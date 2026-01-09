/**
 * Peeks Extension Background Script
 *
 * Quick access modal windows for web pages via keyboard shortcuts (Option+0-9)
 *
 * Runs in isolated extension process (peek://ext/peeks/background.html)
 * Uses api.settings for datastore-backed settings storage
 */

import { id, labels, schemas, storageKeys, defaults } from './config.js';

const api = window.app;
const debug = api.debug;

console.log('[ext:peeks] background', labels.name);

// Track registered shortcuts for cleanup
let registeredShortcuts = [];

// In-memory settings cache (loaded from datastore on init)
let currentSettings = {
  prefs: defaults.prefs,
  items: defaults.items
};

/**
 * Load settings from datastore
 * @returns {Promise<{prefs: object, items: array}>}
 */
const loadSettings = async () => {
  const result = await api.settings.get();
  if (result.success && result.data) {
    return {
      prefs: result.data.prefs || defaults.prefs,
      items: result.data.items || defaults.items
    };
  }
  return { prefs: defaults.prefs, items: defaults.items };
};

/**
 * Save settings to datastore
 * @param {object} settings - Settings object with prefs and items
 */
const saveSettings = async (settings) => {
  const result = await api.settings.set(settings);
  if (!result.success) {
    console.error('[ext:peeks] Failed to save settings:', result.error);
  }
};

/**
 * Open a peek window for the given item
 */
const executeItem = (item) => {
  console.log('[ext:peeks] executeItem', item);
  const height = item.height || 600;
  const width = item.width || 800;

  const params = {
    // browserwindow
    height,
    width,

    // modal behavior
    modal: true,
    type: 'panel',

    // peek
    feature: labels.name,
    keepLive: item.keepLive || false,
    persistState: item.persistState || false,

    // Create a unique key for this peek using its address
    key: `peek:${item.address}`,

    // tracking
    trackingSource: 'peek',
    trackingSourceId: item.keyNum ? `peek_${item.keyNum}` : 'peek',
    title: item.title || ''
  };

  api.window.open(item.address, params)
    .then(result => {
      console.log('[ext:peeks] Peek window opened:', result);
    })
    .catch(error => {
      console.error('[ext:peeks] Failed to open peek window:', error);
    });
};

/**
 * Initialize shortcuts for enabled items
 */
const initItems = (prefs, items) => {
  const cmdPrefix = prefs.shortcutKeyPrefix;

  items.forEach(item => {
    if (item.enabled == true && item.address && item.address.length > 0) {
      const shortcut = `${cmdPrefix}${item.keyNum}`;

      api.shortcuts.register(shortcut, () => {
        executeItem(item);
      }, { global: true });

      registeredShortcuts.push(shortcut);
    }
  });
};

/**
 * Unregister all shortcuts and clean up
 */
const uninit = () => {
  console.log('[ext:peeks] uninit - unregistering', registeredShortcuts.length, 'shortcuts');

  registeredShortcuts.forEach(shortcut => {
    api.shortcuts.unregister(shortcut, { global: true });
  });

  registeredShortcuts = [];
};

/**
 * Reinitialize peeks (called when settings change)
 */
const reinit = async () => {
  console.log('[ext:peeks] reinit');
  uninit();

  currentSettings = await loadSettings();

  if (currentSettings.items && currentSettings.items.length > 0) {
    initItems(currentSettings.prefs, currentSettings.items);
  }
};

/**
 * Initialize the extension
 */
const init = async () => {
  console.log('[ext:peeks] init');

  // Load settings from datastore
  currentSettings = await loadSettings();

  // Initialize peeks if we have items
  if (currentSettings.items && currentSettings.items.length > 0) {
    initItems(currentSettings.prefs, currentSettings.items);
  }

  // Listen for settings changes to hot-reload (GLOBAL scope for cross-process)
  api.subscribe('peeks:settings-changed', () => {
    console.log('[ext:peeks] settings changed, reinitializing');
    reinit();
  }, api.scopes.GLOBAL);

  // Listen for settings updates from Settings UI
  // Settings UI sends proposed changes, we validate and save
  api.subscribe('peeks:settings-update', async (msg) => {
    console.log('[ext:peeks] settings-update received:', msg);

    try {
      // Apply the update based on what was sent
      if (msg.data) {
        // Full data object sent
        currentSettings = {
          prefs: msg.data.prefs || currentSettings.prefs,
          items: msg.data.items || currentSettings.items
        };
      } else if (msg.key === 'prefs' && msg.path) {
        // Single pref field update
        const field = msg.path.split('.')[1];
        if (field) {
          currentSettings.prefs = { ...currentSettings.prefs, [field]: msg.value };
        }
      } else if (msg.key === 'items' && msg.index !== undefined) {
        // Item field update
        const items = [...currentSettings.items];
        if (items[msg.index]) {
          items[msg.index] = { ...items[msg.index], [msg.field]: msg.value };
          currentSettings.items = items;
        }
      }

      // Save to datastore
      await saveSettings(currentSettings);

      // Reinitialize with new settings
      await reinit();

      // Confirm change back to Settings UI
      api.publish('peeks:settings-changed', currentSettings, api.scopes.GLOBAL);
    } catch (err) {
      console.error('[ext:peeks] settings-update error:', err);
    }
  }, api.scopes.GLOBAL);
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
