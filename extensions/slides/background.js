/**
 * Slides Extension Background Script
 *
 * Edge-anchored slide-in panels triggered by keyboard shortcuts (Option+Arrow)
 *
 * Runs in isolated extension process (peek://ext/slides/background.html)
 * Uses api.settings for datastore-backed settings storage
 */

import { id, labels, schemas, storageKeys, defaults } from './config.js';

const api = window.app;
const debug = api.debug;

console.log('[ext:slides] background', labels.name);

// Map to track opened slides - key is slide key, value is window ID
const slideWindows = new Map();

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
    console.error('[ext:slides] Failed to save settings:', result.error);
  }
};

const executeItem = (item) => {
  const height = item.height || 600;
  const width = item.width || 800;

  const screen = {
    height: window.screen.height,
    width: window.screen.width
  };

  let x, y, center = null;

  switch(item.screenEdge) {
    case 'Up':
      x = (screen.width - width) / 2;
      y = 0;
      break;
    case 'Down':
      x = (screen.width - item.width) / 2;
      y = screen.height;
      break;
    case 'Left':
      x = 0;
      y = (screen.height - item.height) / 2;
      break;
    case 'Right':
      x = screen.width;
      y = (screen.height - item.height) / 2;
      break;
    default:
      center = true;
      console.log('[ext:slides] unknown screen edge');
  }

  console.log('[ext:slides] execute slide', item.screenEdge, x, y);

  const key = `${item.address}:${item.screenEdge}`;

  // Check if this slide is already open
  if (slideWindows.has(key)) {
    const windowId = slideWindows.get(key);
    console.log('[ext:slides] Slide already open, verifying window exists with ID:', windowId);

    api.window.exists({ id: windowId }).then(existsResult => {
      if (existsResult.exists) {
        api.window.show({ id: windowId }).then(result => {
          if (result.success) {
            console.log('[ext:slides] Successfully showed existing slide:', key);
          } else {
            console.error('[ext:slides] Failed to show existing slide:', result.error);
            slideWindows.delete(key);
            openNewSlide();
          }
        }).catch(err => {
          console.error('[ext:slides] Error showing window:', err);
          slideWindows.delete(key);
          openNewSlide();
        });
      } else {
        console.log('[ext:slides] Window no longer exists, creating new one');
        slideWindows.delete(key);
        openNewSlide();
      }
    }).catch(err => {
      console.error('[ext:slides] Error checking if window exists:', err);
      slideWindows.delete(key);
      openNewSlide();
    });
  } else {
    openNewSlide();
  }

  function openNewSlide() {
    const params = {
      address: item.address,
      height,
      width,
      key,

      // modal behavior
      modal: true,
      type: 'panel',

      feature: labels.name,
      keepLive: item.keepLive || false,
      persistState: item.persistState || false,

      x,
      y,

      // tracking
      trackingSource: 'slide',
      trackingSourceId: item.screenEdge ? `slide_${item.screenEdge}` : 'slide',
      title: item.title || ''
    };

    api.window.open(item.address, params).then(result => {
      if (result.success) {
        console.log('[ext:slides] Successfully opened slide with ID:', result.id);
        slideWindows.set(key, result.id);
      } else {
        console.error('[ext:slides] Failed to open slide:', result.error);
      }
    });
  }
};

const initItems = (prefs, items) => {
  const cmdPrefix = prefs.shortcutKeyPrefix;

  items.forEach(item => {
    if (item.enabled == true && item.address && item.address.length > 0) {
      const shortcut = `${cmdPrefix}${item.screenEdge}`;

      api.shortcuts.register(shortcut, () => {
        executeItem(item);
      }, { global: true });

      registeredShortcuts.push(shortcut);
    }
  });
};

/**
 * Unregister all shortcuts and clean up windows
 */
const uninit = () => {
  console.log('[ext:slides] uninit - unregistering', registeredShortcuts.length, 'shortcuts');

  registeredShortcuts.forEach(shortcut => {
    api.shortcuts.unregister(shortcut, { global: true });
  });
  registeredShortcuts = [];

  // Close or hide all slide windows
  for (const [key, windowId] of slideWindows.entries()) {
    console.log('[ext:slides] Closing slide window:', key);
    api.window.hide({ id: windowId }).catch(err => {
      console.error('[ext:slides] Error hiding slide window:', err);
      api.window.close({ id: windowId }).catch(err => {
        console.error('[ext:slides] Error closing slide window:', err);
      });
    });
  }
  slideWindows.clear();
};

/**
 * Reinitialize slides (called when settings change)
 */
const reinit = async () => {
  console.log('[ext:slides] reinit');
  uninit();

  currentSettings = await loadSettings();

  if (currentSettings.items && currentSettings.items.length > 0) {
    initItems(currentSettings.prefs, currentSettings.items);
  }
};

const init = async () => {
  console.log('[ext:slides] init');

  // Load settings from datastore
  currentSettings = await loadSettings();

  // Add global window closed handler
  api.subscribe('window:closed', (data) => {
    for (const [key, windowId] of slideWindows.entries()) {
      if (data.id === windowId) {
        console.log('[ext:slides] Slide window was closed externally:', key);
        slideWindows.delete(key);
      }
    }
  }, api.scopes.GLOBAL);

  // Initialize slides
  if (currentSettings.items && currentSettings.items.length > 0) {
    initItems(currentSettings.prefs, currentSettings.items);
  }

  // Listen for settings changes to hot-reload (GLOBAL scope for cross-process)
  api.subscribe('slides:settings-changed', () => {
    console.log('[ext:slides] settings changed, reinitializing');
    reinit();
  }, api.scopes.GLOBAL);

  // Listen for settings updates from Settings UI
  // Settings UI sends proposed changes, we validate and save
  api.subscribe('slides:settings-update', async (msg) => {
    console.log('[ext:slides] settings-update received:', msg);

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
      api.publish('slides:settings-changed', currentSettings, api.scopes.GLOBAL);
    } catch (err) {
      console.error('[ext:slides] settings-update error:', err);
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
