// settings/background.js
(async () => {

console.log('settings/background');

//import { labels, schemas, ui, defaults } from './config.js';

//const debug = window.location.search.indexOf('debug') > 0;
const debug = 1;

if (debug) {
  console.log('clearing storage')
  //localStorage.clear();
}

const _store = localStorage;
const _api = window.app;

const openSettingsWindow = (prefs) => {
  const height = prefs.height || 600;
  const width = prefs.width || 800;

  const params = {
    debug,
    type: labels.featureType,
    file: 'features/settings/content.html',
    height,
    width
  };

  _api.openWindow(params);
};

const initStore = (data) => {
  const sp = _store.getItem('prefs');
  if (!sp) {
    console.log('first run, initing datastore')
    _store.setItem('prefs', JSON.stringify(data.prefs));
  }
};

const initShortcut = (shortcut) => {
  console.log('is', prefs());
  _api.shortcuts.register(shortcut, () => {
    openSettingsWindow(prefs());
  });
};

const prefs = () => JSON.parse(_store.getItem('prefs'));

const init = () => {
  console.log('settings: init');

  initStore(defaults);

  initShortcut(prefs().shortcutKey);
};

const onChange = (changed, old) => {
  console.log(labels.featureType, 'onChange', changed);

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
