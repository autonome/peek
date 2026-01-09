// main.js

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
} from 'electron';

import fs from 'node:fs';
import path from 'node:path';

// Import from compiled TypeScript backend
import {
  // Main process orchestration
  configure,
  initialize,
  discoverBuiltinExtensions,
  createExtensionWindow,
  loadEnabledExtensions,
  getRunningExtensions,
  destroyExtensionWindow,
  getExtensionWindow,
  registerWindow,
  getWindowInfo,
  findWindowByKey,
  shutdown,
  // Database
  getDb,
  isValidTable,
  // Datastore operations
  addAddress,
  getAddress,
  updateAddress,
  queryAddresses,
  addVisit,
  queryVisits,
  addContent,
  queryContent,
  getOrCreateTag,
  tagAddress,
  untagAddress,
  getTagsByFrecency,
  getAddressTags,
  getAddressesByTag,
  getUntaggedAddresses,
  getTable,
  setRow,
  getStats,
  // Protocol
  APP_SCHEME,
  APP_PROTOCOL,
  registerExtensionPath,
  getExtensionPath,
  loadExtensionManifest,
  // Tray
  initTray,
  // Shortcuts
  registerGlobalShortcut,
  unregisterGlobalShortcut,
  registerLocalShortcut,
  unregisterLocalShortcut,
  unregisterShortcutsForAddress,
  // PubSub
  scopes,
  publish as pubsubPublish,
  subscribe as pubsubSubscribe,
  getSystemAddress,
} from './dist/backend/electron/index.js';
import unhandled from 'electron-unhandled';

// Catch unhandled errors and promise rejections without showing alert dialogs
unhandled({
  showDialog: false,
  logger: (error) => {
    console.error('Unhandled error:', error);
  }
});

const __dirname = import.meta.dirname;

(async () => {

const DEBUG = process.env.DEBUG || false;
const DEBUG_LEVELS = {
  BASIC: 1,
  FIRST_RUN: 2
};
const DEBUG_LEVEL = DEBUG_LEVELS.BASIC;
//const DEBUG_LEVEL = DEBUG_LEVELS.FIRST_RUN;

// script loaded into every app window
const preloadPath = path.join(__dirname, 'preload.js');

const APP_CORE_PATH = 'app';

const APP_DEF_WIDTH = 1024;
const APP_DEF_HEIGHT = 768;

// app hidden window to load
// core application logic is here
const webCoreAddress = 'peek://app/background.html';
//const webCoreAddress = 'peek://test/index.html';

const systemAddress = getSystemAddress();
const settingsAddress = 'peek://app/settings/settings.html';

const strings = {
  defaults: {
    quitShortcut: 'Option+q'
  },
  msgs: {
    registerShortcut: 'registershortcut',
    unregisterShortcut: 'unregistershortcut',
    publish: 'publish',
    subscribe: 'subscribe',
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

const profileIsLegit = p => p != undefined && typeof p == 'string' && p.length > 0;

// Profile selection:
// 1. Explicit PROFILE env var takes precedence
// 2. Packaged app uses 'default' (production)
// 3. Running from source uses 'dev' (development)
const PROFILE = profileIsLegit(process.env.PROFILE)
  ? process.env.PROFILE
  : (app.isPackaged ? 'default' : 'dev');

console.log('PROFILE', PROFILE, app.isPackaged ? '(packaged)' : '(source)');

// Test profiles skip certain behaviors (devtools, dialogs, etc.)
const isTestProfile = PROFILE.startsWith('test');

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

// ***** Datastore *****

// Note: getDb, generateId, now, parseUrl, normalizeUrl, calculateFrecency, isValidTable
// are imported directly from backend/electron

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

// app global prefs configurable by user
// populated during app init
let _prefs = {};
let _quitShortcut = null;

// ***** Window Manager *****

class WindowManager {
  constructor() {
    this.windows = new Map();

    // Track window close events to clean up
    app.on('browser-window-created', (_, window) => {
      window.on('closed', () => {
        const windowId = window.id;
        const windowData = this.getWindow(windowId);

        // Notify subscribers that window was closed
        if (windowData) {
          pubsub.publish(windowData.source, scopes.GLOBAL, 'window:closed', {
            id: windowId,
            source: windowData.source
          });
        }

        // Remove from window manager
        this.removeWindow(windowId);
      });

      // Handle local shortcuts on all windows via before-input-event
      window.webContents.on('before-input-event', (event, input) => {
        if (handleLocalShortcut(input)) {
          event.preventDefault();
        }
      });
    });
  }
  
  addWindow(id, options) {
    this.windows.set(id, options);
  }
  
  getWindow(id) {
    return this.windows.get(id);
  }
  
  removeWindow(id) {
    this.windows.delete(id);
  }
  
  findWindowByKey(source, key) {
    if (!key) return null;
    
    for (const [id, win] of this.windows) {
      if (win.source === source && win.params && win.params.key === key) {
        return { id, window: BrowserWindow.fromId(id), data: win };
      }
    }
    return null;
  }
  
  getChildWindows(source) {
    const children = [];
    for (const [id, win] of this.windows) {
      if (win.source === source) {
        children.push({ id, data: win });
      }
    }
    return children;
  }
}

// Initialize window manager
const windowManager = new WindowManager();

// ***** pubsub *****
// Wrapper object for backend pubsub functions
const pubsub = {
  publish: pubsubPublish,
  subscribe: pubsubSubscribe
};

// ***** Command Registry *****
// Stores commands registered via cmd:register topic
// This enables cmd app to query commands registered before it started
const commandRegistry = new Map();

// ***** init *****

// Electron app load
const onReady = async () => {
  console.log('onReady');

  // Hide dock early to prevent flash in app switcher
  // Will be shown/hidden properly once prefs are loaded
  if (app.dock) {
    app.dock.hide();
  }

  // Initialize backend (database, protocol handler, pubsub broadcaster)
  await initialize();

  //https://stackoverflow.com/questions/35916158/how-to-prevent-multiple-instances-in-electron
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    console.error('APP INSTANCE ALREADY RUNNING, QUITTING');
    app.quit();
    return;
  }

  // Windows/Linux: handle URLs when another instance tries to open
  app.on('second-instance', (event, argv) => {
    const url = argv.find(arg =>
      arg.startsWith('http://') || arg.startsWith('https://')
    );
    if (url) {
      console.log('second-instance URL:', url);
      handleExternalUrl(url, 'os');
    }
  });

  // Discover and register built-in extensions from extensions/ folder
  discoverBuiltinExtensions(path.join(__dirname, 'extensions'));

  // Register as default handler for http/https URLs (if not already and user hasn't declined)
  // Skip for test profiles to avoid system dialogs during automated testing
  const isTestProfile = PROFILE.startsWith('test');
  if (isTestProfile) {
    console.log('Skipping default browser check for test profile:', PROFILE);
  }

  const defaultBrowserPrefFile = path.join(profileDataPath, 'default-browser-pref.json');
  let shouldPromptForDefault = !isTestProfile;

  // Check if user has previously declined
  try {
    if (fs.existsSync(defaultBrowserPrefFile)) {
      const pref = JSON.parse(fs.readFileSync(defaultBrowserPrefFile, 'utf8'));
      if (pref.declined === true) {
        shouldPromptForDefault = false;
        console.log('User previously declined default browser prompt');
      }
    }
  } catch (e) {
    // Ignore errors reading pref file
  }

  // Only try to register if user hasn't declined and we're not already default
  if (shouldPromptForDefault) {
    const isDefaultHttp = app.isDefaultProtocolClient('http');
    const isDefaultHttps = app.isDefaultProtocolClient('https');

    if (!isDefaultHttp || !isDefaultHttps) {
      console.log('Registering as default protocol client for http/https');
      app.setAsDefaultProtocolClient('http');
      app.setAsDefaultProtocolClient('https');

      // Check if registration succeeded - if not, user likely declined
      setTimeout(() => {
        const nowDefaultHttp = app.isDefaultProtocolClient('http');
        const nowDefaultHttps = app.isDefaultProtocolClient('https');
        if (!nowDefaultHttp && !nowDefaultHttps) {
          // User declined, save preference
          console.log('User declined default browser, saving preference');
          try {
            fs.writeFileSync(defaultBrowserPrefFile, JSON.stringify({ declined: true, timestamp: Date.now() }));
          } catch (e) {
            console.error('Failed to save default browser preference:', e);
          }
        }
      }, 2000);
    } else {
      console.log('Already default protocol client for http/https');
    }
  }

  // Handle CLI arguments (e.g., yarn start -- "https://example.com")
  const urlArg = process.argv.find(arg =>
    arg.startsWith('http://') || arg.startsWith('https://')
  );
  if (urlArg) {
    console.log('CLI URL argument:', urlArg);
    // Defer until background app is ready
    setTimeout(() => handleExternalUrl(urlArg, 'cli'), 1000);
  }

  // Track if extensions have been loaded (only load once)
  let extensionsLoaded = false;

  // listen for app prefs to configure ourself
  // TODO: kinda janky, needs rethink
  pubsub.subscribe(systemAddress, scopes.SYSTEM, strings.topics.prefs, async msg => {
    console.log('PREFS', msg);

    // cache all prefs
    _prefs = msg.prefs;

    // Update dock visibility based on pref and visible windows
    updateDockVisibility();

    // initialize system tray
    if (msg.prefs.showTrayIcon == true) {
      console.log('showing tray');
      initTray(__dirname, {
        tooltip: labels.tray.tooltip,
        onClick: () => {
          pubsub.publish(webCoreAddress, scopes.GLOBAL, 'open', {
            address: settingsAddress
          });
        }
      });
    }

    // update quit shortcut if changed (local shortcut - only works when app has focus)
    const newQuitShortcut = msg.prefs.quitShortcut || strings.defaults.quitShortcut;
    if (newQuitShortcut !== _quitShortcut) {
      if (_quitShortcut) {
        console.log('unregistering old quit shortcut:', _quitShortcut);
        unregisterLocalShortcut(_quitShortcut);
      }
      console.log('registering new quit shortcut:', newQuitShortcut);
      registerLocalShortcut(newQuitShortcut, 'system', onQuit);
      _quitShortcut = newQuitShortcut;
    }

    // Load extensions after core app is ready (only once)
    if (!extensionsLoaded) {
      extensionsLoaded = true;
      console.log('[ext:win] Core app ready, loading extensions...');
      await loadEnabledExtensions();
    }
  });

  // Initialize the background window using the new window-open method
  // Create a BrowserWindow directly for the core background process
  const winPrefs = {
    show: false,
    // TODO: maybe not necessary now?
    key: 'background-core',
    webPreferences: {
      preload: preloadPath,
      // Should not be needed false ever or something has gone very
      // wrong.
      //webSecurity: false
    }
  };
  
  // Create the background window
  const win = new BrowserWindow(winPrefs);
  win.loadURL(webCoreAddress);
  
  // Setup devtools for the background window (debug mode, but not in tests)
  if (DEBUG && !isTestProfile) {
    win.webContents.openDevTools({ mode: 'detach', activate: false });
  }
  
  // Add to window manager
  windowManager.addWindow(win.id, {
    id: win.id,
    source: systemAddress,
    params: { ...winPrefs, address: webCoreAddress }
  });

  // NOTE: No ESC handler for background window - it should never be closed
  
  // Set up handlers for windows opened from the background window
  win.webContents.setWindowOpenHandler((details) => {
    console.log('Background window opening child window:', details.url);
    
    // Parse window features into options
    const featuresMap = {};
    if (details.features) {
      details.features.split(',')
        .map(entry => entry.split('='))
        .forEach(([key, value]) => {
          // Convert string booleans to actual booleans
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          // Convert numeric values to numbers
          else if (!isNaN(value) && value.trim() !== '') {
            value = parseInt(value, 10);
          }
          featuresMap[key] = value;
        });
    }
    
    console.log('Parsed features map:', featuresMap);
    
    // Check if window with this key already exists
    if (featuresMap.key) {
      const existingWindow = windowManager.findWindowByKey(webCoreAddress, featuresMap.key);
      if (existingWindow) {
        console.log('Reusing existing window with key:', featuresMap.key);
        existingWindow.window.show();
        return { action: 'deny' };
      }
    }
    
    // Create a new window - we'll handle it directly
    
    // Prepare browser window options
    const winOptions = {
      ...featuresMap,
      width: parseInt(featuresMap.width) || APP_DEF_WIDTH,
      height: parseInt(featuresMap.height) || APP_DEF_HEIGHT,
      show: featuresMap.show !== false,
      webPreferences: {
        preload: preloadPath
      }
    };
    
    // Make sure position parameters are correctly handled
    if (featuresMap.x !== undefined) {
      winOptions.x = parseInt(featuresMap.x);
    }
    if (featuresMap.y !== undefined) {
      winOptions.y = parseInt(featuresMap.y);
    }
    
    console.log('Background window creating child with options:', winOptions);
    
    // Make sure we register browser window created handler to track the new window
    const onCreated = (e, newWin) => {
      // Check if this is the window we just created
      newWin.webContents.once('did-finish-load', () => {
        const loadedUrl = newWin.webContents.getURL();
        if (loadedUrl === details.url) {
          // Remove the listener
          app.removeListener('browser-window-created', onCreated);
          
          // Add the window to our manager with necessary parameters
          windowManager.addWindow(newWin.id, {
            id: newWin.id,
            source: webCoreAddress,
            params: { 
              ...featuresMap,
              address: details.url,
              modal: featuresMap.modal
            }
          });
          
          // Add escape key handler
          addEscHandler(newWin);
          
          // Set up DevTools if requested
          winDevtoolsConfig(newWin);
          
          // Set up modal behavior with delay to avoid focus race condition
          if (featuresMap.modal === true) {
            setTimeout(() => {
              if (!newWin.isDestroyed()) {
                newWin.on('blur', () => {
                  console.log('Modal window lost focus:', details.url);
                  closeOrHideWindow(newWin.id);
                });
              }
            }, 100);
          }
        }
      });
    };
    
    // Start listening for the window creation
    app.on('browser-window-created', onCreated);
    
    // Return allow with overridden options
    return { 
      action: 'allow',
      overrideBrowserWindowOptions: winOptions
    };
  });

  // Register default quit shortcut (local - only works when app has focus)
  // Will be updated when prefs arrive
  _quitShortcut = strings.defaults.quitShortcut;
  registerLocalShortcut(_quitShortcut, 'system', onQuit);

  // Mark app as ready and process any URLs that arrived during startup
  _appReady = true;
  processPendingUrls();
};

// ***** External URL Handler *****

// Track if app is ready to handle URLs
let _appReady = false;
let _pendingUrls = [];

// Handle URLs opened from external apps (e.g., when Peek is default browser)
const handleExternalUrl = (url, sourceId = 'os') => {
  console.log('External URL received:', url, 'from:', sourceId);

  if (!_appReady) {
    _pendingUrls.push({ url, sourceId });
    return;
  }

  // Note: Using trackingSource/trackingSourceId because preload.js overwrites msg.source
  pubsub.publish(systemAddress, scopes.GLOBAL, 'external:open-url', {
    url,
    trackingSource: 'external',
    trackingSourceId: sourceId,
    timestamp: Date.now()
  });
};

// Process any URLs that arrived before app was ready
const processPendingUrls = () => {
  _pendingUrls.forEach(({ url, sourceId }) => {
    handleExternalUrl(url, sourceId);
  });
  _pendingUrls = [];
};

// macOS: handle open-url event (must be registered before app.whenReady)
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleExternalUrl(url, 'os');
});

// Configure app before ready (registers protocol scheme, sets theme)
configure({
  rootDir: __dirname,
  preloadPath: preloadPath,
  userDataPath: defaultUserDataPath,
  profile: PROFILE,
  isDev: DEBUG,
  isTest: PROFILE.startsWith('test')
});

app.whenReady().then(onReady);

// ***** API *****

// Renderer log forwarding - prints renderer console.log to terminal
ipcMain.on('renderer-log', (ev, msg) => {
  const shortSource = msg.source.replace('peek://app/', '');
  console.log(`[${shortSource}]`, ...msg.args);
});

ipcMain.on(strings.msgs.registerShortcut, (ev, msg) => {
  const isGlobal = msg.global === true;
  console.log('ipc register shortcut', msg.shortcut, isGlobal ? '(global)' : '(local)');

  const callback = () => {
    console.log('on(registershortcut): shortcut executed', msg.shortcut, msg.replyTopic);
    ev.reply(msg.replyTopic, { foo: 'bar' });
  };

  if (isGlobal) {
    registerGlobalShortcut(msg.shortcut, msg.source, callback);
  } else {
    registerLocalShortcut(msg.shortcut, msg.source, callback);
  }
});

ipcMain.on(strings.msgs.unregisterShortcut, (ev, msg) => {
  const isGlobal = msg.global === true;
  console.log('ipc unregister shortcut', msg.shortcut, isGlobal ? '(global)' : '(local)');

  if (isGlobal) {
    const err = unregisterGlobalShortcut(msg.shortcut);
    if (err) {
      console.log('ipc unregister global shortcut error:', err.message);
    }
  } else {
    unregisterLocalShortcut(msg.shortcut);
  }
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

  // Intercept command registration to store in registry
  if (msg.topic === 'cmd:register' && msg.data) {
    commandRegistry.set(msg.data.name, {
      name: msg.data.name,
      description: msg.data.description || '',
      source: msg.data.source
    });
    console.log('[cmd-registry] Registered command:', msg.data.name);
  } else if (msg.topic === 'cmd:unregister' && msg.data) {
    commandRegistry.delete(msg.data.name);
    console.log('[cmd-registry] Unregistered command:', msg.data.name);
  }

  pubsub.publish(msg.source, msg.scope, msg.topic, msg.data);
});

ipcMain.on(strings.msgs.subscribe, (ev, msg) => {
  console.log('ipc:subscribe', msg);

  pubsub.subscribe(msg.source, msg.scope, msg.topic, data => {
    console.log('ipc:subscribe:notification', msg);
    ev.reply(msg.replyTopic, data);
  });
});

// Query all registered commands from the registry
ipcMain.handle('get-registered-commands', async () => {
  const commands = Array.from(commandRegistry.values());
  console.log('[cmd-registry] Query returned', commands.length, 'commands');
  return { success: true, data: commands };
});

ipcMain.on(strings.msgs.console, (ev, msg) => {
  console.log('r:', msg.source, msg.text);
});

ipcMain.on('app-quit', (ev, msg) => {
  console.log('app-quit requested from:', msg?.source);
  onQuit();
});

ipcMain.on('modifywindow', (ev, msg) => {
  console.log('modifywindow', msg);

  const key = msg.hasOwnProperty('name') ? msg.name : null;

  if (key != null) {
    const existingWindow = windowManager.findWindowByKey(msg.source, key);
    if (existingWindow) {
      console.log('FOUND WINDOW FOR KEY', key);
      const bw = existingWindow.window;
      let r = false;
      try {
        modWindow(bw, msg.params);
        r = true;
      }
      catch(ex) {
        console.error(ex);
      }
      ev.reply(msg.replyTopic, { output: r });
    }
  }
});

// Window API handlers
ipcMain.handle('window-open', async (ev, msg) => {
  console.log('window-open', msg);

  const { url, options } = msg;
  
  // Check if window with this key already exists
  if (options.key) {
    const existingWindow = windowManager.findWindowByKey(msg.source, options.key);
    if (existingWindow) {
      console.log('Reusing existing window with key:', options.key);
      existingWindow.window.show();
      return { success: true, id: existingWindow.id, reused: true };
    }
  }
  
  // Prepare browser window options
  const winOptions = {
    ...options,  // Pass all options to support any BrowserWindow constructor param
    width: parseInt(options.width) || APP_DEF_WIDTH,
    height: parseInt(options.height) || APP_DEF_HEIGHT,
    show: options.show !== false,
    webPreferences: {
      ...options.webPreferences,
      preload: preloadPath
    }
  };
  
  // Make sure position parameters are correctly handled
  if (options.x !== undefined) {
    winOptions.x = parseInt(options.x);
  }
  if (options.y !== undefined) {
    winOptions.y = parseInt(options.y);
  }

  if (options.modal === true) {
    winOptions.frame = false;
    // Use panel type on macOS to improve focus restoration when closed
    if (process.platform === 'darwin') {
      winOptions.type = 'panel';
    }
  }
  
  console.log('Creating window with options:', winOptions);
  
  // Create new window
  const win = new BrowserWindow(winOptions);

  // Forward console logs from window to main process stdout (for debugging)
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    // Only forward for peek:// URLs to avoid noise
    if (url.startsWith('peek://')) {
      console.log(`[${url.replace('peek://', '')}] ${message}`);
    }
  });

  try {
    await win.loadURL(url);

    // Determine if this is a transient window (opened while no Peek window was focused)
    // Used for escapeMode: 'auto' to decide between navigate and close behavior
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const isTransient = !focusedWindow || focusedWindow.isDestroyed();

    // Add to window manager with modal parameter
    const windowEntry = {
      id: win.id,
      source: msg.source,
      params: {
        ...options,
        address: url,
        transient: isTransient
      }
    };
    console.log('Adding window to manager:', windowEntry.id, 'modal:', windowEntry.params.modal, 'keepLive:', windowEntry.params.keepLive);
    windowManager.addWindow(win.id, windowEntry);
    
    // Add escape key handler to all windows
    addEscHandler(win);
    
    // Set up DevTools if requested
    winDevtoolsConfig(win);
    
    // Set up modal behavior if requested
    // Delay blur handler attachment to avoid race condition where focus events
    // are still settling after window creation (can cause immediate close)
    if (options.modal === true) {
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.on('blur', () => {
            console.log('window-open: blur for modal window', url);
            closeOrHideWindow(win.id);
          });
        }
      }, 100);
    }

    // Show dock when window opens
    updateDockVisibility();

    return { success: true, id: win.id };
  } catch (error) {
    console.error('Failed to open window:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('window-close', async (ev, msg) => {
  console.log('window-close', msg);

  try {
    if (!msg.id) {
      return { success: false, error: 'Window ID is required' };
    }

    const win = BrowserWindow.fromId(msg.id);
    if (!win) {
      return { success: false, error: 'Window not found' };
    }

    win.close();
    // WindowManager will automatically clean up on window close event
    return { success: true };
  } catch (error) {
    console.error('Failed to close window:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('window-hide', async (ev, msg) => {
  console.log('window-hide', msg);

  try {
    if (!msg.id) {
      return { success: false, error: 'Window ID is required' };
    }

    // Get window data from manager to verify it exists
    const winData = windowManager.getWindow(msg.id);
    if (!winData) {
      return { success: false, error: 'Window not found in window manager' };
    }

    const win = BrowserWindow.fromId(msg.id);
    if (!win) {
      // Clean up stale window reference
      windowManager.removeWindow(msg.id);
      return { success: false, error: 'Window not found' };
    }

    win.hide();
    return { success: true };
  } catch (error) {
    console.error('Failed to hide window:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('window-show', async (ev, msg) => {
  console.log('window-show', msg);

  try {
    if (!msg.id) {
      return { success: false, error: 'Window ID is required' };
    }

    // Get window data from manager to verify it exists
    const winData = windowManager.getWindow(msg.id);
    if (!winData) {
      return { success: false, error: 'Window not found in window manager' };
    }

    const win = BrowserWindow.fromId(msg.id);
    if (!win) {
      // Clean up stale window reference
      windowManager.removeWindow(msg.id);
      return { success: false, error: 'Window not found' };
    }

    win.show();
    updateDockVisibility();
    return { success: true };
  } catch (error) {
    console.error('Failed to show window:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('window-move', async (ev, msg) => {
  console.log('window-move', msg);

  try {
    if (!msg.id) {
      return { success: false, error: 'Window ID is required' };
    }

    // Get window data from manager to verify it exists
    const winData = windowManager.getWindow(msg.id);
    if (!winData) {
      return { success: false, error: 'Window not found in window manager' };
    }

    const win = BrowserWindow.fromId(msg.id);
    if (!win) {
      // Clean up stale window reference
      windowManager.removeWindow(msg.id);
      return { success: false, error: 'Window not found' };
    }

    if (typeof msg.x !== 'number' || typeof msg.y !== 'number') {
      return { success: false, error: 'Valid x and y coordinates are required' };
    }

    win.setPosition(msg.x, msg.y);
    return { success: true };
  } catch (error) {
    console.error('Failed to move window:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('window-focus', async (ev, msg) => {
  console.log('window-focus', msg);

  try {
    if (!msg.id) {
      return { success: false, error: 'Window ID is required' };
    }

    // Get window data from manager to verify it exists
    const winData = windowManager.getWindow(msg.id);
    if (!winData) {
      return { success: false, error: 'Window not found in window manager' };
    }

    const win = BrowserWindow.fromId(msg.id);
    if (!win) {
      // Clean up stale window reference
      windowManager.removeWindow(msg.id);
      return { success: false, error: 'Window not found' };
    }

    win.focus();
    return { success: true };
  } catch (error) {
    console.error('Failed to focus window:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('window-blur', async (ev, msg) => {
  console.log('window-blur', msg);

  try {
    if (!msg.id) {
      return { success: false, error: 'Window ID is required' };
    }

    // Get window data from manager to verify it exists
    const winData = windowManager.getWindow(msg.id);
    if (!winData) {
      return { success: false, error: 'Window not found in window manager' };
    }

    const win = BrowserWindow.fromId(msg.id);
    if (!win) {
      // Clean up stale window reference
      windowManager.removeWindow(msg.id);
      return { success: false, error: 'Window not found' };
    }

    win.blur();
    return { success: true };
  } catch (error) {
    console.error('Failed to blur window:', error);
    return { success: false, error: error.message };
  }
});

// Add a window-exists handler to check if a window is still valid
ipcMain.handle('window-exists', async (ev, msg) => {
  console.log('window-exists', msg);

  try {
    if (!msg.id) {
      return { exists: false, error: 'Window ID is required' };
    }

    // Check if the window exists in the window manager
    const winData = windowManager.getWindow(msg.id);
    if (!winData) {
      return { exists: false };
    }

    // Double-check that the window object is still valid
    const win = BrowserWindow.fromId(msg.id);
    if (!win || win.isDestroyed()) {
      // Clean up stale window reference
      windowManager.removeWindow(msg.id);
      return { exists: false };
    }

    return { exists: true };
  } catch (error) {
    console.error('Failed to check if window exists:', error);
    return { exists: false, error: error.message };
  }
});

ipcMain.handle('window-list', async (ev, msg) => {
  console.log('window-list', msg);

  try {
    const windows = [];

    for (const [id, winData] of windowManager.windows) {
      const win = BrowserWindow.fromId(id);
      if (win && !win.isDestroyed()) {
        // Get the current URL of the window
        const url = win.webContents.getURL();

        // Skip internal peek:// URLs unless requested
        if (!msg?.includeInternal && url.startsWith('peek://')) {
          continue;
        }

        windows.push({
          id,
          url,
          title: win.getTitle(),
          source: winData.source,
          params: winData.params
        });
      }
    }

    return { success: true, windows };
  } catch (error) {
    console.error('Failed to list windows:', error);
    return { success: false, error: error.message, windows: [] };
  }
});

// ***** Datastore IPC Handlers *****

ipcMain.handle('datastore-add-address', async (ev, data) => {
  try {
    const { uri, options = {} } = data;
    const result = addAddress(uri, options);
    return { success: true, id: result.id };
  } catch (error) {
    console.error('datastore-add-address error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-get-address', async (ev, data) => {
  try {
    const { id } = data;
    const row = getAddress(id);
    return { success: true, data: row || {} };
  } catch (error) {
    console.error('datastore-get-address error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-update-address', async (ev, data) => {
  try {
    const { id, updates } = data;
    const updated = updateAddress(id, updates);
    if (!updated) {
      return { success: false, error: 'Address not found' };
    }
    return { success: true, data: updated };
  } catch (error) {
    console.error('datastore-update-address error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-query-addresses', async (ev, data) => {
  try {
    const { filter = {} } = data;
    const results = queryAddresses(filter);
    return { success: true, data: results };
  } catch (error) {
    console.error('datastore-query-addresses error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-add-visit', async (ev, data) => {
  try {
    const { addressId, options = {} } = data;
    const result = addVisit(addressId, options);
    return { success: true, id: result.id };
  } catch (error) {
    console.error('datastore-add-visit error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-query-visits', async (ev, data) => {
  try {
    const { filter = {} } = data;
    const results = queryVisits(filter);
    return { success: true, data: results };
  } catch (error) {
    console.error('datastore-query-visits error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-add-content', async (ev, data) => {
  try {
    const { options = {} } = data;
    const result = addContent(options);
    return { success: true, id: result.id };
  } catch (error) {
    console.error('datastore-add-content error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-query-content', async (ev, data) => {
  try {
    const { filter = {} } = data;
    const results = queryContent(filter);
    return { success: true, data: results };
  } catch (error) {
    console.error('datastore-query-content error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-get-table', async (ev, data) => {
  try {
    const { tableName } = data;
    if (!isValidTable(tableName)) {
      return { success: false, error: `Invalid table name: ${tableName}` };
    }
    const table = getTable(tableName);
    return { success: true, data: table };
  } catch (error) {
    console.error('datastore-get-table error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-set-row', async (ev, data) => {
  try {
    const { tableName, rowId, rowData } = data;
    if (!isValidTable(tableName)) {
      return { success: false, error: `Invalid table name: ${tableName}` };
    }
    setRow(tableName, rowId, rowData);
    return { success: true };
  } catch (error) {
    console.error('datastore-set-row error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-get-stats', async () => {
  try {
    const stats = getStats();
    return { success: true, data: stats };
  } catch (error) {
    console.error('datastore-get-stats error:', error);
    return { success: false, error: error.message };
  }
});

// ***** Tag IPC Handlers *****

ipcMain.handle('datastore-get-or-create-tag', async (ev, data) => {
  try {
    const { name } = data;
    const result = getOrCreateTag(name);
    return { success: true, data: result.tag, created: result.created };
  } catch (error) {
    console.error('datastore-get-or-create-tag error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-tag-address', async (ev, data) => {
  try {
    const { addressId, tagId } = data;
    const result = tagAddress(addressId, tagId);
    return { success: true, data: result.link, alreadyExists: result.alreadyExists };
  } catch (error) {
    console.error('datastore-tag-address error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-untag-address', async (ev, data) => {
  try {
    const { addressId, tagId } = data;
    const removed = untagAddress(addressId, tagId);
    return { success: true, removed };
  } catch (error) {
    console.error('datastore-untag-address error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-get-tags-by-frecency', async (ev, data = {}) => {
  try {
    const { domain } = data || {};
    const tags = getTagsByFrecency(domain);
    return { success: true, data: tags };
  } catch (error) {
    console.error('datastore-get-tags-by-frecency error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-get-address-tags', async (ev, data) => {
  try {
    const { addressId } = data;
    const tags = getAddressTags(addressId);
    return { success: true, data: tags };
  } catch (error) {
    console.error('datastore-get-address-tags error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-get-addresses-by-tag', async (ev, data) => {
  try {
    const { tagId } = data;
    const addresses = getAddressesByTag(tagId);
    return { success: true, data: addresses };
  } catch (error) {
    console.error('datastore-get-addresses-by-tag error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-get-untagged-addresses', async (ev, data) => {
  try {
    const addresses = getUntaggedAddresses();
    return { success: true, data: addresses };
  } catch (error) {
    console.error('datastore-get-untagged-addresses error:', error);
    return { success: false, error: error.message };
  }
});

// ==================== Extension Management ====================

// Open folder picker dialog for adding an extension
ipcMain.handle('extension-pick-folder', async (ev) => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Extension Folder',
      message: 'Select a folder containing a Peek extension (must have manifest.json)'
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }

    const folderPath = result.filePaths[0];
    return { success: true, data: { path: folderPath } };
  } catch (error) {
    console.error('extension-pick-folder error:', error);
    return { success: false, error: error.message };
  }
});

// Validate an extension folder (check for manifest.json and parse it)
ipcMain.handle('extension-validate-folder', async (ev, data) => {
  const { folderPath } = data;

  try {
    const manifestPath = path.join(folderPath, 'manifest.json');

    // Check if manifest exists
    if (!fs.existsSync(manifestPath)) {
      return {
        success: false,
        valid: false,
        error: 'No manifest.json found in folder'
      };
    }

    // Read and parse manifest
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    let manifest;
    try {
      manifest = JSON.parse(manifestContent);
    } catch (parseError) {
      return {
        success: true,
        valid: false,
        error: `Invalid JSON in manifest.json: ${parseError.message}`,
        manifest: null
      };
    }

    // Validate required fields
    const errors = [];
    if (!manifest.id) errors.push('Missing required field: id');
    if (!manifest.shortname) errors.push('Missing required field: shortname');
    if (!manifest.name) errors.push('Missing required field: name');

    // Check shortname format
    if (manifest.shortname && !/^[a-z0-9-]+$/.test(manifest.shortname)) {
      errors.push('Invalid shortname format: must be lowercase alphanumeric with hyphens');
    }

    // Check for background script
    const backgroundScript = manifest.background || 'background.js';
    const backgroundPath = path.join(folderPath, backgroundScript);
    if (!fs.existsSync(backgroundPath)) {
      errors.push(`Background script not found: ${backgroundScript}`);
    }

    return {
      success: true,
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : null,
      manifest
    };
  } catch (error) {
    console.error('extension-validate-folder error:', error);
    return { success: false, error: error.message };
  }
});

// Add extension to datastore
ipcMain.handle('extension-add', async (ev, data) => {
  const { folderPath, manifest, enabled = false } = data;

  try {
    const timestamp = now();
    const id = manifest?.id || `ext-${timestamp}`;
    const db = getDb();

    // Check if extension with this ID already exists
    const existing = db.prepare('SELECT * FROM extensions WHERE id = ?').get(id);
    if (existing) {
      return { success: false, error: `Extension with ID '${id}' already exists` };
    }

    // Add to extensions table
    db.prepare(`
      INSERT INTO extensions (id, name, description, version, path, backgroundUrl, settingsUrl, iconPath, builtin, enabled, status, installedAt, updatedAt, lastErrorAt, lastError, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      manifest?.name || path.basename(folderPath),
      manifest?.description || '',
      manifest?.version || '0.0.0',
      folderPath,
      `peek://ext/${manifest?.shortname || id}/background.js`,
      manifest?.settings_url || '',
      manifest?.icon || '',
      0,
      enabled ? 1 : 0,
      enabled ? 'installed' : 'disabled',
      timestamp,
      timestamp,
      0,
      '',
      JSON.stringify({ shortname: manifest?.shortname || id })
    );

    console.log(`Extension added: ${id} at ${folderPath}`);
    return { success: true, data: { id } };
  } catch (error) {
    console.error('extension-add error:', error);
    return { success: false, error: error.message };
  }
});

// Remove extension from datastore
ipcMain.handle('extension-remove', async (ev, data) => {
  const { id } = data;

  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM extensions WHERE id = ?').get(id);
    if (!existing) {
      return { success: false, error: `Extension '${id}' not found` };
    }

    // Don't allow removing builtin extensions
    if (existing.builtin === 1) {
      return { success: false, error: 'Cannot remove built-in extensions' };
    }

    db.prepare('DELETE FROM extensions WHERE id = ?').run(id);
    console.log(`Extension removed: ${id}`);
    return { success: true };
  } catch (error) {
    console.error('extension-remove error:', error);
    return { success: false, error: error.message };
  }
});

// Update extension (enable/disable, update error status, etc.)
ipcMain.handle('extension-update', async (ev, data) => {
  const { id, updates } = data;

  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM extensions WHERE id = ?').get(id);
    if (!existing) {
      return { success: false, error: `Extension '${id}' not found` };
    }

    // Apply updates
    const updatedRow = { ...existing, ...updates, updatedAt: now() };
    const columns = Object.keys(updatedRow).filter(k => k !== 'id');
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const values = columns.map(col => updatedRow[col]);

    db.prepare(`UPDATE extensions SET ${setClause} WHERE id = ?`).run(...values, id);

    console.log(`Extension updated: ${id}`, updates);
    return { success: true, data: { id, ...updatedRow } };
  } catch (error) {
    console.error('extension-update error:', error);
    return { success: false, error: error.message };
  }
});

// Get all extensions from datastore
ipcMain.handle('extension-get-all', async (ev) => {
  try {
    const db = getDb();
    const extensions = db.prepare('SELECT * FROM extensions').all();
    return { success: true, data: extensions };
  } catch (error) {
    console.error('extension-get-all error:', error);
    return { success: false, error: error.message };
  }
});

// Get single extension from datastore
ipcMain.handle('extension-get', async (ev, data) => {
  const { id } = data;

  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM extensions WHERE id = ?').get(id);
    if (!row) {
      return { success: false, error: `Extension '${id}' not found` };
    }
    return { success: true, data: row };
  } catch (error) {
    console.error('extension-get error:', error);
    return { success: false, error: error.message };
  }
});

// ==================== Extension Window Management ====================

// Load extension (create window) - permission check in preload.js
ipcMain.handle('extension-window-load', async (ev, data) => {
  const { extId } = data;
  const url = ev.sender.getURL();

  // Permission check: only core app can manage extension windows
  if (!url.startsWith('peek://app/')) {
    console.warn(`[ext:win] Permission denied for extension load from: ${url}`);
    return { success: false, error: 'Permission denied' };
  }

  try {
    const win = await createExtensionWindow(extId);
    if (win) {
      return { success: true, data: { extId } };
    } else {
      return { success: false, error: 'Failed to create extension window' };
    }
  } catch (error) {
    console.error('extension-window-load error:', error);
    return { success: false, error: error.message };
  }
});

// Unload extension (destroy window) - permission check in preload.js
ipcMain.handle('extension-window-unload', async (ev, data) => {
  const { extId } = data;
  const url = ev.sender.getURL();

  // Permission check: only core app can manage extension windows
  if (!url.startsWith('peek://app/')) {
    console.warn(`[ext:win] Permission denied for extension unload from: ${url}`);
    return { success: false, error: 'Permission denied' };
  }

  try {
    const result = destroyExtensionWindow(extId);
    return { success: true, data: { wasRunning: result } };
  } catch (error) {
    console.error('extension-window-unload error:', error);
    return { success: false, error: error.message };
  }
});

// Reload extension (destroy and recreate window)
ipcMain.handle('extension-window-reload', async (ev, data) => {
  const { extId } = data;
  const url = ev.sender.getURL();

  // Permission check: only core app can manage extension windows
  if (!url.startsWith('peek://app/')) {
    console.warn(`[ext:win] Permission denied for extension reload from: ${url}`);
    return { success: false, error: 'Permission denied' };
  }

  try {
    destroyExtensionWindow(extId);
    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 200));
    const win = await createExtensionWindow(extId);
    if (win) {
      return { success: true, data: { extId } };
    } else {
      return { success: false, error: 'Failed to reload extension window' };
    }
  } catch (error) {
    console.error('extension-window-reload error:', error);
    return { success: false, error: error.message };
  }
});

// List running extension windows
ipcMain.handle('extension-window-list', async (ev) => {
  try {
    const running = getRunningExtensions();
    return { success: true, data: running };
  } catch (error) {
    console.error('extension-window-list error:', error);
    return { success: false, error: error.message };
  }
});

// ==================== Extension Settings (Cross-Origin Storage) ====================

// Get extension settings from datastore
ipcMain.handle('extension-settings-get', async (ev, data) => {
  const { extId } = data;

  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM extension_settings WHERE extensionId = ?').all(extId);
    const settings = {};

    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch (e) {
        settings[row.key] = row.value;
      }
    }

    return { success: true, data: settings };
  } catch (error) {
    console.error('extension-settings-get error:', error);
    return { success: false, error: error.message };
  }
});

// Set extension settings in datastore
ipcMain.handle('extension-settings-set', async (ev, data) => {
  const { extId, settings } = data;

  try {
    const timestamp = now();
    const db = getDb();

    for (const [key, value] of Object.entries(settings)) {
      const rowId = `${extId}:${key}`;
      db.prepare(`
        INSERT OR REPLACE INTO extension_settings (id, extensionId, key, value, updatedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(rowId, extId, key, JSON.stringify(value), timestamp);
    }

    return { success: true };
  } catch (error) {
    console.error('extension-settings-set error:', error);
    return { success: false, error: error.message };
  }
});

// Get a single setting key for an extension
ipcMain.handle('extension-settings-get-key', async (ev, data) => {
  const { extId, key } = data;

  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM extension_settings WHERE extensionId = ? AND key = ?').get(extId, key);

    if (!row) {
      return { success: true, data: null };
    }

    try {
      return { success: true, data: JSON.parse(row.value) };
    } catch (e) {
      return { success: true, data: row.value };
    }
  } catch (error) {
    console.error('extension-settings-get-key error:', error);
    return { success: false, error: error.message };
  }
});

// Set a single setting key for an extension
ipcMain.handle('extension-settings-set-key', async (ev, data) => {
  const { extId, key, value } = data;

  try {
    const db = getDb();
    const rowId = `${extId}:${key}`;
    db.prepare(`
      INSERT OR REPLACE INTO extension_settings (id, extensionId, key, value, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(rowId, extId, key, JSON.stringify(value), now());

    return { success: true };
  } catch (error) {
    console.error('extension-settings-set-key error:', error);
    return { success: false, error: error.message };
  }
});

// Get extension manifest from filesystem
ipcMain.handle('extension-manifest-get', async (ev, data) => {
  const { extId } = data;

  try {
    const extPath = getExtensionPath(extId);
    if (!extPath) {
      return { success: false, error: 'Extension not found' };
    }

    const manifestPath = path.join(extPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return { success: false, error: 'manifest.json not found' };
    }

    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);

    return { success: true, data: manifest };
  } catch (error) {
    console.error('extension-manifest-get error:', error);
    return { success: false, error: error.message };
  }
});

// Get extension settings schema from filesystem
// Reads the schema file path from manifest.settingsSchema
ipcMain.handle('extension-settings-schema', async (ev, data) => {
  const { extId } = data;

  try {
    const extPath = getExtensionPath(extId);
    if (!extPath) {
      return { success: false, error: 'Extension not found' };
    }

    const manifestPath = path.join(extPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return { success: false, error: 'manifest.json not found' };
    }

    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);

    // Check if extension has a settings schema
    if (!manifest.settingsSchema) {
      return { success: true, data: null }; // No settings schema defined
    }

    // Resolve schema path relative to extension directory
    const schemaPath = path.join(extPath, manifest.settingsSchema);
    if (!fs.existsSync(schemaPath)) {
      return { success: false, error: `Settings schema not found: ${manifest.settingsSchema}` };
    }

    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);

    return {
      success: true,
      data: {
        extId: manifest.id || extId,
        name: manifest.name,
        schema
      }
    };
  } catch (error) {
    console.error('extension-settings-schema error:', error);
    return { success: false, error: error.message };
  }
});

// ==================== End Extension Management ====================

const modWindow = (bw, params) => {
  if (params.action == 'close') {
    bw.close();
  }
  if (params.action == 'hide') {
    bw.hide();
  }
  if (params.action == 'show') {
    bw.show();
  }
};

// ***** Helpers *****

// Ask renderer to handle escape, returns Promise<{ handled: boolean }>
const askRendererToHandleEscape = (bw) => {
  return new Promise((resolve) => {
    const responseChannel = `escape-response-${bw.id}-${Date.now()}`;

    // Timeout after 100ms - if renderer doesn't respond, assume not handled
    const timeout = setTimeout(() => {
      ipcMain.removeAllListeners(responseChannel);
      resolve({ handled: false });
    }, 100);

    ipcMain.once(responseChannel, (event, response) => {
      clearTimeout(timeout);
      resolve(response || { handled: false });
    });

    bw.webContents.send('escape-pressed', { responseChannel });
  });
};

// esc handler
// Supports escapeMode: 'close' (default), 'navigate', 'auto'
const addEscHandler = bw => {
  console.log('adding esc handler to window:', bw.id);
  bw.webContents.on('before-input-event', async (e, i) => {
    if (i.key == 'Escape' && i.type == 'keyUp') {
      // Get window info
      const entry = windowManager.getWindow(bw.id);
      const params = entry?.params || {};
      const escapeMode = params.escapeMode || 'close';

      console.log(`ESC pressed - window ${bw.id}, escapeMode: ${escapeMode}`);

      // For 'navigate' mode, ask renderer first
      if (escapeMode === 'navigate') {
        const response = await askRendererToHandleEscape(bw);
        console.log(`Renderer escape response:`, response);

        if (response.handled) {
          // Renderer handled the escape (internal navigation)
          console.log('Renderer handled escape, not closing');
          return;
        }
      }

      // For 'auto' mode, check if transient (no focused window when opened)
      if (escapeMode === 'auto') {
        if (params.transient) {
          // Transient mode - close immediately
          console.log('Auto mode (transient) - closing');
        } else {
          // Active mode - ask renderer first
          const response = await askRendererToHandleEscape(bw);
          console.log(`Renderer escape response (auto/active):`, response);

          if (response.handled) {
            console.log('Renderer handled escape, not closing');
            return;
          }
        }
      }

      // Close or hide the window
      console.log('Closing/hiding window');
      closeOrHideWindow(bw.id);
    }
  });
};

// show/configure devtools when/after a window is opened
const winDevtoolsConfig = bw => {
  const windowData = windowManager.getWindow(bw.id);
  const params = windowData ? windowData.params : {};

  console.log('winDevtoolsConfig:', bw.id, 'openDevTools:', params.openDevTools, 'address:', params.address);

  // Check if devTools should be opened (never in test profiles)
  if (params.openDevTools === true && !isTestProfile) {
    const isDetached = params.detachedDevTools === true;
    // Determine if detached mode should be used
    // activate: false prevents devtools from stealing focus (only works with detach/undocked)
    const devToolsOptions = {
      mode: isDetached ? 'detach' : 'right',
      activate: false
    };

    console.log(`Opening DevTools for window ${bw.id} with options:`, devToolsOptions);

    // Open DevTools after a slight delay to let the main window settle
    setTimeout(() => {
      bw.webContents.openDevTools(devToolsOptions);

      // when devtools completely open, ensure content window has focus
      bw.webContents.once('devtools-opened', () => {
        // Re-focus the content window after devtools opens
        setTimeout(() => {
          if (bw.isVisible() && !bw.isDestroyed()) {
            bw.focus();
            bw.webContents.focus();
          }
        }, 100);
      });
    }, 50);
  }
};

// window closer
// this will actually close the the window
// regardless of "keep alive" opener params
const closeWindow = (params, callback) => {
  console.log('closeWindow', params, callback != null);

  let retval = false;

  if (params.hasOwnProperty('id') && windowManager.getWindow(params.id)) {
    console.log('closeWindow(): closing', params.id);

    const entry = windowManager.getWindow(params.id);
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

/**
 * Get count of visible user windows (excluding background window)
 */
const getVisibleWindowCount = (excludeId = null) => {
  return BrowserWindow.getAllWindows().filter(win => {
    if (excludeId && win.id === excludeId) return false;
    if (win.isDestroyed()) return false;
    if (!win.isVisible()) return false;

    // Exclude the background window
    const entry = windowManager.getWindow(win.id);
    if (entry && entry.params.address === webCoreAddress) return false;

    return true;
  }).length;
};

/**
 * Update dock visibility based on visible windows and pref
 * Show dock if: visible windows exist OR pref is enabled
 * Hide dock if: no visible windows AND pref is disabled
 */
const updateDockVisibility = (excludeId = null) => {
  if (process.platform !== 'darwin' || !app.dock) return;

  const visibleCount = getVisibleWindowCount(excludeId);
  const prefShowDock = _prefs?.showInDockAndSwitcher === true;

  console.log('updateDockVisibility:', { visibleCount, prefShowDock, excludeId });

  if (visibleCount > 0 || prefShowDock) {
    console.log('Showing dock');
    app.dock.show();
  } else {
    console.log('Hiding dock');
    app.dock.hide();
  }
};

// Only hide the app if there are no other visible windows (besides the one being closed/hidden)
const maybeHideApp = (excludeId) => {
  if (process.platform !== 'darwin') return;

  const visibleCount = getVisibleWindowCount(excludeId);
  console.log('maybeHideApp: visible windows (excluding', excludeId + '):', visibleCount);

  if (visibleCount === 0) {
    console.log('No other visible windows, hiding app');
    app.hide();
  } else {
    console.log('Other windows visible, not hiding app');
  }

  // Also update dock visibility
  updateDockVisibility(excludeId);
};

const closeOrHideWindow = id => {
  console.log('closeOrHideWindow called for ID:', id);

  try {
    const win = BrowserWindow.fromId(id);
    if (!win || win.isDestroyed()) {
      console.log('Window already destroyed or invalid');
      return;
    }

    const entry = windowManager.getWindow(id);
    console.log('Window entry from manager:', entry);

    if (!entry) {
      console.log('Window not found in window manager, closing directly');
      win.close();
      return;
    }

    const params = entry.params;
    console.log('Window parameters - modal:', params.modal, 'keepLive:', params.keepLive);

    // Never close the background window
    if (params.address === webCoreAddress) {
      console.log('Refusing to close background window');
      return;
    }

    // Special case for settings window - always close it on ESC
    if (params.address === settingsAddress) {
      console.log(`CLOSING settings window ${id}`);
      closeChildWindows(params.address);
      win.close();
      // Hide app to return focus to previous app (only if no other visible windows)
      maybeHideApp(id);
    }
    // Check if window should be hidden rather than closed
    // Either keepLive or modal parameter can trigger hiding behavior
    else if (params.keepLive === true || params.modal === true) {
      //console.log(`HIDING window ${id} (${params.address}) - modal: ${params.modal}, keepLive: ${params.keepLive}`);
      win.hide();
      // Hide app to return focus to previous app (only if no other visible windows)
      maybeHideApp(id);
    } else {
      // close any open windows this window opened
      closeChildWindows(params.address);
      console.log(`CLOSING window ${id} (${params.address})`);
      win.close();
      // Hide app to return focus to previous app (only if no other visible windows)
      maybeHideApp(id);
    }

    console.log('closeOrHideWindow completed');
  } catch (error) {
    console.error('Error in closeOrHideWindow:', error);
  }
};

const closeChildWindows = (aAddress) => {
  console.log('closeChildWindows()', aAddress);

  if (aAddress == webCoreAddress) {
    return;
  }

  // Get all child windows from the window manager
  const childWindows = windowManager.getChildWindows(aAddress);
  
  for (const child of childWindows) {
    const address = child.data.params.address;
    console.log('closing child window', address, 'for', aAddress);

    // recurseme
    closeChildWindows(address);

    // close window
    const win = BrowserWindow.fromId(child.id);
    if (win) {
      win.close();
    }
  }
};

/*
// send message to all windows
const broadcastToWindows = (topic, msg) => {
  for (const [id, _] of windowManager.windows) {
    const win = BrowserWindow.fromId(id);
    if (win) {
      win.webContents.send(topic, msg);
    }
  }
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

const onQuit = async () => {
  console.log('onQuit');

  // Notify all processes that the app is shutting down
  pubsub.publish(systemAddress, scopes.GLOBAL, 'app:shutdown', {
    timestamp: Date.now()
  });

  // Close SQLite database
  try {
    closeDatabase();
    console.log('SQLite database closed');
  } catch (error) {
    console.error('Error closing SQLite database:', error);
  }

  // Give windows a moment to clean up before forcing quit
  setTimeout(() => {
    app.quit();
  }, 100);
};

const smash = (source, target, k, d, noset = false) => {
  if (source.hasOwnProperty(k)) {
    target[k] = source[k];
  }
  else if (noset) {
    /* no op */
  }
  else {
    target[k] = d;
  }
};

})();
