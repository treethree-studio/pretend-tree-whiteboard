const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('treeboardDesktop', {
  getHomeData: () => ipcRenderer.invoke('home:get-data'),
  newBoard: () => ipcRenderer.invoke('board:new'),
  openBoardDialog: () => ipcRenderer.invoke('board:open-dialog'),
  openBoardPath: (filePath) => ipcRenderer.invoke('board:open-path', filePath),
  getCurrentBoard: () => ipcRenderer.invoke('board:get-current'),
  saveCurrent: (board) => ipcRenderer.invoke('board:save-current', board),
  saveAs: (board) => ipcRenderer.invoke('board:save-as', board),
  renameCurrent: (title) => ipcRenderer.invoke('board:rename-current', title),
  goHome: () => ipcRenderer.invoke('nav:home'),
  showInFolder: (filePath) => ipcRenderer.invoke('file:show-in-folder', filePath),
  removeRecent: (filePath) => ipcRenderer.invoke('recent:remove', filePath),
  chooseSaveDirectory: () => ipcRenderer.invoke('settings:choose-save-directory'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  exportPNG: (payload) => ipcRenderer.invoke('export:png', payload),
  exportPDF: (payload) => ipcRenderer.invoke('export:pdf', payload),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximizeToggle: () => ipcRenderer.invoke('window:maximize-toggle'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onBeforeClose: (callback) => ipcRenderer.on('app:request-close', () => callback()),
  onOpenBoard: (callback) => ipcRenderer.on('app:request-open', (_event, filePath) => callback(filePath)),
  confirmClose: () => ipcRenderer.invoke('app:confirm-close')
});
