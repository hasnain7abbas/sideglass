const providerButtons = [...document.querySelectorAll(".provider")];
const aiView = document.querySelector("#aiView");
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

let providers = {};
let currentProvider = "chatgpt";
let alwaysOnTop = true;
let loadTimer;

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

function setLoading(isLoading, title = "Opening provider", detail = "Connecting to your existing web session") {
  loading.classList.toggle("hidden", !isLoading);
  loading.classList.remove("error");
  loadingTitle.textContent = title;
  loadingDetail.textContent = detail;
  loadingActions.classList.remove("visible");
}

function setLoadError(detail) {
  clearTimeout(loadTimer);
  loading.classList.remove("hidden");
  loading.classList.add("error");
  loadingTitle.textContent = `${providerLabel(currentProvider)} could not load`;
  loadingDetail.textContent = detail;
  loadingActions.classList.add("visible");
  setStatus("Connection problem", "error");
}

function finishLoading() {
  clearTimeout(loadTimer);
  setLoading(false);
  setStatus(`${providerLabel(currentProvider)} ready`);
}

function startLoad(title) {
  setLoading(true, title);
  setStatus(title, "loading");
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => {
    setLoadError("The provider is taking longer than expected. Check your connection or try again.");
  }, 30000);
}

function updateProviderButtons() {
  providerButtons.forEach((button) => {
    const active = button.dataset.provider === currentProvider;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.body.dataset.provider = currentProvider;
}

async function switchProvider(provider) {
  if (!providers[provider]) return;
  currentProvider = provider;
  updateProviderButtons();
  startLoad(`Opening ${providerLabel(provider)}`);
  aiView.src = providers[provider];
  await window.sideglass.setSettings({ provider });
}

async function setOpacity(value) {
  const opacity = Math.max(0.58, Math.min(1, Number(value) / 100));
  opacityValue.textContent = `${Math.round(opacity * 100)}%`;
  await window.sideglass.setSettings({ opacity });
}

async function setPinned(nextValue) {
  alwaysOnTop = nextValue;
  pinButton.classList.toggle("active", alwaysOnTop);
  pinButton.setAttribute("aria-pressed", String(alwaysOnTop));
  pinButton.title = alwaysOnTop ? "Stop keeping on top" : "Keep on top";
  await window.sideglass.setSettings({ alwaysOnTop });
}

function reloadProvider() {
  startLoad(`Reloading ${providerLabel(currentProvider)}`);
  aiView.reload();
}

function openProviderInBrowser() {
  return window.sideglass.openProviderInBrowser(currentProvider);
}

async function boot() {
  const settings = await window.sideglass.getSettings();
  providers = settings.providers;
  currentProvider = settings.provider || "chatgpt";
  alwaysOnTop = settings.alwaysOnTop !== false;

  opacitySlider.value = Math.round((settings.opacity || 0.86) * 100);
  opacityValue.textContent = `${opacitySlider.value}%`;
  pinButton.classList.toggle("active", alwaysOnTop);
  pinButton.setAttribute("aria-pressed", String(alwaysOnTop));
  updateProviderButtons();
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
retryButton.addEventListener("click", reloadProvider);
openExternalButton.addEventListener("click", openProviderInBrowser);
openBrowserButton.addEventListener("click", openProviderInBrowser);

aiView.addEventListener("did-start-loading", () => {
  startLoad(`Opening ${providerLabel(currentProvider)}`);
});

aiView.addEventListener("did-stop-loading", finishLoading);
aiView.addEventListener("dom-ready", finishLoading);

aiView.addEventListener("did-fail-load", (event) => {
  if (event.errorCode === -3 || event.isMainFrame === false) return;
  setLoadError(event.errorDescription || "Check your internet connection and try again.");
});

aiView.addEventListener("render-process-gone", () => {
  setLoadError("The provider page stopped responding. Reload it to continue.");
});

window.addEventListener("offline", () => setLoadError("You appear to be offline. Reconnect, then try again."));
window.addEventListener("online", () => setStatus("Back online"));

boot();
