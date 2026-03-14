const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ytDlpApi', {
  getPaths: () => ipcRenderer.invoke('paths:get'),
  listCookieFiles: () => ipcRenderer.invoke('cookies:list'),
  getSelfCheck: () => ipcRenderer.invoke('self-check:get'),
  openMediaTools: () => ipcRenderer.invoke('window:openMediaTools'),
  pickDirectory: (currentPath) => ipcRenderer.invoke('dialog:pickDirectory', currentPath),
  pickMediaFile: (currentPath) => ipcRenderer.invoke('dialog:pickMediaFile', currentPath),
  exportConfig: (config) => ipcRenderer.invoke('config:export', config),
  importConfig: () => ipcRenderer.invoke('config:import'),
  startDownload: (request) => ipcRenderer.invoke('download:start', request),
  cancelDownload: () => ipcRenderer.invoke('download:cancel'),
  inspectMedia: (inputPath) => ipcRenderer.invoke('media:inspect', inputPath),
  runMediaTool: (request) => ipcRenderer.invoke('media:run', request),
  cancelMediaTool: () => ipcRenderer.invoke('media:cancel'),
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
  openExternal: (targetUrl) => ipcRenderer.invoke('shell:openExternal', targetUrl),
  onDownloadUpdate: (listener) => {
    const wrapped = (_event, payload) => listener(payload)
    ipcRenderer.on('download:update', wrapped)
    return () => ipcRenderer.removeListener('download:update', wrapped)
  },
  onMediaToolsUpdate: (listener) => {
    const wrapped = (_event, payload) => listener(payload)
    ipcRenderer.on('media-tools:update', wrapped)
    return () => ipcRenderer.removeListener('media-tools:update', wrapped)
  },
})
