import { openStore, openWindow } from "./utils.js";
import api from './api.js';
import fc from './features.js';

const debug = api.debug;
const clear = false;

// maps app id to BrowserWindow id (background)
const windows = new Map();

/**
 * Opens a modal window with the provided address and parameters
 * @param {string} address - URL to open in the window
 * @param {Object} params - Window parameters
 * @returns {Promise<Object>} - Promise resolving to the window API result
 */
const openModalWindow = (address, params = {}) => {
  // Set modal flag to true
  params.modal = true;
  
  console.log('Opening modal window with params:', params);
  
  // Prefer using the IPC API directly
  if (api.window && api.window.open) {
    return api.window.open(address, params);
  } else {
    return openWindow(address, params);
  }
};

/**
 * Creates a window and handles its lifecycle
 * @param {string} address - URL to open in the window
 * @param {Object} params - Window parameters 
 * @returns {Promise<Object>} - Promise resolving to an object with methods to interact with the window
 */
const createWindow = async (address, params = {}) => {
  console.log('Creating window with params:', params);
  
  let windowId;
  
  // Prefer using the IPC API directly
  if (api.window && api.window.open) {
    const result = await api.window.open(address, params);
    if (result.success) {
      windowId = result.id;
    } else {
      console.error('Failed to open window:', result.error);
      throw new Error(`Failed to open window: ${result.error}`);
    }
  } else {
    // Fallback to regular window.open
    const win = openWindow(address, params);
    return {
      window: win,
      close: () => {
        if (win) win.close();
      },
      hide: () => {
        if (win) win.close();
      },
      show: () => {
        // Can't re-open with this method
      }
    };
  }
  
  // Return an API for the window
  return {
    id: windowId,
    close: () => api.window.close({ id: windowId }),
    hide: () => api.window.hide({ id: windowId }),
    show: () => api.window.show({ id: windowId }),
    focus: () => api.window.focus({ id: windowId }),
    blur: () => api.window.blur({ id: windowId }),
    move: (x, y) => api.window.move({ id: windowId, x, y })
  };
};

export default {
  openModalWindow,
  createWindow
};
