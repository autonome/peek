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

/*
const paneGenerator = (pane, labels, schema, data, onChange, disabled) => {
	const schemaKeys = Object.keys(schema.properties);
  const dataKeys = data ? Object.keys(data): [];
  const keys = shemaKeys.append(dataKeys);

  const inSchema = (data && data.hasOwnProperty(k))

  Object.keys(data).forEach(k => {
    // TODO: unhack
    if (k == 'settingsAddress') {
      log('sa', data[k], data);
      //log('settingsAddress', k, 'v', data[k]);
      const btn = pane.addButton({title: k});

      btn.on('click', () => {
        console.log('settings click!')
        const address = data[k];

        const params = {
          debug: window.app.debug,
          feature: labels.featureType,
          file: address,
        };

        window.app.publish('open', {
          feature: 'feature/cmd/settings'
        });
      });
    }
    else {
      // schema for property
      const s = props[k];

      // value (or default)
      const v =
        (data && data.hasOwnProperty(k))
        ? data[k]
        : props[k].default;

      const params = {};
      const opts = {};

      // dedecimalize
      if (s.type == 'integer') {
        opts.step = 1;
      }

      // disabled fields
      if (disabled.includes(k)) {
        opts.disabled = true;
      }

      params[k] = v;

      const input = pane.addBinding(params, k, opts);

      // TODO: consider inline state management
      input.on('change', ev => {
        // TODO: validate against schema
        log('inline field change', k, ev.value)
        data[k] = ev.value;
        onChange(data)
      });
    }
  });
};
*/

// TODO: fuckfuckfuck
// https://github.com/cocopon/tweakpane/issues/431
const exportPaneData = pane => {
  //const val = pane.exportState();
  //
  const children = pane.rackApi_.children.filter(p => p.children);
  const val = children.map(paneChild => {
    return paneChild.children.reduce((obj, field) => {
      const k = field.label;
      if (!k) {
        return obj;
      }

      let v = null;

      const input = field.element.querySelector('.tp-txtv_i')
      if (input) {
        v = input.value;
      }

      const checkbox = field.element.querySelector('.tp-ckbv_i');
      if (checkbox) {
        v = checkbox.checked;
      }

      // TODO: drop fields not supported for now
      if (v != undefined) {
        obj[k] = v;
      }

      return obj;
    }, {});
  });
  //
  return val;
};

export {
  log,
  openStore,
  //settingsPane
};
