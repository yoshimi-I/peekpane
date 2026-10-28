const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("peekpaneHost", {
  copy(text) {
    ipcRenderer.send("peekpane-copy", String(text));
  },
});
