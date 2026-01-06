/**
 * Tag command - add tags to the URL of the active window
 * Tags are saved using the proper join table (address_tags) with frecency tracking
 *
 * Usage:
 *   tag foo          - add tag "foo" to active window's URL
 *   tag foo bar      - add multiple tags
 *   tag -r foo       - remove tag "foo" from active window
 *   tag              - show tags for active window
 */
import api from '../../api.js';

/**
 * Get the most recently focused non-internal window
 */
const getActiveWindow = async () => {
  const result = await api.window.list({ includeInternal: false });
  if (!result.success || !result.windows.length) {
    return null;
  }
  // Return the first non-internal window
  return result.windows[0];
};

/**
 * Find address record by URI
 */
const findAddressByUri = async (uri) => {
  const result = await api.datastore.queryAddresses({});
  if (!result.success) return null;

  return result.data.find(addr => addr.uri === uri) || null;
};

/**
 * Add tags to an address using the join table
 */
const addTagsToAddress = async (addressId, tagNames) => {
  const results = [];

  for (const tagName of tagNames) {
    // Get or create the tag
    const tagResult = await api.datastore.getOrCreateTag(tagName);
    if (!tagResult.success) {
      console.error('Failed to get/create tag:', tagName, tagResult.error);
      continue;
    }

    // Link tag to address
    const linkResult = await api.datastore.tagAddress(addressId, tagResult.data.id);
    if (!linkResult.success) {
      console.error('Failed to link tag:', tagName, linkResult.error);
      continue;
    }

    results.push({
      tag: tagResult.data,
      alreadyExists: linkResult.alreadyExists
    });
  }

  return results;
};

/**
 * Remove tags from an address
 */
const removeTagsFromAddress = async (addressId, tagNames) => {
  const results = [];

  // Get current tags for address
  const tagsResult = await api.datastore.getAddressTags(addressId);
  if (!tagsResult.success) {
    return results;
  }

  for (const tagName of tagNames) {
    // Find the tag by name
    const tag = tagsResult.data.find(t => t.name.toLowerCase() === tagName.toLowerCase());
    if (!tag) {
      console.log('Tag not found on address:', tagName);
      continue;
    }

    // Unlink tag from address
    const unlinkResult = await api.datastore.untagAddress(addressId, tag.id);
    results.push({
      tag,
      removed: unlinkResult.removed
    });
  }

  return results;
};

/**
 * Get tags for an address
 */
const getTagsForAddress = async (addressId) => {
  const result = await api.datastore.getAddressTags(addressId);
  if (!result.success) return [];
  return result.data;
};

// Commands
const commands = [
  {
    name: 'tag',
    description: 'Add tags to the active window URL',
    async execute(ctx) {
      // Get active window
      const activeWindow = await getActiveWindow();
      if (!activeWindow) {
        console.log('No active window found');
        return { success: false, error: 'No active window' };
      }

      const url = activeWindow.url;
      console.log('Tagging URL:', url);

      // Find address in datastore
      let address = await findAddressByUri(url);

      // If no address exists, create one
      if (!address) {
        const addResult = await api.datastore.addAddress(url, {
          title: activeWindow.title || ''
        });
        if (!addResult.success) {
          console.error('Failed to create address:', addResult.error);
          return { success: false, error: 'Failed to create address' };
        }
        address = { id: addResult.id };
      }

      // No args - show current tags
      if (!ctx.search) {
        const tags = await getTagsForAddress(address.id);
        if (tags.length === 0) {
          console.log('No tags for:', url);
        } else {
          console.log('Tags for', url + ':');
          tags.forEach(t => console.log('  -', t.name, `(frecency: ${t.frecencyScore?.toFixed(1) || 0})`));
        }
        return { success: true, tags };
      }

      // Parse args
      const args = ctx.search.trim().split(/\s+/);
      const removeMode = args[0] === '-r';
      const tagsToProcess = removeMode ? args.slice(1) : args;

      if (tagsToProcess.length === 0) {
        console.log('No tags specified');
        return { success: false, error: 'No tags specified' };
      }

      // Add or remove tags
      if (removeMode) {
        const results = await removeTagsFromAddress(address.id, tagsToProcess);
        const removed = results.filter(r => r.removed).map(r => r.tag.name);
        if (removed.length > 0) {
          console.log('Removed tags:', removed.join(', '), 'from', url);
        }
        return { success: true, removed };
      } else {
        const results = await addTagsToAddress(address.id, tagsToProcess);
        const added = results.filter(r => !r.alreadyExists).map(r => r.tag.name);
        const existing = results.filter(r => r.alreadyExists).map(r => r.tag.name);
        if (added.length > 0) {
          console.log('Added tags:', added.join(', '), 'to', url);
        }
        if (existing.length > 0) {
          console.log('Already tagged:', existing.join(', '));
        }
        return { success: true, added, existing };
      }
    }
  },
  {
    name: 'tags',
    description: 'Show tags for the active window URL (or all tags by frecency)',
    async execute(ctx) {
      // If search term provided, show all tags matching
      if (ctx.search) {
        const result = await api.datastore.getTagsByFrecency();
        if (!result.success) {
          console.log('Failed to get tags');
          return { success: false };
        }

        const filter = ctx.search.toLowerCase();
        const filtered = result.data.filter(t => t.name.toLowerCase().includes(filter));

        if (filtered.length === 0) {
          console.log('No tags matching:', ctx.search);
        } else {
          console.log('Tags matching "' + ctx.search + '":');
          filtered.forEach(t => {
            console.log('  -', t.name, `(used ${t.frequency}x, frecency: ${t.frecencyScore?.toFixed(1) || 0})`);
          });
        }
        return { success: true, tags: filtered };
      }

      // No args - show tags for active window
      const activeWindow = await getActiveWindow();
      if (!activeWindow) {
        // No active window - show all tags by frecency
        const result = await api.datastore.getTagsByFrecency();
        if (!result.success) {
          console.log('Failed to get tags');
          return { success: false };
        }

        if (result.data.length === 0) {
          console.log('No tags yet');
        } else {
          console.log('All tags (by frecency):');
          result.data.slice(0, 20).forEach(t => {
            console.log('  -', t.name, `(used ${t.frequency}x, frecency: ${t.frecencyScore?.toFixed(1) || 0})`);
          });
        }
        return { success: true, tags: result.data };
      }

      const address = await findAddressByUri(activeWindow.url);
      if (!address) {
        console.log('No tags for:', activeWindow.url);
        return { success: true, tags: [] };
      }

      const tags = await getTagsForAddress(address.id);

      if (tags.length === 0) {
        console.log('No tags for:', activeWindow.url);
      } else {
        console.log('Tags for', activeWindow.url + ':');
        tags.forEach(t => console.log('  -', t.name));
      }

      return { success: true, tags };
    }
  },
  {
    name: 'untag',
    description: 'Remove tags from the active window URL',
    async execute(ctx) {
      if (!ctx.search) {
        console.log('Usage: untag <tag1> [tag2] ...');
        return { success: false, error: 'No tags specified' };
      }

      // Delegate to tag -r
      return commands[0].execute({ search: '-r ' + ctx.search });
    }
  }
];

export default {
  commands
};
