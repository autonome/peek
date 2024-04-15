// main.js
(async () => {

console.log('main');

const DEBUG = process.env.DEBUG;
const DEBUG_LEVELS = {
  BASIC: 1,
  FIRST_RUN: 2
};
const DEBUG_LEVEL = DEBUG_LEVELS.BASIC;
//const DEBUG_LEVEL = DEBUG_LEVELS.FIRST_RUN;

// Modules to control application life and create native browser window
const {
  electron,
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  Tray
} = require('electron');

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('url');

// script loaded into every app window
const preloadPath = path.join(__dirname, 'preload.js');

const APP_SCHEME = 'peek';
const APP_CORE_PATH = 'features';

// app hidden window to load
// core application logic is here
const webCoreAddress = 'peek://core/background.html';

const p = process.env.PROFILE;
console.log('env prof?', p, p != undefined, typeof p)
const profileIsLegit = p => p != undefined && typeof p == 'string' && p.length > 0;

const PROFILE =
  profileIsLegit(process.env.PROFILE)
  ? process.env.PROFILE
  : (DEBUG == true ? 'debug' : 'default');

console.log('PROFILE', PROFILE);

// Profile dirs are subdir of userData dir
// ..................................... ↓ we set this per profile
//
// {home} / {appData} / {userData} / {profileDir}
//
// Chromium's data in a subfolder of profile folder
//
// ................................................. ↓ we set this per profile
//
// {home} / {appData} / {userData} / {profileDir} / {sessionData}


// specify various app data paths and make if not exist
const defaultUserDataPath = app.getPath('userData');
const profileDataPath = path.join(defaultUserDataPath, PROFILE); 
const sessionDataPath = path.join(profileDataPath, 'chromium'); 

//console.log('udp', defaultUserDataPath);
//console.log('pdp', profileDataPath);
//console.log('sdp', sessionDataPath);

// create filesystem
if (!fs.existsSync(sessionDataPath)){
  fs.mkdirSync(sessionDataPath, { recursive: true });
}

// configure Electron with these paths
app.setPath('userData', profileDataPath);
app.setPath('sessionData', sessionDataPath);

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

// ***** Caches *****

const windowCache = {
  cache: [],
  add: entry => windowCache.cache.push(entry),
  byId: id => windowCache.cache.find(w => w.id == id),
  byKey: key => windowCache.cache.find(w => w.key == key),
  hasKey: key => windowCache.byKey(key) != undefined,
  indexOfKey: key => windowCache.cache.findIndex(w => w.key == key),
  removeByKey: key => windowCache.cache.splice(windowCache.indexOfKey(key), 1)
};

const _shortcuts = {};

const _prefs = {};

// ***** pubsub *****

const pubsub = (() => {

  const topics = new Map();

  return {
    publish: (topic, msg) => {
      console.log('ps.pub', topic, msg);
      if (topics.has(topic)) {
        topics.get(topic).forEach(subscriber => {
          subscriber(msg);
        });
      }
    },
    subscribe: (topic, cb) => {
      console.log('ps.sub', topic);
      if (!topics.has(topic)) {
        topics.set(topic, [cb]);
      }
      else {
        const subscribers = topics.get(topic);
        subscribers.push(cb);
        topics.set(topic, subscribers);
      }
    },
  };

})();

// ***** Tray *****

const ICON_RELATIVE_PATH = 'assets/icons/AppIcon.appiconset/Icon-App-20x20@2x.png';
const ICON_PATH = path.join(__dirname, ICON_RELATIVE_PATH);

let _tray = null;

const initTray = () => {
  if (!_tray || _tray.isDestroyed()) {
    _tray = new Tray(ICON_PATH);
    _tray.setToolTip(labels.tray.tooltip);
    _tray.on('click', () => {
      pubsub.publish('open', {
        feature: _prefs['features/core'].startupFeature
      });
    });
  }
  return _tray;
};

// ***** protocol handling

protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    bypassCSP: true,
    corsEnabled: true,
    allowServiceWorkers: false
  }
}]);

const initAppProtocol = () => {
  protocol.handle(APP_SCHEME, (req) => {
    const { host, pathname } = new URL(req.url);

    // TODO: nope
    if (pathname === '/') {
      pathname = 'background.html';
    }

    // TODO: unhack all this
    const isNode = pathname.indexOf('node_modules') > -1;

    const hackedPath = isNode ? pathname.replace(/^\//, '')
      : path.join(APP_CORE_PATH, host, pathname.replace(/^\//,''));

    const pathToServe = path.resolve(__dirname, hackedPath);

    const relativePath = path.relative(__dirname, pathToServe);

    // NB, this checks for paths that escape the bundle, e.g.
    // app://bundle/../../secret_file.txt
    const isSafe = relativePath && !relativePath.startsWith('..')
      && !path.isAbsolute(relativePath);

    // ugh
    if (!isNode && !isSafe) {
      console.log('NOTSAFE');
      return new Response('bad', {
        status: 400,
        headers: { 'content-type': 'text/html' }
      })
    }

    const finalPath = pathToFileURL(pathToServe).toString();

    return net.fetch(finalPath);
  });
}

// ***** init *****

// Electron app load
const onReady = () => {
  console.log('onReady');

  //https://stackoverflow.com/questions/35916158/how-to-prevent-multiple-instances-in-electron
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    console.error('APP INSTANCE ALREADY RUNNING, QUITTING');
    app.quit();
    return;
  }

  // handle peek://
  initAppProtocol();

  // init web core
  const rootWin = openWindow({
    feature: 'Core',
    address: webCoreAddress,
    show: true,
    keepLive: true,
    keepVisible: true,
    debug: DEBUG
  })

  pubsub.subscribe('prefs', msg => {
    // cache all prefs
    _prefs[msg.feature] = msg.prefs;

    // show/hide in dock and tab switcher
    if (app.dock && msg.prefs.showInDockAndSwitcher == false) {
      app.dock.hide();
    }
   
    // initialize system tray
    if (msg.prefs.showTrayIcon == true) {
      initTray();
    }

    // open default app
    pubsub.publish('open', {
      feature: msg.prefs.startupFeature
    });
  });

  // eh, for helpers really
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
    if (msg && msg.replyTopic) {
      ev.reply(msg.replyTopic, output);
    }
  });
});

ipcMain.on('closewindow', (ev, msg) => {
  closeWindow(msg.params, output => {
    if (msg && msg.replyTopic) {
      ev.reply(msg.replyTopic, output);
    }
  });
});

// generic dispatch - messages only from trusted code (💀)
ipcMain.on('publish', (ev, msg) => {
  console.log('ipc:publish', msg);

  pubsub.publish(msg.topic, msg.data);
});

ipcMain.on('subscribe', (ev, msg) => {
  console.log('ipc:subscribe', msg);

  pubsub.subscribe(msg.topic, data => {
    console.log('ipc:subscribe:notification', msg);
    ev.reply(msg.replyTopic, data);
  });
});

// ipc ESC handler
// close focused window on Escape
ipcMain.on('esc', (ev, title) => {
  console.log('index.js: ESC');
  // XXX remove
  return;

  const fwin = BrowserWindow.getFocusedWindow();
  const entry = windowCache.byId(fwin.id);
  // focused window is managed by me
  // so hide it instead of actually closing it
  if (entry) {
    BrowserWindow.fromId(entry.id).hide();
    console.log('index.js: ESC: hiding focused content window');
  }
  // focused window is me
  else if (!fwin.isDestroyed()) {
    fwin.close();
    console.log('index.js: ESC: closing focused window, is not in cache and not destroyed');
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
  console.log('openWindow', params, callback != null);

  // if no source identifier, barf
  // TODO: test the protocol
  if (!params.hasOwnProperty('feature') || params.feature == undefined) {
    throw new Error('openWindow: no identifying source for openWindow request!');
  }

  // TODO: need to figure out a better approach
  const show = params.hasOwnProperty('show') ? params.show : true;

  // keep visible
  const keepVisible = params.hasOwnProperty('keepVisible') ? params.keepVisible : false;

  // validate address
  if (!params.hasOwnProperty('address') || params.address.length <= 0) {
    console.error('openWindow: no address or is empty!');
    return;
  }

  // cache key
  // window keys can be provided by features.
  // eg for different slides that have same url, don't want to re-use window.
  //
  // otherwise use a simple concat
  //
  // TODO: need to figure out a better approach
  const key = params.key ? params.key : (params.feature + (params.address || params.file));
  console.log('openWindow', 'cache key', key);

  if (windowCache.hasKey(key)) {
    console.log('REUSING WINDOW for ', key)
    const entry = windowCache.byKey(key);
    if (entry != undefined) {
      const win = BrowserWindow.fromId(entry.id);
      if (win) {
        console.log('openWindow: opening persistent window for', key)
        if (show) {
          win.show();
        }
        else {
          // asking to open an already cached window
          // eg background app processes that weren't cleaned up maybe?
        }

        if (callback != null) {
          callback({
            cache: true,
            key: key
          });
        }

        return;
      }
    }
  }
  else {
    console.log('KEY NOT IN CACHE');
  }

  console.log('openWindow(): creating new window');

  const height = params.height || 600;
  const width = params.width || 800;

  let webPreferences = {};

  const url = new URL(params.address);

  if (url.protocol == APP_SCHEME + ':') {
    console.log('APP ADDRESS', params.address);

    //params.address = `file://${path.join(__dirname)}/${params.file}`;

    // add preload
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

  console.log('final dimension params (x, y, center)', winPreferences.x, winPreferences.y, winPreferences.center);

  let win = new BrowserWindow(winPreferences);

  // if persisting window, cache the caller's key and window id
  if (params.keepLive == true || DEBUG) {
    windowCache.add({
      id: win.id,
      key,
      params
    });
  }

  // TODO: make configurable
  const onGoAway = () => {
    if (params.keepLive == true) {
      if (params.keepVisible == false) {
        console.log('main.onGoAway(): hiding ', params.address);
        win.hide();
      }
      // else keep window alive and visible!
    }
    else {
      console.log('win.onGoAway(): destroying ', params.address);
      win.destroy();
    }
  }

  // don't do this in detached debug mode, devtools steals focus
  // and closes everything 😐
  // TODO: fix
  // TODO: should be configurable behavior
  win.on('blur', onGoAway);
  
  win.on('close', onGoAway);

  win.on('closed', () => {
    console.log('win.on(closed): deleting ', key, ' for ', params.address);
    windowCache.removeByKey(key);
    win = null;
  });

  //if (params.debug) {
    // TODO: why not working for core background page?
    //win.webContents.openDevTools({ mode: 'detach' });
    win.webContents.openDevTools();
  //}

  if (params.address) {
    win.loadURL(params.address);
  }
  else {
    console.error('openWindow: neither address nor file!');
  }

  /*
  win.webContents.on('keyup', async () => {
    console.log('main: keyup')
  });
  */

  //const escScript = "window.addEventListener('keyup', e => window.close())";
  //win.webContents.executeJavaScript(escScript);

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
            key: key,
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
  else if (callback != null) {
    callback({
      key: key
    });
  }

  return win;
};

// window closer
const closeWindow = (params, callback) => {
  console.log('closeWindow', params, callback != null);

  if (windowCache.hasKey(params.key)) {
    const winData = windowCache.byKey(params.key);
    BrowserWindow.fromId(winData.id).close();
  }
  else {
    // wtf
  }

  if (callback != null) {
    callback();
  }
};

/*
// send message to all windows
const broadcastToWindows = (topic, msg) => {
  _windows.forEach(win => {
    win.webContents.send(topic, msg);
  });
};
*/

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
