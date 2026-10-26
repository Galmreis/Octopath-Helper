const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  getAlwaysOnTop: () => ipcRenderer.invoke('get-always-on-top'),
  onAlwaysOnTopChanged: (callback) => {
    const handler = (_event, val) => callback(val);
    ipcRenderer.on('always-on-top-changed', handler);
    return () => ipcRenderer.removeListener('always-on-top-changed', handler);
  }
});
