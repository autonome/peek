// settings/settings.js
(async () => {

console.log('settings/settings');

const labels = {
  featureType: 'settings',
  featureDisplay: 'Settings',
  prefs: {
    shortcutKey: 'Settings shortcut',
  }
};

const {
  BrowserWindow,
  globalShortcut,
} = require('electron');

const path = require('path');

let _store = null;
let _data = {};

const prefsSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.prefs.schema.json",
  "title": "Application and Settings preferences",
  "description": "Peek user preferences",
  "type": "object",
  "properties": {
    "shortcutKey": {
      "description": "App keyboard shortcut to load settings",
      "type": "string",
      "default": "CommandOrControl+,"
    },
    "height": {
      "description": "User-set or -defined height of Settings page",
      "type": "integer",
      "default": 600
    },
    "width": {
      "description": "User-set or -defined width of Settings page",
      "type": "integer",
      "default": 800
    },
  },
  "required": [ "shortcutKey" ]
};

// TODO: schemaize 0-9 constraints for peeks
const schemas = {
  prefs: prefsSchema,
};

const _defaults = {
  prefs: {
    shortcutKey: 'Option+,',
    height: 600,
    width: 800,
  },
};

const openSettingsWindow = (api, prefs) => {
  const height = prefs.height || 600;
  const width = prefs.width || 800;

  const params = {
    type: labels.featureType,
    file: 'features/settings/content.html',
    height,
    width
  };

  _api.openWindow(params);
};

const initStore = (store, data) => {
  const sp = store.get('prefs');
  if (!sp) {
    store.set('prefs', data.prefs);
  }
};

const initShortcut = (api, prefs) => {
  const shortcut = prefs.shortcutKey;

  if (globalShortcut.isRegistered(shortcut)) {
    globalShortcut.unregister(shortcut);
  }

  const ret = globalShortcut.register(shortcut, () => {
    openSettingsWindow(api, prefs);
  });

  if (!ret) {
    console.error('Unable to register shortcut', shortcut);
  }
};

const init = (api, store) => {
  console.log('settings: init');

  _store = store;
  _api = api;

  initStore(_store, _defaults);

  _data = {
    get prefs() { return _store.get('prefs'); },
    //get items() { return _store.get('items'); },
  };

  initShortcut(api, _data.prefs);
};

const onChange = (changed, old) => {
  console.log(labels.featureType, 'onChange', changed);

  // TODO only update store if changed
  // and re-init
  if (changed.prefs) {
    _store.set('prefs', changed.prefs);
  }

  if (changed.items) {
    _store.set('items', changed.items);
  }
};

// ui config
const config = {
  // allow user to create new items
  allowNew: false,
  // fields that are view only
  disabled: ['keyNum'],
};

const open = () => {
  openSettingsWindow(_api, _data.prefs);
};

module.exports = {
  init: init,
  config,
  labels,
  schemas,
  data: {
    get prefs() {
      return _store.get('prefs');
    }
  },
  open,
  onChange
};

})();
