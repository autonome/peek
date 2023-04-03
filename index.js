// main.js
(async () => {

console.log('main');

// Modules to control application life and create native browser window
const {
  electron,
  app,
  BrowserView,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  Tray
} = require('electron');

const path = require('path');

const labels = {
  app: {
    title: 'Peek'
  },
  tray: {
    tooltip: 'Click to open Peek'
  }
};

// keep app out of dock and tab switcher
app.dock.hide();

// load data
let { data, schemas, set, watch } = require('./defaults');

const ICON_RELATIVE_PATH = 'assets/icons/AppIcon.appiconset/Icon-App-20x20@2x.png';
const ICON_PATH = path.join(__dirname, ICON_RELATIVE_PATH);

const isDev = require('electron-is-dev');

if (isDev) {
  // Enable live reload for Electron too
  require('electron-reload')(__dirname, {
    // Note that the path to electron may vary according to the main file
    electron: require(`${__dirname}/node_modules/electron`)
  });
  /*
  try {
	  require('electron-reloader')(module);
  } catch {}
  */
}

const unhandled = require('electron-unhandled');
unhandled();

// system dark mode handling
ipcMain.handle('dark-mode:toggle', () => {
  if (nativeTheme.shouldUseDarkColors) {
    nativeTheme.themeSource = 'light';
  } else {
    nativeTheme.themeSource = 'dark';
  }
  return nativeTheme.shouldUseDarkColors
});

ipcMain.handle('dark-mode:system', () => {
  nativeTheme.themeSource = 'system';
});

let _windows = [];
let _peekWins = {};

let _win = null;
const getMainWindow = () => {
  //console.log('getMainWindow', _win === null);
  if (_win === null) {
    _win = createMainWindow();
  }
  return _win;
};

const createMainWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // and load the index.html of the app.
  mainWindow.loadFile('main.html');

  // Open the DevTools.
  mainWindow.webContents.openDevTools()

  return mainWindow;
};

// 
app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    getMainWindow().show();
  }
});

const initTray = () => {
  const tray = new Tray(ICON_PATH);
  tray.setToolTip(labels.tray.tooltip);
  tray.on('click', () => {
    getMainWindow().show();
  });
  return tray;
};

const execContentScript = (script, cb) => {
  const view = new BrowserView({
    webPreferences: {
      // isolate content and do not persist it
      partition: Date.now()
    }
  });

  //win.setBrowserView(view)
  //view.setBounds({ x: 0, y: 0, width: 300, height: 300 })
  view.webContents.loadURL(script.address);

  const str = `
    const s = "${script.selector}";
    const r = document.querySelector(s);
    const value = r ? r.textContent : null;
    value;
  `;

  view.webContents.on('dom-ready', async () => {
    try {
      const r = await view.webContents.executeJavaScript(str);
      cb(r);
    } catch(ex) {
      console.error('cs exec error', ex);
      cb(null);
    }
  });
};

const initScripts = scripts => {
  return;
  // debounce me somehow so not shooting em all off
  // at once every time app starts
  scripts.forEach(script => {
    const r = execContentScript(script, (res) => {
      console.log('cs r', res);
    });
  });
};

const initGlobalShortcuts = prefs => {
  // register global activation shortcut
  if (!globalShortcut.isRegistered(prefs.globalKeyCmd)) {
    const onActivate = () => {
      getMainWindow().show();
    };

    const ret = globalShortcut.register(prefs.globalKeyCmd, onActivate);

    if (!ret) {
      console.error('Unable to register global key command.')
    }
  }
};

const showPeek = (peek) => {
  const height = peek.height || 600;
  const width = peek.width || 800;
  
  let win = null;

  const key = 'peek' + peek.keyNum;

  if (_peekWins[key]) {
    console.log('peek', peek.keyNum, 'using stored window');
    win = _peekWins[key];
    win.show();
  }
  else {
    console.log('peek', peek.keyNum, 'creating new window');
    win = new BrowserWindow({
      height,
      width,
      center: true,
      skipTaskbar: true,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      webPreferences: {
        preload: path.join(__dirname, 'peek-preload.js'),
        // isolate content and do not persist it
        partition: Date.now()
      }
    });
  }

  const onGoAway = () => {
    if (peek.keepLive) {
      _peekWins[key] = win;
      win.hide();
    }
    else {
      win.destroy();
    }
  }
  win.on('blur', onGoAway);
  win.on('close', onGoAway);

  /*
  const str = `
    window.addEventListener('keyup', e => {
      if (e.key == 'Escape') {
        console.log('peek script esc');
      }
    });
    1;
  `;

  win.webContents.on('dom-ready', async () => {
    try {
      const r = await win.webContents.executeJavaScript(str);
      console.log(r);
    } catch(ex) {
      console.error('cs exec error', ex);
    }
  });
  */

  //win.setBounds({ x: 0, y: 0, width, height })
  win.loadURL(peek.address);
};

const initPeeks = (cmdPrefix, peeks) => {
  peeks.forEach((p, i) => {
    if (!globalShortcut.isRegistered(cmdPrefix + `${i}`)) {
      const ret = globalShortcut.register(cmdPrefix + `${i}`, () => {
        showPeek(p);
      });

      if (!ret) {
        console.error('Unable to register peek');
      }
    }
  });
};

const initData = data => {
  // initialize prefs
  const prefs = data.prefs;
  initGlobalShortcuts(prefs);

  // initialize peeks
  const peeks = data.peeks;
  if (peeks.length > 0) {
    initPeeks(prefs.peekKeyPrefix, peeks);
  }

  // initialize scripts
  const scripts = data.scripts;
  if (scripts.length > 0) {
    initScripts(scripts);
  }
};

const onReady = () => {
  // create main app window on app start
  const win = getMainWindow();

  initData(data);

  initTray();

  watch(newData => {
    initData(newData);
    getMainWindow().webContents.send('configchange', {});
  });
};

app.whenReady().then(onReady);

// when renderer is ready, send over user data
ipcMain.on('getconfig', () => {
  getMainWindow().webContents.send('config', {
		data,
		schemas
  });
});

// listen for updates
ipcMain.on('setconfig', (event, newData) => {
  // write to datastore
  set(newData);
});

// ipc ESC handler
ipcMain.on('esc', (event, title) => {
  console.log('esc');
  const win = getMainWindow();
  win.close();
  _win = null;
  /*
  if (win.isVisible()) {
    console.log('win is visible, hide it');
    win.hide();
  }
  */
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  console.log('window-all-closed', process.platform);
  if (process.platform !== 'darwin') {
    onQuit();
  }
});

const onQuit = () => {
  console.log('onquit');
  // Unregister all shortcuts on app close
  globalShortcut.unregisterAll();

  app.quit();
};

})();
