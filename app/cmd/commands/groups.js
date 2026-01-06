/**
 * Groups command - manage groups (tags) and their addresses
 * Groups are implemented as tags in the datastore
 */
import windows from '../../windows.js';
import api from '../../api.js';

const GROUPS_ADDRESS = 'peek://app/groups/home.html';

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
  console.log('Saving to group:', groupName);

  // Get or create the tag
  const tagResult = await api.datastore.getOrCreateTag(groupName);
  if (!tagResult.success) {
    console.error('Failed to get/create tag:', tagResult.error);
    return { success: false, error: tagResult.error };
  }

  const tagId = tagResult.data.id;

  // Get all open windows (excluding internal peek:// URLs)
  const listResult = await api.window.list({ includeInternal: false });
  if (!listResult.success || listResult.windows.length === 0) {
    console.log('No windows to save');
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

  console.log(`Saved ${savedCount} addresses to group "${groupName}"`);
  return { success: true, count: savedCount, total: listResult.windows.length };
};

/**
 * Open all addresses in a group (tag)
 */
const openGroup = async (groupName) => {
  console.log('Opening group:', groupName);

  // Find the tag by name
  const tagsResult = await api.datastore.getTagsByFrecency();
  if (!tagsResult.success) {
    return { success: false, error: 'Failed to get tags' };
  }

  const tag = tagsResult.data.find(t => t.name.toLowerCase() === groupName.toLowerCase());
  if (!tag) {
    console.log('Group not found:', groupName);
    return { success: false, error: 'Group not found' };
  }

  // Get addresses with this tag
  const addressesResult = await api.datastore.getAddressesByTag(tag.id);
  if (!addressesResult.success || addressesResult.data.length === 0) {
    console.log('No addresses in group:', groupName);
    return { success: false, error: 'Group is empty' };
  }

  for (const addr of addressesResult.data) {
    await windows.createWindow(addr.uri, {
      trackingSource: 'cmd',
      trackingSourceId: `group:${groupName}`
    });
  }

  console.log(`Opened ${addressesResult.data.length} windows from group "${groupName}"`);
  return { success: true, count: addressesResult.data.length };
};

// Commands
const commands = [
  {
    name: 'groups',
    description: 'Open the groups manager',
    async execute(ctx) {
      console.log('Opening groups manager');
      await windows.createWindow(GROUPS_ADDRESS, {
        width: 800,
        height: 600,
        trackingSource: 'cmd',
        trackingSourceId: 'groups'
      });
    }
  },
  {
    name: 'save group',
    description: 'Save open windows to a group',
    async execute(ctx) {
      if (ctx.search) {
        const groupName = ctx.search.trim();
        const result = await saveToGroup(groupName);
        if (result.success) {
          console.log(`Saved ${result.count} of ${result.total} windows to "${groupName}"`);
        }
      } else {
        console.log('Usage: save group <name>');
      }
    }
  },
  {
    name: 'open group',
    description: 'Open all addresses in a group',
    async execute(ctx) {
      if (ctx.search) {
        const groupName = ctx.search.trim();
        await openGroup(groupName);
      } else {
        // Show available groups
        const groups = await getAllGroups();
        if (groups.length === 0) {
          console.log('No groups saved yet. Use "save group <name>" to create one.');
        } else {
          console.log('Available groups:');
          groups.forEach(g => console.log('  -', g.name));
        }
      }
    }
  }
];

export default {
  commands
};
