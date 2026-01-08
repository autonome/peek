import appConfig from './config.js';
import { openStore } from "./utils.js";
import windowManager from "./windows.js";
import api from './api.js';
import fc from './features.js';
import migrations from './migrations/index.js';

const { id, labels, schemas, storageKeys, defaults } = appConfig;

console.log('core', id, labels.name);

const debug = api.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);

// Datastore is now initialized in main process and accessible via api.datastore
console.log('core', 'datastore available via api.datastore');

// Import and expose history tracking helpers
import historyTracking from './datastore/history.js';
window.datastoreHistory = historyTracking;

// maps app id to BrowserWindow id (background)
const windows = new Map();

const settingsAddress = 'peek://app/settings/settings.html';
const topicCorePrefs = 'topic:core:prefs';
const topicFeatureToggle = 'core:feature:toggle';

// Built-in extensions (now loaded by main process ExtensionManager)
const builtinExtensions = ['groups', 'peeks', 'slides'];

let _settingsWin = null;

const openSettingsWindow = async (prefs) => {
  console.log('openSettingsWindow()');

  // Fixed size for settings window - content doesn't need to scale with screen
  const width = 900;
  const height = 650;

  const params = {
    debug,
    key: settingsAddress,
    transparent: true,
    height,
    width
  };

  console.log('Opening settings window with params:', params);

  try {
    // Use the window creation API from windows.js
    const windowController = await windowManager.createWindow(settingsAddress, params);

    console.log('Settings window opened successfully with controller:', windowController);
    _settingsWin = windowController;

    // Focus the window to bring it to front
    await windowController.focus();
  } catch (error) {
    console.error('Failed to open settings window:', error);
  }
};

const initSettingsShortcut = (prefs) => {
  api.shortcuts.register(prefs.shortcutKey, () => {
    console.log('settings shortcut executed');
    openSettingsWindow(prefs);
  });
};

const initFeature = f => {
  if (!f.enabled) {
    return;
  }

  // Skip extension-based features (they're loaded by main process ExtensionManager)
  const extId = f.name.toLowerCase();
  if (builtinExtensions.includes(extId)) {
    debug && console.log('skipping extension-based feature (loaded by main process):', f.name);
    return;
  }

  // Check if feature exists in the features collection
  if (!fc[f.id]) {
    console.log('feature not found in collection:', f.name, f.id);
    return;
  }

  console.log('initializing feature ', f);

  fc[f.id].init();
};

const uninitFeature = f => {
  console.log('TODO: uninitFeature', f);

  // TODO uninitialize each active feature and close its window
};

// unused, worth testing more tho
const initIframeFeature = file => {
  const pathPrefix = 'file:///Users/dietrich/misc/peek/';
  console.log('initiframe');
  const i = document.createElement('iframe');
  const src = pathPrefix + file;
  console.log('iframe src', src);
  document.body.appendChild(i);
  i.src = src;
  console.log('iframe inited');
  i.addEventListener('load', () => {
    console.log('iframe loaded');
  });
};

const prefs = () => store.get(storageKeys.PREFS);
const features = () => store.get(storageKeys.ITEMS);

// Register extension management commands for cmd palette
const registerExtensionCommands = () => {
  // Reload extension command (uses main process IPC)
  api.commands.register({
    name: 'extension reload',
    description: 'Reload an extension by name',
    execute: async (ctx) => {
      const extName = ctx.search?.trim();
      if (!extName) {
        console.log('extension reload: no extension name provided');
        return;
      }

      console.log(`Reloading extension: ${extName}`);
      const result = await api.extensions.reload(extName.toLowerCase());
      if (result.success) {
        console.log(`Extension reloaded: ${extName}`);
      } else {
        console.error(`Failed to reload extension: ${result.error}`);
      }
    }
  });

  // List extensions command (uses main process IPC)
  api.commands.register({
    name: 'extensions',
    description: 'List running extensions',
    execute: async (ctx) => {
      const listResult = await api.extensions.list();
      if (listResult.success && listResult.data) {
        console.log('Running extensions:');
        listResult.data.forEach(ext => {
          const manifest = ext.manifest || {};
          console.log(`  - ${manifest.name || ext.id} (${ext.id}) v${manifest.version || '?'}`);
        });
      } else {
        console.log('No extensions running');
      }

      // Open settings to Extensions section
      const p = prefs();
      await openSettingsWindow(p);
    }
  });

  console.log('Extension commands registered');
};

const init = async () => {
  console.log('init');

  const p = prefs();

  console.log('prefs', p);

  // main process uses these for initialization
  api.publish(topicCorePrefs, {
    id: id,
    prefs: p
  }, api.scopes.SYSTEM);

  // Listen for system- or feature-level requests to open windows.
  api.subscribe('open', msg => {
    // eg from the tray icon.
    if (msg.address && msg.address == settingsAddress) {
      openSettingsWindow(p).catch(err => {
        console.error('Error opening settings window from open event:', err);
      });
    }
  });

  // Handle URLs opened from external apps (e.g., when Peek is default browser)
  api.subscribe('external:open-url', async (msg) => {
    console.log('external:open-url', msg);
    const { url, trackingSource, trackingSourceId } = msg;

    try {
      // Use URL as key to reuse existing windows
      await windowManager.createWindow(url, {
        key: url,
        trackingSource,
        trackingSourceId
      });
    } catch (error) {
      console.error('Error opening external URL:', error);
    }
  });

  // Always open settings window on startup
  try {
    await openSettingsWindow(p);
  } catch (error) {
    console.error('Error opening startup settings window:', error);
  }

  // Feature enable/disable handler
  // Extensions are now managed by main process ExtensionManager via IPC
  api.subscribe(topicFeatureToggle, async msg => {
    console.log('feature toggle', msg)

    // Find feature by ID (UUID) or by name (extension ID like "groups")
    const f = features().find(f =>
      f.id == msg.featureId ||
      f.name.toLowerCase() === msg.featureId?.toLowerCase()
    );
    if (f) {
      console.log('feature toggle', f);

      // Check if this feature is backed by an extension
      const extId = f.name.toLowerCase();
      const isExtension = builtinExtensions.includes(extId);

      if (msg.enabled == false) {
        console.log('disabling', f.name);
        if (isExtension) {
          // Use main process IPC to unload extension
          await api.extensions.unload(extId);
        } else {
          uninitFeature(f);
        }
      }
      else if (msg.enabled == true) {
        console.log('enabling', f.name);
        if (isExtension) {
          // Use main process IPC to load extension
          await api.extensions.load(extId);
        } else {
          initFeature(f);
        }
      }
    }
    else {
      console.log('feature toggle - no feature found for', msg.featureId);
    }
  });

  initSettingsShortcut(p);

  // Run any pending migrations (e.g., localStorage -> datastore)
  await migrations.runMigrations();

  // Initialize core features (non-extension features only)
  features().forEach(initFeature);

  // Extensions are now loaded by main process ExtensionManager
  // It receives the 'core:ready' signal and calls loadEnabledExtensions()
  console.log('Core features initialized. Extensions loaded by main process.');

  // Register extension dev commands
  registerExtensionCommands();
};

window.addEventListener('load', () => {
  init().catch(error => {
    console.error('Error during application initialization:', error);
  });
});
