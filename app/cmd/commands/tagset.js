/**
 * Tagset command - create a tagset item with specified tags
 *
 * Usage:
 *   tagset cooking,recipes,favorites   → creates tagset with those tags
 */
import api from '../../api.js';

const commands = [
  {
    name: 'tagset',
    description: 'Create a tag set item with specified tags',
    async execute(ctx) {
      const input = (ctx.search || '').trim();
      if (!input) {
        console.log('Usage: tagset <tag1,tag2,...>');
        return { success: false, error: 'No tags provided' };
      }

      // Parse comma or space separated tag names
      const hasComma = input.includes(',');
      const tagNames = hasComma
        ? input.split(',').map(s => s.trim()).filter(s => s.length > 0)
        : input.split(/\s+/).filter(s => s.length > 0);

      if (tagNames.length === 0) {
        console.log('No valid tag names provided');
        return { success: false, error: 'No valid tag names' };
      }

      // Create the tagset item
      const result = await api.datastore.addItem('tagset', {
        content: tagNames.join(', ')
      });

      if (!result.success) {
        console.error('Failed to create tagset:', result.error);
        return { success: false, error: result.error };
      }

      const itemId = result.data.id;

      // Create and link each tag
      const linked = [];
      for (const name of tagNames) {
        const tagResult = await api.datastore.getOrCreateTag(name);
        if (tagResult.success) {
          const linkResult = await api.datastore.tagItem(itemId, tagResult.data.tag.id);
          if (linkResult.success) {
            linked.push(name);
          }
        }
      }

      console.log('Created tagset with tags:', linked.join(', '));

      // Notify editor
      api.publish('editor:changed', { action: 'add', itemId }, api.scopes.GLOBAL);

      return { success: true, itemId, tags: linked };
    }
  }
];

export default { commands };
