// input/input.js
(async () => {

console.log('input/input');

const labels = {
  featureType: 'input',
  featureDisplay: 'Input',
  prefs: {
    shortcutKey: 'Input shortcut',
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
  "$id": "peek.input.prefs.schema.json",
  "title": "Input preferences",
  "description": "Peek app Input user preferences",
  "type": "object",
  "properties": {
    "shortcutKey": {
      "description": "Global OS hotkey to open input",
      "type": "string",
      "default": "Option+Space"
    },
  },
  "required": [ "shortcutKey"]
};

const itemSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.input.entry.schema.json",
  "title": "Peek - input entry",
  "description": "Peek input entry",
  "type": "object",
  "properties": {
    "keyNum": {
      "description": "Number on keyboard to open this peek, 0-9",
      "type": "integer",
      "minimum": 0,
      "maximum": 9,
      "default": 0
    },
    "title": {
      "description": "Name of the peek - user defined label",
      "type": "string",
      "default": "New Peek"
    },
    "address": {
      "description": "URL to load",
      "type": "string",
      "default": "https://example.com"
    },
    "persistState": {
      "description": "Whether to persist local state or load page into empty container - defaults to false",
      "type": "boolean",
      "default": false
    },
    "keepLive": {
      "description": "Whether to keep page alive in background or load fresh when triggered - defaults to false",
      "type": "boolean",
      "default": false
    },
    "allowSound": {
      "description": "Whether to allow the page to emit sound or not (eg for background music player peeks - defaults to false",
      "type": "boolean",
      "default": false
    },
    "height": {
      "description": "User-defined height of peek page",
      "type": "integer",
      "default": 600
    },
    "width": {
      "description": "User-defined width of peek page",
      "type": "integer",
      "default": 800
    },
  },
  "required": [ "keyNum", "title", "address", "persistState", "keepLive", "allowSound",
                "height", "width" ]
};

const listSchema = {
  type: 'array',
  items: { "$ref": "#/$defs/entry" }
};

// TODO: schemaize 0-9 constraints for peeks
const schemas = {
  prefs: prefsSchema,
  item: itemSchema,
  items: listSchema
};

const _defaults = {
  prefs: {
    shortcutKey: 'Option+Space'
  },
};

let _windows = {};

const openInputWindow = (api, item) => {
  // TODO: implement me
  return;

  const height = item.height || 600;
  const width = item.width || 800;
  
  let win = null;

  const windowKey = labels.featureType + item.keyNum;

  if (_windows[windowKey]) {
    console.log(labels.featureType, item.keyNum, 'using stored window');
    win = _windows[windowKey];
    win.show();
  }
  else {
    console.log(labels.featureType, item.keyNum, 'creating new window');

    win = new BrowserWindow({
      height,
      width,
      center: true,
      skipTaskbar: true,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      webPreferences: {
        preload: api.preloadPath,
        // isolate content and do not persist it
        partition: Date.now()
      }
    });

    //_windows[windowKey] = win;
  }

  const onGoAway = () => {
    /*
    if (item.keepLive) {
      _windows[windowKey] = win;
      win.hide();
    }
    else {
      win.destroy();
    }
    */
    win.destroy();
  }
  win.on('blur', onGoAway);
  win.on('close', onGoAway);

  win.webContents.send('window', { type: labels.featureType, id: win.id, data: item });

  win.loadURL(item.address);
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
    openInputWindow(api);
  });

  if (!ret) {
    console.error('Unable to register shortcut', shortcut);
  }
};

const init = (api, store) => {
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
    console.log('input: updating prefs', changed.prefs);
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

module.exports = {
  init: init,
  config,
  labels,
  schemas,
  data: {
    get prefs() { return _store.get('prefs'); },
  },
  onChange
};


})();
