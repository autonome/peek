// Groups extension background script
// This runs in the core background context and registers the extension

import { id, labels, schemas, storageKeys, defaults } from './config.js';
// Use absolute peek:// URLs since relative paths stay within the ext host
import { openStore } from "peek://app/utils.js";
import windows from "peek://app/windows.js";

const api = window.app;
const debug = api.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);

// Extension content is served from peek://ext/groups/
const address = 'peek://ext/groups/home.html';

const openGroupsWindow = () => {
  const height = 600;
  const width = 800;

  const params = {
    key: address,
    height,
    width,
    escapeMode: 'navigate',  // Allow internal navigation before closing
    trackingSource: 'cmd',
    trackingSourceId: 'groups'
  };

  windows.createWindow(address, params)
    .then(window => {
      debug && console.log('Groups window opened:', window);
    })
    .catch(error => {
      console.error('Failed to open groups window:', error);
    });
};

// ===== Command helpers (moved from app/cmd/commands/groups.js) =====

/**
 * Helper to get or create an address for a URI
 */
const getOrCreateAddress = async (uri) => {
  const result = await api.datastore.queryAddresses({});
  if (!result.success) return null;

  const existing = result.data.find(addr => addr.uri === uri);
  if (existing) return existing;

  // Create new address
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

  // Get or create the tag
  const tagResult = await api.datastore.getOrCreateTag(groupName);
  if (!tagResult.success) {
    console.error('[ext:groups] Failed to get/create tag:', tagResult.error);
    return { success: false, error: tagResult.error };
  }

  const tagId = tagResult.data.id;

  // Get all open windows (excluding internal peek:// URLs)
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

  // Find the tag by name
  const tagsResult = await api.datastore.getTagsByFrecency();
  if (!tagsResult.success) {
    return { success: false, error: 'Failed to get tags' };
  }

  const tag = tagsResult.data.find(t => t.name.toLowerCase() === groupName.toLowerCase());
  if (!tag) {
    console.log('[ext:groups] Group not found:', groupName);
    return { success: false, error: 'Group not found' };
  }

  // Get addresses with this tag
  const addressesResult = await api.datastore.getAddressesByTag(tag.id);
  if (!addressesResult.success || addressesResult.data.length === 0) {
    console.log('[ext:groups] No addresses in group:', groupName);
    return { success: false, error: 'Group is empty' };
  }

  for (const addr of addressesResult.data) {
    await windows.createWindow(addr.uri, {
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
        // Show available groups
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

const initShortcut = shortcut => {
  api.shortcuts.register(shortcut, () => {
    openGroupsWindow();
  });
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

const init = () => {
  console.log('[ext:groups] init');

  const prefs = () => store.get(storageKeys.PREFS);
  initShortcut(prefs().shortcutKey);
  initCommands();
};

const uninit = () => {
  console.log('[ext:groups] uninit');
  if (registeredShortcut) {
    api.shortcuts.unregister(registeredShortcut);
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
