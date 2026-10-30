const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("peekpaneHost", {
  async openExternal(url) {
    if (!navigator.userActivation?.isActive) return false;
    return ipcRenderer.invoke("peekpane-open-external", url);
  },
  copy(text) {
    ipcRenderer.send("peekpane-copy", String(text));
  },
});
