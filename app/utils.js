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

export {
  openStore
};
