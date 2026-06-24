const providerButtons = [...document.querySelectorAll(".provider")];
const aiView = document.querySelector("#aiView");
const loading = document.querySelector("#loading");
const statusText = document.querySelector("#statusText");
const opacitySlider = document.querySelector("#opacitySlider");
const pinButton = document.querySelector("#pinButton");
const hideButton = document.querySelector("#hideButton");
const closeButton = document.querySelector("#closeButton");
const reloadButton = document.querySelector("#reloadButton");

let providers = {};
let currentProvider = "chatgpt";
let alwaysOnTop = true;

function providerLabel(key) {
  return {
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini"
  }[key] || "Provider";
}

function setLoading(isLoading, text = "Opening provider") {
  loading.classList.toggle("hidden", !isLoading);
  loading.querySelector("p").textContent = text;
}

function updateProviderButtons() {
  providerButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.provider === currentProvider);
  });
}

async function switchProvider(provider) {
  if (!providers[provider]) return;
  currentProvider = provider;
  updateProviderButtons();
  setLoading(true, `Opening ${providerLabel(provider)}`);
  statusText.textContent = providerLabel(provider);
  aiView.src = providers[provider];
  await window.sideglass.setSettings({ provider });
}

async function setOpacity(value) {
  const opacity = Math.max(0.58, Math.min(1, Number(value) / 100));
  await window.sideglass.setSettings({ opacity });
}

async function setPinned(nextValue) {
  alwaysOnTop = nextValue;
  pinButton.classList.toggle("active", alwaysOnTop);
  await window.sideglass.setSettings({ alwaysOnTop });
}

async function boot() {
  const settings = await window.sideglass.getSettings();
  providers = settings.providers;
  currentProvider = settings.provider || "chatgpt";
  alwaysOnTop = settings.alwaysOnTop !== false;

  opacitySlider.value = Math.round((settings.opacity || 0.86) * 100);
  pinButton.classList.toggle("active", alwaysOnTop);
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
reloadButton.addEventListener("click", () => aiView.reload());

aiView.addEventListener("did-start-loading", () => {
  setLoading(true, `Opening ${providerLabel(currentProvider)}`);
});

aiView.addEventListener("did-stop-loading", () => {
  setLoading(false);
  statusText.textContent = `${providerLabel(currentProvider)} loaded`;
});

aiView.addEventListener("did-fail-load", (event) => {
  if (event.errorCode === -3) return;
  setLoading(false);
  statusText.textContent = "Provider could not load";
});

boot();
