const { app, BrowserWindow, ipcMain, globalShortcut, screen, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const PROVIDERS = {
  chatgpt: "https://chatgpt.com/",
  claude: "https://claude.ai/new",
  gemini: "https://gemini.google.com/app"
};

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

let mainWindow;
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
    settings = { ...settings, ...saved };
  } catch {
    // First launch is expected to have no settings file.
  }
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
  const width = Math.min(430, Math.floor(display.width * 0.34));
  const height = Math.max(620, display.height - 64);
  return {
    width,
    height,
    x: display.x + display.width - width - 18,
    y: display.y + 32
  };
}

function createWindow() {
  const bounds = settings.bounds || defaultBounds();
  log(`createWindow ${JSON.stringify(bounds)}`);

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 340,
    minHeight: 460,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: false,
    title: "SideGlass",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
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

  mainWindow.webContents.on("will-attach-webview", (_event, webPreferences, params) => {
    webPreferences.partition = "persist:sideglass-ai";
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.plugins = true;
    params.useragent = CHROME_UA;
  });
}

function rememberBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  settings.bounds = mainWindow.getBounds();
  saveSettings();
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

app.whenReady().then(() => {
  log("app ready");
  readSettings();
  createWindow();

  const shortcutRegistered = globalShortcut.register("CommandOrControl+Alt+Space", toggleWindow);
  log(`shortcut registered ${shortcutRegistered}`);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  log("will quit");
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
  providers: PROVIDERS
}));

ipcMain.handle("settings:set", (_event, patch) => {
  settings = { ...settings, ...patch };

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (typeof patch.opacity === "number") mainWindow.setOpacity(patch.opacity);
    if (typeof patch.alwaysOnTop === "boolean") {
      mainWindow.setAlwaysOnTop(patch.alwaysOnTop, "screen-saver");
    }
  }

  saveSettings();
  return settings;
});

ipcMain.handle("window:hide", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
});

ipcMain.handle("window:close", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});
