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

const api = window.app;
const debug = api.debug;

console.log('[ext:cmd] background', labels.name);

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
    console.error('[ext:cmd] Failed to save settings:', result.error);
  }
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
  // Handle command registrations from extensions
  api.subscribe('cmd:register', (msg) => {
    console.log('[ext:cmd] cmd:register received:', msg.name);
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
    console.log('[ext:cmd] cmd:unregister received:', msg.name);
    commandRegistry.delete(msg.name);
  }, api.scopes.GLOBAL);

  // Handle queries from late-arriving consumers
  // Re-publish ready signal so they know we're available
  api.subscribe('cmd:query', () => {
    console.log('[ext:cmd] cmd:query received, re-publishing ready');
    api.publish('cmd:ready', { id: 'cmd' }, api.scopes.GLOBAL);
  }, api.scopes.GLOBAL);

  // Handle command list queries from the panel
  api.subscribe('cmd:query-commands', () => {
    console.log('[ext:cmd] cmd:query-commands received');
    const commands = Array.from(commandRegistry.values());
    api.publish('cmd:query-commands-response', { commands }, api.scopes.GLOBAL);
  }, api.scopes.GLOBAL);

  console.log('[ext:cmd] Command registry initialized');
};

/**
 * Open the command panel window
 */
const openPanelWindow = (prefs) => {
  // Use larger default height to accommodate results list and preview
  const height = prefs.height || 400;
  const width = prefs.width || 600;

  const params = {
    debug,
    key: panelAddress,
    height,
    width,

    // Keep resident in the background
    keepLive: true,

    // Completely remove window frame and decorations
    frame: false,
    transparent: true,

    // Make sure the window stays on top
    alwaysOnTop: true,

    // Center the window
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

    openDevTools: debug,
    detachedDevTools: true,
  };

  api.window.open(panelAddress, params)
    .then(result => {
      console.log('[ext:cmd] Command window opened:', result);
    })
    .catch(error => {
      console.error('[ext:cmd] Failed to open command window:', error);
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

  console.log('[ext:cmd] Registered shortcut:', prefs.shortcutKey);
};

/**
 * Unregister shortcut and clean up
 */
const uninit = () => {
  console.log('[ext:cmd] uninit');

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
  console.log('[ext:cmd] reinit');

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
  console.log('[ext:cmd] init');

  // 1. Initialize command registry subscriptions FIRST
  // This ensures we're ready to receive registrations from other extensions
  initCommandRegistry();

  // 2. Load settings from datastore
  currentSettings = await loadSettings();

  // 3. Register the global shortcut
  initShortcut(currentSettings.prefs);

  // 4. Listen for settings changes to hot-reload
  api.subscribe('cmd:settings-changed', () => {
    console.log('[ext:cmd] settings changed, reinitializing');
    reinit();
  }, api.scopes.GLOBAL);

  // Listen for settings updates from Settings UI
  api.subscribe('cmd:settings-update', async (msg) => {
    console.log('[ext:cmd] settings-update received:', msg);

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
      console.error('[ext:cmd] settings-update error:', err);
    }
  }, api.scopes.GLOBAL);

  // 5. LAST: Publish ready signal (PROVIDER PATTERN)
  // This tells all waiting consumers that cmd is ready to receive registrations
  console.log('[ext:cmd] Publishing cmd:ready');
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
