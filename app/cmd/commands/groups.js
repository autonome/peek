/**
 * Groups command - save and open window groups using machine tags
 * Groups are stored as machine tags on addresses: "group:groupname"
 */
import windows from '../../windows.js';
import api from '../../api.js';

const GROUP_TAG_PREFIX = 'group:';

/**
 * Helper to add a tag to an address's tags string
 */
const addTagToAddress = async (addressId, tag, currentTags) => {
  const tagsArray = currentTags ? currentTags.split(',').map(t => t.trim()).filter(t => t) : [];
  if (!tagsArray.includes(tag)) {
    tagsArray.push(tag);
  }
  const newTags = tagsArray.join(',');
  return api.datastore.updateAddress(addressId, { tags: newTags });
};

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
 * Get all group names from existing tags
 */
const getGroupNames = async () => {
  const result = await api.datastore.queryAddresses({});
  if (!result.success) return [];

  const groupNames = new Set();
  result.data.forEach(addr => {
    if (addr.tags) {
      addr.tags.split(',').forEach(tag => {
        const trimmed = tag.trim();
        if (trimmed.startsWith(GROUP_TAG_PREFIX)) {
          groupNames.add(trimmed.substring(GROUP_TAG_PREFIX.length));
        }
      });
    }
  });

  return Array.from(groupNames);
};

/**
 * Get addresses in a group
 */
const getGroupAddresses = async (groupName) => {
  const tag = GROUP_TAG_PREFIX + groupName;
  const result = await api.datastore.queryAddresses({ tag });
  if (!result.success) return [];
  return result.data;
};

/**
 * Save current windows as a group
 */
const saveGroup = async (groupName) => {
  console.log('Saving group:', groupName);

  // Get all open windows (excluding internal peek:// URLs)
  const listResult = await api.window.list();
  if (!listResult.success || listResult.windows.length === 0) {
    console.log('No windows to save');
    return { success: false, error: 'No windows to save' };
  }

  const tag = GROUP_TAG_PREFIX + groupName;
  let savedCount = 0;

  for (const win of listResult.windows) {
    const addr = await getOrCreateAddress(win.url);
    if (addr) {
      await addTagToAddress(addr.id, tag, addr.tags || '');
      savedCount++;
    }
  }

  console.log(`Saved ${savedCount} addresses to group "${groupName}"`);
  return { success: true, count: savedCount };
};

/**
 * Open all addresses in a group
 */
const openGroup = async (groupName) => {
  console.log('Opening group:', groupName);

  const addresses = await getGroupAddresses(groupName);
  if (addresses.length === 0) {
    console.log('No addresses in group:', groupName);
    return { success: false, error: 'Group is empty or not found' };
  }

  for (const addr of addresses) {
    await windows.createWindow(addr.uri, {
      trackingSource: 'cmd',
      trackingSourceId: `group:${groupName}`
    });
  }

  console.log(`Opened ${addresses.length} windows from group "${groupName}"`);
  return { success: true, count: addresses.length };
};

// Base commands
const commands = [
  {
    name: 'save group',
    async execute(ctx) {
      if (ctx.search) {
        const groupName = ctx.search.trim().replace(/\s+/g, '-').toLowerCase();
        await saveGroup(groupName);
      } else {
        console.log('Usage: save group <name>');
      }
    }
  }
];

/**
 * Initialize dynamic group commands
 * Adds "open group <name>" commands for each saved group
 */
export const initializeSources = async (addCommand) => {
  const groupNames = await getGroupNames();
  console.log('Found groups:', groupNames);

  groupNames.forEach(groupName => {
    addCommand({
      name: `open group ${groupName}`,
      async execute(ctx) {
        await openGroup(groupName);
      }
    });
  });
};

export default {
  commands,
  initializeSources
};
