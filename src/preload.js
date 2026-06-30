const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sideglass", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  openProviderInBrowser: (provider) => ipcRenderer.invoke("provider:openExternal", provider),
  hide: () => ipcRenderer.invoke("window:hide"),
  close: () => ipcRenderer.invoke("window:close")
});
