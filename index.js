// main.js

import { app } from 'electron';

import fs from 'node:fs';
import path from 'node:path';

// Import from compiled TypeScript backend
import {
  // Main process orchestration
  configure,
  initialize,
  discoverBuiltinExtensions,
  loadEnabledExtensions,
  // External URL handling
  setAppReady,
  registerExternalUrlHandlers,
  registerSecondInstanceHandler,
  handleCliUrl,
  // Background window
  createBackgroundWindow,
  // App lifecycle
  registerWindowAllClosedHandler,
  registerActivateHandler,
  requestSingleInstance,
  quitApp,
  // Tray
  initTray,
  // Shortcuts
  registerLocalShortcut,
  unregisterLocalShortcut,
  // PubSub
  scopes,
  publish as pubsubPublish,
  subscribe as pubsubSubscribe,
  getSystemAddress,
  // IPC
  registerAllHandlers,
  // Config
  WEB_CORE_ADDRESS,
  SETTINGS_ADDRESS,
  setPreloadPath,
  setProfile,
  isTestProfile,
  // Window helpers
  setPrefsGetter,
  updateDockVisibility,
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

const systemAddress = getSystemAddress();

// Initialize backend config with runtime values
setPreloadPath(preloadPath);

const strings = {
  defaults: {
    quitShortcut: 'Option+q'
  },
  topics: {
    prefs: 'topic:core:prefs'
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

// Set profile in backend config
setProfile(PROFILE);

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

// Register activate handler (macOS dock click)
registerActivateHandler();

// ***** Caches *****

// app global prefs configurable by user
// populated during app init
let _prefs = {};
let _quitShortcut = null;

// Set up prefs getter for backend window helpers
setPrefsGetter(() => _prefs);

// ***** pubsub *****
// Wrapper object for backend pubsub functions
const pubsub = {
  publish: pubsubPublish,
  subscribe: pubsubSubscribe
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

  // Initialize backend (database, protocol handler, pubsub broadcaster)
  await initialize();

  // Register all IPC handlers from backend
  registerAllHandlers(onQuit);

  // Ensure single instance
  if (!requestSingleInstance()) {
    return;
  }

  // Windows/Linux: handle URLs when another instance tries to open
  registerSecondInstanceHandler();

  // Discover and register built-in extensions from extensions/ folder
  discoverBuiltinExtensions(path.join(__dirname, 'extensions'));

  // Register as default handler for http/https URLs (if not already and user hasn't declined)
  // Skip for test profiles to avoid system dialogs during automated testing
  if (isTestProfile()) {
    console.log('Skipping default browser check for test profile:', PROFILE);
  }

  const defaultBrowserPrefFile = path.join(profileDataPath, 'default-browser-pref.json');
  let shouldPromptForDefault = !isTestProfile();

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
  handleCliUrl();

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
          pubsub.publish(WEB_CORE_ADDRESS, scopes.GLOBAL, 'open', {
            address: SETTINGS_ADDRESS
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

  // Create the core background window
  createBackgroundWindow();

  // Register default quit shortcut (local - only works when app has focus)
  // Will be updated when prefs arrive
  _quitShortcut = strings.defaults.quitShortcut;
  registerLocalShortcut(_quitShortcut, 'system', onQuit);

  // Mark app as ready and process any URLs that arrived during startup
  setAppReady();
};

// macOS: handle open-url event (must be registered before app.whenReady)
registerExternalUrlHandlers();

// Configure app before ready (registers protocol scheme, sets theme)
configure({
  rootDir: __dirname,
  preloadPath: preloadPath,
  userDataPath: defaultUserDataPath,
  profile: PROFILE,
  isDev: DEBUG,
  isTest: PROFILE.startsWith('test')
});

// Register window-all-closed handler
registerWindowAllClosedHandler(quitApp);

app.whenReady().then(onReady);

// Define onQuit as alias to quitApp for use in IPC handlers and shortcuts
const onQuit = quitApp;

})();
