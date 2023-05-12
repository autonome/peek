// cmd/background.js
(async () => {

const log = (...args) => {
  window.app.log(labels.featureType, args.join(', '));
};

log('cmd/background');

//import { labels, schemas, ui, defaults } from './config.js';

//const debug = window.location.search.indexOf('debug') > 0;
const debug = 1;

if (debug) {
  log('clearing storage')
  localStorage.clear();
}

const _store = localStorage;
const _api = window.app;

const openInputWindow = prefs => {
  const height = prefs.height || 50;
  const width = prefs.width || 600;

  const params = {
    debug,
    feature: labels.featureType,
    file: 'features/cmd/panel.html',
    height,
    width
  };

  _api.openWindow(params);
};

const initStore = (data) => {
  const sp = _store.getItem('prefs');
  if (!sp) {
    _store.setItem('prefs', JSON.stringify(data.prefs));
  }
};

const initShortcut = (shortcut) => {
  _api.shortcuts.register(shortcut, () => {
    openInputWindow(prefs());
  });
};

const prefs = () => JSON.parse(_store.getItem('prefs'));

const init = () => {
  initStore(defaults);

  initShortcut(prefs().shortcutKey);
};

const onChange = (changed, old) => {
  log('onChange', changed);

  // TODO only update store if changed
  // and re-init
  if (changed.prefs) {
    _store.setItem('prefs', JSON.stringify(changed.prefs));
  }

  if (changed.items) {
    _store.setItem('items', JSON.stringif(changed.items));
  }
};


window.addEventListener('load', init);

})();
