// main.js

import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  Tray
} from 'electron';

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'url';
import {
  initDatabase,
  closeDatabase,
  getDb,
  generateId,
  now,
  parseUrl,
  normalizeUrl,
  getTableAsObject,
  getRow,
  setRow,
  deleteRow,
  isValidTable,
  tableNames
} from './app/datastore/db.js';
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

const APP_SCHEME = 'peek';
const APP_PROTOCOL = `${APP_SCHEME}:`;
const APP_CORE_PATH = 'app';

const APP_DEF_WIDTH = 1024;
const APP_DEF_HEIGHT = 768;

// app hidden window to load
// core application logic is here
const webCoreAddress = 'peek://app/background.html';
//const webCoreAddress = 'peek://test/index.html';

const systemAddress = 'peek://system/';
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

// Database reference (set during init)
let db = null;

const initDatastore = (userDataPath) => {
  const dbPath = path.join(userDataPath, 'datastore.sqlite');
  db = initDatabase(dbPath);
  return db !== null;
};

// Calculate frecency score: frequency * 10 * decay_factor
// decay_factor = 1 / (1 + days_since_use / 7)
const calculateFrecency = (frequency, lastUsedAt) => {
  const currentTime = Date.now();
  const daysSinceUse = (currentTime - lastUsedAt) / (1000 * 60 * 60 * 24);
  const decayFactor = 1 / (1 + daysSinceUse / 7);
  return Math.round(frequency * 10 * decayFactor);
};

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

// keyed on shortcut string, value is source address (for global shortcuts)
const shortcuts = new Map();

// keyed on shortcut string, value is { source, callback, replyTopic }
// Local shortcuts only work when app has focus
const localShortcuts = new Map();

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

const getPseudoHost = str => str.split('/')[2];

const scopes = {
  SYSTEM: 1,
  SELF: 2,
  GLOBAL: 3
};

const pubsub = (() => {

  const topics = new Map();

  const scopeCheck = (pubSource, subSource, scope) => {
    //console.log('scopeCheck', subSource, pubSource, scope);
    if (subSource == systemAddress) {
      return true
    }
    if (scope == scopes.GLOBAL) {
      return true;
    }
    if (getPseudoHost(subSource) == getPseudoHost(pubSource)) {
      return true;
    }
    return false;
  };

  return {
    publish: (source, scope, topic, msg) => {
      //console.log('ps.pub', topic);

      // Route to traditional subscribers (via IPC callbacks)
      if (topics.has(topic)) {

        const t = topics.get(topic);

        for (const [subSource, cb] of t) {
          if (scopeCheck(source, subSource, scope)) {
            //console.log('FOUND ONE!', subSource);
            cb(msg);
          }
        };
      }

      // Route to extension windows (GLOBAL scope only)
      // This enables cross-origin communication to isolated extension processes
      if (scope === scopes.GLOBAL && extensionWindows) {
        for (const [extId, entry] of extensionWindows) {
          if (entry.win && !entry.win.isDestroyed() && entry.status === 'running') {
            // Don't send back to the source extension
            const extOrigin = `peek://ext/${extId}/`;
            if (!source.startsWith(extOrigin)) {
              entry.win.webContents.send(`pubsub:${topic}`, {
                ...msg,
                source
              });
            }
          }
        }
      }
    },
    subscribe: (source, scope, topic, cb) => {
      //console.log('ps.sub', source, scope, topic);

      if (!topics.has(topic)) {
        topics.set(topic, new Map([ [source, cb] ]));
      }
      else {
        const subscribers = topics.get(topic);
        subscribers.set(source, cb);
        topics.set(topic, subscribers);
      }
    },
  };

})();

// ***** Command Registry *****
// Stores commands registered via cmd:register topic
// This enables cmd app to query commands registered before it started
const commandRegistry = new Map();

// ***** Tray *****

const ICON_RELATIVE_PATH = 'assets/tray/tray@2x.png';

let _tray = null;

const initTray = () => {
  if (!_tray || _tray.isDestroyed()) {
    const iconPath = path.join(__dirname, ICON_RELATIVE_PATH);
    console.log('initTray: loading icon from', iconPath);

    try {
      _tray = new Tray(iconPath);
      _tray.setToolTip(labels.tray.tooltip);
      _tray.on('click', () => {
        pubsub.publish(webCoreAddress, scopes.GLOBAL, 'open', {
          address: settingsAddress
        });
      });
      console.log('initTray: tray created successfully');
    } catch (err) {
      console.error('initTray: failed to create tray:', err);
      return null;
    }
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

// Extension path cache: extensionId -> filesystem path
const extensionPaths = new Map();

// Register a built-in extension path
const registerExtensionPath = (id, fsPath) => {
  extensionPaths.set(id, fsPath);
  DEBUG && console.log('Registered extension path:', id, fsPath);
};

// Get extension filesystem path by ID
// First checks built-in extensions, then datastore for external extensions
const getExtensionPath = (id) => {
  // Check built-in extensions first
  const builtinPath = extensionPaths.get(id);
  if (builtinPath) return builtinPath;

  // Check datastore for external extensions
  if (db) {
    const ext = db.prepare('SELECT * FROM extensions WHERE id = ?').get(id);
    if (ext && ext.path) {
      return ext.path;
    }

    // Also check by shortname (stored in metadata)
    const allExts = db.prepare('SELECT * FROM extensions').all();
    for (const extData of allExts) {
      try {
        const metadata = JSON.parse(extData.metadata || '{}');
        if (metadata.shortname === id && extData.path) {
          return extData.path;
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }
  }

  return null;
};

/**
 * Scan a directory for valid extensions (folders with manifest.json)
 * @param {string} basePath - Directory to scan
 * @returns {Array<{id: string, path: string, manifest: object}>}
 */
const discoverExtensions = (basePath) => {
  const extensions = [];

  if (!fs.existsSync(basePath)) return extensions;

  const entries = fs.readdirSync(basePath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const extPath = path.join(basePath, entry.name);
    const manifestPath = path.join(extPath, 'manifest.json');

    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      // Use manifest.id or folder name as fallback
      const id = manifest.id || manifest.shortname || entry.name;

      extensions.push({ id, path: extPath, manifest });

    } catch (err) {
      console.error(`[ext:discovery] Failed to load ${entry.name}:`, err.message);
    }
  }

  return extensions;
};

// ***** Extension Window Management *****
// Each extension runs in its own isolated BrowserWindow at peek://ext/{id}/background.html

const extensionWindows = new Map(); // extId -> { win, manifest, status }

const createExtensionWindow = async (extId) => {
  if (extensionWindows.has(extId)) {
    console.log(`[ext:win] Extension ${extId} already has a window`);
    return extensionWindows.get(extId).win;
  }

  const extPath = getExtensionPath(extId);
  if (!extPath) {
    console.error(`[ext:win] Extension path not found: ${extId}`);
    return null;
  }

  // Load manifest and settings schema
  let manifest = null;
  try {
    const manifestPath = path.join(extPath, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      // Load settings schema if specified
      if (manifest.settingsSchema) {
        const schemaPath = path.join(extPath, manifest.settingsSchema);
        if (fs.existsSync(schemaPath)) {
          const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
          // Merge schema fields into manifest for Settings UI
          manifest.schemas = { prefs: schema.prefs, item: schema.item };
          manifest.storageKeys = schema.storageKeys;
          manifest.defaults = schema.defaults;
        }
      }
    }
  } catch (err) {
    console.error(`[ext:win] Failed to load manifest for ${extId}:`, err);
  }

  console.log(`[ext:win] Creating window for extension: ${extId}`);

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: preloadPath
    }
  });

  // Forward console logs from extension to main process stdout
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelStr = ['debug', 'info', 'warn', 'error'][level] || 'log';
    console.log(`[ext:${extId}] ${message}`);
  });

  // Track crash events
  win.webContents.on('crashed', (event, killed) => {
    console.error(`[ext:win] Extension ${extId} crashed (killed: ${killed})`);
    const entry = extensionWindows.get(extId);
    if (entry) {
      entry.status = 'crashed';
    }
    // Optionally auto-restart: createExtensionWindow(extId);
  });

  // Track close events
  win.on('closed', () => {
    console.log(`[ext:win] Extension ${extId} window closed`);
    extensionWindows.delete(extId);
  });

  // Store before loading to handle async issues
  extensionWindows.set(extId, { win, manifest, status: 'loading' });

  try {
    await win.loadURL(`peek://ext/${extId}/background.html`);
    console.log(`[ext:win] Extension ${extId} loaded successfully`);
    const entry = extensionWindows.get(extId);
    if (entry) {
      entry.status = 'running';
    }
    return win;
  } catch (error) {
    console.error(`[ext:win] Failed to load extension ${extId}:`, error);
    extensionWindows.delete(extId);
    win.destroy();
    return null;
  }
};

const destroyExtensionWindow = (extId) => {
  const entry = extensionWindows.get(extId);
  if (!entry) {
    console.log(`[ext:win] No window to destroy for: ${extId}`);
    return false;
  }

  console.log(`[ext:win] Destroying window for: ${extId}`);

  // Notify extension of shutdown before destroying
  if (entry.win && !entry.win.isDestroyed()) {
    entry.win.webContents.send('pubsub:app:shutdown', {});
    // Give it a moment to clean up, then destroy
    setTimeout(() => {
      if (!entry.win.isDestroyed()) {
        entry.win.destroy();
      }
    }, 100);
  }

  extensionWindows.delete(extId);
  return true;
};

const getExtensionWindow = (extId) => {
  const entry = extensionWindows.get(extId);
  return entry ? entry.win : null;
};

const getRunningExtensions = () => {
  const running = [];
  for (const [extId, entry] of extensionWindows) {
    if (entry.status === 'running') {
      running.push({
        id: extId,
        manifest: entry.manifest,
        status: entry.status
      });
    }
  }
  return running;
};

// Load enabled extensions on startup
const loadEnabledExtensions = async () => {
  // Get all discovered extensions (registered via discoverExtensions)
  const builtinExtIds = Array.from(extensionPaths.keys());

  // Check which are enabled from datastore/localStorage
  for (const extId of builtinExtIds) {
    // Check if enabled in extension_settings or extensions table
    let enabled = true; // Default to enabled for builtins

    if (db) {
      // Check extension_settings for enabled state
      const setting = db.prepare('SELECT * FROM extension_settings WHERE extensionId = ? AND key = ?').get(extId, 'enabled');
      if (setting) {
        try {
          enabled = JSON.parse(setting.value) !== false;
        } catch (e) {
          enabled = true;
        }
      }
    }

    if (enabled) {
      console.log(`[ext:win] Loading enabled extension: ${extId}`);
      await createExtensionWindow(extId);
    } else {
      console.log(`[ext:win] Skipping disabled extension: ${extId}`);
    }
  }

  // Load external extensions from datastore
  if (db) {
    const externalExts = db.prepare('SELECT * FROM extensions').all();
    for (const extData of externalExts) {
      const extId = extData.id;
      // Skip if already loaded (shouldn't happen but be safe)
      if (extensionWindows.has(extId)) continue;

      // Skip if not enabled
      if (extData.enabled !== 1) {
        console.log(`[ext:win] Skipping disabled external extension: ${extId}`);
        continue;
      }

      // Need a path to load from
      if (!extData.path) {
        console.log(`[ext:win] Skipping external extension without path: ${extId}`);
        continue;
      }

      console.log(`[ext:win] Loading enabled external extension: ${extId}`);
      await createExtensionWindow(extId);
    }
  }

  console.log(`[ext:win] Loaded ${extensionWindows.size} extensions`);

  // Signal that all extensions are loaded (GLOBAL so Settings can receive it)
  pubsub.publish('system', scopes.GLOBAL, 'ext:all-loaded', {
    count: extensionWindows.size
  });
};

// TODO: unhack all this trash fire
const initAppProtocol = () => {
  protocol.handle(APP_SCHEME, req => {
    //console.log('PROTOCOL', req.url);

    let { host, pathname } = new URL(req.url);
    //console.log('host, pathname', host, pathname);

    // trim trailing slash
    pathname = pathname.replace(/^\//, '');

    // Handle extension content: peek://ext/{ext-id}/{path}
    if (host === 'ext') {
      const parts = pathname.split('/');
      const extId = parts[0];
      const extPath = parts.slice(1).join('/') || 'index.html';

      const extBasePath = getExtensionPath(extId);
      if (!extBasePath) {
        DEBUG && console.log('Extension not found:', extId);
        return new Response('Extension not found', { status: 404 });
      }

      const absolutePath = path.resolve(extBasePath, extPath);

      // Security: ensure path stays within extension folder
      const normalizedBase = path.normalize(extBasePath);
      if (!absolutePath.startsWith(normalizedBase)) {
        console.error('Path traversal attempt blocked:', absolutePath);
        return new Response('Forbidden', { status: 403 });
      }

      const fileURL = pathToFileURL(absolutePath).toString();
      return net.fetch(fileURL);
    }

    // Handle extensions infrastructure: peek://extensions/{path}
    // This serves the extension loader and other shared extension code
    if (host === 'extensions') {
      const absolutePath = path.resolve(__dirname, 'extensions', pathname);

      // Security: ensure path stays within extensions folder
      const extensionsBase = path.resolve(__dirname, 'extensions');
      if (!absolutePath.startsWith(extensionsBase)) {
        console.error('Path traversal attempt blocked:', absolutePath);
        return new Response('Forbidden', { status: 403 });
      }

      const fileURL = pathToFileURL(absolutePath).toString();
      return net.fetch(fileURL);
    }

    let relativePath = pathname;

    // Ugh, handle node_modules paths
    // does this even work in packaged build?
    const isNode = pathname.indexOf('node_modules') > -1;

    if (!isNode) {
      relativePath = path.join(host, pathname);
    }

    const absolutePath = path.resolve(__dirname, relativePath);
    //console.log('ABSOLUTE PATH', absolutePath);

    const fileURL = pathToFileURL(absolutePath).toString();
    //console.log('FILE URL', fileURL);

    return net.fetch(fileURL);
  });
};

// ***** init *****

// Electron app load
const onReady = async () => {
  console.log('onReady');

  // Hide dock early to prevent flash in app switcher
  // Will be shown/hidden properly once prefs are loaded
  if (app.dock) {
    app.dock.hide();
  }

  // Initialize datastore with SQLite persistence
  await initDatastore(profileDataPath);

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

  // handle peek://
  initAppProtocol();

  // Discover and register built-in extensions from extensions/ folder
  const discoveredExtensions = discoverExtensions(path.join(__dirname, 'extensions'));
  console.log(`[ext:discovery] Found ${discoveredExtensions.length} extensions:`, discoveredExtensions.map(e => e.id).join(', '));

  for (const ext of discoveredExtensions) {
    registerExtensionPath(ext.id, ext.path);
  }

  // Register as default handler for http/https URLs (if not already and user hasn't declined)
  const defaultBrowserPrefFile = path.join(profileDataPath, 'default-browser-pref.json');
  let shouldPromptForDefault = true;

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
      initTray();
    }

    // update quit shortcut if changed (local shortcut - only works when app has focus)
    const newQuitShortcut = msg.prefs.quitShortcut || strings.defaults.quitShortcut;
    if (newQuitShortcut !== _quitShortcut) {
      if (_quitShortcut) {
        console.log('unregistering old quit shortcut:', _quitShortcut);
        unregisterLocalShortcut(_quitShortcut);
      }
      console.log('registering new quit shortcut:', newQuitShortcut);
      registerLocalShortcut(newQuitShortcut, onQuit);
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
  
  // Setup devtools for the background window (always open in debug mode)
  if (DEBUG) {
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
  registerLocalShortcut(_quitShortcut, onQuit);

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
    // Global shortcut (works even when app doesn't have focus)
    shortcuts.set(msg.shortcut, msg.source);
    registerShortcut(msg.shortcut, callback);
  } else {
    // Local shortcut (only works when app has focus)
    const parsed = parseShortcut(msg.shortcut);
    localShortcuts.set(msg.shortcut, { source: msg.source, parsed, callback });
  }
});

ipcMain.on(strings.msgs.unregisterShortcut, (ev, msg) => {
  const isGlobal = msg.global === true;
  console.log('ipc unregister shortcut', msg.shortcut, isGlobal ? '(global)' : '(local)');

  if (isGlobal) {
    unregisterShortcut(msg.shortcut, res => {
      console.log('ipc unregister global shortcut callback result:', res);
    });
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
    const normalizedUri = normalizeUrl(uri);
    const parsed = parseUrl(normalizedUri);
    const addressId = generateId('addr');
    const timestamp = now();

    const stmt = db.prepare(`
      INSERT INTO addresses (id, uri, protocol, domain, path, title, mimeType, favicon, description, tags, metadata, createdAt, updatedAt, lastVisitAt, visitCount, starred, archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      addressId,
      normalizedUri,
      options.protocol || parsed.protocol,
      options.domain || parsed.domain,
      options.path || parsed.path,
      options.title || '',
      options.mimeType || 'text/html',
      options.favicon || '',
      options.description || '',
      options.tags || '',
      options.metadata || '{}',
      timestamp,
      timestamp,
      options.lastVisitAt || 0,
      options.visitCount || 0,
      options.starred || 0,
      options.archived || 0
    );

    return { success: true, id: addressId };
  } catch (error) {
    console.error('datastore-add-address error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-get-address', async (ev, data) => {
  try {
    const { id } = data;
    const row = db.prepare('SELECT * FROM addresses WHERE id = ?').get(id);
    return { success: true, data: row || {} };
  } catch (error) {
    console.error('datastore-get-address error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-update-address', async (ev, data) => {
  try {
    const { id, updates } = data;
    const existing = db.prepare('SELECT * FROM addresses WHERE id = ?').get(id);
    if (!existing) {
      return { success: false, error: 'Address not found' };
    }

    const updated = { ...existing, ...updates, updatedAt: now() };
    const columns = Object.keys(updated).filter(k => k !== 'id');
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const values = columns.map(col => updated[col]);

    db.prepare(`UPDATE addresses SET ${setClause} WHERE id = ?`).run(...values, id);
    return { success: true, data: { id, ...updated } };
  } catch (error) {
    console.error('datastore-update-address error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-query-addresses', async (ev, data) => {
  try {
    const { filter = {} } = data;

    let sql = 'SELECT * FROM addresses WHERE 1=1';
    const params = [];

    if (filter.domain) {
      sql += ' AND domain = ?';
      params.push(filter.domain);
    }
    if (filter.protocol) {
      sql += ' AND protocol = ?';
      params.push(filter.protocol);
    }
    if (filter.starred !== undefined) {
      sql += ' AND starred = ?';
      params.push(filter.starred);
    }
    if (filter.tag) {
      sql += ' AND tags LIKE ?';
      params.push(`%${filter.tag}%`);
    }

    // Sort
    const sortMap = {
      lastVisit: 'lastVisitAt DESC',
      visitCount: 'visitCount DESC',
      created: 'createdAt DESC'
    };
    sql += ` ORDER BY ${sortMap[filter.sortBy] || 'updatedAt DESC'}`;

    // Limit
    if (filter.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    const results = db.prepare(sql).all(...params);
    return { success: true, data: results };
  } catch (error) {
    console.error('datastore-query-addresses error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-add-visit', async (ev, data) => {
  try {
    const { addressId, options = {} } = data;
    const visitId = generateId('visit');
    const timestamp = now();

    db.prepare(`
      INSERT INTO visits (id, addressId, timestamp, duration, source, sourceId, windowType, metadata, scrollDepth, interacted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      visitId,
      addressId,
      options.timestamp || timestamp,
      options.duration || 0,
      options.source || 'direct',
      options.sourceId || '',
      options.windowType || 'main',
      options.metadata || '{}',
      options.scrollDepth || 0,
      options.interacted || 0
    );

    // Update address visit stats
    db.prepare(`
      UPDATE addresses SET lastVisitAt = ?, visitCount = visitCount + 1, updatedAt = ?
      WHERE id = ?
    `).run(timestamp, timestamp, addressId);

    return { success: true, id: visitId };
  } catch (error) {
    console.error('datastore-add-visit error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-query-visits', async (ev, data) => {
  try {
    const { filter = {} } = data;

    let sql = 'SELECT * FROM visits WHERE 1=1';
    const params = [];

    if (filter.addressId) {
      sql += ' AND addressId = ?';
      params.push(filter.addressId);
    }
    if (filter.source) {
      sql += ' AND source = ?';
      params.push(filter.source);
    }
    if (filter.since) {
      const since = typeof filter.since === 'number' ? filter.since : now() - filter.since;
      sql += ' AND timestamp >= ?';
      params.push(since);
    }

    sql += ' ORDER BY timestamp DESC';

    if (filter.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    const results = db.prepare(sql).all(...params);
    return { success: true, data: results };
  } catch (error) {
    console.error('datastore-query-visits error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-add-content', async (ev, data) => {
  try {
    const { options = {} } = data;
    const contentId = generateId('content');
    const timestamp = now();

    db.prepare(`
      INSERT INTO content (id, title, content, mimeType, contentType, language, encoding, tags, addressRefs, parentId, metadata, createdAt, updatedAt, syncPath, synced, starred, archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contentId,
      options.title || 'Untitled',
      options.content || '',
      options.mimeType || 'text/plain',
      options.contentType || 'plain',
      options.language || '',
      options.encoding || 'utf-8',
      options.tags || '',
      options.addressRefs || '',
      options.parentId || '',
      options.metadata || '{}',
      timestamp,
      timestamp,
      options.syncPath || '',
      options.synced || 0,
      options.starred || 0,
      options.archived || 0
    );
    return { success: true, id: contentId };
  } catch (error) {
    console.error('datastore-add-content error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-query-content', async (ev, data) => {
  try {
    const { filter = {} } = data;

    let sql = 'SELECT * FROM content WHERE 1=1';
    const params = [];

    if (filter.contentType) {
      sql += ' AND contentType = ?';
      params.push(filter.contentType);
    }
    if (filter.mimeType) {
      sql += ' AND mimeType = ?';
      params.push(filter.mimeType);
    }
    if (filter.synced !== undefined) {
      sql += ' AND synced = ?';
      params.push(filter.synced);
    }
    if (filter.starred !== undefined) {
      sql += ' AND starred = ?';
      params.push(filter.starred);
    }
    if (filter.tag) {
      sql += ' AND tags LIKE ?';
      params.push(`%${filter.tag}%`);
    }

    // Sort
    const sortMap = {
      updated: 'updatedAt DESC',
      created: 'createdAt DESC'
    };
    sql += ` ORDER BY ${sortMap[filter.sortBy] || 'updatedAt DESC'}`;

    if (filter.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    const results = db.prepare(sql).all(...params);
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
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    // Convert to object keyed by id for compatibility
    const table = {};
    for (const row of rows) {
      table[row.id] = row;
    }
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
    const row = { id: rowId, ...rowData };
    const columns = Object.keys(row);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map(col => row[col]);

    db.prepare(`INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);
    return { success: true };
  } catch (error) {
    console.error('datastore-set-row error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('datastore-get-stats', async () => {
  try {
    const stats = {
      totalAddresses: db.prepare('SELECT COUNT(*) as count FROM addresses').get().count,
      totalVisits: db.prepare('SELECT COUNT(*) as count FROM visits').get().count,
      avgVisitDuration: db.prepare('SELECT AVG(duration) as avg FROM visits').get().avg || 0,
      totalContent: db.prepare('SELECT COUNT(*) as count FROM content').get().count,
      syncedContent: db.prepare('SELECT COUNT(*) as count FROM content WHERE synced = 1').get().count
    };
    return { success: true, data: stats };
  } catch (error) {
    console.error('datastore-get-stats error:', error);
    return { success: false, error: error.message };
  }
});

// ***** Tag IPC Handlers *****

// Get or create a tag by name
ipcMain.handle('datastore-get-or-create-tag', async (ev, data) => {
  try {
    const { name } = data;
    console.log('datastore-get-or-create-tag:', name);
    const slug = name.toLowerCase().trim().replace(/\s+/g, '-');
    const timestamp = now();

    // Look for existing tag by name (case-insensitive)
    const existingTag = db.prepare('SELECT * FROM tags WHERE LOWER(name) = LOWER(?)').get(name);

    if (existingTag) {
      console.log('  -> found existing tag:', existingTag.id);
      return { success: true, data: existingTag, created: false };
    }

    // Create new tag
    const tagId = generateId('tag');
    db.prepare(`
      INSERT INTO tags (id, name, slug, color, parentId, description, metadata, createdAt, updatedAt, frequency, lastUsedAt, frecencyScore)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tagId, name.trim(), slug, '#999999', '', '', '{}', timestamp, timestamp, 0, 0, 0);

    const newTag = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId);
    console.log('  -> created new tag:', tagId);
    return { success: true, data: newTag, created: true };
  } catch (error) {
    console.error('datastore-get-or-create-tag error:', error);
    return { success: false, error: error.message };
  }
});

// Tag an address (create the link and update frecency)
ipcMain.handle('datastore-tag-address', async (ev, data) => {
  try {
    const { addressId, tagId } = data;
    console.log('datastore-tag-address:', { addressId, tagId });
    const timestamp = now();

    // Check if link already exists
    const existingLink = db.prepare('SELECT * FROM address_tags WHERE addressId = ? AND tagId = ?').get(addressId, tagId);
    if (existingLink) {
      return { success: true, data: existingLink, alreadyExists: true };
    }

    // Create the link
    const linkId = generateId('address_tag');
    db.prepare('INSERT INTO address_tags (id, addressId, tagId, createdAt) VALUES (?, ?, ?, ?)').run(linkId, addressId, tagId, timestamp);

    // Update tag frequency and frecency
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId);
    if (tag) {
      const newFrequency = (tag.frequency || 0) + 1;
      const frecencyScore = calculateFrecency(newFrequency, timestamp);
      db.prepare('UPDATE tags SET frequency = ?, lastUsedAt = ?, frecencyScore = ?, updatedAt = ? WHERE id = ?')
        .run(newFrequency, timestamp, frecencyScore, timestamp, tagId);
    }

    const newLink = db.prepare('SELECT * FROM address_tags WHERE id = ?').get(linkId);
    return { success: true, data: newLink };
  } catch (error) {
    console.error('datastore-tag-address error:', error);
    return { success: false, error: error.message };
  }
});

// Untag an address (remove the link)
ipcMain.handle('datastore-untag-address', async (ev, data) => {
  try {
    const { addressId, tagId } = data;

    const result = db.prepare('DELETE FROM address_tags WHERE addressId = ? AND tagId = ?').run(addressId, tagId);
    return { success: true, removed: result.changes > 0 };
  } catch (error) {
    console.error('datastore-untag-address error:', error);
    return { success: false, error: error.message };
  }
});

// Get all tags sorted by frecency
ipcMain.handle('datastore-get-tags-by-frecency', async (ev, data = {}) => {
  try {
    const { domain } = data || {};
    let tags = db.prepare('SELECT * FROM tags').all();
    console.log('datastore-get-tags-by-frecency: tags table has', tags.length, 'tags');

    // Recalculate frecency scores (they decay over time)
    tags = tags.map(tag => ({
      ...tag,
      frecencyScore: calculateFrecency(tag.frequency || 0, tag.lastUsedAt || 0)
    }));

    // If domain provided, boost tags used on same-domain addresses
    if (domain) {
      // Find tag IDs used on addresses with matching domain using JOIN
      const domainTagIds = new Set(
        db.prepare(`
          SELECT DISTINCT at.tagId FROM address_tags at
          JOIN addresses a ON at.addressId = a.id
          WHERE a.domain = ?
        `).all(domain).map(row => row.tagId)
      );

      // Apply 2x boost
      tags = tags.map(tag => ({
        ...tag,
        frecencyScore: domainTagIds.has(tag.id) ? tag.frecencyScore * 2 : tag.frecencyScore
      }));
    }

    // Sort by frecency descending
    tags.sort((a, b) => b.frecencyScore - a.frecencyScore);

    return { success: true, data: tags };
  } catch (error) {
    console.error('datastore-get-tags-by-frecency error:', error);
    return { success: false, error: error.message };
  }
});

// Get tags for a specific address
ipcMain.handle('datastore-get-address-tags', async (ev, data) => {
  try {
    const { addressId } = data;

    // Use JOIN to get tags directly
    const tags = db.prepare(`
      SELECT t.* FROM tags t
      JOIN address_tags at ON t.id = at.tagId
      WHERE at.addressId = ?
    `).all(addressId);

    return { success: true, data: tags };
  } catch (error) {
    console.error('datastore-get-address-tags error:', error);
    return { success: false, error: error.message };
  }
});

// Get addresses with a specific tag
ipcMain.handle('datastore-get-addresses-by-tag', async (ev, data) => {
  try {
    const { tagId } = data;

    // Use JOIN to get addresses directly
    const addresses = db.prepare(`
      SELECT a.* FROM addresses a
      JOIN address_tags at ON a.id = at.addressId
      WHERE at.tagId = ?
    `).all(tagId);

    return { success: true, data: addresses };
  } catch (error) {
    console.error('datastore-get-addresses-by-tag error:', error);
    return { success: false, error: error.message };
  }
});

// Get addresses that have no tags
ipcMain.handle('datastore-get-untagged-addresses', async (ev, data) => {
  try {
    // Use LEFT JOIN + NULL check to find untagged addresses
    const addresses = db.prepare(`
      SELECT a.* FROM addresses a
      LEFT JOIN address_tags at ON a.id = at.addressId
      WHERE at.id IS NULL
      ORDER BY a.visitCount DESC
    `).all();

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

const registerShortcut = (shortcut, callback) => {
  console.log('registerShortcut', shortcut);

  if (globalShortcut.isRegistered(shortcut)) {
    console.error(strings.shortcuts.errorAlreadyRegistered, shortcut);
    globalShortcut.unregister(shortcut);
  }

  const ret = globalShortcut.register(shortcut, () => {
    console.log('shortcut executed', shortcut);
    callback();
  });

  if (ret !== true) {
    console.error('registerShortcut FAILED:', shortcut);
    return new Error(strings.shortcuts.errorRegistrationFailed);
  }
};

const unregisterShortcut = (shortcut, callback) => {
  console.log('unregisterShortcut', shortcut)

  if (!globalShortcut.isRegistered(shortcut)) {
    console.error('Unable to unregister shortcut because not registered or it is not us', shortcut);
    return new Error("Shortcut not registered: " + shortcut);
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
      console.log('unregistering global shortcut', shortcut, 'for', address);
      unregisterShortcut(shortcut);
    }
  }
  // Also unregister local shortcuts for this address
  for (const [shortcut, data] of localShortcuts) {
    if (data.source === aAddress) {
      console.log('unregistering local shortcut', shortcut, 'for', aAddress);
      localShortcuts.delete(shortcut);
    }
  }
};

// Map key names to physical key codes (for before-input-event matching)
// Electron's input.code follows the USB HID spec
const keyToCode = {
  // Letters
  'a': 'KeyA', 'b': 'KeyB', 'c': 'KeyC', 'd': 'KeyD', 'e': 'KeyE',
  'f': 'KeyF', 'g': 'KeyG', 'h': 'KeyH', 'i': 'KeyI', 'j': 'KeyJ',
  'k': 'KeyK', 'l': 'KeyL', 'm': 'KeyM', 'n': 'KeyN', 'o': 'KeyO',
  'p': 'KeyP', 'q': 'KeyQ', 'r': 'KeyR', 's': 'KeyS', 't': 'KeyT',
  'u': 'KeyU', 'v': 'KeyV', 'w': 'KeyW', 'x': 'KeyX', 'y': 'KeyY',
  'z': 'KeyZ',
  // Numbers
  '0': 'Digit0', '1': 'Digit1', '2': 'Digit2', '3': 'Digit3', '4': 'Digit4',
  '5': 'Digit5', '6': 'Digit6', '7': 'Digit7', '8': 'Digit8', '9': 'Digit9',
  // Punctuation
  ',': 'Comma', '.': 'Period', '/': 'Slash', ';': 'Semicolon', "'": 'Quote',
  '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', '`': 'Backquote',
  '-': 'Minus', '=': 'Equal',
  // Special keys
  'enter': 'Enter', 'return': 'Enter',
  'tab': 'Tab',
  'space': 'Space', ' ': 'Space',
  'backspace': 'Backspace',
  'delete': 'Delete',
  'escape': 'Escape', 'esc': 'Escape',
  'up': 'ArrowUp', 'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight',
  'arrowup': 'ArrowUp', 'arrowdown': 'ArrowDown', 'arrowleft': 'ArrowLeft', 'arrowright': 'ArrowRight',
  'home': 'Home', 'end': 'End',
  'pageup': 'PageUp', 'pagedown': 'PageDown',
  // Function keys
  'f1': 'F1', 'f2': 'F2', 'f3': 'F3', 'f4': 'F4', 'f5': 'F5', 'f6': 'F6',
  'f7': 'F7', 'f8': 'F8', 'f9': 'F9', 'f10': 'F10', 'f11': 'F11', 'f12': 'F12',
};

// Parse shortcut string to match Electron's input event format
// e.g., 'Alt+Q' -> { alt: true, code: 'KeyQ' }
// e.g., 'CommandOrControl+Shift+P' -> { meta: true, shift: true, code: 'KeyP' } (on Mac)
const parseShortcut = (shortcut) => {
  const parts = shortcut.toLowerCase().split('+');
  const result = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    code: ''
  };

  for (const part of parts) {
    const p = part.trim();
    if (p === 'ctrl' || p === 'control') {
      result.ctrl = true;
    } else if (p === 'alt' || p === 'option') {
      result.alt = true;
    } else if (p === 'shift') {
      result.shift = true;
    } else if (p === 'meta' || p === 'cmd' || p === 'command' || p === 'super') {
      result.meta = true;
    } else if (p === 'commandorcontrol' || p === 'cmdorctrl') {
      // On Mac, use meta (Cmd), on others use ctrl
      if (process.platform === 'darwin') {
        result.meta = true;
      } else {
        result.ctrl = true;
      }
    } else {
      // This is the key itself - convert to code
      result.code = keyToCode[p] || p;
    }
  }

  return result;
};

// Check if an input event matches a parsed shortcut
const inputMatchesShortcut = (input, parsed) => {
  // Check modifiers
  if (input.alt !== parsed.alt) return false;
  if (input.shift !== parsed.shift) return false;
  if (input.meta !== parsed.meta) return false;
  if (input.control !== parsed.ctrl) return false;

  // Check physical key code (case-insensitive comparison)
  return input.code.toLowerCase() === parsed.code.toLowerCase();
};

// Register a local (app-only) shortcut
const registerLocalShortcut = (shortcut, callback) => {
  console.log('registerLocalShortcut', shortcut);

  if (localShortcuts.has(shortcut)) {
    console.log('local shortcut already registered, replacing:', shortcut);
  }

  const parsed = parseShortcut(shortcut);
  localShortcuts.set(shortcut, { parsed, callback });
};

// Unregister a local shortcut
const unregisterLocalShortcut = (shortcut) => {
  console.log('unregisterLocalShortcut', shortcut);

  if (!localShortcuts.has(shortcut)) {
    console.error('local shortcut not registered:', shortcut);
    return;
  }

  localShortcuts.delete(shortcut);
};

// Handle local shortcuts from any focused window
// Called from before-input-event handler
const handleLocalShortcut = (input) => {
  // Only handle keyDown events
  if (input.type !== 'keyDown') return false;

  for (const [shortcut, data] of localShortcuts) {
    if (inputMatchesShortcut(input, data.parsed)) {
      data.callback();
      return true;
    }
  }
  return false;
};

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

  // Check if devTools should be opened
  if (params.openDevTools === true) {
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
  if (db) {
    try {
      closeDatabase();
      console.log('SQLite database closed');
    } catch (error) {
      console.error('Error closing SQLite database:', error);
    }
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
