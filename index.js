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
  Notification,
  Tray
} = require('electron');

const path = require('path');
const preloadPath = path.join(__dirname, 'preload.js');

const Store = require('electron-store');

const features = {
  peeks: require('./features/peeks/peeks'),
  slides: require('./features/slides/slides'),
  scripts: require('./features/scripts/scripts'),
};

const labels = {
  app: {
    key: 'peek',
    title: 'Peek'
  },
  tray: {
    tooltip: 'Click to open'
  }
};

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

// main window
let _win = null;

// tray
let _tray = null;

const getMainWindow = () => {
  if (_win === null || _win.isDestroyed()) {
    _win = createMainWindow();
  }
  return _win;
};

const createMainWindow = () => {
  console.log('createMainWindow, preloadPath', preloadPath);
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: preloadPath
    }
  });

  /*
  mainWindow.on('close', (e) => {
    console.log('onClose - just hiding');
    e.preventDefault();
    mainWindow.hide();
  });
  */

  // and load the index.html of the app.
  mainWindow.loadFile('main.html');

  // Open the DevTools.
  mainWindow.webContents.openDevTools()

  mainWindow.webContents.send('window', {
    path: path.join(__dirname),
    id: mainWindow.id,
    type: 'main',
  });

  _windows.push(mainWindow);
  /*
  mainWindow.on('closed', () => {
    const idx = _windows.findIndex(mainWindow);
    //_windows.
  });
  */

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
  if (!_tray || _tray.isDestroyed()) {
    _tray = new Tray(ICON_PATH);
    _tray.setToolTip(labels.tray.tooltip);
    _tray.on('click', () => {
      getMainWindow().show();
    });
  }
  return _tray;
};

const getData = () => {
  let rollup = {
    prefs: {
      schema: prefsSchema,
      data: appStore.get('prefs')
    },
    features: []
  };

  Object.keys(features).forEach(k => {
    const feature = features[k];
    rollup.features.push({
      config: feature.config,
      labels: feature.labels,
      schemas: feature.schemas,
      data: feature.data
    })
  });

  return rollup;
};

const updateData = newData => {
  console.log('updateData', newData);

  if (newData.prefs) {
    appStore.set('prefs', newData.prefs);
  }

  Object.keys(newData).forEach(k => {
    if (features[k]) {
      features[k].onChange(newData[k]);
    }
  });
};

const prefsSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.prefs.schema.json",
  "title": "Peek - prefs",
  "description": "Peek user preferences",
  "type": "object",
  "properties": {
    "globalKeyCmd": {
      "description": "Global OS hotkey to load app",
      "type": "string",
      "default": "CommandOrControl+Escape"
    }
  },
  "required": [ "globalKeyCmd" ]
};

const initPrefs = store => {
  const defaults = {
    globalKeyCmd: 'CommandOrControl+Escape',
  };

  let prefs = appStore.get('prefs');
  if (!prefs) {
    store.set('prefs', defaults);
    prefs = store.get('prefs');
  }

  // register global activation shortcut
  if (globalShortcut.isRegistered(prefs.globalKeyCmd)) {
    globalShortcut.unregister(prefs.globalKeyCmd);
  }

  const onGlobalKeyCmd = () => getMainWindow().show();

  const ret = globalShortcut.register(prefs.globalKeyCmd, onGlobalKeyCmd);

  if (!ret) {
    console.error('Unable to register global key command.')
  }
};

const initFeatures = (features) => {

  // TODO: allow features to register
  // as app level prefs for enable/disable 

  // inject into features
  // eventually get to less tight coupling
  const api = {
    preloadPath,
  };

  const featureContainerPrefix = 'peekFeature';

  Object.keys(features).forEach(k => {
    const feature = features[k];
    const storeName = `${featureContainerPrefix}${feature.labels.featureType}`;

    // have to make per feature stores for now, pfftt
    // maybe fine, better isolation
    const featureStore = new Store({
      name: storeName,
      // TODO: figure out schema approach here
      //schema: fullSchema,
      watch: true
    });

    featureStore.onDidAnyChange(newData => {
      initData();
      //win.webContents.send('configchange', {});
    });

    feature.init(api, featureStore);
  });
};

// initialized all bits which need updating if the data changes
// can be called repeatedly to refresh on changes
const initData = () => {
  // initialize app prefs
  initPrefs(appStore);

  initFeatures(features);

  /*
  // initialize slides
  if (data.slides.length > 0) {
    initSlides(prefs.slideKeyPrefix, data.slides);
  }

  // initialize scripts
  if (data.scripts.length > 0) {
    initScripts(data.scripts);
  }
  */
};

const appStore = new Store({
  name: labels.app.key,
  // TODO: re-enable schemas
  //schema: fullSchema,
  watch: true
});

// DEBUG
appStore.clear();

// app load
const onReady = () => {
  console.log('onReady');

  // create main app window on app start
  const win = getMainWindow();

  // keep app out of dock and tab switcher
  if (app.dock) {
    app.dock.hide();
  }

  initTray();

  initData();

  appStore.onDidAnyChange(newData => {
    initData();
    win.webContents.send('configchange', {});
  });
};

app.whenReady().then(onReady);

// when renderer is ready, send over user data
ipcMain.on('getconfig', (ev, data) => {
  getMainWindow().webContents.send('config', getData())
});

// listen for updates
ipcMain.on('setconfig', (event, newData) => {
  // TODO: if any shortcuts changed, unregister the old ones

  // write to datastore
  updateData(newData);
});

// ipc ESC handler
ipcMain.on('esc', (event, title) => {
  console.log('esc');

  const fwin = BrowserWindow.getFocusedWindow();

  //
  if (!fwin.isDestroyed()) {
    console.log('esc: killingit');
    fwin.close();
    //win.destroy();
    //_win = null;
  }
  //
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
  //
  if (!_win.isDestroyed()) {
    console.log('wac: killingit');
    _win.destroy();
    _win = null;
  }
  /*
  if (_win.isVisible()) {
    console.log('win is visible, hide it');
    //_win.hide();
  }
  */
  
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
