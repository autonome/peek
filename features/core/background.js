import { id, labels, schemas, ui, defaults } from './config.js';
import { log as l, openStore } from "../utils.js";

const log = function(...args) { l(id, args); };

log('background');

const debug = window.app.debug;

const _store = openStore(id, defaults);
const _api = window.app;

const storageKeys = {
  PREFS: 'prefs',
  FEATURES: 'items',
};

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

const initShortcut = (prefs) => {
  _api.shortcuts.register(prefs.shortcutKey, () => {
    openSettingsWindow(prefs);
  });
};

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
    show: debug
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
  const old = JSON.parse(e.oldValue);
  const now = JSON.parse(e.newValue);

  const featureKey = `${id}+${storageKeys.FEATURES}`;
  //log('onStorageChane', e.key, featureKey)
  if (e.key == featureKey) {
    //log('STORAGE CHANGE', e.key, old[0].enabled, now[0].enabled);
    items().forEach((feat, i) => {
      log(feat.title, i, feat.enabled, old[i].enabled, now[i].enabled);
      // disabled, so unload
      if (old[i].enabled == true && now[i].enabled == false) {
        // TODO
        log('TODO: add unloading of features', feat)
      }
      // enabled, so load
      else if (old[i].enabled == false && now[i].enabled == true) {
        initFeature(feat);
      }
    });
  }
	//JSON.stringify(e.storageArea);
};

window.addEventListener('storage', onStorageChange);

const prefs = () => _store.get(storageKeys.PREFS);
const items = () => _store.get(storageKeys.FEATURES);

const init = () => {
  log('init');

  initShortcut(prefs());

  items().forEach(initFeature);
  //features.forEach(initIframeFeature);
  
  const startupFeatureTitle = prefs().startupFeature;

  const startupFeature = items().find(f => f.title = startupFeatureTitle);

  /*
  const msg = {
    feature: id,
    topic: 'init',
    'prefs': prefs()
  };

  window.app.sendMessage(msg);
  */
};

window.addEventListener('load', init);
