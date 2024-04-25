// main.js

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

(async () => {

console.log('main');

const DEBUG = process.env.DEBUG || false;
const DEBUG_LEVELS = {
  BASIC: 1,
  FIRST_RUN: 2
};
const DEBUG_LEVEL = DEBUG_LEVELS.BASIC;
//const DEBUG_LEVEL = DEBUG_LEVELS.FIRST_RUN;

// script loaded into every app window
const preloadPath = path.join(__dirname, 'preload.js');

const APP_SCHEME = 'peek';
const APP_PROTOCOL = `${APP_SCHEME}:`;
const APP_CORE_PATH = 'features';

const APP_DEF_WIDTH = 1024;
const APP_DEF_HEIGHT = 768;

// app hidden window to load
// core application logic is here
const webCoreAddress = 'peek://core/background.html';

const strings = {
  defaults: {
    quitShortcut: 'Option+q'
  },
  msgs: {
    registerShortcut: 'registershortcut',
    unregisterShortcut: 'unregistershortcut',
    publish: 'publish',
    subscribe: 'subscribe',
    openWindow: 'openwindow',
    closeWindow: 'closewindow',
    escape: 'esc',
    console: 'console',
  },
  topics: {
    prefs: 'prefs'
  },
  shortcuts: {
    errorAlreadyRegistered: 'Shortcut already registered',
    errorRegistrationFailed: 'Shortcut registration failed'
  }
};

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

const windows = new Map();

const windowByKey = k => {
  let ret = null;
  windows.forEach((w, id) => {
    if (w.key == k) {
      ret = id;
    }
  });
  return ret;
};

/*
const windows = {
  cache: [],
  add: entry => windows.cache.push(entry),
  byId: id => windows.cache.find(w => w.id == id),
  byKey: key => windows.cache.find(w => w.key == key),
  hasKey: key => windows.byKey(key) != undefined,
  indexOfKey: key => windows.cache.findIndex(w => w.key == key),
  removeByKey: key => windows.cache.splice(windows.indexOfKey(key), 1)
};
*/

const _shortcuts = {};

const _prefs = {};

// ***** pubsub *****

const pubsub = (() => {

  const topics = new Map();

  return {
    publish: (topic, msg) => {
      console.log('ps.pub', topic);
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
        address: _prefs[webCoreAddress].startupFeature
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

  pubsub.subscribe(strings.topics.prefs, msg => {
    // cache all prefs
    _prefs[msg.source] = msg.prefs;

    // show/hide in dock and tab switcher
    if (app.dock && !msg.prefs.showInDockAndSwitcher) {
      console.log('hiding dock');
      app.dock.hide();
    }
   
    // initialize system tray
    if (msg.prefs.showTrayIcon == true) {
      console.log('showing tray');
      initTray();
    }

    // open default app
    pubsub.publish('open', {
      address: msg.prefs.startupFeature
    });
  });

  // init web core
  const coreWin = openWindow({
    source: this, // um, wat
    address: webCoreAddress,
    show: DEBUG,
    keepLive: true,
    keepVisible: true,
    debug: DEBUG
  })

  // eh, for helpers really
  registerShortcut(strings.defaults.quitShortcuts, onQuit);
};

app.whenReady().then(onReady);

// ***** API *****

ipcMain.on(strings.msgs.registerShortcut, (ev, msg) => {
  //_shortcuts[msg.shortcut] = msg.replyTopic;
  registerShortcut(msg.shortcut, () => {
    console.log('on(registershortcut): shortcut executed', msg.shortcut, msg.replyTopic)
    ev.reply(msg.replyTopic, {});
  });
});

ipcMain.on(strings.msgs.unregisterShortcut, (ev, msg) => {
  if (globalShortcut.isRegistered(msg.shortcut)) {
    globalShortcut.unregister(msg.shortcut);
  }
});

ipcMain.on(strings.msgs.openWindow, (ev, msg) => {
  openWindow(msg.params, output => {
    if (msg && msg.replyTopic) {
      ev.reply(msg.replyTopic, output);
    }
  });
});

ipcMain.on(strings.msgs.closeWindow, (ev, msg) => {
  closeWindow(msg.params, output => {
    if (msg && msg.replyTopic) {
      ev.reply(msg.replyTopic, output);
    }
  });
});

// generic dispatch - messages only from trusted code (💀)
ipcMain.on(strings.msgs.publish, (ev, msg) => {
  console.log('ipc:publish', msg);

  pubsub.publish(msg.topic, msg.data);
});

ipcMain.on(strings.msgs.subscribe, (ev, msg) => {
  console.log('ipc:subscribe', msg);

  pubsub.subscribe(msg.topic, data => {
    console.log('ipc:subscribe:notification', msg);
    ev.reply(msg.replyTopic, data);
  });
});

// ipc ESC handler
// close focused window on Escape
ipcMain.on(strings.msgs.escape, (ev, title) => {
  console.log('index.js: ESC');

  const fwin = BrowserWindow.getFocusedWindow();
  const entry = windows.get(fwin.id);
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

ipcMain.on(strings.msgs.console, (ev, msg) => {
  console.log('r:', msg.source, msg.text);
});

// ***** Helpers *****

const registerShortcut = (shortcut, callback) => {
  console.log('registerShortcut', shortcut)

  if (globalShortcut.isRegistered(shortcut)) {
    console.error(strings.shortcuts.errorAlreadyRegistered, shortcut);
    //globalShortcut.unregister(shortcut);
    return new Error(strings.shortcuts.errorAlreadyRegisterd);
  }

  const ret = globalShortcut.register(shortcut, () => {
    console.log('shortcut executed', shortcut);
    callback();
  });

  if (ret != true) {
    console.error('Unable to register shortcut', shortcut);
    return new Error(strings.shortcuts.errorRegistrationFailed);
  }
};

const unregisterShortcut = (shortcut, callback) => {
  console.log('unregisterShortcut', shortcut)

  if (!globalShortcut.isRegistered(shortcut)) {
    console.error('Unable to register shortcut', shortcut);
    return new Error("Failed in some way", { cause: err });
  }

  const ret = globalShortcut.unregister(shortcut, () => {
    console.log('shortcut executed', shortcut);
    callback();
  });

  if (!ret) {
    console.error('Unable to unregister shortcut', shortcut);
    return new Error("Failed in some way", { cause: err });
  }
};

// window opener
const openWindow = (params, callback) => {
  console.log('openWindow', params, callback != null);

  // if no source identifier, barf
  // TODO: test the protocol
  if (!params.hasOwnProperty('source') || params.source == undefined) {
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

  // need to make an address scheme that has opaque host
  // AND origin - which isn't a thing really:
  // https://github.com/whatwg/url/issues/690
  // for now, hack out the "host".
  const url = new URL(params.address);
  const isPrivileged = url.protocol.startsWith(APP_PROTOCOL);
  /*
  const separator = ':';
  const pseudoHost = isPrivileged ? params.pathName.split('/').shift()
    : 'web';
  */

  // generate window cache key
  //
  // window keys can be provided by features.
  //
  // this gives apps ability to have singleton windows vs copies
  //
  // otherwise use a simple concat
  //
  // TODO: need to figure out a better approach
  const key = params.key ? params.key : params.address;

  console.log('openWindow', 'cache key', key);

  const id = windowByKey(key);

  if (id != null) {
    console.log('REUSING WINDOW for ', key)
    const entry = windows.get(id);
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

  const height = params.height || APP_DEF_HEIGHT;
  const width = params.width || APP_DEF_WIDTH;

  let webPreferences = {};

  // privileged app addresses get special powers
  if (isPrivileged) {
    console.log('APP ADDRESS', params.address);

    // add preload
    webPreferences.preload = preloadPath;
  }

  if (!params.persistState) {
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

  if (winPreferences.x == undefined
    && winPreferences.y == undefined) {
    winPreferences.center = true;
  }

  if (params.hasOwnProperty('transparent')
    && typeof params.transparent == 'boolean') {
    winPreferences.transparent = params.transparent;
    winPreferences.frame = false;
    //winPreferences.fullscreen = true;
    //mainWindow.setIgnoreMouseEvents(true);

    // wait until load event and resize
    // (maybe do this in preload?)
    //win.setSize(width,height)
    winPreferences.useContentSize = true;
    delete winPreferences.height;
    delete winPreferences.width;
  }
  // can't have both
  // TODO: need reference and testing
  // and maybe error somehow
  else if (params.hasOwnProperty('resizable')
    && typeof params.resizable == 'boolean') {
    winPreferences.resizable = params.resizable;
  }

  console.log('final dimension params (x, y, center)', winPreferences.x, winPreferences.y, winPreferences.center);

  const win = new BrowserWindow(winPreferences);

  // if persisting window, cache the caller's key and window id
  if (params.keepLive == true) {
    windows.set(win.id, {
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
    windows.delete(win.id);
    //win = null;
  });

  if (DEBUG || params.debug) {
    // TODO: why not working for core background page?
    //win.webContents.openDevTools({ mode: 'detach' });
    win.webContents.openDevTools();
  }

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

  let retval = false;
  const id = windowByKey(params.key);
  if (id != null) {
    BrowserWindow.fromId(id).close();
    retval = true;
  }

  if (callback != null) {
    callback(retval);
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
