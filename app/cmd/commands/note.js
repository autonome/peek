/**
 * Note command - saves quick notes to the datastore
 * Notes are stored in the content table with mimeType='text/plain'
 * and tagged with 'note' and 'from:cmd'
 */
import api from '../../api.js';

const NOTE_TAGS = 'note,from:cmd';

/**
 * Save a new note to the datastore
 */
const saveNote = async (noteText) => {
  const result = await api.datastore.addContent({
    title: noteText.substring(0, 50) + (noteText.length > 50 ? '...' : ''),
    content: noteText,
    mimeType: 'text/plain',
    tags: NOTE_TAGS
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to save note');
  }

  return result.id;
};

/**
 * Get all notes from the datastore
 */
const getNotes = async (limit = 20) => {
  const result = await api.datastore.queryContent({
    tag: 'note',
    sortBy: 'created',
    limit
  });

  if (!result.success) {
    return [];
  }

  return result.data;
};

// Commands
const commands = [
  {
    name: 'note',
    async execute(ctx) {
      if (ctx.search) {
        try {
          const noteId = await saveNote(ctx.search);
          console.log('Note saved with ID:', noteId);
        } catch (error) {
          console.error('Failed to save note:', error);
        }
      } else {
        console.log('Usage: note <text>');
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
          console.log(`${i + 1}. ${note.title}`);
        });
      }
    }
  }
];

export default {
  commands
};
