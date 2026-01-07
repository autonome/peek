import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore } from "../utils.js";
import windows from "../windows.js";
import api from '../api.js';

console.log('index', labels.name);

const debug = api.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);

const address = 'peek://app/cmd/panel.html';

// ===== Dynamic Command Registry =====
// Commands registered by extensions are stored here in the background process
// The panel queries this registry when it opens

const dynamicCommands = new Map();

/**
 * Initialize command registration listeners
 * Extensions publish cmd:register to add commands, cmd:unregister to remove
 */
const initCommandRegistry = () => {
  // Listen for command registrations from extensions
  api.subscribe('cmd:register', (msg) => {
    console.log('[cmd] cmd:register received:', msg.name);
    dynamicCommands.set(msg.name, {
      name: msg.name,
      description: msg.description || '',
      source: msg.source
    });
  }, api.scopes.GLOBAL);

  // Listen for command unregistrations
  api.subscribe('cmd:unregister', (msg) => {
    console.log('[cmd] cmd:unregister received:', msg.name);
    dynamicCommands.delete(msg.name);
  }, api.scopes.GLOBAL);

  // Respond to queries for registered commands from the panel
  api.subscribe('cmd:query-commands', (msg) => {
    console.log('[cmd] cmd:query-commands received');
    const commands = Array.from(dynamicCommands.values());
    api.publish('cmd:query-commands-response', { commands }, api.scopes.GLOBAL);
  }, api.scopes.GLOBAL);

  console.log('[cmd] Command registry initialized');
};

const openInputWindow = prefs => {
  const height = prefs.height || 50;
  const width = prefs.width || 600;

  const params = {
    debug,
    key: address,
    height,
    width,

    // Keep resident in the background
    keepLive: true,

    // Completely remove window frame and decorations
    frame: false,
    transparent: true,
    
    // Make sure the window stays on top
    alwaysOnTop: true,
    
    // Center the window
    center: true,
    
    // Set a reasonable minimum size
    minWidth: 400,
    minHeight: 50,
    
    // Make sure shadows are shown for visual appearance
    hasShadow: true,
    
    // Additional window behavior options
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false,

    openDevTools: debug,
    detachedDevTools: true,
  };

  windows.openModalWindow(address, params)
    .then(result => {
      console.log('Command window opened:', result);
    })
    .catch(error => {
      console.error('Failed to open command window:', error);
    });
};

const initShortcut = (prefs) => {
  api.shortcuts.register(prefs.shortcutKey, () => {
    openInputWindow(prefs);
  }, { global: true });
};

const init = () => {
  console.log('init');

  const prefs = () => store.get(storageKeys.PREFS);

  // Initialize command registry before shortcuts so extensions can register
  initCommandRegistry();

  initShortcut(prefs());
};

export default {
  defaults,
  id,
  init,
  labels,
  schemas,
  storageKeys
};
