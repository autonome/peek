/**
 * URL command - save a URL item to the datastore
 *
 * Usage:
 *   url https://example.com   → saves URL item
 */
import api from 'peek://app/api.js';

const commands = [
  {
    name: 'url',
    description: 'Save a URL',
    async execute(ctx) {
      if (!ctx.search) {
        api.publish('editor:add', { type: 'url' }, api.scopes.GLOBAL);
        return { success: true, message: 'Opening editor' };
      }

      const input = ctx.search.trim();

      const result = await api.datastore.addItem('url', {
        content: input,
        url: input
      });

      if (!result.success) {
        console.error('Failed to save URL:', result.error);
        return { success: false, message: result.error };
      }

      console.log('Saved URL:', result.data.id);
      api.publish('editor:changed', { action: 'add', itemId: result.data.id }, api.scopes.GLOBAL);
      return { success: true, message: 'URL saved' };
    }
  }
];

export default { commands };
