/**
 * Tagset command - creates tagset items in the datastore
 * Tagsets are items of type='tagset' that exist solely to hold a combination of tags
 * Useful for creating quick reference collections or categorization markers
 */
import api from 'peek://app/api.js';

/**
 * Create a new tagset with the specified tags
 * @param {string} tagsString - Comma-separated list of tag names
 * @returns {Promise<string>} The ID of the created tagset
 */
const createTagset = async (tagsString) => {
  // Parse tags from comma-separated string
  const tagNames = tagsString
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  if (tagNames.length === 0) {
    throw new Error('No valid tags provided');
  }

  // Create the tagset item
  const result = await api.datastore.addItem('tagset', {
    content: null // Tagsets don't have content, they're defined by their tags
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to create tagset');
  }

  const itemId = result.data.id;

  // Add each tag to the tagset
  for (const tagName of tagNames) {
    const tagResult = await api.datastore.getOrCreateTag(tagName);
    if (tagResult.success) {
      await api.datastore.tagItem(itemId, tagResult.data.tag.id);
    }
  }

  // Also add the 'from:cmd' tag to track origin
  const fromCmdResult = await api.datastore.getOrCreateTag('from:cmd');
  if (fromCmdResult.success) {
    await api.datastore.tagItem(itemId, fromCmdResult.data.tag.id);
  }

  return { id: itemId, tags: tagNames };
};

// Commands
const commands = [
  {
    name: 'tagset',
    description: 'Create a tagset with specified tags',
    async execute(ctx) {
      if (ctx.search) {
        try {
          const { id, tags } = await createTagset(ctx.search);
          console.log(`Tagset created with ID: ${id}`);
          console.log(`Tags: ${tags.join(', ')}`);
          return { success: true, message: `Tagset created with tags: ${tags.join(', ')}` };
        } catch (error) {
          console.error('Failed to create tagset:', error);
          return { success: false, message: error.message };
        }
      } else {
        console.log('Usage: tagset <tag1,tag2,...>');
        console.log('Example: tagset work,important,urgent');
        return { success: false, message: 'Usage: tagset <tag1,tag2,...>' };
      }
    }
  }
];

export default {
  commands
};
