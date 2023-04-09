// peeks/peek.js
(async () => {

console.log('peeks/peeks');

const labels = {
  featureType: 'peeks',
  featureDisplay: 'Peeks',
  itemType: 'peek',
  itemDisplay: 'Peek',
  prefs: {
    keyPrefix: 'Peek shortcut prefix',
  }
};

const {
  BrowserWindow,
  globalShortcut,
} = require('electron');

const path = require('path');

let _store = null;

const prefsSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.peeks.prefs.schema.json",
  "title": "Peek - peeks",
  "description": "Peek app Peeks prefs",
  "type": "object",
  "properties": {
    "shortcutKeyPrefix": {
      "description": "Global OS hotkey prefix to trigger peeks - will be followed by 0-9",
      "type": "string",
      "default": "Option+"
    },
  },
  "required": [ "shortcutKeyPrefix"]
};

const itemSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.peeks.peek.schema.json",
  "title": "Peek - page peek",
  "description": "Peek page peek",
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
  items: { "$ref": "#/$defs/peek" }
};

// TODO: schemaize 0-9 constraints for peeks
const schemas = {
  prefs: prefsSchema,
  item: itemSchema,
  items: listSchema
};

const _defaults = {
  prefs: {
    shortcutKeyPrefix: 'Option+'
  },
  items: Array.from(Array(10)),
};

for (var i = 0; i != 10; i++) {
  _defaults.items[i] = {
    keyNum: i,
    title: `Peek key ${i}`,
    address: 'https://example.com/',
    persistState: false,
    keepLive: false,
    allowSound: false,
    height: 600,
    width: 800,
  };
}

let _windows = {};

const executeItem = (api, item) => {
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

  const items = store.get('items');
  if (!items) {
    store.set('items', data.items);
  }
};

const initItems = (api, prefs, items) => {
  const cmdPrefix = prefs.shortcutKeyPrefix;

  items.forEach(item => {
    const shortcut = `${cmdPrefix}${item.keyNum}`;

    if (globalShortcut.isRegistered(shortcut)) {
      globalShortcut.unregister(shortcut);
    }

    const ret = globalShortcut.register(shortcut, () => {
      executeItem(api, item);
    });

    if (!ret) {
      console.error('Unable to register shortcut', shortcut);
    }
  });
};

const init = (api, store) => {
  _store = store;
  _api = api;

  initStore(_store, _defaults);

  _data = {
    get prefs() { return _store.get('prefs'); },
    get items() { return _store.get('items'); },
  };

  // initialize peeks
  if (_data.items.length > 0) {
    initItems(api, _data.prefs, _data.items);
  }
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

module.exports = {
  init: init,
  config,
  labels,
  schemas,
  data: {
    get prefs() { return _store.get('prefs'); },
    get items() { return _store.get('items'); },
  },
  onChange
};


})();
