const log = (...args) => {
  //console.log.apply(null, [source].concat(args));
  window.app.log(labels.featureType, args.join(', '));
};

log('loading');

const features = [
  //'features/cmd/background.html',
  //'features/groups/background.html',
  //'features/peeks/background.html',
  //'features/scripts/background.html',
  //'features/settings/background.html',
  //'features/slides/background.html'
];

//import { labels, schemas, ui, defaults } from './config.js';

//const debug = window.location.search.indexOf('debug') > 0;
const debug = 1;

if (debug) {
  log('clearing storage')
  localStorage.clear();
}

const _store = localStorage;
const _api = window.app;

const openSettingsWindow = (prefs) => {
  const height = prefs.height || 600;
  const width = prefs.width || 800;

  const params = {
    debug,
    feature: labels.featureType,
    file: 'features/core/settings.html',
    height,
    width
  };

  _api.openWindow(params);
};

const initStore = (data) => {
  const sp = _store.getItem('prefs');
  if (!sp) {
    log('first run, initing datastore')
    _store.setItem('prefs', JSON.stringify(data.prefs));
  }

  const items = _store.getItem('items');
  if (!items) {
    _store.setItem('items', JSON.stringify(data.items));
  }
};

const initShortcut = (shortcut) => {
  _api.shortcuts.register(shortcut, () => {
    openSettingsWindow(prefs());
  });
};

const prefs = () => JSON.parse(_store.getItem('prefs'));
const items = () => JSON.parse(_store.getItem('items'));

const initFeature = f => {
  if (!f.enabled) {
    return;
  }

  log('initializing feature ' + f);

  const params = {
    feature: f.title,
    debug,
    file: f.address,
    keepLive: true,
    show: false
  };

  window.app.openWindow(params);
  //window.app.openWindow(params, () => window.app.log('win opened'));
};

const initIframeFeature = file => {
  const pathPrefix = 'file:///Users/dietrich/misc/peek/';
  log('initiframe');
  const i = document.createElement('iframe');
  const src = pathPrefix + file;
  log('iframe src', src);
  document.body.appendChild(i);
  i.src = src;
  log('iframe inited');
  i.addEventListener('load', () => {
    log('iframe loaded');
  });
};

const odiff = (a, b) => Object.entries(b).reduce((c, [k, v]) => Object.assign(c, a[k] ? {} : { [k]: v }), {});

const onStorageChange = (e) => {
  console.log(e);
  //log('oSC', e.key, JSON.stringify(odiff(e.oldValue, e.newValue)));
  /*
	e.key;
	e.oldValue;
	e.newValue;
	e.url;
	JSON.stringify(
    e.storageArea
  );
  */
  items().forEach(initFeature);
};

window.addEventListener('storage', onStorageChange);

const init = () => {
  log('settings: init');

  initStore(defaults);

  initShortcut(prefs().shortcutKey);

  items().forEach(initFeature);
  //features.forEach(initIframeFeature);
};

window.addEventListener('load', init);
