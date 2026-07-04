const providerButtons = [...document.querySelectorAll(".provider")];
const stage = document.querySelector("#browserSurface");
const loading = document.querySelector("#loading");
const statusText = document.querySelector("#statusText");
const statusDot = document.querySelector("#statusDot");
const opacitySlider = document.querySelector("#opacitySlider");
const opacityValue = document.querySelector("#opacityValue");
const pinButton = document.querySelector("#pinButton");
const hideButton = document.querySelector("#hideButton");
const closeButton = document.querySelector("#closeButton");
const reloadButton = document.querySelector("#reloadButton");
const openExternalButton = document.querySelector("#openExternalButton");
const retryButton = document.querySelector("#retryButton");
const openBrowserButton = document.querySelector("#openBrowserButton");
const loadingTitle = document.querySelector("#loadingTitle");
const loadingDetail = document.querySelector("#loadingDetail");
const loadingActions = document.querySelector("#loadingActions");

let currentProvider = "chatgpt";
let alwaysOnTop = true;
let resizeFrame;

function providerLabel(key) {
  return {
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini"
  }[key] || "Provider";
}

function setStatus(text, state = "ready") {
  statusText.textContent = text;
  statusDot.dataset.state = state;
}

function setLoading(isLoading, title = "Opening provider", detail = "Connecting to your browser session") {
  loading.classList.toggle("hidden", !isLoading);
  loading.classList.remove("error");
  loadingTitle.textContent = title;
  loadingDetail.textContent = detail;
  loadingActions.classList.remove("visible");
  providerButtons.forEach((button) => {
    button.disabled = isLoading;
  });
  reloadButton.disabled = isLoading;
}

function setLoadError(detail) {
  loading.classList.remove("hidden");
  loading.classList.add("error");
  loadingTitle.textContent = `${providerLabel(currentProvider)} could not open`;
  loadingDetail.textContent = detail;
  loadingActions.classList.add("visible");
  providerButtons.forEach((button) => {
    button.disabled = false;
  });
  reloadButton.disabled = false;
  setStatus("Browser connection problem", "error");
}

function updateProviderButtons() {
  providerButtons.forEach((button) => {
    const active = button.dataset.provider === currentProvider;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.body.dataset.provider = currentProvider;
}

function updateOpacityTrack(value) {
  const min = Number(opacitySlider.min);
  const max = Number(opacitySlider.max);
  const progress = ((Number(value) - min) / (max - min)) * 100;
  opacitySlider.style.setProperty("--range-progress", `${progress}%`);
}

async function reportBrowserBounds() {
  const bounds = stage.getBoundingClientRect();
  await window.sideglass.setBrowserBounds({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  });
}

async function switchProvider(provider) {
  if (!["chatgpt", "claude", "gemini"].includes(provider)) return;
  currentProvider = provider;
  updateProviderButtons();
  setLoading(true, `Opening ${providerLabel(provider)}`);
  setStatus(`Opening ${providerLabel(provider)}`, "loading");
  const opened = await window.sideglass.activateProvider(provider);
  if (!opened) {
    setLoadError("Chrome or Edge could not open this provider. Try again or open it in the browser.");
  }
}

async function setOpacity(value) {
  const opacity = Math.max(0.58, Math.min(1, Number(value) / 100));
  opacityValue.textContent = `${Math.round(opacity * 100)}%`;
  updateOpacityTrack(value);
  await window.sideglass.setSettings({ opacity });
}

async function setPinned(nextValue) {
  alwaysOnTop = nextValue;
  pinButton.classList.toggle("active", alwaysOnTop);
  pinButton.setAttribute("aria-pressed", String(alwaysOnTop));
  pinButton.title = alwaysOnTop ? "Stop keeping on top" : "Keep on top";
  await window.sideglass.setSettings({ alwaysOnTop });
}

async function reloadProvider() {
  setLoading(true, `Reloading ${providerLabel(currentProvider)}`);
  setStatus(`Reloading ${providerLabel(currentProvider)}`, "loading");
  const opened = await window.sideglass.reloadProvider();
  if (!opened) setLoadError("The browser window could not be reloaded. Try opening the provider in Chrome.");
}

async function openProviderInBrowser() {
  const opened = await window.sideglass.openProviderInBrowser(currentProvider);
  if (opened) setStatus(`Sign-in opened in Chrome`);
}

async function boot() {
  const settings = await window.sideglass.getSettings();
  currentProvider = settings.provider || "chatgpt";
  alwaysOnTop = settings.alwaysOnTop !== false;

  opacitySlider.value = Math.round((settings.opacity || 0.86) * 100);
  opacityValue.textContent = `${opacitySlider.value}%`;
  updateOpacityTrack(opacitySlider.value);
  pinButton.classList.toggle("active", alwaysOnTop);
  pinButton.setAttribute("aria-pressed", String(alwaysOnTop));
  updateProviderButtons();
  await reportBrowserBounds();

  if (!settings.browserAvailable) {
    setLoadError("Install Google Chrome or Microsoft Edge to use SideGlass without API keys.");
    return;
  }
  await switchProvider(currentProvider);
}

providerButtons.forEach((button) => {
  button.addEventListener("click", () => switchProvider(button.dataset.provider));
});

opacitySlider.addEventListener("input", () => setOpacity(opacitySlider.value));
pinButton.addEventListener("click", () => setPinned(!alwaysOnTop));
hideButton.addEventListener("click", () => window.sideglass.hide());
closeButton.addEventListener("click", () => window.sideglass.close());
reloadButton.addEventListener("click", reloadProvider);
retryButton.addEventListener("click", () => switchProvider(currentProvider));
openExternalButton.addEventListener("click", openProviderInBrowser);
openBrowserButton.addEventListener("click", openProviderInBrowser);

window.sideglass.onBrowserStatus((status) => {
  if (status.provider && status.provider !== currentProvider) return;
  if (status.state === "loading") {
    setLoading(true, status.text);
    setStatus(status.text, "loading");
    return;
  }
  if (status.state === "ready") {
    setLoading(false);
    setStatus(status.text);
    return;
  }
  if (status.state === "error") setLoadError(status.text);
});

const resizeObserver = new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(reportBrowserBounds);
});
resizeObserver.observe(stage);

boot();
