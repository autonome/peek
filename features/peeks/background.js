// slides/slides.js
//(async () => {

const log = (...args) => {
  console.log(labels.featureType, window.app.shortcuts);
  window.app.log(labels.featureType, args.join(', '));
};

log('peeks/background');

//import { labels, schemas, ui, defaults } from './config.js';

//const debug = window.location.search.indexOf('debug') > 0;
const debug = 1;

if (debug) {
  log('clearing storage')
  localStorage.clear();
}

const _store = localStorage;
const _api = window.app;

const executeItem = (item) => {
  const height = item.height || 600;
  const width = item.width || 800;

  const params = {
    // browserwindow
    address: item.address,
    height,
    width,

    // peek
    feature: labels.featureType,
    windowKey: `${labels.featureType}:${item.keyNum}`,
    keepLive: item.keepLive || false,
    persistData: item.persistData || false
  };

  _api.openWindow(params);
};

const initStore = (data) => {
  const sp = _store.getItem('prefs');
  if (!sp) {
    _store.setItem('prefs', JSON.stringify(data.prefs));
  }

  const items = _store.getItem('items');
  if (!items) {
    _store.setItem('items', JSON.stringify(data.items));
  }
};

const initItems = (prefs, items) => {
  const cmdPrefix = prefs.shortcutKeyPrefix;

  items.forEach(item => {
    const shortcut = `${cmdPrefix}${item.keyNum}`;

    _api.shortcuts.register(shortcut, () => {
      executeItem(item);
    });
  });
};

const init = () => {
  log('init');

  initStore(defaults);

  const prefs = () => JSON.parse(_store.getItem('prefs'));
  const items = () => JSON.parse(_store.getItem('items'));

  // initialize slides
  if (items().length > 0) {
    initItems(prefs(), items());
  }
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

//})();
