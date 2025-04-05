/**
 * Note command - saves a note
 * Currently disabled, needs browser extension API
 */

export default {
  name: 'note',
  
  /**
   * Executes the note command
   */
  execute: async (msg) => {
    if (typeof browser === 'undefined' || !browser.storage) {
      console.error('Note command disabled: browser storage API not available');
      return { success: false, error: 'Browser API not available' };
    }
    
    console.log('note executed', msg);
    
    try {
      if (msg.typed.indexOf(' ') !== -1) {
        const noteText = msg.typed.replace('note ', '');
        await saveNewNote(noteText);
        
        // Notify user
        if (typeof notify === 'function') {
          notify('Note saved!', noteText);
        } else {
          console.log('Note saved:', noteText);
        }
        
        return { success: true, command: 'note', text: noteText };
      } else {
        return { success: false, error: 'No note text provided' };
      }
    } catch (error) {
      console.error('Failed to save note:', error);
      return { success: false, error: error.message };
    }
  }
};

// Storage constants
const STG_KEY = 'cmd:notes';
const STG_TYPE = 'local';

/**
 * Saves a new note to browser storage
 * @param {string} note - The note text to save
 */
async function saveNewNote(note) {
  let store = await browser.storage[STG_TYPE].get(STG_KEY);
  console.log('store', store);
  
  if (Object.keys(store).indexOf(STG_KEY) === -1) {
    console.log('new store');
    store = {
      notes: []
    };
  } else {
    store = store[STG_KEY];
  }
  
  store.notes.push(note);
  
  await browser.storage[STG_TYPE].set({ [STG_KEY]: store });
  console.log('saved store', store);
}

/**
 * Notifies the user
 * @param {string} title - Notification title
 * @param {string} content - Notification content
 */
function notify(title, content) {
  if (browser && browser.notifications) {
    browser.notifications.create({
      "type": "basic",
      "iconUrl": browser.extension.getURL("images/icon.png"),
      "title": title,
      "message": content
    });
  } else {
    console.log('Notification:', title, content);
  }
}