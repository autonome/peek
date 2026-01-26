/**
 * URL command - save a URL item to the datastore
 *
 * Usage:
 *   url https://example.com   → saves URL item
 */
import api from '../../api.js';

const commands = [
  {
    name: 'url',
    description: 'Save a URL',
    async execute(ctx) {
      const input = (ctx.search || '').trim();
      if (!input) {
        console.log('Usage: url <url>');
        return { success: false, error: 'No URL provided' };
      }

      const result = await api.datastore.addItem('url', {
        content: input,
        url: input
      });

      if (!result.success) {
        console.error('Failed to save URL:', result.error);
        return { success: false, error: result.error };
      }

      console.log('Saved URL:', result.data.id);
      api.publish('editor:changed', { action: 'add', itemId: result.data.id }, api.scopes.GLOBAL);
      return { success: true, itemId: result.data.id };
    }
  }
];

export default { commands };
