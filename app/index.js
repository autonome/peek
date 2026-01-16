import appConfig from './config.js';
import { createDatastoreStore } from "./utils.js";
import windowManager from "./windows.js";
import api from './api.js';
import fc from './features.js';
import migrations from './migrations/index.js';
import { log } from './log.js';

const { id, labels, schemas, storageKeys, defaults } = appConfig;

log('core', id, labels.name);

// Store is created asynchronously in init()
let store = null;

// Datastore is now initialized in main process and accessible via api.datastore
log('core', 'datastore available via api.datastore');

// Import and expose history tracking helpers
import historyTracking from './datastore/history.js';
window.datastoreHistory = historyTracking;

// maps app id to BrowserWindow id (background)
const windows = new Map();

const settingsAddress = 'peek://app/settings/settings.html';
const topicCorePrefs = 'topic:core:prefs';
const topicFeatureToggle = 'core:feature:toggle';

// Built-in extensions (now loaded by main process ExtensionManager)
// cmd is first so it's ready to receive command registrations from other extensions
const builtinExtensions = ['cmd', 'groups', 'peeks', 'slides'];

let _settingsWin = null;

const openSettingsWindow = async (prefs) => {
  log('core', 'openSettingsWindow()');

  // Fixed size for settings window - content doesn't need to scale with screen
  const width = 900;
  const height = 650;

  const params = {
    debug: log.debug,
    key: settingsAddress,
    transparent: true,
    height,
    width
  };

  log('core', 'Opening settings window with params:', params);

  try {
    // Use the window creation API from windows.js
    const windowController = await windowManager.createWindow(settingsAddress, params);

    log('core', 'Settings window opened successfully with controller:', windowController);
    _settingsWin = windowController;

    // Focus the window to bring it to front
    await windowController.focus();
  } catch (error) {
    log.error('core', 'Failed to open settings window:', error);
  }
};

const initSettingsShortcut = (prefs) => {
  api.shortcuts.register(prefs.shortcutKey, () => {
    log('core', 'settings shortcut executed');
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
    log('core', 'skipping extension-based feature (loaded by main process):', f.name);
    return;
  }

  // Check if feature exists in the features collection
  if (!fc[f.id]) {
    log('core', 'feature not found in collection:', f.name, f.id);
    return;
  }

  log('core', 'initializing feature ', f);

  fc[f.id].init();
};

const uninitFeature = f => {
  log('core', 'TODO: uninitFeature', f);

  // TODO uninitialize each active feature and close its window
};

// unused, worth testing more tho
const initIframeFeature = file => {
  const pathPrefix = 'file:///Users/dietrich/misc/peek/';
  log('core', 'initiframe');
  const i = document.createElement('iframe');
  const src = pathPrefix + file;
  log('core', 'iframe src', src);
  document.body.appendChild(i);
  i.src = src;
  log('core', 'iframe inited');
  i.addEventListener('load', () => {
    log('core', 'iframe loaded');
  });
};

const prefs = () => store ? store.get(storageKeys.PREFS) : defaults.prefs;
const features = () => store ? store.get(storageKeys.ITEMS) : defaults.items;

// ==================== Theme Commands ====================

/**
 * Set color scheme (light/dark/system)
 */
async function setColorScheme(scheme) {
  const result = await api.theme.setColorScheme(scheme);
  if (result.success) {
    log('core', `Color scheme set to: ${scheme}`);
  } else {
    log.error('core', 'Failed to set color scheme:', result.error);
  }
}

/**
 * Cycle to the next available theme
 */
async function cycleTheme() {
  const [currentState, themeList] = await Promise.all([
    api.theme.get(),
    api.theme.list()
  ]);

  if (!themeList.success || !themeList.data || themeList.data.length === 0) {
    log.error('core', 'No themes available');
    return;
  }

  const themes = themeList.data;
  const currentId = currentState.data?.themeId || themes[0].id;

  // Find current theme index and get next one
  const currentIndex = themes.findIndex(t => t.id === currentId);
  const nextIndex = (currentIndex + 1) % themes.length;
  const nextTheme = themes[nextIndex];

  const result = await api.theme.setTheme(nextTheme.id);
  if (result.success) {
    log('core', `Theme changed to: ${nextTheme.name} (${nextTheme.id})`);
  } else {
    log.error('core', 'Failed to set theme:', result.error);
  }
}

// Register extension management commands for cmd palette
const registerExtensionCommands = () => {
  // Settings command
  api.commands.register({
    name: 'settings',
    description: 'Open settings',
    execute: async () => {
      const p = prefs();
      await openSettingsWindow(p);
    }
  });

  // Reload extension command (uses main process IPC)
  api.commands.register({
    name: 'extension reload',
    description: 'Reload an extension by name',
    execute: async (ctx) => {
      const extName = ctx.search?.trim();
      if (!extName) {
        log('core', 'extension reload: no extension name provided');
        return;
      }

      log('core', `Reloading extension: ${extName}`);
      const result = await api.extensions.reload(extName.toLowerCase());
      if (result.success) {
        log('core', `Extension reloaded: ${extName}`);
      } else {
        log.error('core', `Failed to reload extension: ${result.error}`);
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
        log('core', 'Running extensions:');
        listResult.data.forEach(ext => {
          const manifest = ext.manifest || {};
          log('core', `  - ${manifest.name || ext.id} (${ext.id}) v${manifest.version || '?'}`);
        });
      } else {
        log('core', 'No extensions running');
      }

      // Open settings to Extensions section
      const p = prefs();
      await openSettingsWindow(p);
    }
  });

  // ---- Settings Section Commands ----

  // Helper to open settings and navigate to a section
  const openSettingsSection = async (section) => {
    const p = prefs();
    await openSettingsWindow(p);
    // Small delay to ensure window is ready
    setTimeout(() => {
      api.publish('settings:navigate', { section }, api.scopes.GLOBAL);
    }, 100);
  };

  api.commands.register({
    name: 'settings core',
    description: 'Open Core settings',
    execute: () => openSettingsSection('core')
  });

  api.commands.register({
    name: 'settings extensions',
    description: 'Open Extensions settings',
    execute: () => openSettingsSection('extensions')
  });

  api.commands.register({
    name: 'settings themes',
    description: 'Open Themes settings',
    execute: () => openSettingsSection('themes')
  });

  api.commands.register({
    name: 'settings peeks',
    description: 'Open Peeks settings',
    execute: () => openSettingsSection('peeks')
  });

  api.commands.register({
    name: 'settings slides',
    description: 'Open Slides settings',
    execute: () => openSettingsSection('slides')
  });

  api.commands.register({
    name: 'settings groups',
    description: 'Open Groups settings',
    execute: () => openSettingsSection('groups')
  });

  api.commands.register({
    name: 'datastore',
    description: 'Open Datastore viewer',
    execute: async () => {
      await api.window.open('peek://app/datastore/viewer.html', {
        width: 900,
        height: 600,
        key: 'datastore-viewer'
      });
    }
  });

  api.commands.register({
    name: 'diagnostic',
    description: 'Open Diagnostic tool',
    execute: async () => {
      await api.window.open('peek://app/diagnostic.html', {
        width: 900,
        height: 700,
        key: 'diagnostic-tool'
      });
    }
  });

  // ---- Theme Commands ----

  api.commands.register({
    name: 'theme light',
    description: 'Switch to light mode',
    execute: () => setColorScheme('light')
  });

  api.commands.register({
    name: 'theme dark',
    description: 'Switch to dark mode',
    execute: () => setColorScheme('dark')
  });

  api.commands.register({
    name: 'theme system',
    description: 'Follow system color scheme',
    execute: () => setColorScheme('system')
  });

  api.commands.register({
    name: 'theme next',
    description: 'Switch to next theme',
    execute: cycleTheme
  });

  // ---- Extension Commands ----

  api.commands.register({
    name: 'reload extension',
    description: 'Reload an external extension by ID',
    execute: async (ctx) => {
      // Get running extensions to show which can be reloaded
      const result = await api.extensions.list();
      if (!result.success) {
        return { output: 'Failed to get extensions list', mimeType: 'text/plain' };
      }

      // Filter to only external extensions (not consolidated)
      const external = result.data.running?.filter(ext => !ext.isConsolidated) || [];
      if (external.length === 0) {
        return { output: 'No external extensions running to reload', mimeType: 'text/plain' };
      }

      // If input provided, try to reload that extension
      const input = ctx?.input?.trim();
      if (input) {
        const ext = external.find(e => e.id === input || e.id.includes(input));
        if (ext) {
          const reloadResult = await api.extensions.reload(ext.id);
          if (reloadResult.success) {
            return { output: `Reloaded extension: ${ext.id}`, mimeType: 'text/plain' };
          }
          return { output: `Failed to reload: ${reloadResult.error}`, mimeType: 'text/plain' };
        }
        return { output: `Extension not found: ${input}`, mimeType: 'text/plain' };
      }

      // No input - show available extensions
      const list = external.map(e => e.id).join('\n');
      return { output: `External extensions (type ID to reload):\n${list}`, mimeType: 'text/plain' };
    }
  });

  // ---- App Control Commands ----

  api.commands.register({
    name: 'quit',
    description: 'Quit the application',
    execute: () => api.quit()
  });

  api.commands.register({
    name: 'restart',
    description: 'Restart the application',
    execute: () => api.restart()
  });

  log('core', 'Core commands registered');
};

const init = async () => {
  const initStart = Date.now();

  // Run migrations first (moves localStorage -> datastore)
  await migrations.runMigrations();

  // Create datastore-backed store
  store = await createDatastoreStore('core', defaults);

  const p = prefs();

  // main process uses these for initialization
  api.publish(topicCorePrefs, {
    id: id,
    prefs: p
  }, api.scopes.SYSTEM);

  log('timing', `core init: ${Date.now() - initStart}ms`);

  // Listen for system- or feature-level requests to open windows.
  api.subscribe('open', msg => {
    // eg from the tray icon.
    if (msg.address && msg.address == settingsAddress) {
      openSettingsWindow(p).catch(err => {
        log.error('core', 'Error opening settings window from open event:', err);
      });
    }
  });

  // Handle URLs opened from external apps (e.g., when Peek is default browser)
  api.subscribe('external:open-url', async (msg) => {
    log('core', 'external:open-url', msg);
    const { url, trackingSource, trackingSourceId } = msg;

    try {
      // Use URL as key to reuse existing windows
      await windowManager.createWindow(url, {
        key: url,
        trackingSource,
        trackingSourceId
      });
    } catch (error) {
      log.error('core', 'Error opening external URL:', error);
    }
  });

  // Always open settings window on startup
  try {
    await openSettingsWindow(p);
  } catch (error) {
    log.error('core', 'Error opening startup settings window:', error);
  }

  // Feature enable/disable handler
  // Extensions are now managed by main process ExtensionManager via IPC
  api.subscribe(topicFeatureToggle, async msg => {
    log('core', 'feature toggle', msg)

    // Find feature by ID (UUID) or by name (extension ID like "groups")
    const f = features().find(f =>
      f.id == msg.featureId ||
      f.name.toLowerCase() === msg.featureId?.toLowerCase()
    );
    if (f) {
      log('core', 'feature toggle', f);

      // Check if this feature is backed by an extension
      const extId = f.name.toLowerCase();
      const isExtension = builtinExtensions.includes(extId);

      if (msg.enabled == false) {
        log('core', 'disabling', f.name);
        if (isExtension) {
          // Use main process IPC to unload extension
          await api.extensions.unload(extId);
        } else {
          uninitFeature(f);
        }
      }
      else if (msg.enabled == true) {
        log('core', 'enabling', f.name);
        if (isExtension) {
          // Use main process IPC to load extension
          await api.extensions.load(extId);
        } else {
          initFeature(f);
        }
      }
    }
    else {
      log('core', 'feature toggle - no feature found for', msg.featureId);
    }
  });

  initSettingsShortcut(p);

  // Initialize core features (non-extension features only)
  features().forEach(initFeature);

  // Extensions are now loaded by main process ExtensionManager
  // It receives the 'core:ready' signal and calls loadEnabledExtensions()
  log('core', 'Core features initialized. Extensions loaded by main process.');

  // Register extension dev commands - wait for cmd:ready
  api.subscribe('cmd:ready', () => {
    registerExtensionCommands();
  }, api.scopes.GLOBAL);

  // Query in case cmd is already ready
  api.publish('cmd:query', {}, api.scopes.GLOBAL);
};

window.addEventListener('load', () => {
  init().catch(error => {
    log.error('core', 'Error during application initialization:', error);
  });
});
