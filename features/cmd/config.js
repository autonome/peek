const id = 'features/cmd';

const labels = {
  featureType: 'cmd',
  featureDisplay: 'Cmd',
  prefs: {
    shortcutKey: 'Cmd shortcut',
  }
};

const prefsSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.cmd.prefs.schema.json",
  "title": "Cmd preferences",
  "description": "Peek app Cmd user preferences",
  "type": "object",
  "properties": {
    "shortcutKey": {
      "description": "Global OS hotkey to open command panel",
      "type": "string",
      "default": "Option+Space"
    },
  },
  "required": [ "shortcutKey"]
};

/*
const itemSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.cmd.entry.schema.json",
  "title": "Peek - command entry",
  "description": "Peek command entry",
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
*/

const schemas = {
  prefs: prefsSchema,
  //item: itemSchema,
  //items: listSchema
};

const defaults = {
  prefs: {
    shortcutKey: 'Option+Space'
  },
};

// ui config for tweakpane filling
const ui = {
  // allow user to create new items
  allowNew: false,
  // fields that are view only
  disabled: [],
};

export {
  id,
  labels,
  schemas,
  ui,
  defaults
};

