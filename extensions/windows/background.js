/**
 * Windows Extension Background Script
 *
 * Full-screen window switcher with transparent overlay
 *
 * Runs in isolated extension process (peek://ext/windows/background.html)
 */

import { id, labels, schemas, storageKeys, defaults } from './config.js';

const api = window.app;
const debug = api.debug;

console.log('[ext:windows] background', labels.name);

// Extension content is served from peek://windows/ (hybrid mode)
const address = 'peek://windows/windows.html';

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

// Track windows we've hidden so we can restore them
let hiddenWindowIds = [];

/**
 * Hide all other app windows before showing windows view
 */
const hideOtherWindows = async () => {
  const result = await api.window.list({ includeInternal: true });
  if (!result.success) return;

  hiddenWindowIds = [];
  for (const win of result.windows) {
    // Skip background pages and extension host
    if (win.url.includes('background.html')) continue;
    if (win.url.includes('extension-host.html')) continue;
    if (win.url.includes('windows.html')) continue;

    // Hide this window
    await api.window.hide(win.id);
    hiddenWindowIds.push(win.id);
  }
  debug && console.log('[ext:windows] Hidden windows:', hiddenWindowIds.length);
};

/**
 * Restore windows that were hidden
 */
const restoreHiddenWindows = async () => {
  for (const id of hiddenWindowIds) {
    await api.window.show(id);
  }
  debug && console.log('[ext:windows] Restored windows:', hiddenWindowIds.length);
  hiddenWindowIds = [];
};

/**
 * Open the Windows view (maximized, transparent)
 */
const openWindowsView = async () => {
  // Hide other windows first
  await hideOtherWindows();

  const params = {
    key: address,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    // Maximize to fill screen without OS fullscreen
    maximize: true,
    // Don't use modal - we want windows view to stay open until ESC or selection
    type: 'panel',
    trackingSource: 'windows',
    trackingSourceId: 'main'
  };

  api.window.open(address, params)
    .then(window => {
      debug && console.log('[ext:windows] Windows view opened:', window);
    })
    .catch(error => {
      console.error('[ext:windows] Failed to open windows view:', error);
    });
};

// ===== Command definitions =====

const commandDefinitions = [
  {
    name: 'windows',
    description: 'Show all windows in full-screen overlay',
    execute: async (ctx) => {
      console.log('[ext:windows] Opening windows view');
      openWindowsView();
    }
  }
];

// ===== Registration =====

let registeredShortcut = null;
let registeredCommands = [];

const initShortcut = (shortcut) => {
  api.shortcuts.register(shortcut, () => {
    openWindowsView();
  }, { global: true });
  registeredShortcut = shortcut;
};

const initCommands = async () => {
  commandDefinitions.forEach(cmd => {
    api.commands.register(cmd);
    registeredCommands.push(cmd.name);
  });
  console.log('[ext:windows] Registered commands:', registeredCommands);
};

const uninitCommands = () => {
  registeredCommands.forEach(name => {
    api.commands.unregister(name);
  });
  registeredCommands = [];
  console.log('[ext:windows] Unregistered commands');
};

const init = async () => {
  console.log('[ext:windows] init');

  // Load settings from datastore
  currentSettings = await loadSettings();

  initShortcut(currentSettings.prefs.shortcutKey);

  // Wait for cmd:ready before registering commands
  api.subscribe('cmd:ready', () => {
    initCommands();
  }, api.scopes.GLOBAL);

  // Query in case cmd is already ready
  api.publish('cmd:query', {}, api.scopes.GLOBAL);

  // Listen for windows view closing to restore hidden windows
  api.subscribe('windows:closing', () => {
    console.log('[ext:windows] Received closing signal, restoring windows');
    restoreHiddenWindows();
  }, api.scopes.GLOBAL);
};

const uninit = () => {
  console.log('[ext:windows] uninit');
  if (registeredShortcut) {
    api.shortcuts.unregister(registeredShortcut, { global: true });
    registeredShortcut = null;
  }
  uninitCommands();
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
