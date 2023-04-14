// main.js
(async () => {

console.log('main');

const DEBUG = process.env.DEBUG;

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

// ***** Developer / Error handling / Etc *****
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

// ***** System / OS / Theme / Etc *****

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

// ***** App / Strings / Etc *****

const features = {
  settings: require('./features/settings/settings'),
  input: require('./features/input/input'),
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

// ***** Caches *****

// vestigial?
let _windows = [];

// main window
let _win = null;

// TODO: make this open settings?
app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    //getMainWindow().show();
  }
});

// ***** Tray *****

const ICON_RELATIVE_PATH = 'assets/icons/AppIcon.appiconset/Icon-App-20x20@2x.png';
const ICON_PATH = path.join(__dirname, ICON_RELATIVE_PATH);

let _tray = null;

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

// ***** Data *****

const getData = () => {
  let rollup = {
    features: []
  };

  Object.keys(features).forEach(k => {
    const feature = features[k];

    //console.log('feature', feature);

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

  Object.keys(newData).forEach(k => {
    console.log('updateData: key exists?', k);
    if (features[k]) {
      console.log('updateData: yes, updating with', newData[k]);
      features[k].onChange(newData[k]);
    }
  });
};

// initialized all bits which need updating if the data changes
// can be called repeatedly to refresh on changes
const initFeatures = () => {
  console.log('initFeatures');
  // TODO: allow features to register
  // as app level prefs for enable/disable 

  // inject into features
  // eventually get to less tight coupling
  const api = {
    preloadPath,
  };

  const datastorePrefix = 'peekFeature';

  Object.keys(features).forEach(k => {
    console.log('main:initFeatures()', k);
    const feature = features[k];

    if (!feature.labels) {
      console.error('feature?', feature)
    }
    const storeName = `${datastorePrefix}${feature.labels.featureType}`;

    // have to make per feature stores for now, pfftt
    // maybe fine, better isolation
    const featureStore = new Store({
      name: storeName,
      // TODO: figure out schema approach here
      //schema: fullSchema,
      watch: true
    });

    if (DEBUG) {
      //console.log('main: clearing datastore', k)
      featureStore.clear();
    }

    feature.init(api, featureStore);

    featureStore.onDidAnyChange(initFeatures);
  });
};

// app load
const onReady = () => {
  console.log('onReady');

  // keep app out of dock and tab switcher
  if (app.dock) {
    app.dock.hide();
  }

  initTray();

  initFeatures(features);

  // open settings on startup for now
  if (BrowserWindow.getAllWindows().length === 0) {
    features.settings.open();
  }

};

app.whenReady().then(onReady);

// when renderer is ready, send over user data
ipcMain.on('getconfig', (ev, data) => {
  console.log('main: getconfig')
  //ev.sender.hostWebContents.send('config', getData())
  ev.reply('config', getData())
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
  /*
  if (!_win.isDestroyed()) {
    console.log('wac: killingit');
    _win.destroy();
    _win = null;
  }
  */
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
