const openStore = (prefix, defaults, clear = false) => {

  //console.log('openStore', prefix, (defaults ? Object.keys(defaults) : ''));

  // multiple contexts
  const keyify = k => `${prefix}+${k}`;

  // Simple localStorage abstraction/wrapper
  const store = {
    set: (k, v) => {
      const key = keyify(k);
      const value = JSON.stringify(v);
      //console.log('store.set', key, value)
      localStorage.setItem(key, value);
    },
    get: (k) => {
      const key = keyify(k);
      //console.log('store.get', key)
      const r = localStorage.getItem(key);
      return r ? JSON.parse(r) : null;
    },
    clear: () => localStorage.clear()
  };

  if (window.app.debug
      && window.app.debugLevel == window.app.debugLevels.FIRST_RUN) {
    console.log('openStore(): clearing storage')
    store.clear();
  }

  if (clear) {
    console.log('openStore(): CLEARING');
    store.clear();
  }

  const initStore = (store, data) => {
    Object.keys(data).forEach(k => {
      const v = store.get(k);
      if (!v) {
        //console.log('openStore(): init is setting', k, data[k]);
        store.set(k, data[k]);
      }
    });
  };

  if (defaults != null) {
    //console.log('UTILS/openStore()', 'initing');
    initStore(store, defaults);
  }

  return store;
};

// The flattenObj helper is now private - it's only needed for window.open

/**
 * Create an async store backed by datastore instead of localStorage.
 * Uses the extension_settings table with extensionId as namespace.
 *
 * @param {string} namespace - The extensionId (e.g., 'core', 'cmd', 'scripts')
 * @param {object} defaults - Default values for each key
 * @returns {Promise<object>} Store with async get/set methods
 */
const createDatastoreStore = async (namespace, defaults = {}) => {
  const api = window.app;
  const table = 'extension_settings';

  // Load all settings for this namespace once
  let cache = {};
  try {
    const result = await api.datastore.getTable(table);
    if (result.success && result.data) {
      Object.values(result.data).forEach(row => {
        if (row.extensionId === namespace && row.value) {
          try {
            cache[row.key] = JSON.parse(row.value);
          } catch (e) {
            console.warn(`[datastoreStore] Failed to parse ${namespace}:${row.key}`, e);
          }
        }
      });
    }
  } catch (e) {
    console.warn(`[datastoreStore] Failed to load ${namespace}`, e);
  }

  // Apply defaults for missing keys
  Object.keys(defaults).forEach(key => {
    if (cache[key] === undefined) {
      cache[key] = defaults[key];
    }
  });

  return {
    get(key) {
      return cache[key] !== undefined ? cache[key] : defaults[key];
    },

    async set(key, value) {
      cache[key] = value;
      const rowId = `${namespace}:${key}`;
      try {
        await api.datastore.setRow(table, rowId, {
          extensionId: namespace,
          key,
          value: JSON.stringify(value),
          updatedAt: Date.now()
        });
      } catch (e) {
        console.error(`[datastoreStore] Failed to save ${namespace}:${key}`, e);
      }
    },

    // Get all cached values
    getAll() {
      return { ...cache };
    }
  };
};

export {
  openStore,
  createDatastoreStore
};
