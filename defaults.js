
const Store = require('electron-store');

const prefsSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.prefs.schema.json",
  "title": "Peek - prefs",
  "description": "Peek user preferences",
  "type": "object",
	"properties": {
    "globalKeyCmd": {
      "description": "Global OS hotkey to load app",
      "type": "string",
      "default": "CommandOrControl+Escape"
    },
    "peekKeyPrefix": {
      "description": "Global OS hotkey prefix to trigger peeks - will be followed by 0-9",
      "type": "string",
      "default": "Option+"
    },
  },
  "required": [ "globalKeyCmd", "peekKeyPrefix"]
};

const peekSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.peek.schema.json",
  "title": "Peek - page peek",
  "description": "Peek page peek",
  "type": "object",
	"properties": {
    "keyNum": {
      "description": "Number on keyboard to open this peek, 0-9",
      "type": "integer",
      "default": 0
    },
    "title": {
      "description": "Name of the peek - user defined label",
      "type": "string",
      "default": "New Peek"
    },
    "address": {
      "description": "URL to execute script against",
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

const scriptSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.script.schema.json",
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
    "value": {
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
  },
  "required": [ "id", "title", "address", "version", "selector", "value",
								"interval", "storeHistory" ]
};

const schemas = {
	prefs: prefsSchema,
	peek: peekSchema,
	script: scriptSchema
};

const fullSchema = {
  prefs: prefsSchema,
  peek: peekSchema,
  script: scriptSchema,
  peeks: {
    type: 'array',
    items: {
      type: 'peek'
    }
  },
  scripts: {
    type: 'array',
    items: {
      type: 'script'
    }
  },
};

const defaults = {
  prefs: {
    globalKeyCmd: 'CommandOrControl+Escape',
    peekKeyPrefix: 'Option+'
  },
  peeks: [
    {
      keyNum: 0,
      title: 'localhost',
      address: 'http://localhost/',
      persistState: false,
      keepLive: false,
      allowSound: false,
      height: '',
      width: '',
    },
    {
      keyNum: 1,
      title: 'everytimezone',
      address: 'https://everytimezone.com/',
      persistState: false,
      keepLive: false,
      allowSound: false,
      height: '',
      width: '',
    }
  ],
  scripts: [
    {
      id: 'peek:script:localhost:test',
      title: 'localhost test',
      address: 'http://localhost/',
      version: '1',
      selector: 'body > h1',
      value: 'textContent',
      interval: 300000,
      storehistory: false
    },
  ]
};

const set = data => {
  store.set('prefs', data.prefs);
  store.set('peeks', data.peeks);
  store.set('scripts', data.scripts);
};

const store = new Store({
  // TODO: re-enable schemas
  //schema: fullSchema,
  watch: true
});

// DEBUG
store.clear();

const tmp = store.get('prefs');
if (!tmp) {
  console.log('initializing datastore');
  store.set('prefs', defaults.prefs);
  store.set('peeks', defaults.peeks);
  store.set('scripts', defaults.scripts);
}

module.exports = {
	schemas,
	data: {
    get prefs() { return store.get('prefs'); },
    get peeks() { return store.get('peeks'); },
    get scripts() { return store.get('scripts'); }
  },
  set,
  watch: fn => {
    store.onDidAnyChange(newData => {
      fn(newData)
    });
  }
};
