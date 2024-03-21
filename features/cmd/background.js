// cmd/background.js

import { id, labels, schemas, ui, defaults } from './config.js';
import { log as l, openStore } from "../utils.js";

const log = function(...args) { l(id, args); };

log('background');

const debug = window.app.debug;
const store = openStore(id, defaults);
const api = window.app;

const storageKeys = {
  PREFS: 'prefs',
  ITEMS: 'items',
};

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

  api.openWindow(params);
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
