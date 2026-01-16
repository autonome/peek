/**
 * Cmd Extension Background Script
 *
 * Command palette for quick command access via keyboard shortcut.
 *
 * Implements the PROVIDER pattern for extension-to-extension APIs:
 * - Owns the command registry
 * - Subscribes to cmd:register, cmd:unregister for command management
 * - Subscribes to cmd:query for late-arriving consumers
 * - Publishes cmd:ready when fully initialized
 *
 * Runs in isolated extension process (peek://ext/cmd/background.html)
 */

import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { log } from 'peek://app/log.js';

const api = window.app;

log('ext:cmd', 'background', labels.name);

// ===== Command Registry (PROVIDER PATTERN) =====
// This extension owns the command registry. Other extensions register
// commands by publishing to cmd:register, and we store them here.
const commandRegistry = new Map();

// Track registered shortcut for cleanup
let registeredShortcut = null;

// Panel window address
const panelAddress = 'peek://ext/cmd/panel.html';

// In-memory settings cache
let currentSettings = {
  prefs: defaults.prefs
};

/**
 * Load settings from datastore
 */
const loadSettings = async () => {
  const result = await api.settings.get();
  if (result.success && result.data) {
    return {
      prefs: result.data.prefs || defaults.prefs
    };
  }
  return { prefs: defaults.prefs };
};

/**
 * Save settings to datastore
 */
const saveSettings = async (settings) => {
  const result = await api.settings.set(settings);
  if (!result.success) {
    log.error('ext:cmd', 'Failed to save settings:', result.error);
  }
};

// ===== Command Registry Cache =====
// Cache command metadata to avoid re-registration overhead when versions match

/**
 * Load command cache from datastore
 * @returns {Promise<{appVersion: string, extensionVersions: Object, commands: Array} | null>}
 */
const loadCommandCache = async () => {
  try {
    const result = await api.datastore.getRow('extension_settings', `cmd:command_cache`);
    if (result.success && result.data && result.data.value) {
      const cache = JSON.parse(result.data.value);
      log('ext:cmd', 'Loaded command cache:', cache.commands?.length, 'commands');
      return cache;
    }
  } catch (err) {
    log.error('ext:cmd', 'Failed to load command cache:', err);
  }
  return null;
};

/**
 * Save command cache to datastore
 * @param {string} appVersion - Current app version
 * @param {Object} extensionVersions - Map of extension ID to version
 */
const saveCommandCache = async (appVersion, extensionVersions) => {
  try {
    const commands = Array.from(commandRegistry.values()).map(cmd => ({
      name: cmd.name,
      description: cmd.description,
      source: cmd.source,
      accepts: cmd.accepts,
      produces: cmd.produces
    }));

    const cache = {
      appVersion,
      extensionVersions,
      commands,
      cachedAt: Date.now()
    };

    await api.datastore.setRow('extension_settings', 'cmd:command_cache', {
      extensionId: 'cmd',
      key: 'command_cache',
      value: JSON.stringify(cache),
      updatedAt: Date.now()
    });

    log('ext:cmd', 'Saved command cache:', commands.length, 'commands');
  } catch (err) {
    log.error('ext:cmd', 'Failed to save command cache:', err);
  }
};

/**
 * Get current app and extension versions
 * @returns {Promise<{appVersion: string, extensionVersions: Object}>}
 */
const getCurrentVersions = async () => {
  const appInfo = await api.app.getInfo();
  const appVersion = appInfo.success ? appInfo.data.version : '0.0.0';

  const extList = await api.extensions.list();
  const extensionVersions = {};

  if (extList.success && extList.data) {
    for (const ext of extList.data) {
      if (ext.manifest?.version) {
        extensionVersions[ext.id] = ext.manifest.version;
      }
    }
  }

  return { appVersion, extensionVersions };
};

/**
 * Check if cache is valid by comparing versions
 * @param {Object} cache - Cached data with versions
 * @param {string} appVersion - Current app version
 * @param {Object} extensionVersions - Current extension versions
 * @returns {boolean}
 */
const isCacheValid = (cache, appVersion, extensionVersions) => {
  if (!cache) return false;
  if (cache.appVersion !== appVersion) {
    log('ext:cmd', 'Cache invalid: app version mismatch', cache.appVersion, '!=', appVersion);
    return false;
  }

  // Check if all cached extension versions match
  const cachedExtIds = Object.keys(cache.extensionVersions || {});
  const currentExtIds = Object.keys(extensionVersions);

  // Different set of extensions
  if (cachedExtIds.length !== currentExtIds.length) {
    log('ext:cmd', 'Cache invalid: extension count mismatch');
    return false;
  }

  for (const extId of currentExtIds) {
    if (cache.extensionVersions[extId] !== extensionVersions[extId]) {
      log('ext:cmd', 'Cache invalid: extension version mismatch for', extId);
      return false;
    }
  }

  return true;
};

/**
 * Initialize the command registry subscriptions (PROVIDER PATTERN)
 *
 * This sets up the cmd extension as the owner of the command API.
 * Other extensions (consumers) communicate via pubsub:
 * - cmd:register - Consumer registers a command
 * - cmd:unregister - Consumer unregisters a command
 * - cmd:query - Consumer checks if cmd is ready (for late arrivals)
 * - cmd:query-commands - Panel queries for all registered commands
 */
const initCommandRegistry = () => {
  // Handle batch command registrations (from preload batching)
  api.subscribe('cmd:register-batch', (msg) => {
    if (!msg.commands || !Array.isArray(msg.commands)) return;

    log('ext:cmd', 'cmd:register-batch received:', msg.commands.length, 'commands');

    for (const cmd of msg.commands) {
      commandRegistry.set(cmd.name, {
        name: cmd.name,
        description: cmd.description || '',
        source: cmd.source,
        accepts: cmd.accepts || [],
        produces: cmd.produces || []
      });
    }
  }, api.scopes.GLOBAL);

  // Handle individual command registrations from extensions
  api.subscribe('cmd:register', (msg) => {
    log('ext:cmd', 'cmd:register received:', msg.name);
    commandRegistry.set(msg.name, {
      name: msg.name,
      description: msg.description || '',
      source: msg.source,
      // Connector metadata for chaining
      accepts: msg.accepts || [],   // MIME types this command accepts as input
      produces: msg.produces || []  // MIME types this command produces as output
    });
  }, api.scopes.GLOBAL);

  // Handle command unregistrations
  api.subscribe('cmd:unregister', (msg) => {
    log('ext:cmd', 'cmd:unregister received:', msg.name);
    commandRegistry.delete(msg.name);
  }, api.scopes.GLOBAL);

  // Handle queries from late-arriving consumers
  // Re-publish ready signal so they know we're available
  api.subscribe('cmd:query', () => {
    log('ext:cmd', 'cmd:query received, re-publishing ready');
    api.publish('cmd:ready', { id: 'cmd' }, api.scopes.GLOBAL);
  }, api.scopes.GLOBAL);

  // Handle command list queries from the panel
  api.subscribe('cmd:query-commands', () => {
    log('ext:cmd', 'cmd:query-commands received');
    const commands = Array.from(commandRegistry.values());
    api.publish('cmd:query-commands-response', { commands }, api.scopes.GLOBAL);
  }, api.scopes.GLOBAL);

  log('ext:cmd', 'Command registry initialized');
};

/**
 * Open the command panel window
 */
const openPanelWindow = (prefs) => {
  // Initial height just for the command bar (~50px visible)
  // Window will resize when results appear
  const initialHeight = 60;
  const maxHeight = prefs.height || 400;
  const width = prefs.width || 600;

  const params = {
    debug: log.debug,
    key: panelAddress,
    height: initialHeight,
    maxHeight,
    width,

    // Keep resident in the background
    keepLive: true,

    // Completely remove window frame and decorations
    frame: false,
    transparent: true,

    // Make sure the window stays on top
    alwaysOnTop: true,

    // Center the window (works correctly with small initial height)
    center: true,

    // Set a reasonable minimum size
    minWidth: 400,
    minHeight: 50,

    // Make sure shadows are shown for visual appearance
    hasShadow: true,

    // Additional window behavior options
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false,

    // Modal behavior
    modal: true,
    type: 'panel',

    openDevTools: log.debug,
    detachedDevTools: true,
  };

  api.window.open(panelAddress, params)
    .then(result => {
      log('ext:cmd', 'Command window opened:', result);
    })
    .catch(error => {
      log.error('ext:cmd', 'Failed to open command window:', error);
    });
};

/**
 * Register the global shortcut
 */
const initShortcut = (prefs) => {
  if (registeredShortcut) {
    api.shortcuts.unregister(registeredShortcut, { global: true });
  }

  registeredShortcut = prefs.shortcutKey;
  api.shortcuts.register(prefs.shortcutKey, () => {
    openPanelWindow(prefs);
  }, { global: true });

  log('ext:cmd', 'Registered shortcut:', prefs.shortcutKey);
};

/**
 * Unregister shortcut and clean up
 */
const uninit = () => {
  log('ext:cmd', 'uninit');

  if (registeredShortcut) {
    api.shortcuts.unregister(registeredShortcut, { global: true });
    registeredShortcut = null;
  }

  // Note: We don't clear the command registry here because other extensions
  // may still be running. The registry will be rebuilt on next init.
};

/**
 * Reinitialize (called when settings change)
 */
const reinit = async () => {
  log('ext:cmd', 'reinit');

  // Unregister old shortcut
  if (registeredShortcut) {
    api.shortcuts.unregister(registeredShortcut, { global: true });
    registeredShortcut = null;
  }

  // Load new settings and re-register
  currentSettings = await loadSettings();
  initShortcut(currentSettings.prefs);
};

/**
 * Initialize the extension
 */
const init = async () => {
  log('ext:cmd', 'init');

  // 1. Initialize command registry subscriptions FIRST
  // This ensures we're ready to receive registrations from other extensions
  initCommandRegistry();

  // 1b. Load cached commands if versions match
  // This pre-populates the registry so panel can open immediately
  const cache = await loadCommandCache();
  if (cache && cache.commands) {
    // Pre-populate from cache (will be updated by fresh registrations)
    for (const cmd of cache.commands) {
      commandRegistry.set(cmd.name, {
        name: cmd.name,
        description: cmd.description || '',
        source: cmd.source,
        accepts: cmd.accepts || [],
        produces: cmd.produces || []
      });
    }
    log('ext:cmd', 'Pre-populated registry from cache:', commandRegistry.size, 'commands');
  }

  // 2. Load settings from datastore
  currentSettings = await loadSettings();

  // 3. Register the global shortcut
  initShortcut(currentSettings.prefs);

  // 3b. Register built-in commands
  api.commands.register({
    name: 'devtools',
    description: 'Open devtools for last active content window',
    execute: async () => {
      const result = await api.window.devtools();
      if (result.success) {
        log('ext:cmd', 'Opened devtools for:', result.url);
      } else {
        log.error('ext:cmd', 'Failed to open devtools:', result.error);
      }
    }
  });

  // 4. Listen for settings changes to hot-reload
  api.subscribe('cmd:settings-changed', () => {
    log('ext:cmd', 'settings changed, reinitializing');
    reinit();
  }, api.scopes.GLOBAL);

  // 4b. Save command cache after all extensions have loaded
  api.subscribe('ext:all-loaded', async () => {
    log('ext:cmd', 'ext:all-loaded - saving command cache');
    // Small delay to ensure all commands are registered
    setTimeout(async () => {
      const { appVersion, extensionVersions } = await getCurrentVersions();
      await saveCommandCache(appVersion, extensionVersions);
    }, 100);
  }, api.scopes.GLOBAL);

  // Listen for settings updates from Settings UI
  api.subscribe('cmd:settings-update', async (msg) => {
    log('ext:cmd', 'settings-update received:', msg);

    try {
      if (msg.data) {
        currentSettings = {
          prefs: msg.data.prefs || currentSettings.prefs
        };
      } else if (msg.key === 'prefs' && msg.path) {
        const field = msg.path.split('.')[1];
        if (field) {
          currentSettings.prefs = { ...currentSettings.prefs, [field]: msg.value };
        }
      }

      await saveSettings(currentSettings);
      await reinit();

      api.publish('cmd:settings-changed', currentSettings, api.scopes.GLOBAL);
    } catch (err) {
      log.error('ext:cmd', 'settings-update error:', err);
    }
  }, api.scopes.GLOBAL);

  // 5. Handle save-file requests from panel
  // Background script handles this so it persists after panel closes
  // Uses a pending downloads map to handle the request/response pattern
  const pendingDownloads = new Map();

  api.subscribe('cmd:save-file', async (msg) => {
    log('ext:cmd', 'save-file request:', msg.filename);

    try {
      // Generate unique ID and store the data
      const downloadId = Math.random().toString(36).slice(2);
      pendingDownloads.set(downloadId, {
        content: msg.content,
        filename: msg.filename,
        mimeType: msg.mimeType
      });

      // Open download window with the ID
      const downloadPageUrl = `peek://ext/cmd/download.html?id=${downloadId}`;

      await api.window.open(downloadPageUrl, {
        width: 400,
        height: 200,
        show: true,
        alwaysOnTop: true
      });
    } catch (err) {
      log.error('ext:cmd', 'save-file error:', err);
    }
  }, api.scopes.GLOBAL);

  // Download window requests data when ready
  api.subscribe('cmd:download-ready', (msg) => {
    log('ext:cmd', 'download-ready:', msg.id);

    const data = pendingDownloads.get(msg.id);
    if (data) {
      // Send data to the requesting window
      api.publish(`cmd:download-data:${msg.id}`, data, api.scopes.GLOBAL);
      // Clean up
      pendingDownloads.delete(msg.id);
    } else {
      log.error('ext:cmd', 'No pending download for id:', msg.id);
    }
  }, api.scopes.GLOBAL);

  // 6. LAST: Publish ready signal (PROVIDER PATTERN)
  // This tells all waiting consumers that cmd is ready to receive registrations
  log('ext:cmd', 'Publishing cmd:ready');
  api.publish('cmd:ready', { id: 'cmd' }, api.scopes.GLOBAL);
};

export default {
  defaults,
  id,
  init,
  uninit,
  labels,
  schemas,
  storageKeys
};
