import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore } from "../utils.js";
import windows from "../windows.js";
import api from '../api.js';

console.log('index', labels.name);

const debug = api.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);

const address = 'peek://app/cmd/panel.html';

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
  });
};

const init = () => {
  console.log('init');

  const prefs = () => store.get(storageKeys.PREFS);

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
