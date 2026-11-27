const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('node:crypto');

app.setName('假装一棵树');

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
}

let mainWindow = null;
let currentBoardPath = null;
let allowWindowClose = false;
const MAX_RECENTS = 12;

function userDataPath(name) {
  return path.join(app.getPath('userData'), name);
}

function defaultSettings() {
  return {
    saveDirectory: path.join(app.getPath('documents'), '假装一棵树'),
    recentFiles: []
  };
}

function loadSettings() {
  const file = userDataPath('settings.json');
  const defaults = defaultSettings();
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ...defaults,
      ...data,
      recentFiles: Array.isArray(data.recentFiles) ? data.recentFiles : []
    };
  } catch {
    return defaults;
  }
}

function saveSettings(settings) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(userDataPath('settings.json'), JSON.stringify(settings, null, 2), 'utf8');
}

function ensureSaveDirectory() {
  const settings = loadSettings();
  fs.mkdirSync(settings.saveDirectory, { recursive: true });
  return settings.saveDirectory;
}

function sanitizeFileName(name) {
  const clean = String(name || '未命名白板')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return (clean || '未命名白板').slice(0, 80);
}

function uniqueBoardPath(directory, baseTitle) {
  const safe = sanitizeFileName(baseTitle);
  let candidate = path.join(directory, `${safe}.treeboard`);
  if (!fs.existsSync(candidate)) return candidate;
  let i = 2;
  while (fs.existsSync(path.join(directory, `${safe} ${i}.treeboard`))) i += 1;
  return path.join(directory, `${safe} ${i}.treeboard`);
}

function blankBoard(title = '未命名白板') {
  return {
    format: 'treeboard',
    version: 1,
    title,
    camera: { x: 0, y: 0, scale: 1 },
    objects: [],
    assets: {},
    preview: null,
    updatedAt: new Date().toISOString()
  };
}

function writeBoardAtomic(filePath, board) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const temp = `${filePath}.${randomUUID()}.tmp`;
  const payload = {
    ...board,
    format: 'treeboard',
    version: 1,
    updatedAt: new Date().toISOString()
  };
  try {
    fs.writeFileSync(temp, JSON.stringify(payload), { encoding: 'utf8', flag: 'wx', flush: true });
    fs.renameSync(temp, filePath);
  } finally {
    try {
      fs.rmSync(temp, { force: true });
    } catch (err) {
      console.warn('Unable to clean up a temporary board file', err);
    }
  }
}

function parseBoard(raw) {
  const data = JSON.parse(raw);
  if (data.format !== 'treeboard') throw new Error('不是有效的 .treeboard 文件');
  return data;
}
function readBoard(filePath) {
  return parseBoard(fs.readFileSync(filePath, 'utf8'));
}

function addRecent(filePath) {
  const settings = loadSettings();
  const normalized = path.resolve(filePath);
  settings.recentFiles = [normalized, ...settings.recentFiles.filter(p => path.resolve(p) !== normalized)].slice(0, MAX_RECENTS);
  saveSettings(settings);
}

function removeRecent(filePath) {
  const settings = loadSettings();
  const normalized = path.resolve(filePath);
  settings.recentFiles = settings.recentFiles.filter(p => path.resolve(p) !== normalized);
  saveSettings(settings);
}

function recentMetadata(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const data = readBoard(filePath);
    const stat = fs.statSync(filePath);
    return {
      path: filePath,
      title: data.title || path.basename(filePath, '.treeboard'),
      hasContent: Array.isArray(data.objects) && data.objects.length > 0,
      preview: data.previewKind === 'content' && typeof data.preview === 'string' &&
        /^data:image\/(?:png|webp);base64,/i.test(data.preview) ? data.preview : null,
      updatedAt: data.updatedAt || stat.mtime.toISOString()
    };
  } catch {
    return null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: '#fbfbfa',
    icon: path.join(__dirname, 'assets', 'app.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'home.html'));

  mainWindow.on('close', (event) => {
    if (currentBoardPath && !allowWindowClose) {
      event.preventDefault();
      mainWindow.webContents.send('app:request-close');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function openEditor(filePath) {
  allowWindowClose = false;
  currentBoardPath = filePath;
  addRecent(filePath);
  if (!mainWindow) createWindow();
  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'editor.html'));
}

async function goHome() {
  allowWindowClose = false;
  currentBoardPath = null;
  if (!mainWindow) createWindow();
  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'home.html'));
}

function findTreeboardArg(argv) {
  return argv.find(a => typeof a === 'string' && a.toLowerCase().endsWith('.treeboard') && fs.existsSync(a));
}

app.on('second-instance', (_event, argv) => {
  const filePath = findTreeboardArg(argv);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  if (filePath) {
    const nextPath = path.resolve(filePath);
    if (mainWindow && currentBoardPath) {
      if (nextPath !== currentBoardPath) mainWindow.webContents.send('app:request-open', nextPath);
    } else {
      openEditor(nextPath);
    }
  }
});

app.whenReady().then(async () => {
  createWindow();
  const filePath = findTreeboardArg(process.argv.slice(1));
  if (filePath) await openEditor(path.resolve(filePath));
});

app.on('window-all-closed', () => app.quit());

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize-toggle', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('app:confirm-close', () => {
  allowWindowClose = true;
  mainWindow?.close();
  return { ok: true };
});

ipcMain.handle('home:get-data', () => {
  const settings = loadSettings();
  const recent = [];
  let changed = false;
  for (const p of settings.recentFiles) {
    const item = recentMetadata(p);
    if (item) recent.push(item); else changed = true;
  }
  if (changed) {
    settings.recentFiles = recent.map(x => x.path);
    saveSettings(settings);
  }
  return { settings, recent };
});

ipcMain.handle('recent:get-preview-source', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return null;
  try {
    const normalized = path.resolve(filePath);
    if (!loadSettings().recentFiles.some(entry => typeof entry === 'string' && path.resolve(entry) === normalized)) return null;
    const board = parseBoard(await fs.promises.readFile(normalized, 'utf8'));
    return {
      objects: Array.isArray(board.objects) ? board.objects : [],
      assets: board.assets || {}
    };
  } catch {
    return null;
  }
});

ipcMain.handle('board:new', async () => {
  const dir = ensureSaveDirectory();
  const filePath = uniqueBoardPath(dir, '未命名白板');
  writeBoardAtomic(filePath, blankBoard('未命名白板'));
  await openEditor(filePath);
  return { ok: true, path: filePath };
});

ipcMain.handle('board:open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '打开白板',
    properties: ['openFile'],
    filters: [{ name: '假装一棵树 白板', extensions: ['treeboard'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false };
  const filePath = result.filePaths[0];
  try {
    readBoard(filePath);
    await openEditor(filePath);
    return { ok: true, path: filePath };
  } catch (err) {
    dialog.showErrorBox('无法打开白板', err.message || '文件已损坏或格式不正确。');
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('board:open-path', async (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: '文件不存在' };
  try {
    readBoard(filePath);
    await openEditor(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('board:get-current', () => {
  if (!currentBoardPath || !fs.existsSync(currentBoardPath)) return null;
  try {
    return { path: currentBoardPath, board: readBoard(currentBoardPath) };
  } catch (err) {
    return { path: currentBoardPath, error: String(err.message || err) };
  }
});

function saveBoardAt(filePath, board) {
  writeBoardAtomic(filePath, board);
  currentBoardPath = filePath;
  try {
    addRecent(filePath);
  } catch (err) {
    console.warn('Unable to update recent boards', err);
  }
  return { ok: true, path: filePath };
}

ipcMain.handle('board:save-current', (_event, board) => {
  try {
    const filePath = currentBoardPath || uniqueBoardPath(ensureSaveDirectory(), board?.title || '未命名白板');
    return saveBoardAt(filePath, board);
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('board:save-as', async (_event, board) => {
  try {
    const suggested = sanitizeFileName(board?.title || '未命名白板') + '.treeboard';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '另存白板',
      defaultPath: path.join(app.getPath('documents'), suggested),
      filters: [{ name: '假装一棵树 白板', extensions: ['treeboard'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    if (path.extname(result.filePath).toLowerCase() !== '.treeboard') {
      return { ok: false, error: '请使用 .treeboard 文件扩展名。' };
    }
    return saveBoardAt(result.filePath, board);
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('board:rename-current', (_event, title) => {
  try {
    if (!currentBoardPath) return { ok: false };
    const nextTitle = sanitizeFileName(title);
    const nextPath = path.join(path.dirname(currentBoardPath), `${nextTitle}.treeboard`);
    if (path.resolve(nextPath) !== path.resolve(currentBoardPath)) {
      let finalPath = nextPath;
      if (fs.existsSync(finalPath)) finalPath = uniqueBoardPath(path.dirname(currentBoardPath), nextTitle);
      const oldPath = currentBoardPath;
      fs.renameSync(oldPath, finalPath);
      currentBoardPath = finalPath;
      try {
        removeRecent(oldPath);
        addRecent(finalPath);
      } catch (err) {
        console.warn('Unable to update recent boards', err);
      }
    }
    return { ok: true, path: currentBoardPath, title: path.basename(currentBoardPath, '.treeboard') };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('nav:home', async () => {
  await goHome();
  return { ok: true };
});

ipcMain.handle('file:show-in-folder', (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
  return { ok: true };
});

ipcMain.handle('recent:remove', (_event, filePath) => {
  removeRecent(filePath);
  return { ok: true };
});

ipcMain.handle('settings:get', () => loadSettings());

ipcMain.handle('settings:choose-save-directory', async () => {
  const settings = loadSettings();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择默认保存位置',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: settings.saveDirectory
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, settings };
  settings.saveDirectory = result.filePaths[0];
  fs.mkdirSync(settings.saveDirectory, { recursive: true });
  saveSettings(settings);
  return { ok: true, settings };
});

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('无效的导出图像');
  return Buffer.from(match[2], 'base64');
}

ipcMain.handle('export:png', async (_event, payload) => {
  try {
    const suggested = sanitizeFileName(payload?.title || '白板') + '.png';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出 PNG',
      defaultPath: path.join(app.getPath('pictures'), suggested),
      filters: [{ name: 'PNG 图片', extensions: ['png'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false };
    fs.writeFileSync(result.filePath, dataUrlToBuffer(payload.dataUrl));
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('export:pdf', async (_event, payload) => {
  let printWin = null;
  try {
    const suggested = sanitizeFileName(payload?.title || '白板') + '.pdf';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出 PDF',
      defaultPath: path.join(app.getPath('documents'), suggested),
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false };

    printWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    const dataUrl = payload.dataUrl;
    const width = Math.max(400, Number(payload.width) || 1200);
    const height = Math.max(300, Number(payload.height) || 800);
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:#fbfbfa;width:${width}px;height:${height}px;overflow:hidden}
      img{display:block;width:${width}px;height:${height}px;object-fit:contain}
      @page{size:${width}px ${height}px;margin:0}
    </style></head><body><img src="${dataUrl}"></body></html>`;
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await printWin.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(result.filePath, pdf);
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  } finally {
    if (printWin && !printWin.isDestroyed()) printWin.destroy();
  }
});
