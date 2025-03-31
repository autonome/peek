import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore, openWindow } from "../utils.js";
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
    address,
    key: address,
    height,
    width
  };

  openWindow(address, params);
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
