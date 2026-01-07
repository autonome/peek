import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore } from "../utils.js";
import windows from "../windows.js";
import api from '../api.js';

console.log('background', labels.name);

const debug = api.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);

// Track registered shortcuts for cleanup
let registeredShortcuts = [];

const executeItem = (item) => {
  console.log('executeItem:peek', item);
  const height = item.height || 600;
  const width = item.width || 800;

  const params = {
    // browserwindow
    height,
    width,

    // peek
    feature: labels.name,
    keepLive: item.keepLive || false,
    persistState: item.persistState || false,

    // Create a unique key for this peek using its address
    key: `peek:${item.address}`,

    // tracking (handled automatically by windows API)
    trackingSource: 'peek',
    trackingSourceId: item.keyNum ? `peek_${item.keyNum}` : 'peek',
    title: item.title || ''
  };

  windows.openModalWindow(item.address, params)
    .then(result => {
      console.log('Peek window opened:', result);
    })
    .catch(error => {
      console.error('Failed to open peek window:', error);
    });
};

const initItems = (prefs, items) => {
  const cmdPrefix = prefs.shortcutKeyPrefix;
  console.log('initItems', items);

  items.forEach(item => {
    if (item.enabled == true && item.address.length > 0) {
      const shortcut = `${cmdPrefix}${item.keyNum}`;

      api.shortcuts.register(shortcut, () => {
        executeItem(item);
      }, { global: true });

      registeredShortcuts.push(shortcut);
    }
  });
};

/**
 * Unregister all shortcuts and clean up
 */
const uninit = () => {
  console.log('peeks uninit - unregistering', registeredShortcuts.length, 'shortcuts');

  registeredShortcuts.forEach(shortcut => {
    api.shortcuts.unregister(shortcut, { global: true });
  });

  registeredShortcuts = [];
};

/**
 * Reinitialize peeks (called when settings change)
 *
 * TODO: This is inefficient - reinitializes all peeks when any single
 * property changes. A better approach would be to diff the old and new
 * settings and only update the shortcuts that actually changed.
 */
const reinit = () => {
  console.log('peeks reinit');
  uninit();

  const prefs = store.get(storageKeys.PREFS);
  const items = store.get(storageKeys.ITEMS);

  if (items && items.length > 0) {
    initItems(prefs, items);
  }
};

const init = () => {
  console.log('peeks init');

  const prefs = () => store.get(storageKeys.PREFS);
  const items = () => store.get(storageKeys.ITEMS);

  // Initialize peeks
  if (items().length > 0) {
    initItems(prefs(), items());
  }

  // Listen for settings changes to hot-reload
  api.subscribe('peeks:settings-changed', () => {
    console.log('peeks settings changed, reinitializing');
    reinit();
  });
};

export default {
  defaults,
  id,
  init,
  uninit,
  labels,
  schemas,
  storageKeys
}
