const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sideglass", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  setBrowserBounds: (bounds) => ipcRenderer.invoke("browser:setBounds", bounds),
  activateProvider: (provider) => ipcRenderer.invoke("browser:activate", provider),
  reloadProvider: () => ipcRenderer.invoke("browser:reload"),
  openProviderInBrowser: (provider) => ipcRenderer.invoke("browser:openExternal", provider),
  onBrowserStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("browser:status", listener);
    return () => ipcRenderer.removeListener("browser:status", listener);
  },
  hide: () => ipcRenderer.invoke("window:hide"),
  close: () => ipcRenderer.invoke("window:close")
});
