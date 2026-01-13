/**
 * Electron Backend Entry Point
 *
 * This is the main entry point for the Electron application.
 * All Electron-specific code lives here.
 */

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import unhandled from 'electron-unhandled';

// Import from local backend modules
import {
  // Main process orchestration
  configure,
  initialize,
  discoverBuiltinExtensions,
  discoverBuiltinThemes,
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
  publish,
  subscribe,
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
} from './index.js';

// Catch unhandled errors and promise rejections without showing alert dialogs
unhandled({
  showDialog: false,
  logger: (error) => {
    console.error('Unhandled error:', error);
  }
});

// Get the root directory - app.getAppPath() works in both dev and packaged modes
const ROOT_DIR = app.getAppPath();

const DEBUG = !!process.env.DEBUG;

// script loaded into every app window
const preloadPath = path.join(ROOT_DIR, 'preload.js');

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

const profileIsLegit = (p: unknown): p is string =>
  p !== undefined && typeof p === 'string' && p.length > 0;

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
// {home} / {appData} / {userData} / {profileDir}
// Chromium's data in a subfolder of profile folder
// {home} / {appData} / {userData} / {profileDir} / {sessionData}

// specify various app data paths and make if not exist
const defaultUserDataPath = app.getPath('userData');
const profileDataPath = path.join(defaultUserDataPath, PROFILE);
const sessionDataPath = path.join(profileDataPath, 'chromium');

// create filesystem
if (!fs.existsSync(sessionDataPath)) {
  fs.mkdirSync(sessionDataPath, { recursive: true });
}

// configure Electron with these paths
app.setPath('userData', profileDataPath);
app.setPath('sessionData', sessionDataPath);

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
let _prefs: Record<string, unknown> = {};
let _quitShortcut: string | null = null;

// Set up prefs getter for backend window helpers
setPrefsGetter(() => _prefs);

// Define onQuit as alias to quitApp for use in IPC handlers and shortcuts
const onQuit = quitApp;

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
  discoverBuiltinExtensions(path.join(ROOT_DIR, 'extensions'));

  // Discover and register built-in themes from themes/ folder
  discoverBuiltinThemes(path.join(ROOT_DIR, 'themes'));

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
  } catch {
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
          } catch {
            console.error('Failed to save default browser preference');
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
  subscribe(systemAddress, scopes.SYSTEM, strings.topics.prefs, async (msg: unknown) => {
    const prefsMsg = msg as { prefs: Record<string, unknown> };
    console.log('PREFS', prefsMsg);

    // cache all prefs
    _prefs = prefsMsg.prefs;

    // Update dock visibility based on pref and visible windows
    updateDockVisibility();

    // initialize system tray
    if (prefsMsg.prefs.showTrayIcon === true) {
      console.log('showing tray');
      initTray(ROOT_DIR, {
        tooltip: labels.tray.tooltip,
        onClick: () => {
          publish(WEB_CORE_ADDRESS, scopes.GLOBAL, 'open', {
            address: SETTINGS_ADDRESS
          });
        }
      });
    }

    // update quit shortcut if changed (local shortcut - only works when app has focus)
    const newQuitShortcut = (prefsMsg.prefs.quitShortcut as string) || strings.defaults.quitShortcut;
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
  rootDir: ROOT_DIR,
  preloadPath: preloadPath,
  userDataPath: defaultUserDataPath,
  profile: PROFILE,
  isDev: DEBUG,
  isTest: PROFILE.startsWith('test')
});

// Register window-all-closed handler
registerWindowAllClosedHandler(quitApp);

// Start the app
app.whenReady().then(onReady);
