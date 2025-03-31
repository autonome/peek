import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore, openWindow } from "../utils.js";
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
    address,
    key: address,
    height,
    width
  };

  openWindow(address, params);
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
