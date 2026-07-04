const { app, BrowserWindow, ipcMain, globalShortcut, screen, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const BROWSER_SURFACE_FALLBACK = { x: 3, y: 96, width: 427, height: 525 };
const PROVIDERS = {
  chatgpt: {
    label: "ChatGPT",
    url: "https://chatgpt.com/",
    signInUrl: "https://chatgpt.com/auth/login"
  },
  claude: {
    label: "Claude",
    url: "https://claude.ai/new",
    signInUrl: "https://claude.ai/login"
  },
  gemini: {
    label: "Gemini",
    url: "https://gemini.google.com/app",
    signInUrl: "https://gemini.google.com/app"
  }
};

let mainWindow;
let boundsSaveTimer;
let browserBounds = { ...BROWSER_SURFACE_FALLBACK };
let browserExecutable;
let browserProcessName;
let browserHostProcess;
let browserHostBuffer = "";
let browserHostRequestId = 0;
let currentBrowserHandle;
let launchSequence = 0;
let quitCleanupStarted = false;
let quitCleanupComplete = false;
const providerWindows = new Map();
const browserHostRequests = new Map();

let settings = {
  provider: "chatgpt",
  opacity: 0.86,
  alwaysOnTop: true,
  bounds: null
};

function log(message) {
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.appendFileSync(path.join(app.getPath("userData"), "sideglass.log"), line);
  } catch {
    // Logging is diagnostic only.
  }
}

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    settings = sanitizeSettings({ ...settings, ...saved });
  } catch {
    // First launch is expected to have no settings file.
  }
}

function sanitizeSettings(candidate) {
  const next = { ...settings };

  if (candidate && PROVIDERS[candidate.provider]) next.provider = candidate.provider;
  if (candidate && Number.isFinite(candidate.opacity)) {
    next.opacity = Math.max(0.58, Math.min(1, candidate.opacity));
  }
  if (candidate && typeof candidate.alwaysOnTop === "boolean") {
    next.alwaysOnTop = candidate.alwaysOnTop;
  }

  const bounds = candidate && candidate.bounds;
  if (bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) {
    next.bounds = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(400, Math.round(bounds.width)),
      height: Math.max(460, Math.round(bounds.height))
    };
  }

  return next;
}

function saveSettings() {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch {
    // Settings persistence should never break the assistant window.
  }
}

function defaultBounds() {
  const display = screen.getPrimaryDisplay().workArea;
  const width = Math.min(display.width, Math.max(400, Math.min(430, Math.floor(display.width * 0.34))));
  const height = Math.min(display.height, Math.max(460, display.height - 64));
  return {
    width,
    height,
    x: display.x + display.width - width - 18,
    y: display.y + 32
  };
}

function visibleBounds(savedBounds) {
  if (!savedBounds) return defaultBounds();

  const display = screen.getDisplayMatching(savedBounds).workArea;
  const width = Math.min(display.width, Math.max(400, savedBounds.width));
  const height = Math.min(display.height, Math.max(460, savedBounds.height));

  return {
    width,
    height,
    x: Math.max(display.x, Math.min(savedBounds.x, display.x + display.width - width)),
    y: Math.max(display.y, Math.min(savedBounds.y, display.y + display.height - height))
  };
}

function browserHostScript() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "SideGlassBrowserHost.exe")
    : path.join(__dirname, "..", "build", "SideGlassBrowserHost.exe");
}

function detectBrowser() {
  const candidates = [
    {
      name: "Chrome",
      processName: "chrome",
      paths: [
        path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
        path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe")
      ]
    },
    {
      name: "Edge",
      processName: "msedge",
      paths: [
        path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")
      ]
    }
  ];

  for (const candidate of candidates) {
    const executable = candidate.paths.find((candidatePath) => candidatePath && fs.existsSync(candidatePath));
    if (executable) return { ...candidate, executable };
  }
  return null;
}

function startBrowserHost() {
  if (browserHostProcess && !browserHostProcess.killed) return;

  browserHostProcess = spawn(browserHostScript(), [], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });

  browserHostProcess.stdout.setEncoding("utf8");
  browserHostProcess.stdout.on("data", (chunk) => {
    browserHostBuffer += chunk;
    const lines = browserHostBuffer.split(/\r?\n/);
    browserHostBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        const pending = browserHostRequests.get(response.id);
        if (!pending) continue;
        browserHostRequests.delete(response.id);
        clearTimeout(pending.timer);
        if (response.ok) pending.resolve(response.result);
        else pending.reject(new Error(response.error || "Browser host command failed"));
      } catch (error) {
        log(`browser host response error ${error.message}: ${line}`);
      }
    }
  });

  browserHostProcess.stderr.setEncoding("utf8");
  browserHostProcess.stderr.on("data", (chunk) => {
    const message = chunk.trim();
    if (message) log(`browser host stderr ${message}`);
  });

  browserHostProcess.on("exit", (code) => {
    const error = new Error(`Browser host exited with code ${code}`);
    for (const pending of browserHostRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    browserHostRequests.clear();
    browserHostProcess = null;
    browserHostBuffer = "";
  });
}

function runBrowserHost(action, params = {}, timeout = 20000) {
  startBrowserHost();
  const id = ++browserHostRequestId;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browserHostRequests.delete(id);
      reject(new Error(`Browser host timed out while running ${action}`));
    }, timeout);

    browserHostRequests.set(id, { resolve, reject, timer });
    browserHostProcess.stdin.write(`${JSON.stringify({ id, action, ...params })}\n`, (error) => {
      if (!error) return;
      clearTimeout(timer);
      browserHostRequests.delete(id);
      reject(error);
    });
  });
}

function stopBrowserHost() {
  if (!browserHostProcess) return;
  browserHostProcess.stdin.end();
  browserHostProcess.kill();
  browserHostProcess = null;
}

async function listBrowserWindows() {
  const windows = await runBrowserHost("List", { ProcessName: browserProcessName }, 30000);
  if (!windows) return [];
  return Array.isArray(windows) ? windows : [windows];
}

function nativeWindowHandle(window) {
  const handle = window.getNativeWindowHandle();
  return process.arch === "x64" ? Number(handle.readBigUInt64LE()) : handle.readUInt32LE();
}

function sendBrowserStatus(state, text, provider = settings.provider) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("browser:status", { state, text, provider });
}

function scoreBrowserWindow(window, provider) {
  const title = String(window.Title || "").toLowerCase();
  const label = PROVIDERS[provider].label.toLowerCase();
  return title.includes(label) ? 2 : title ? 1 : 0;
}

function launchBrowserWindow(url) {
  const launchBounds = mainWindow ? mainWindow.getBounds() : defaultBounds();
  const args = [
    `--app=${url}`,
    "--start-fullscreen",
    `--window-size=${Math.max(400, browserBounds.width)},${Math.max(360, browserBounds.height)}`,
    `--window-position=${launchBounds.x + browserBounds.x},${launchBounds.y + browserBounds.y}`
  ];
  const child = spawn(browserExecutable, args, { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
}

async function waitForNewBrowserWindow(existingHandles, provider, sequence) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (sequence !== launchSequence) return null;

    const windows = await listBrowserWindows();
    const candidates = windows.filter((window) => !existingHandles.has(String(window.Handle)));
    if (candidates.length > 0) {
      candidates.sort((left, right) => scoreBrowserWindow(right, provider) - scoreBrowserWindow(left, provider));
      return candidates[0];
    }
  }
  return null;
}

async function hideCurrentBrowser() {
  if (!currentBrowserHandle) return;
  try {
    await runBrowserHost("Hide", { Handle: currentBrowserHandle });
  } catch (error) {
    log(`hide browser failed ${error.message}`);
  }
}

async function showBrowser(handle) {
  await runBrowserHost("Show", { Handle: handle });
  await runBrowserHost("Resize", { Handle: handle, ...browserBounds });
}

async function closeBrowser(handle) {
  if (!handle) return;
  try {
    await runBrowserHost("Close", { Handle: handle });
  } catch (error) {
    log(`close browser failed ${error.message}`);
  }
}

async function activateProvider(provider, options = {}) {
  if (!PROVIDERS[provider]) throw new Error("Unknown provider");
  if (!browserExecutable) throw new Error("Google Chrome or Microsoft Edge is required");

  const sequence = ++launchSequence;
  settings.provider = provider;
  saveSettings();
  sendBrowserStatus("loading", `Opening ${PROVIDERS[provider].label}`, provider);

  await hideCurrentBrowser();
  currentBrowserHandle = null;

  const cachedHandle = providerWindows.get(provider);
  if (cachedHandle && !options.forceNew) {
    try {
      await showBrowser(cachedHandle);
      currentBrowserHandle = cachedHandle;
      sendBrowserStatus("ready", `${PROVIDERS[provider].label} ready`, provider);
      log(`restored ${provider} browser window ${cachedHandle}`);
      return true;
    } catch {
      providerWindows.delete(provider);
    }
  }

  if (cachedHandle) {
    providerWindows.delete(provider);
    await closeBrowser(cachedHandle);
  }

  const existingHandles = new Set((await listBrowserWindows()).map((window) => String(window.Handle)));
  launchBrowserWindow(PROVIDERS[provider].url);
  const browserWindow = await waitForNewBrowserWindow(existingHandles, provider, sequence);

  if (sequence !== launchSequence) {
    if (browserWindow) await closeBrowser(browserWindow.Handle);
    return false;
  }
  if (!browserWindow) throw new Error(`${PROVIDERS[provider].label} did not open in ${browserProcessName}`);

  await runBrowserHost(
    "Embed",
    {
      Handle: browserWindow.Handle,
      Parent: nativeWindowHandle(mainWindow),
      ...browserBounds
    },
    15000
  );
  await new Promise((resolve) => setTimeout(resolve, 850));
  await runBrowserHost("Resize", { Handle: browserWindow.Handle, ...browserBounds });
  log(`embedded bounds ${JSON.stringify(browserBounds)}`);

  providerWindows.set(provider, browserWindow.Handle);
  currentBrowserHandle = browserWindow.Handle;
  sendBrowserStatus("ready", `${PROVIDERS[provider].label} ready`, provider);
  log(`embedded ${provider} browser window ${browserWindow.Handle}`);
  return true;
}

async function openSignInWindow(provider) {
  if (!PROVIDERS[provider] || !browserExecutable) return false;
  const child = spawn(browserExecutable, ["--new-window", PROVIDERS[provider].signInUrl], {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();
  return true;
}

function createWindow() {
  const bounds = visibleBounds(settings.bounds);
  settings.bounds = bounds;
  browserBounds = {
    ...BROWSER_SURFACE_FALLBACK,
    width: Math.max(1, bounds.width - BROWSER_SURFACE_FALLBACK.x),
    height: Math.max(1, bounds.height - BROWSER_SURFACE_FALLBACK.y - 35)
  };
  log(`createWindow ${JSON.stringify(bounds)}`);

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 400,
    minHeight: 460,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: false,
    title: "SideGlass",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setOpacity(settings.opacity);
  mainWindow.setAlwaysOnTop(settings.alwaysOnTop, "screen-saver");
  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.once("ready-to-show", () => {
    log("ready-to-show");
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    log("window closed");
    mainWindow = null;
  });

  mainWindow.on("moved", rememberBounds);
  mainWindow.on("resized", rememberBounds);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function rememberBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  settings.bounds = mainWindow.getBounds();
  clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(saveSettings, 250);
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
    return;
  }
  mainWindow.show();
  mainWindow.focus();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    log("app ready");
    readSettings();
    const browser = detectBrowser();
    if (browser) {
      browserExecutable = browser.executable;
      browserProcessName = browser.processName;
      startBrowserHost();
      log(`using ${browser.name} at ${browser.executable}`);
    } else {
      log("no supported browser found");
    }
    createWindow();

    const shortcutRegistered = globalShortcut.register("CommandOrControl+Alt+Space", toggleWindow);
    log(`shortcut registered ${shortcutRegistered}`);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("before-quit", (event) => {
  if (quitCleanupComplete) return;
  event.preventDefault();
  if (quitCleanupStarted) return;
  quitCleanupStarted = true;
  launchSequence += 1;

  Promise.all([...new Set(providerWindows.values())].map((handle) => closeBrowser(handle)))
    .catch((error) => log(`browser cleanup failed ${error.message}`))
    .finally(() => {
      providerWindows.clear();
      currentBrowserHandle = null;
      quitCleanupComplete = true;
      stopBrowserHost();
      app.quit();
    });
});

app.on("will-quit", () => {
  log("will quit");
  clearTimeout(boundsSaveTimer);
  saveSettings();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  log("window-all-closed");
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", (error) => {
  log(`uncaughtException ${error.stack || error.message}`);
});

process.on("unhandledRejection", (reason) => {
  log(`unhandledRejection ${reason && reason.stack ? reason.stack : reason}`);
});

ipcMain.handle("settings:get", () => ({
  ...settings,
  providers: Object.fromEntries(Object.entries(PROVIDERS).map(([key, value]) => [key, value.url])),
  browserAvailable: Boolean(browserExecutable)
}));

ipcMain.handle("settings:set", (_event, patch) => {
  settings = sanitizeSettings({ ...settings, ...patch });

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (typeof patch.opacity === "number") mainWindow.setOpacity(settings.opacity);
    if (typeof patch.alwaysOnTop === "boolean") {
      mainWindow.setAlwaysOnTop(settings.alwaysOnTop, "screen-saver");
    }
  }

  saveSettings();
  return settings;
});

ipcMain.handle("browser:setBounds", async (_event, bounds) => {
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return false;
  browserBounds = {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height))
  };
  if (currentBrowserHandle) {
    try {
      await runBrowserHost("Resize", { Handle: currentBrowserHandle, ...browserBounds });
    } catch (error) {
      log(`resize browser failed ${error.message}`);
    }
  }
  return true;
});

ipcMain.handle("browser:activate", async (_event, provider) => {
  try {
    return await activateProvider(provider);
  } catch (error) {
    log(`activate provider failed ${error.stack || error.message}`);
    sendBrowserStatus("error", error.message, provider);
    return false;
  }
});

ipcMain.handle("browser:reload", async () => {
  try {
    return await activateProvider(settings.provider, { forceNew: true });
  } catch (error) {
    log(`reload provider failed ${error.stack || error.message}`);
    sendBrowserStatus("error", error.message, settings.provider);
    return false;
  }
});

ipcMain.handle("browser:openExternal", (_event, provider) => openSignInWindow(provider));

ipcMain.handle("window:hide", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
});

ipcMain.handle("window:close", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});
