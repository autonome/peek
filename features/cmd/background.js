// cmd/background.js

import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore, flattenObj } from "./utils.js";

console.log('background', labels.name);

const debug = window.app.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);
const api = window.app;

const address = 'peek://cmd/panel.html';
const settingsAddress = 'peek://cmd/settings.html';

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

  const features = flattenObj(params);
  window.open(address, null, features);
};

const openSettingsWindow = (prefs) => {
  const height = prefs.height || 600;
  const width = prefs.width || 800;

  const params = {
    debug,
    address: settingsAddress,
    transparent: true
  };

  window.open(settingsAddress, null, flattenObj(params));
};

const initShortcut = (prefs) => {
  api.shortcuts.register(prefs.shortcutKey, () => {
    openInputWindow(prefs);
  });
};

const init = () => {
  console.log('init');

  const prefs = () => store.get(storageKeys.PREFS);

  initShortcut(prefs());

  window.app.subscribe('open', msg => {
    if (msg.feature && msg.feature == `${id}/settings`) {
      openSettingsWindow(prefs());
    }
  });

};

window.addEventListener('load', init);
