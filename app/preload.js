const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('treeboardDesktop', {
  version: '0.1.0-alpha'
});
