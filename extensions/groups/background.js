/**
 * Groups Extension Background Script
 *
 * Tag-based grouping of addresses
 *
 * Runs in isolated extension process (peek://ext/groups/background.html)
 * Uses api.settings for datastore-backed settings storage
 */

import { id, labels, schemas, storageKeys, defaults } from './config.js';

const api = window.app;
const debug = api.debug;

console.log('[ext:groups] background', labels.name);

// Extension content is served from peek://ext/groups/
const address = 'peek://ext/groups/home.html';

// In-memory settings cache (loaded from datastore on init)
let currentSettings = {
  prefs: defaults.prefs
};

/**
 * Load settings from datastore
 * @returns {Promise<{prefs: object}>}
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
 * @param {object} settings - Settings object with prefs
 */
const saveSettings = async (settings) => {
  const result = await api.settings.set(settings);
  if (!result.success) {
    console.error('[ext:groups] Failed to save settings:', result.error);
  }
};

const openGroupsWindow = () => {
  const height = 600;
  const width = 800;

  const params = {
    key: address,
    height,
    width,
    escapeMode: 'navigate',
    trackingSource: 'cmd',
    trackingSourceId: 'groups'
  };

  api.window.open(address, params)
    .then(window => {
      debug && console.log('[ext:groups] Groups window opened:', window);
    })
    .catch(error => {
      console.error('[ext:groups] Failed to open groups window:', error);
    });
};

// ===== Command helpers =====

/**
 * Helper to get or create an address for a URI
 */
const getOrCreateAddress = async (uri) => {
  const result = await api.datastore.queryAddresses({});
  if (!result.success) return null;

  const existing = result.data.find(addr => addr.uri === uri);
  if (existing) return existing;

  const addResult = await api.datastore.addAddress(uri, {});
  if (!addResult.success) return null;

  return { id: addResult.id, uri, tags: '' };
};

/**
 * Get all tags (groups) sorted by frecency
 */
const getAllGroups = async () => {
  const result = await api.datastore.getTagsByFrecency();
  if (!result.success) return [];
  return result.data;
};

/**
 * Save current windows to a group (tag)
 */
const saveToGroup = async (groupName) => {
  console.log('[ext:groups] Saving to group:', groupName);

  const tagResult = await api.datastore.getOrCreateTag(groupName);
  if (!tagResult.success) {
    console.error('[ext:groups] Failed to get/create tag:', tagResult.error);
    return { success: false, error: tagResult.error };
  }

  const tagId = tagResult.data.id;

  const listResult = await api.window.list({ includeInternal: false });
  if (!listResult.success || listResult.windows.length === 0) {
    console.log('[ext:groups] No windows to save');
    return { success: false, error: 'No windows to save' };
  }

  let savedCount = 0;

  for (const win of listResult.windows) {
    const addr = await getOrCreateAddress(win.url);
    if (addr) {
      const linkResult = await api.datastore.tagAddress(addr.id, tagId);
      if (linkResult.success && !linkResult.alreadyExists) {
        savedCount++;
      }
    }
  }

  console.log(`[ext:groups] Saved ${savedCount} addresses to group "${groupName}"`);
  return { success: true, count: savedCount, total: listResult.windows.length };
};

/**
 * Open all addresses in a group (tag)
 */
const openGroup = async (groupName) => {
  console.log('[ext:groups] Opening group:', groupName);

  const tagsResult = await api.datastore.getTagsByFrecency();
  if (!tagsResult.success) {
    return { success: false, error: 'Failed to get tags' };
  }

  const tag = tagsResult.data.find(t => t.name.toLowerCase() === groupName.toLowerCase());
  if (!tag) {
    console.log('[ext:groups] Group not found:', groupName);
    return { success: false, error: 'Group not found' };
  }

  const addressesResult = await api.datastore.getAddressesByTag(tag.id);
  if (!addressesResult.success || addressesResult.data.length === 0) {
    console.log('[ext:groups] No addresses in group:', groupName);
    return { success: false, error: 'Group is empty' };
  }

  for (const addr of addressesResult.data) {
    await api.window.open(addr.uri, {
      trackingSource: 'cmd',
      trackingSourceId: `group:${groupName}`
    });
  }

  console.log(`[ext:groups] Opened ${addressesResult.data.length} windows from group "${groupName}"`);
  return { success: true, count: addressesResult.data.length };
};

// ===== Command definitions =====

const commandDefinitions = [
  {
    name: 'groups',
    description: 'Open the groups manager',
    execute: async (ctx) => {
      console.log('[ext:groups] Opening groups manager');
      openGroupsWindow();
    }
  },
  {
    name: 'save group',
    description: 'Save open windows to a group',
    execute: async (ctx) => {
      if (ctx.search) {
        const groupName = ctx.search.trim();
        const result = await saveToGroup(groupName);
        if (result.success) {
          console.log(`[ext:groups] Saved ${result.count} of ${result.total} windows to "${groupName}"`);
        }
      } else {
        console.log('[ext:groups] Usage: save group <name>');
      }
    }
  },
  {
    name: 'open group',
    description: 'Open all addresses in a group',
    execute: async (ctx) => {
      if (ctx.search) {
        const groupName = ctx.search.trim();
        await openGroup(groupName);
      } else {
        const groups = await getAllGroups();
        if (groups.length === 0) {
          console.log('[ext:groups] No groups saved yet. Use "save group <name>" to create one.');
        } else {
          console.log('[ext:groups] Available groups:');
          groups.forEach(g => console.log('  -', g.name));
        }
      }
    }
  }
];

// ===== Registration =====

let registeredShortcut = null;
let registeredCommands = [];

const initShortcut = (shortcut) => {
  api.shortcuts.register(shortcut, () => {
    openGroupsWindow();
  }, { global: true });
  registeredShortcut = shortcut;
};

const initCommands = () => {
  commandDefinitions.forEach(cmd => {
    api.commands.register(cmd);
    registeredCommands.push(cmd.name);
  });
  console.log('[ext:groups] Registered commands:', registeredCommands);
};

const uninitCommands = () => {
  registeredCommands.forEach(name => {
    api.commands.unregister(name);
  });
  registeredCommands = [];
  console.log('[ext:groups] Unregistered commands');
};

const init = async () => {
  console.log('[ext:groups] init');

  // Load settings from datastore
  currentSettings = await loadSettings();

  initShortcut(currentSettings.prefs.shortcutKey);

  // Wait for cmd:ready before registering commands
  api.subscribe('cmd:ready', () => {
    initCommands();
  }, api.scopes.GLOBAL);

  // Query in case cmd is already ready (it usually is since cmd loads first)
  api.publish('cmd:query', {}, api.scopes.GLOBAL);

  // Listen for settings changes to hot-reload (GLOBAL scope for cross-process)
  api.subscribe('groups:settings-changed', async () => {
    console.log('[ext:groups] settings changed, reinitializing');
    uninit();
    currentSettings = await loadSettings();
    initShortcut(currentSettings.prefs.shortcutKey);
    initCommands();
  }, api.scopes.GLOBAL);

  // Listen for settings updates from Settings UI
  // Settings UI sends proposed changes, we validate and save
  api.subscribe('groups:settings-update', async (msg) => {
    console.log('[ext:groups] settings-update received:', msg);

    try {
      // Apply the update based on what was sent
      if (msg.data) {
        // Full data object sent
        currentSettings = {
          prefs: msg.data.prefs || currentSettings.prefs
        };
      } else if (msg.key === 'prefs' && msg.path) {
        // Single pref field update
        const field = msg.path.split('.')[1];
        if (field) {
          currentSettings.prefs = { ...currentSettings.prefs, [field]: msg.value };
        }
      }

      // Save to datastore
      await saveSettings(currentSettings);

      // Reinitialize with new settings
      uninit();
      initShortcut(currentSettings.prefs.shortcutKey);
      initCommands();

      // Confirm change back to Settings UI
      api.publish('groups:settings-changed', currentSettings, api.scopes.GLOBAL);
    } catch (err) {
      console.error('[ext:groups] settings-update error:', err);
    }
  }, api.scopes.GLOBAL);
};

const uninit = () => {
  console.log('[ext:groups] uninit');
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
