import { openStore } from "./utils.js";
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
 * @param {boolean} [params.openDevTools=false] - Whether to open DevTools for this window
 * @param {boolean} [params.detachedDevTools=true] - Whether DevTools should be detached
 * @returns {Promise<Object>} - Promise resolving to the window API result
 */
const openModalWindow = (address, params = {}) => {
  // Set modal flag to true
  params.modal = true;
  
  console.log('Opening modal window with params:', params);
  
  // Always use the IPC API
  if (api.window && api.window.open) {
    return api.window.open(address, params);
  } else {
    console.error('API window.open not available');
    throw new Error('API window.open not available. Cannot open window.');
  }
};

/**
 * Creates a window and handles its lifecycle
 * @param {string} address - URL to open in the window
 * @param {Object} params - Window parameters 
 * @param {boolean} [params.openDevTools=false] - Whether to open DevTools for this window
 * @param {boolean} [params.detachedDevTools=true] - Whether DevTools should be detached
 * @returns {Promise<Object>} - Promise resolving to an object with methods to interact with the window
 */
const createWindow = async (address, params = {}) => {
  console.log('Creating window with params:', params);
  
  let windowId;
  
  // Always use the IPC API
  if (api.window && api.window.open) {
    const result = await api.window.open(address, params);
    if (result.success) {
      windowId = result.id;
    } else {
      console.error('Failed to open window:', result.error);
      throw new Error(`Failed to open window: ${result.error}`);
    }
  } else {
    console.error('API window.open not available');
    throw new Error('API window.open not available. Cannot open window.');
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
