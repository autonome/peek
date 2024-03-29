// peeks/background.js

import { id, labels, schemas, ui, defaults } from './config.js';
import { log as l, openStore } from "../utils.js";

const log = function(...args) { l(id, args); };

log('background');

const debug = window.app.debug;

const store = openStore(id, defaults);
const api = window.app;

const storageKeys = {
  PREFS: 'prefs',
  ITEMS: 'items',
};

const executeItem = (item) => {
  const height = item.height || 600;
  const width = item.width || 800;

  const params = {
    // browserwindow
    address: item.address,
    height,
    width,

    // peek
    feature: labels.featureType,
    windowKey: `${labels.featureType}:${item.keyNum}`,
    keepLive: item.keepLive || false,
    persistData: item.persistData || false
  };

  api.openWindow(params);
};

const initItems = (prefs, items) => {
  const cmdPrefix = prefs.shortcutKeyPrefix;

  items.forEach(item => {
    if (item.enabled == true) {
      const shortcut = `${cmdPrefix}${item.keyNum}`;

      api.shortcuts.register(shortcut, () => {
        executeItem(item);
      });
    }
  });
};

const init = () => {
  log('init');

  const prefs = () => store.get(storageKeys.PREFS);
  const items = () => store.get(storageKeys.ITEMS);

  // initialize slides
  if (items().length > 0) {
    initItems(prefs(), items());
  }
};

window.addEventListener('load', init);
