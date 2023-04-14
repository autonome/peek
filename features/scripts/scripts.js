// scripts/scripts.js
(async () => {

console.log('scripts/scripts');

const labels = {
  featureType: 'scripts',
  featureDisplay: 'Scripts',
  itemType: 'script',
  itemDisplay: 'Script',
  prefs: {
  }
};

const {
  BrowserWindow,
  globalShortcut,
  screen,
} = require('electron');

const path = require('path');

let _store = null;

const prefsSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.scripts.prefs.schema.json",
  "title": "Scripts preferences",
  "description": "Scripts user preferences",
  "type": "object",
  "properties": {
  },
  "required": []
};

const itemSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.scripts.script.schema.json",
  "title": "Peek - script",
  "description": "Peek background script",
  "type": "object",
  "properties": {
    "id": {
      "description": "The unique identifier for a script",
      "type": "string",
      "default": "peek:script:REPLACEME"
    },
    "title": {
      "description": "Name of the script - user defined",
      "type": "string",
      "default": "New Script"
    },
    "version": {
      "description": "Version number of the script",
      "type": "string",
      "default": "1.0.0"
    },
    "address": {
      "description": "URL to execute script against",
      "type": "string",
      "default": "https://example.com"
    },
    "selector": {
      "description": "CSS Selector for the script",
      "type": "string",
      "default": "body > h1"
    },
    "property": {
      "description": "Which element property to return - currently 'textContent' is the only supported value",
      "type": "string",
      "default": "textContent"
    },
    "interval": {
      "description": "How often to execute the script, in milliseconds - defaults to five minutes",
      "type": "integer",
      "default": 300000,
      "minimum": 0
    },
    "storeHistory": {
      "description": "Whether to store historic values - defaults to false",
      "type": "boolean",
      "default": false
    },
    "notifyOnChange": {
      "description": "Whether to notify using local OS notifications when script value changes",
      "type": "boolean",
      "default": true
    },
    "previousValue": {
      "description": "The most recently fetched result of script exection",
      "type": "string",
      "default": "",
    },
  },
  "required": [ "id", "title", "address", "version", "selector", "property",
                "interval", "notifyOnChange", "storeHistory" ]
};

const listSchema = {
  type: 'array',
  items: { "$ref": "#/$defs/script" }
};

// TODO: schemaize 0-9 constraints for peeks
const schemas = {
  prefs: prefsSchema,
  item: itemSchema,
  items: listSchema
};

const _defaults = {
  prefs: {
  },
  items: [
    /*
    {
      id: 'peek:script:localhost:test',
      title: 'localhost test',
      address: 'http://localhost/',
      version: '1',
      selector: 'body > h1',
      property: 'textContent',
      interval: 300000,
      storehistory: false,
      notifyOnChange: false
    },
    */
  ]
};

let _windows = {};

const executeItem = (api, script, cb) => {
  const view = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: api.preloadPath,
      // isolate content and do not persist it
      partition: Date.now()
    }
  });

  view.webContents.send('window', {
    id: 'view',
    type: 'script',
    data: script
  });

  view.webContents.loadURL(script.address);

  const str = `
    const s = "${script.selector}";
    const r = document.querySelector(s);
    const value = r ? r.textContent : null;
    value;
  `;

  view.webContents.on('dom-ready', async () => {
    try {
      const r = await view.webContents.executeJavaScript(str);
      cb(r);
    } catch(ex) {
      console.error('cs exec error', ex);
      cb(null);
    }
    view.destroy();
  });
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

let _intervals = [];

const initItems = (api, prefs, items) => {
  // blow it all away for now
  // someday make it right proper just cancel/update changed and add new
  _intervals.forEach(clearInterval);

  // debounce me somehow so not shooting em all off
  // at once every time app starts
  items.forEach(item => {
    const interval = setInterval(() => { 
      //console.log('interval hit', item.title);
      const r = executeItem(api, item, (res) => {
        //console.log('cs r', res);

        if (item.previousValue != res) {

          // update stored value
          item.previousValue = res;
          updateItem(item);

          // notification
          // add to schema and support per script
          /*
          const title = `Peek :: Script :: ${item.title}`;
          const body = [
            `Script result changed for ${item.title}:`,
            `- Old: ${previousValue}`,
            `- New: ${res}`
          ].join('\n');

          new Notification({ title, body }).show();
          */
        }
      });
    }, item.interval);
    _intervals.push(interval);
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

const updateItem = (item) => {
  let items = _store.get('items');
  const idx = items.findIndex(el => el.id == item.id);
  items[idx] = item;
  _store.set('items', items);
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
  disabled: ['screenEdge'],
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
