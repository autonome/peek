import appConfig from './config.js';
import { openStore, openWindow } from "./utils.js";
import api from './api.js';
import fc from './features.js';

const { id, labels, schemas, storageKeys, defaults } = appConfig;

console.log('core', id, labels.name);

const debug = api.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);

// maps app id to BrowserWindow id (background)
const windows = new Map();

const settingsAddress = 'peek://app/settings/settings.html';
const topicCorePrefs = 'topic:core:prefs';
const topicFeatureToggle = 'core:feature:toggle';

let _settingsWin = null;

const openSettingsWindow = (prefs) => {
  console.log('openSettingsWindow()');

  /*
  // TODO: fuck, have to call main process to do this
  if (_settingsWin) {
    console.log('win exists, focusing');
    _settingsWin.focus();
    console.log('focused');
    return;
  }
  */

  // Get screen dimensions from window object
  const screenWidth = window.screen.availWidth;
  const screenHeight = window.screen.availHeight;

  // Calculate 80% of screen dimensions
  const width = Math.floor(screenWidth * 0.8);
  const height = Math.floor(screenHeight * 0.8);

  console.log(`Setting window size to ${width}x${height} (80% of ${screenWidth}x${screenHeight})`);

  const params = {
    debug,
    address: settingsAddress,
    key: settingsAddress,
    transparent: true,
    height,
    width
  };

  console.log('opening settings window', params);
  _settingsWin = openWindow(settingsAddress, params);
  console.log('opened settings window', _settingsWin);
};

const initSettingsShortcut = (prefs) => {
  api.shortcuts.register(prefs.shortcutKey, () => {
    console.log('settings shortcut executed');
    openSettingsWindow(prefs);
  });
};

const initFeature = f => {
  if (!f.enabled) {
    return;
  }

  console.log('initializing feature ', f);

  fc[f.id].init();
};

const uninitFeature = f => {
  console.log('TODO: uninitFeature', f);

  // add uninit to each feature
  //fc[f.id].init();
  /*
  const wid = windows.get(f.id);
  if (wid) {
    console.log('closing window for', f.name);
    api.closeWindow(wid, r => {
      console.log(`uninitFeature(): win closed for ${f.name}`, r)
      windows.delete(f.id);
    });
  }
  */
};

// unused, worth testing more tho
const initIframeFeature = file => {
  const pathPrefix = 'file:///Users/dietrich/misc/peek/';
  console.log('initiframe');
  const i = document.createElement('iframe');
  const src = pathPrefix + file;
  console.log('iframe src', src);
  document.body.appendChild(i);
  i.src = src;
  console.log('iframe inited');
  i.addEventListener('load', () => {
    console.log('iframe loaded');
  });
};

const prefs = () => store.get(storageKeys.PREFS);
const features = () => store.get(storageKeys.ITEMS);

const init = () => {
  console.log('init');

  const p = prefs();

  console.log('prefs', p);

  // main process uses these for initialization
  api.publish(topicCorePrefs, {
    id: id,
    prefs: p
  }, api.scopes.SYSTEM);

  // Listen for system- or feature-level requests to open windows.
  api.subscribe('open', msg => {
    // eg from the tray icon.
    if (msg.address && msg.address == settingsAddress) {
      openSettingsWindow(p);
    }
  });

  if (p.startupFeature == settingsAddress) {
    openSettingsWindow(p);
  }

  // feature enable/disable
  api.subscribe(topicFeatureToggle, msg => {
    console.log('feature toggle', msg)

    const f = features().find(f => f.id == msg.featureId);
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

  initSettingsShortcut(p);

  features().forEach(initFeature);

  //features.forEach(initIframeFeature);

  /*
  const addy = 'http://localhost';
  const params = {
    debug,
    address: addy,
    key: addy,
    height: 300,
    width: 300
  };

  const w = openWindow(addy, params);

  api.subscribe('onWindowOpened', msg => {
    api.modifyWindow(params.key, {
      hide: true
    });
  });
  */
};

window.addEventListener('load', init);

/*
const odiff = (a, b) => Object.entries(b).reduce((c, [k, v]) => Object.assign(c, a[k] ? {} : { [k]: v }), {});

const onStorageChange = (e) => {
  const old = JSON.parse(e.oldValue);
  const now = JSON.parse(e.newValue);

  const featureKey = `${id}+${storageKeys.ITEMS}`;
  //console.log('onStorageChane', e.key, featureKey)
  if (e.key == featureKey) {
    //console.log('STORAGE CHANGE', e.key, old[0].enabled, now[0].enabled);
    features().forEach((feat, i) => {
      console.log(feat.title, i, feat.enabled, old[i].enabled, now[i].enabled);
      // disabled, so unload
      if (old[i].enabled == true && now[i].enabled == false) {
        // TODO
        console.log('TODO: add unloading of features', feat)
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
