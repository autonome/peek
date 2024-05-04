// groups/background.js

import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { log as l, openStore } from "../utils.js";

const log = function(...args) { l(labels.name, args); };

log('background', labels.name);

const debug = window.app.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);
const api = window.app;

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

  api.openWindow(params);
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
  log('init');

  const prefs = () => store.get(storageKeys.PREFS);

  initShortcut(prefs().shortcutKey);

  /*
  const items = () => store.get(storageKeys.ITEMS);

  if (items().length > 0) {
    initItems(prefs(), items());
  }
  */
};

window.addEventListener('load', init);
