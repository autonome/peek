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
  cmd: require('./features/cmd/cmd'),
  slides: require('./features/slides/slides'),
  peeks: require('./features/peeks/peeks'),
  scripts: require('./features/scripts/scripts'),
  groups: require('./features/groups/groups'),
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
      features.settings.open();
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
    debug: DEBUG,
    preloadPath,
    openWindow
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

// generic dispatch - messages only from trusted code (💀)
ipcMain.on('sendmessage', (event, msg) => {
  console.log('sendmsg', msg);

  if (!msg.hasOwnProperty('feature')) {
    console.error('sendMessage', 'no feature property in message');
    return;
  }

  const fkey = msg.feature;
  
  if (Object.keys(features).findIndex(k => k==fkey) == -1) {
    console.error('sendMessage', 'no matching feature');
    return;
  }

  const feature = features[fkey];

  if (!feature.hasOwnProperty('onMessage')) {
    console.error('sendMessage', 'feature has no message handler for', fkey);
    return;
  }

  feature.onMessage(msg.data);
});

// ipc ESC handler
ipcMain.on('esc', (event, title) => {
  console.log('esc');

  const fwin = BrowserWindow.getFocusedWindow();
  const entry = windowCache.byId(fwin.id);
  if (entry) {
    BrowserWindow.fromId(entry.id).hide();
  }
  else if (!fwin.isDestroyed()) {
    fwin.close();
  }
});

const windowCache = {
  cache: [],
  add: entry => windowCache.cache.push(entry),
  byId: id => windowCache.cache.find(w => w.id == id),
  byKey: key => windowCache.cache.find(w => w.key == key)
};

const openWindow = (params) => {
  if (params.keepLive == true) {
    const entry = windowCache.byKey(params.windowKey);
    if (entry != undefined) {
      const win = BrowserWindow.fromId(entry.id);
      if (win) {
        console.log('openWindow(): opening persistent window for', params.windowKey)
        win.show();
        return;
      }
    }
  }

  console.log('openWindow(): creating new window', params);

  const height = params.height || 600;
  const width = params.width || 800;
  const show = params.hasOwnProperty('show') ? params.show : true;

  let webPreferences = {
    preload: preloadPath,
  };

  if (!params.persistData) {
    // TODO: hack. this just isolates.
    webPreferences.partition = Date.now()
  }

  let winPreferences = {
    height,
    width,
    show,
    center: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    webPreferences
  };

  ['x', 'y'].forEach( k => {
    if (params.hasOwnProperty(k)) {
      winPreferences[k] = params[k];
    }
  });

  const win = new BrowserWindow(winPreferences);

  // if persisting window, cache the caller's key and window id
  if (params.keepLive == true) {
    windowCache.add({
      id: win.id,
      key: params.windowKey
    });
  }

  // TODO: make configurable
  const onGoAway = () => {
    if (params.keepLive) {
      win.hide();
    }
    else {
      win.destroy();
    }
  }
  win.on('blur', onGoAway);
  win.on('close', onGoAway);

  //win.webContents.send('window', { type: labels.featureType, id: win.id});

  if (params.debug) {
    win.webContents.openDevTools();
  }

  if (params.address) {
    win.loadURL(params.address);
  }
  else if (params.file) {
    win.loadFile(params.file);
  }
  else {
    console.error('openWindow: neither address nor file!');
  }

  if (params.script) {
    const script = params.script;
    const domEvent = script.domEvent || 'dom-ready';

    win.webContents.on(domEvent, async () => {
      try {
        const r = await win.webContents.executeJavaScript(script.script);
        if (script.callback) {
          script.callback(r);
        }
      } catch(ex) {
        console.error('cs exec error', ex);
        script.callback(null);
      }
      if (script.closeOnCompletion) {
        win.destroy();
      }
    });
  }
};

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

  // Close all persisent windows

  app.quit();
};

})();
