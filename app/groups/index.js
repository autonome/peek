import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore } from "../utils.js";
import windows from "../windows.js";
import api from '../api.js';

console.log('background', labels.name);

const debug = api.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);

const address = 'features/groups/home.html';

const openGroupsWindow = () => {
  const height = 600;
  const width = 800;

  const params = {
    key: address,
    height,
    width,
    // Not using modal so window stays open when clicking elsewhere
    modal: false
  };

  // Use the window creation API
  windows.createWindow(address, params)
    .then(window => {
      console.log('Groups window opened:', window);
    })
    .catch(error => {
      console.error('Failed to open groups window:', error);
    });
};

const initShortcut = shortcut => {
  api.shortcuts.register(shortcut, () => {
    openGroupsWindow();
  });
};

const initItems = (prefs, items) => {
  const cmdPrefix = prefs.shortcutKeyPrefix;

  items.forEach(item => {
    const shortcut = `${cmdPrefix}${item.keyNum}`;

    api.shortcuts.register(shortcut, () => {
      executeItem(item);
    });
  });
};

const init = () => {
  console.log('init');

  const prefs = () => store.get(storageKeys.PREFS);

  initShortcut(prefs().shortcutKey);

  /*
  const items = () => store.get(storageKeys.ITEMS);

  if (items().length > 0) {
    initItems(prefs(), items());
  }
  */
};

export default {
  defaults,
  id,
  init,
  labels,
  schemas,
  storageKeys
};
