/**
 * Tag command - add tags to the URL of the active window
 * Tags are saved using the items table with item_tags join table
 *
 * Usage:
 *   tag foo          - add tag "foo" to active window's URL
 *   tag foo bar      - add multiple tags
 *   tag -r foo       - remove tag "foo" from active window
 *   tag              - show tags for active window
 */
import api from 'peek://app/api.js';

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
 * Find item record by URL content
 */
const findItemByUrl = async (url) => {
  const result = await api.datastore.queryItems({ type: 'url' });
  if (!result.success) return null;

  return result.data.find(item => item.content === url) || null;
};

/**
 * Add tags to an item using the join table
 */
const addTagsToItem = async (itemId, tagNames) => {
  const results = [];

  for (const tagName of tagNames) {
    // Get or create the tag
    api.log('[tag] Getting/creating tag:', tagName);
    const tagResult = await api.datastore.getOrCreateTag(tagName);
    api.log('[tag] getOrCreateTag result:', JSON.stringify(tagResult));
    if (!tagResult.success) {
      console.error('Failed to get/create tag:', tagName, tagResult.error);
      continue;
    }

    const tag = tagResult.data.tag;
    api.log('[tag] Tag id:', tag.id, 'name:', tag.name);

    // Link tag to item
    api.log('[tag] Linking tag', tag.id, 'to item', itemId);
    const linkResult = await api.datastore.tagItem(itemId, tag.id);
    api.log('[tag] tagItem result:', JSON.stringify(linkResult));
    if (!linkResult.success) {
      console.error('Failed to link tag:', tagName, linkResult.error);
      continue;
    }

    results.push({
      tag,
      alreadyExists: linkResult.alreadyExists
    });
  }

  return results;
};

/**
 * Remove tags from an item
 */
const removeTagsFromItem = async (itemId, tagNames) => {
  const results = [];

  // Get current tags for item
  const tagsResult = await api.datastore.getItemTags(itemId);
  if (!tagsResult.success) {
    return results;
  }

  for (const tagName of tagNames) {
    // Find the tag by name
    const tag = tagsResult.data.find(t => t.name.toLowerCase() === tagName.toLowerCase());
    if (!tag) {
      console.log('Tag not found on item:', tagName);
      continue;
    }

    // Unlink tag from item
    const unlinkResult = await api.datastore.untagItem(itemId, tag.id);
    results.push({
      tag,
      removed: unlinkResult.success
    });
  }

  return results;
};

/**
 * Get tags for an item
 */
const getTagsForItem = async (itemId) => {
  const result = await api.datastore.getItemTags(itemId);
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
      api.log('tag command execute, ctx:', ctx);
      const activeWindow = await getActiveWindow();
      api.log('tag command: activeWindow =', activeWindow);
      if (!activeWindow) {
        api.log('No active window found');
        return { success: false, error: 'No active window' };
      }

      const url = activeWindow.url;
      api.log('Tagging URL:', url);

      // Find item in datastore
      let item = await findItemByUrl(url);

      // If no item exists, create one
      if (!item) {
        api.log('[tag] Creating new item for URL:', url);
        const addResult = await api.datastore.addItem('url', {
          content: url,
          metadata: JSON.stringify({ title: activeWindow.title || '' })
        });
        api.log('[tag] addItem result:', JSON.stringify(addResult));
        if (!addResult.success) {
          console.error('Failed to create item:', addResult.error);
          return { success: false, error: 'Failed to create item' };
        }
        item = { id: addResult.data.id };
        api.log('[tag] Created item with id:', item.id);
      } else {
        api.log('[tag] Found existing item:', item.id, 'for URL:', url);
      }

      // No args - show current tags
      if (!ctx.search) {
        const tags = await getTagsForItem(item.id);
        if (tags.length === 0) {
          console.log('No tags for:', url);
        } else {
          console.log('Tags for', url + ':');
          tags.forEach(t => console.log('  -', t.name, `(frecency: ${t.frecencyScore?.toFixed(1) || 0})`));
        }
        return { success: true, tags };
      }

      // Parse args
      // If comma present, split on comma; otherwise split on spaces
      const input = ctx.search.trim();
      const hasComma = input.includes(',');
      let args;
      if (hasComma) {
        args = input.split(',').map(s => s.trim()).filter(s => s.length > 0);
      } else {
        args = input.split(/\s+/);
      }
      const removeMode = args[0] === '-r';
      const tagsToProcess = removeMode ? args.slice(1) : args;

      if (tagsToProcess.length === 0) {
        console.log('No tags specified');
        return { success: false, error: 'No tags specified' };
      }

      // Add or remove tags
      if (removeMode) {
        const results = await removeTagsFromItem(item.id, tagsToProcess);
        const removed = results.filter(r => r.removed).map(r => r.tag.name);
        if (removed.length > 0) {
          console.log('Removed tags:', removed.join(', '), 'from', url);
        }
        return { success: true, removed };
      } else {
        api.log('Adding tags to item:', item.id, 'tags:', tagsToProcess);
        const results = await addTagsToItem(item.id, tagsToProcess);
        api.log('addTagsToItem results:', results);
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

      const item = await findItemByUrl(activeWindow.url);
      if (!item) {
        console.log('No tags for:', activeWindow.url);
        return { success: true, tags: [] };
      }

      const tags = await getTagsForItem(item.id);

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
