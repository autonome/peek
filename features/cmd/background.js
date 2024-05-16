// cmd/background.js

import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { log as l, openStore } from "./utils.js";

const log = function(...args) { l(labels.name, args); };

log('background', labels.name);

const debug = window.app.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);
const api = window.app;

const address = 'peek://cmd/panel.html';

const openInputWindow = prefs => {
  const height = prefs.height || 50;
  const width = prefs.width || 600;

  const params = {
    debug,
    address,
    key: address,
    height,
    width
  };

  const features = Object.keys(params).map(k => `${k}=${params[k]}`).join(',');
  window.open(address, null, features);
};

const openSettingsWindow = (prefs) => {
  const height = prefs.height || 600;
  const width = prefs.width || 800;

  const params = {
    debug,
    feature: labels.name,
    file: 'features/core/settings.html',
    singleton: true,
    height,
    width
  };

  _api.openWindow(params);
};

const initShortcut = (prefs) => {
  api.shortcuts.register(prefs.shortcutKey, () => {
    openInputWindow(prefs);
  });
};

const init = () => {
  log('init');

  const prefs = () => store.get(storageKeys.PREFS);

  initShortcut(prefs());

  window.app.subscribe('open', msg => {
    if (msg.feature && msg.feature == `${id}/settings`) {
      openSettingsWindow(prefs());
    }
  });

};

window.addEventListener('load', init);
