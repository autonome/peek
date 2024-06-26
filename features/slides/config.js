const id = '434108f3-18a6-437a-b507-2f998f693bb2';

const labels = {
  name: 'Slides',
  prefs: {
    keyPrefix: 'Slide shortcut prefix',
  }
};

const prefsSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.slides.prefs.schema.json",
  "title": "Slides prefs",
  "description": "Peek app Slides user preferences",
  "type": "object",
  "properties": {
    "shortcutKeyPrefix": {
      "description": "Global OS hotkey prefix to trigger slides - will be followed by up/down/left/right arrows",
      "type": "string",
      "default": "Option+"
    },
  },
  "required": [ "shortcutKeyPrefix"]
};

const itemSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.slides.slide.schema.json",
  "title": "Peek - page slide",
  "description": "Peek page slide",
  "type": "object",
  "properties": {
    "screenEdge": {
      "description": "Edge of screen or arrow key to open this slide, up/down/left/right",
      "type": "string",
      "oneOf": [
        { "format": "Up" },
        { "format": "Down" },
        { "format": "Left" },
        { "format": "Right" }
      ],
      "default": "Right"
    },
    "title": {
      "description": "Name of the slide - user defined label",
      "type": "string",
      "default": "New Slide"
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
      "description": "Whether to allow the page to emit sound or not (eg for background music player slides - defaults to false",
      "type": "boolean",
      "default": false
    },
    "height": {
      "description": "User-defined height of slide page",
      "type": "integer",
      "default": 600
    },
    "width": {
      "description": "User-defined width of slide page",
      "type": "integer",
      "default": 800
    },
    "enabled": {
      "description": "Whether this slide is enabled or not.",
      "type": "boolean",
      "default": false
    },
  },
  "required": [ "screenEdge", "title", "address", "persistState", "keepLive", "allowSound",
                "height", "width", "enabled" ]
};

const listSchema = {
  type: 'array',
  items: { "$ref": "#/$defs/slide" }
};

const schemas = {
  prefs: prefsSchema,
  item: itemSchema,
  items: listSchema
};

const storageKeys = {
  PREFS: 'prefs',
  ITEMS: 'items',
};

const defaults = {
  prefs: {
    shortcutKeyPrefix: 'Option+'
  },
  items: [
    {
      screenEdge: 'Up',
      title: 'Slide from top',
      address: 'http://localhost/',
      persistState: false,
      keepLive: false,
      allowSound: false,
      height: 600,
      width: 800,
      enabled: true,
    },
    {
      screenEdge: 'Down',
      title: 'Slide from bottom',
      address: '',
      persistState: false,
      keepLive: false,
      allowSound: false,
      height: 600,
      width: 800,
      enabled: false,
    },
    {
      screenEdge: 'Left',
      title: 'Slide from left',
      address: '',
      persistState: false,
      keepLive: false,
      allowSound: false,
      height: 600,
      width: 800,
      enabled: false,
    },
    {
      screenEdge: 'Right',
      title: 'Slide from right',
      address: '',
      persistState: false,
      keepLive: false,
      allowSound: false,
      height: 600,
      width: 800,
      enabled: false,
    },
  ]
};

export {
  id,
  labels,
  schemas,
  storageKeys,
  defaults
};
