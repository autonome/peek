// groups/background.js

import { id, labels, schemas, ui, defaults } from './config.js';
import { log as l, openStore, getLocalId } from "../utils.js";

const log = function(...args) { l(id, args); };

const debug = window.app.debug;

log('background');

const _store = openStore(id, defaults);
const _api = window.app;

const storageKeys = {
  PREFS: 'prefs',
  ITEMS: 'items',
};

const openGroupsWindow = () => {
  const height = 600;
  const width = 800;

  const params = {
    feature: labels.featureType,
    file: 'features/groups/home.html',
    height,
    width
  };

  _api.openWindow(params);
};

const initShortcut = shortcut => {
  _api.shortcuts.register(shortcut, () => {
    openGroupsWindow();
  });
};

const initItems = (prefs, items) => {
  const cmdPrefix = prefs.shortcutKeyPrefix;

  items.forEach(item => {
    const shortcut = `${cmdPrefix}${item.keyNum}`;

    _api.shortcuts.register(shortcut, () => {
      executeItem(item);
    });
  });
};

const init = () => {
  log('init');

  initStore(defaults);

  const prefs = () => _store.get(storageKeys.PREFS);

  initShortcut(prefs().shortcutKey);

  /*
  const items = () => _store.get(storageKeys.ITEMS);

  if (items().length > 0) {
    initItems(prefs(), items());
  }
  */
};

window.addEventListener('load', init);
