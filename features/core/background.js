import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { log as l, openStore } from "../utils.js";

const log = function(...args) { l(labels.name, args); };

log('background', labels.name);

const debug = window.app.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);
const api = window.app;

const winKeyCache = new Map();

const openSettingsWindow = (prefs) => {
  const height = prefs.height || 600;
  const width = prefs.width || 800;

  const params = {
    debug,
    feature: labels.name,
    address: 'peek://core/settings.html',
    height,
    width
  };

  api.openWindow(params);
};

const initShortcut = (prefs) => {
  api.shortcuts.register(prefs.shortcutKey, () => {
    openSettingsWindow(prefs);
  });
};

const initFeature = f => {
  if (!f.enabled) {
    return;
  }

  console.log('initializing feature ', f);

  const params = {
    feature: f.name,
    debug,
    address: f.start_url,
    keepLive: true,
    show: debug
  };

  window.app.openWindow(params, r => {
    console.log(`initFeature(): win opened for ${f.name}`, r)
    winKeyCache.set(f.id, r.key);
  });

  console.log('window opened');
};

const uninitFeature = f => {

  const key = winKeyCache.get(f.id);
  if (key) {
    console.log('closing window for', f.name);
    window.app.closeWindow(key, r => {
      console.log(`uninitFeature(): win closed for ${f.name}`, r)
      winKeyCache.delete(f.id);
    });
  }
};

// unused, worth testing more tho
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

const prefs = () => store.get(storageKeys.PREFS);
const features = () => store.get(storageKeys.FEATURES);

const init = () => {
  log('init');

  const p = prefs();

  console.log('prefs', p);

  initShortcut(p);

  features().forEach(initFeature);
  //features.forEach(initIframeFeature);
  
  const startupFeatureTitle = p.startupFeature;

  const startupFeature = features().find(f => f.name = startupFeatureTitle);

  // Listen for system- or feature-level requests to open windows.
  // 
  // In this case, for opening up global settings
  // on app start (if configured) and from the tray icon.
  window.app.subscribe('open', msg => {
    if (msg.feature && msg.feature == 'feature/core/settings') {
      openSettingsWindow(p);
    }
  });

  // main process uses these for initialization
  window.app.publish('prefs', {
    feature: id,
    prefs: p
  });

  // feature enable/disable
  window.app.subscribe('core:feature:toggle', msg => {
    console.log('feature toggle', msg)

    const f = features().find(f => f.id = msg.featureId);
    if (f) {
      console.log('feature toggle', f);
      if (msg.enabled == false) {
        console.log('disabling', f.name);
        uninitFeature(f);
      }
      else if (msg.enabled == true) {
        console.log('enabling', f.name);
        initFeature(f);
      }
    }
    else {
      console.log('feature toggle - no feature found for', f.name);
    }
  });
};

window.addEventListener('load', init);

/*
const odiff = (a, b) => Object.entries(b).reduce((c, [k, v]) => Object.assign(c, a[k] ? {} : { [k]: v }), {});

const onStorageChange = (e) => {
  const old = JSON.parse(e.oldValue);
  const now = JSON.parse(e.newValue);

  const featureKey = `${id}+${storageKeys.FEATURES}`;
  //log('onStorageChane', e.key, featureKey)
  if (e.key == featureKey) {
    //log('STORAGE CHANGE', e.key, old[0].enabled, now[0].enabled);
    features().forEach((feat, i) => {
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
*/
