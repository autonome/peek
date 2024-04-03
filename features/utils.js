import {Pane} from './../node_modules/tweakpane/dist/tweakpane.js';

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

const openStore = (prefix, defaults, clear = false) => {

  //log(id, 'openStore', prefix, (defaults ? Object.keys(defaults) : ''));

  // multiple contexts
  const keyify = k => `${prefix}+${k}`;

  // Simple localStorage abstraction/wrapper
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

  if (clear) {
    store.clear();
  }

  const initStore = (store, data) => {
    Object.keys(data).forEach(k => {
      const v = store.get(k);
      if (!v) {
        //log(id, 'openStore(): init is setting', k, data[k]);
        store.set(k, data[k]);
      }
    });
  };

  if (defaults != null) {
    //log('UTILS/openStore()', 'initing');
    initStore(store, defaults);
  }

  return store;
};

const addToGUI = (gui, label, value, disabled = false, step = null, max = null) => {
  const params = {};
  params[label] = value;

  const ctr = gui.add(params, label);

  /*
  if (disabled == true) {
    ctr.disable();
  }

  if (max != null) {
    ctr.max(max);
  }

  if (step != null) {
    ctr.step(step);
  }
  */

  return ctr;
}

export {
  log,
  openStore,
  addToGUI
};
