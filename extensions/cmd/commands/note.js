/**
 * Note command - saves quick notes to the datastore
 * Notes are stored in the items table with type='text'
 * and tagged with 'note' and 'from:cmd'
 */
import api from 'peek://app/api.js';

const NOTE_TAGS = ['note', 'from:cmd'];

/**
 * Save a new note to the datastore using the unified items API
 */
const saveNote = async (noteText) => {
  // Create the text item
  const result = await api.datastore.addItem('text', {
    content: noteText
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to save note');
  }

  const itemId = result.data.id;

  // Add tags to the item
  for (const tagName of NOTE_TAGS) {
    const tagResult = await api.datastore.getOrCreateTag(tagName);
    if (tagResult.success) {
      await api.datastore.tagItem(itemId, tagResult.data.tag.id);
    }
  }

  return itemId;
};

/**
 * Get all notes from the datastore
 */
const getNotes = async (limit = 20) => {
  // Query items of type 'text' that have the 'note' tag
  const result = await api.datastore.queryItems({
    type: 'text'
  });

  if (!result.success) {
    return [];
  }

  // Filter to only items with 'note' tag and limit
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
    description: 'Save a quick note',
    async execute(ctx) {
      if (ctx.search) {
        try {
          const noteId = await saveNote(ctx.search);
          console.log('Note saved with ID:', noteId);
          return { success: true, message: 'Note saved' };
        } catch (error) {
          console.error('Failed to save note:', error);
          return { success: false, message: error.message };
        }
      } else {
        console.log('Usage: note <text>');
        return { success: false, message: 'Usage: note <text>' };
      }
    }
  },
  {
    name: 'notes',
    description: 'List recent notes',
    async execute(ctx) {
      const notes = await getNotes(10);
      if (notes.length === 0) {
        console.log('No notes found');
        return { success: true, message: 'No notes found' };
      } else {
        console.log('Recent notes:');
        notes.forEach((note, i) => {
          const preview = (note.content || '').substring(0, 50) + (note.content?.length > 50 ? '...' : '');
          console.log(`${i + 1}. ${preview}`);
        });
        return { success: true, data: notes };
      }
    }
  }
];

export default {
  commands
};
