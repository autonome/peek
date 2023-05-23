const id = 'features/utils';

const log = (...args) => {
  if (!window.app.debug) {
    return;
  }

  const aargs = [...args];
  const source = aargs.shift();
  const str = aargs.map(JSON.stringify).join(', ');
  //const str = aargs.join(', ');
  console.log(str);
  window.app.log(source, str);
};

const openStore = (prefix, defaults) => {

  //log(id, 'openStore', prefix, (defaults ? Object.keys(defaults) : ''));

  const store = {
    set: (k, v) => {
      const key = keyify(k);
      const value = JSON.stringify(v);
      //log(id, 'store.set', key)
      localStorage.setItem(key, value);
    },
    get: (k) => {
      const key = keyify(k);
      //log(id, 'store.get', key)
      const r = localStorage.getItem(key);
      return r ? JSON.parse(r) : null;
    },
    clear: () => localStorage.clear()
  };

  if (window.app.debug
      && window.app.debugLevel == window.app.debugLevels.FIRST_RUN) {
    log(id, 'openStore(): clearing storage')
    store.clear();
  }

  // multiple contexts
  const keyify = k => `${prefix}+${k}`;

  const initStore = (store, data) => {
    Object.keys(data).forEach(k => {
      const v = store.get(k);
      if (!v) {
        //log(id, 'openStore(): init is setting', k, data[k]);
        store.set(k, data[k]);
      }
    });
  };

  if (defaults) {
    //log('UTILS/openStore()', 'initing');
    initStore(store, defaults);
  }

  return store;
};

export {
  log,
  openStore
};
