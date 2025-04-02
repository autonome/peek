import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore } from "../utils.js";
import windows from "../windows.js";
import api from '../api.js';

console.log('index', labels.name);

const debug = api.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);

const address = 'peek://cmd/panel.html';

const openInputWindow = prefs => {
  const height = prefs.height || 50;
  const width = prefs.width || 600;

  const params = {
    debug,
    key: address,
    height,
    width,
    // Using modal parameter so it hides on escape/blur
    modal: true,
    
    // Remove titlebar and make window frameless
    frame: false,
    titleBarStyle: 'hidden',
    transparent: true,
    
    // Make sure the window stays on top
    alwaysOnTop: true,
    
    // Center the window
    center: true,
    
    // Set a reasonable minimum size
    minWidth: 400,
    minHeight: 30
  };

  // Use the modal window API to open the window
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
