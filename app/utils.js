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

const flattenObj = o => Object.keys(o).map(k => {
  // Make sure boolean values are properly converted to strings
  if (typeof o[k] === 'boolean') {
    return `${k}=${o[k]}`;
  } 
  // For numbers and strings, just convert directly
  else {
    return `${k}=${o[k]}`;
  }
}).join(',');

const openWindow = (address, params) => {
  const target = params.hasOwnProperty('key') ? params.key : '_blank';
  
  // Log parameters to help with debugging
  console.log('openWindow called with params:', params);
  
  if (window.app && window.app.window) {
    // Use the IPC window API if available (this goes through main process)
    console.log('Using window.app.window.open API');
    return window.app.window.open(address, params);
  } else {
    // Fall back to regular window.open if API not available
    console.log('Using regular window.open', flattenObj(params));
    return window.open(address, target, flattenObj(params));
  }
};

export {
  flattenObj,
  openStore,
  openWindow
};
