// main.js
(async () => {

console.log('main');


const DEBUG = process.env.DEBUG;

// Modules to control application life and create native browser window
const {
  electron,
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  Tray
} = require('electron');

const path = require('path');
const preloadPath = path.join(__dirname, 'preload.js');

const webCoreAddress = 'features/core/background.html';

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

// ***** Features / Strings *****

const labels = {
  app: {
    key: 'peek',
    title: 'Peek'
  },
  tray: {
    tooltip: 'Click to open'
  }
};

// ***** System / OS / Theme *****

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

// TODO: when does this actually hit on each OS?
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
      //features.settings.open();
    });
  }
  return _tray;
};

// ***** Caches *****

const _windows = new Set();

const windowCache = {
  cache: [],
  add: entry => windowCache.cache.push(entry),
  byId: id => windowCache.cache.find(w => w.id == id),
  byKey: key => windowCache.cache.find(w => w.key == key)
};

const _shortcuts = {};

// Electron app load
const onReady = () => {
  console.log('onReady');

  // keep app out of dock and tab switcher
  if (app.dock) {
    app.dock.hide();
  }

  // initialize system tray
  // mostly just useful to know if the app is running or not
  initTray();

  // init web core
  openWindow({
    feature: 'Core',
    file: webCoreAddress,
    show: true,
    debug: DEBUG
  })

  /*
  // open settings on startup for now
  if (BrowserWindow.getAllWindows().length === 0) {
    features.settings.open();
  }
  */

  registerShortcut('Option+q', onQuit);
};

app.whenReady().then(onReady);

// ***** API *****

ipcMain.on('registershortcut', (ev, msg) => {
  //_shortcuts[msg.shortcut] = msg.replyTopic;
  registerShortcut(msg.shortcut, () => {
    console.log('on(registershortcut): shortcut executed', msg.shortcut, msg.replyTopic)
    ev.reply(msg.replyTopic, {});
  });
});

ipcMain.on('unregistershortcut', (ev, msg) => {
  if (globalShortcut.isRegistered(msg.shortcut)) {
    globalShortcut.unregister(msg.shortcut);
  }
});

ipcMain.on('openwindow', (ev, msg) => {
  openWindow(msg.params, output => {
    if (msg.replyTopic) {
      ev.reply(msg.replyTopic, { output });
    }
  });
});

// generic dispatch - messages only from trusted code (💀)
ipcMain.on('sendmessage', (ev, msg) => {
  console.log('sendmsg', msg);
});

// ipc ESC handler
ipcMain.on('esc', (ev, title) => {
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

ipcMain.on('console', (ev, msg) => {
  console.log('r:', msg.source, msg.text);
});

// ***** Helpers *****

const registerShortcut = (shortcut, callback) => {
  console.log('registerShortcut', shortcut)

  if (globalShortcut.isRegistered(shortcut)) {
    globalShortcut.unregister(shortcut);
  }

  const ret = globalShortcut.register(shortcut, () => {
    console.log('shortcut executed', shortcut);
    callback();
  });

  if (!ret) {
    console.error('Unable to register shortcut', shortcut);
    return new Error("Failed in some way", { cause: err });
  }
};

// window opener
const openWindow = (params, callback) => {
  console.log('openWindow', params);

  // if no source identifier, barf
  if (!params.hasOwnProperty('feature') || params.feature == undefined) {
    throw new Error('openWindow: no identifying source for openWindow request!');
  }

  // TODO: need to figure out a better approach
  const show = params.hasOwnProperty('show') ? params.show : true;

  // cache key
  // TODO: need to figure out a better approach
  const key = params.feature + (params.address || params.file);

  if (params.keepLive == true) {
    const entry = windowCache.byKey(key);
    if (entry != undefined) {
      const win = BrowserWindow.fromId(entry.id);
      if (win) {
        console.log('openWindow: opening persistent window for', key)
        if (show) {
          win.show();
        }
        return;
      }
    }
  }

  console.log('openWindow(): creating new window');

  const height = params.height || 600;
  const width = params.width || 800;

  let webPreferences = {};

  if (params.file) {
    console.log('FILE', params.file);
    params.address = `file://${path.join(__dirname)}/${params.file}`;
    webPreferences.preload = preloadPath;
  }

  if (!params.persistData) {
    // TODO: hack. this just isolates.
    webPreferences.partition = Date.now()
  }

  let winPreferences = {
    height,
    width,
    show,
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

  if (winPreferences.x == undefined && winPreferences.y == undefined) {
    winPreferences.center = true;
  }

  console.log('final params', winPreferences.x, winPreferences.y);

  let win = new BrowserWindow(winPreferences);

  // if persisting window, cache the caller's key and window id
  if (params.keepLive == true) {
    windowCache.add({
      id: win.id,
      key: key
    });
  }

  // TODO: make configurable
  const onGoAway = () => {
    if (params.keepLive) {
      //console.log('win.onGoAway(): hiding ', params.address);
      win.hide();
    }
    else {
      //console.log('win.onGoAway(): destroying ', params.address);
      win.destroy();
    }
  }
  win.on('blur', onGoAway);
  win.on('close', onGoAway);

  win.on('closed', () => {
    //console.log('win.on(closed): deleting ', key, ' for ', params.address);
    _windows.delete(win);
    win = null;
  });

  if (params.debug) {
    win.webContents.openDevTools();
  }

  if (params.address) {
    win.loadURL(params.address);
  }
  else {
    console.error('openWindow: neither address nor file!');
  }

  //win.webContents.send('window', { type: labels.featureType, id: win.id});
  //broadcastToWindows('window', { type: labels.featureType, id: win.id});

	// TODO: fix func-level callback handling and resp obj

  if (params.script) {
    const script = params.script;
    const domEvent = script.domEvent || 'dom-ready';

    win.webContents.on(domEvent, async () => {
      try {
        const r = await win.webContents.executeJavaScript(script.script);
        if (callback) {
          callback({
						scriptOutput: r
					});
        }
      } catch(ex) {
        console.error('cs exec error', ex);
      }
      if (script.closeOnCompletion) {
        win.destroy();
      }
    });
  }
};

// send message to all windows
const broadcastToWindows = (topic, msg) => {
  _windows.forEach(win => {
    win.webContents.send(topic, msg);
  });
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
  console.log('onQuit');
  // Close all persisent windows?

  app.quit();
};

})();
