// peeks/background.js

import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore, openWindow } from "../utils.js";

console.log('background', labels.name);

const debug = window.app.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);
const api = window.app;

const executeItem = (item) => {
  const height = item.height || 600;
  const width = item.width || 800;

  const params = {
    // browserwindow
    address: item.address,
    height,
    width,

    // peek
    feature: labels.name,
    keepLive: item.keepLive || false,
    persistState: item.persistState || false
  };

  window.open(item.address, params);
};

const initItems = (prefs, items) => {
  const cmdPrefix = prefs.shortcutKeyPrefix;
  console.log('inititems', items);

  items.forEach(item => {
    if (item.enabled == true && item.address.length > 0) {
      const shortcut = `${cmdPrefix}${item.keyNum}`;

      api.shortcuts.register(shortcut, () => {
        executeItem(item);
      });
    }
  });
};

const init = () => {
  console.log('init');

  const prefs = () => store.get(storageKeys.PREFS);
  const items = () => store.get(storageKeys.ITEMS);

  // initialize peeks
  if (items().length > 0) {
    initItems(prefs(), items());
  }
};

window.addEventListener('load', init);
