const { contextBridge, ipcRenderer } = require('electron');

// Only the activation screen uses this; the tool itself needs nothing from Electron.
contextBridge.exposeInMainWorld('licence', {
  info: () => ipcRenderer.invoke('licence:info'),
  buy: () => ipcRenderer.invoke('licence:buy'),
  activate: (key) => ipcRenderer.invoke('licence:activate', key),
});
