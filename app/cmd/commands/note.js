/**
 * Note command - saves items to the datastore with smart type detection
 *
 * If input is a URL → saves as url item
 * If input is text → saves as text item tagged with 'note' and 'from:cmd'
 */
import api from '../../api.js';

const NOTE_TAG_NAMES = ['note', 'from:cmd'];

/**
 * Detect item type from input
 */
const detectType = (text) => {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return 'url';
  return 'text';
};

/**
 * Save input to the datastore, auto-detecting type
 */
const saveItem = async (input) => {
  const type = detectType(input);
  if (!type) throw new Error('No input provided');

  const opts = { content: input };
  if (type === 'url') opts.url = input;

  const result = await api.datastore.addItem(type, opts);
  if (!result.success) {
    throw new Error(result.error || 'Failed to save item');
  }

  const itemId = result.data.id;

  // Tag text notes with 'note' and 'from:cmd'
  if (type === 'text') {
    for (const name of NOTE_TAG_NAMES) {
      const tagResult = await api.datastore.getOrCreateTag(name);
      if (tagResult.success) {
        await api.datastore.tagItem(itemId, tagResult.data.tag.id);
      }
    }
  }

  return { itemId, type };
};

/**
 * Get all notes from the datastore
 */
const getNotes = async (limit = 20) => {
  // Query text items and filter to those tagged 'note'
  const result = await api.datastore.queryItems({ type: 'text' });
  if (!result.success) {
    return [];
  }

  // Filter to items that have the 'note' tag
  const notes = [];
  for (const item of result.data) {
    const tagsResult = await api.datastore.getItemTags(item.id);
    if (tagsResult.success) {
      const hasNoteTag = tagsResult.data.some(t => t.name === 'note');
      if (hasNoteTag) {
        notes.push(item);
        if (notes.length >= limit) break;
      }
    }
  }

  return notes;
};

// Commands
const commands = [
  {
    name: 'note',
    description: 'Save a note or URL (auto-detects type)',
    async execute(ctx) {
      if (ctx.search) {
        try {
          const { itemId, type } = await saveItem(ctx.search);
          console.log(`Saved ${type} item:`, itemId);
          api.publish('editor:changed', { action: 'add', itemId }, api.scopes.GLOBAL);
        } catch (error) {
          console.error('Failed to save:', error);
        }
      } else {
        console.log('Usage: note <text or url>');
      }
    }
  },
  {
    name: 'notes',
    async execute(ctx) {
      const notes = await getNotes(10);
      if (notes.length === 0) {
        console.log('No notes found');
      } else {
        console.log('Recent notes:');
        notes.forEach((note, i) => {
          const preview = note.content.substring(0, 50) + (note.content.length > 50 ? '...' : '');
          console.log(`${i + 1}. ${preview}`);
        });
      }
    }
  }
];

export default {
  commands
};
