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
    console: 'console',
  },
  topics: {
    prefs: 'topic:core:prefs'
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

/*
const isDev = require('electron-is-dev');

if (isDev) {
}
*/

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

// keyed on window id
const windows = new Map();

// keyed on source address
const shortcuts = new Map();

// app global prefs configurable by user
// populated during app init
let _prefs = {};

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
        address: _prefs.startupFeature
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

  // listen for app prefs to configure ourself
  // TODO: kinda janky, needs rethink
  pubsub.subscribe(strings.topics.prefs, msg => {
    console.log('PREFS', msg);

    // cache all prefs
    _prefs = msg.prefs;

    // show/hide in dock and tab switcher
    if (DEBUG == false || (app.dock && msg.prefs.showInDockAndSwitcher == false)) {
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
    source: webCoreAddress,
    address: webCoreAddress,
    show: false,
    keepLive: true,
    keepVisible: true,
    debug: DEBUG
  })

  // eh, for helpers really
  registerShortcut(strings.defaults.quitShortcut, onQuit);
};

app.whenReady().then(onReady);

// ***** API *****

ipcMain.on(strings.msgs.registerShortcut, (ev, msg) => {
  console.log('ipc register shortcut', msg);

  // record source of shortcut
  shortcuts.set(msg.shortcut, msg.source);

  registerShortcut(msg.shortcut, () => {
    console.log('on(registershortcut): shortcut executed', msg.shortcut, msg.replyTopic)
    ev.reply(msg.replyTopic, {});
  });
});

ipcMain.on(strings.msgs.unregisterShortcut, (ev, msg) => {
  console.log('ipc unregister shortcut', msg);

  unregisterShortcut(msg.shortcut, res => {
    console.log('ipc unregister shortcut callback result:', res);
  });
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
    console.log('main.closeWindow api callback, output:', output);
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

ipcMain.on(strings.msgs.console, (ev, msg) => {
  console.log('r:', msg.source, msg.text);
});

// ***** Helpers *****

const registerShortcut = (shortcut, callback) => {
  console.log('registerShortcut', shortcut)

  if (globalShortcut.isRegistered(shortcut)) {
    console.error(strings.shortcuts.errorAlreadyRegistered, shortcut);
    globalShortcut.unregister(shortcut);
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
    console.error('Unable to unregister shortcut because not registered or it is not us', shortcut);
    return new Error("Failed in some way", { cause: err });
  }

  globalShortcut.unregister(shortcut, () => {
    console.log('shortcut unregistered', shortcut);

    // delete from cache
    shortcuts.delete(shortcut);
    callback();
  });
};

// unregister any shortcuts this address registered
// and delete entry from cache
const unregisterShortcutsForAddress = (aAddress) => {
  for (const [shortcut, address] of shortcuts) {
    if (address == aAddress) {
      console.log('unregistering', shortcut, 'for', address);
      unregisterShortcut(shortcut);
    }
  }
};

// window opener
const openWindow = (params, callback) => {
  console.log('openWindow', params, callback != null);

  // if no source identifier, barf
  // TODO: test the protocol
  if (!params.hasOwnProperty('source') ||
    params.source == undefined) {
    throw new Error('openWindow: no identifying source for openWindow request!');
  }
  const source = params.source;

  // TODO: need to figure out a better approach
  const show = params.hasOwnProperty('show') ? params.show : true;

  // keep visible
  const keepVisible = params.hasOwnProperty('keepVisible') ? params.keepVisible : false;

  // validate address
  if (!params.hasOwnProperty('address') || params.address.length == 0) {
    console.error('openWindow: no address or is empty!');
    return;
  }

  const url = new URL(params.address);
  const address = url.toString();
  const isPrivileged = url.protocol.startsWith(APP_PROTOCOL);

  /*
  // need to make an address scheme that has opaque host
  // AND origin - which isn't a thing really:
  // https://github.com/whatwg/url/issues/690
  // for now, hack out the "host".
  const separator = ':';
  const pseudoHost = isPrivileged ? params.pathName.split('/').shift()
    : 'web';
  */

  let retval = {
    source,
    fromCache: false
  };

  const key = params.hasOwnProperty('key') ? params.key : null;

  // get window id if exists
  let id = null;
  if (params.id && windows.has(params.id)) {
    id = params.id;
  }
  else if (key != null) {
    windows.forEach((w) => {
      if (w.source == source && w.params.key == key) {
        id = w.id;
      }
    });
  }

  console.log('openWindow', 'param id', id);

  let win = null;

  // Reuse existing window if caller passed a valid window id
  if (id != null) {
    console.log('REUSING WINDOW for ', address);
    retval.id = id;

    const entry = windows.get(id);

    win = BrowserWindow.fromId(entry.id);
    if (show) {
      win.show();
    }

    retval.id = id;
    retval.fromCache = true;
  }
  // Open new window
  else {
    console.log('openWindow(): creating new window');

    const height = params.height || APP_DEF_HEIGHT;
    const width = params.width || APP_DEF_WIDTH;

    let webPreferences = {};

    // privileged app addresses get special powers
    if (isPrivileged) {
      console.log('APP ADDRESS', address);

      // add preload
      webPreferences.preload = preloadPath;
    }

    if (!params.persistState) {
      // TODO: hack. this just isolates.
      webPreferences.partition = Date.now()
    }

    let winPrefs = {
      height,
      width,
      show,
      skipTaskbar: true, // TODO
      autoHideMenuBar: true, // TODO
      titleBarStyle: 'hidden', // TODO
      webPreferences
    };

    ['x', 'y'].forEach( k => {
      if (params.hasOwnProperty(k)) {
        winPrefs[k] = params[k];
      }
    });

    if (winPrefs.x == undefined
      && winPrefs.y == undefined) {
      winPrefs.center = true;
    }

    if (params.hasOwnProperty('transparent')
      && typeof params.transparent == 'boolean'
      && params.transparent == true) {
      winPrefs.transparent = params.transparent;
      winPrefs.frame = false;
      //winPrefs.fullscreen = true;
      //mainWindow.setIgnoreMouseEvents(true);

      // wait until load event and resize
      // (maybe do this in preload?)
      //win.setSize(width,height)
      winPrefs.useContentSize = true;
      //delete winPrefs.height;
      //delete winPrefs.width;
    }
    // can't have both transparent and resizable
    // TODO: need reference and testing
    // and maybe error somehow
    else if (params.hasOwnProperty('resizable')
      && typeof params.resizable == 'boolean') {
      winPrefs.resizable = params.resizable;
    }

    console.log('Opening window with:', winPrefs);

    win = new BrowserWindow(winPrefs);

    id = win.id;

    // add to cache
    windows.set(win.id, {
      id: win.id,
      source,
      params
    });

    // don't do this in detached debug mode, devtools steals focus
    // and closes everything 😐
    // TODO: fix
    // TODO: should be configurable behavior
    if (!DEBUG) {
      win.on('blur', () => {
        console.log('openWindow.onBlur() for', address);
        closeOrHideWindow(id);
      });
    }
    
    /*
    win.on('close', () => {
      console.log('openWindow.onClose() for', address);
      // TODO: confirm if there's anything we still need to do here
      //closeOrHideWindow(id);
    });
    */

    // post actual close clean-up
    win.on('closed', () => {
      console.log('openWindow.onClosed: deleting ', id, ' for ', address);

      // unregister any shortcuts this window registered
      if (isPrivileged) {
        unregisterShortcutsForAddress(address)
        console.log('unregistered shortcuts');
      }

      // remove from cache
      windows.delete(win.id);

      win = null;
    });

    // TODO: use an actual devtools param
    // not just implicit via debug
    if (DEBUG || params.debug) {
      // TODO: make detach mode configurable
      // really want to get so individual app windows can easily control this
      // for themselves
      win.webContents.openDevTools({ mode: 'detach' });
      //win.webContents.openDevTools();

      // when devtools completely open
      win.webContents.on('devtools-opened', () => {
        // if window is visible, focus content window
        if (show) {
          win.webContents.focus();
        }
        // otherwise force devtools focus
        // (for some reason doesn't focus when no visible window...)
        else {
          app.focus();
        }
      });
    }

    win.loadURL(address);
  }

  retval.id = id;

  // esc handler 
  // TODO: make user-configurable
  win.webContents.on('before-input-event', (e, i) => {
    //console.log('BIE', i.type, i.key);
    if (i.key == 'Escape' && i.type == 'keyUp') {
      //console.log('openWindow.wc.BIE(): esc', i);
      closeOrHideWindow(id);
    }
  });

  //win.webContents.send('window', { type: labels.featureType, id: win.id});
  //broadcastToWindows('window', { type: labels.featureType, id: win.id});

  // TODO: fix func-level callback handling and resp obj
  if (params.script) {
    const script = params.script;
    const domEvent = script.domEvent || 'dom-ready';

    win.webContents.on(domEvent, async () => {
      try {
        const r = await win.webContents.executeJavaScript(script.script);
        retval.scriptOutput = r;
      } catch(ex) {
        retval.scriptError = ex;
        console.error('cs exec error', ex);
      }
      if (script.closeOnCompletion) {
        win.destroy();
      }
    });
  }

  // exec callback if present and valid
  if (callback != null && typeof callback == 'function') {
    callback(retval);
  }

  return win;
};

// window closer
// this will actually close the the window
// regardless of "keep alive" opener params
const closeWindow = (params, callback) => {
  console.log('closeWindow', params, callback != null);

  let retval = false;

  if (params.hasOwnProperty('id') && windows.has(params.id)) {
    console.log('closeWindow(): closing', params.id);

    const entry = windows.get(params.id);
    if (!entry) {
      // wtf
      return;
    }

    closeChildWindows(entry.params.address);

    BrowserWindow.fromId(params.id).close();

    retval = true;
  }

  if (callback != null) {
    callback(retval);
  }
};

const closeOrHideWindow = id => {
  console.log('CLOSEORHIDEWINDOW', id);

  const win = BrowserWindow.fromId(id);
  if (win.isDestroyed()) {
    return;
  }

  const entry = windows.get(id);
  if (!entry) {
    // wtf
    return;
  }

  const params = entry.params;

  if (params.keepLive == true) {
    console.log('closeOrHideWindow(): hiding ', params.address);
    win.hide();
  }
  else {
    // close any open windows this window opened
    // TODO: need a "force" mode for this
    closeChildWindows(params.address);

    console.log('closeOrHideWindow(): closing ', params.address);
    win.close();
  }
  console.log('DONE closeorhidewindow');
};

const closeChildWindows = (aAddress) => {
  console.log('closeChildWindows()', aAddress);

  if (aAddress == webCoreAddress) {
    return;
  }

  for (const [id, entry] of windows) {
    if (entry.source == aAddress) {
      const address = entry.params.address;
      console.log('closing child window', address, 'for', aAddress);

      // recurseme
      closeChildWindows(address);

      // close window
      BrowserWindow.fromId(id).close();
    }
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
