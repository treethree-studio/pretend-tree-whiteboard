const { app, BrowserWindow } = require('electron');

app.setName('假装一棵树');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#fbfbfa',
    icon: __dirname + '/assets/app.ico',
    webPreferences: {
      preload: __dirname + '/preload.js',
      contextIsolation: true
    }
  });

  mainWindow.loadFile(__dirname + '/renderer/home.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
