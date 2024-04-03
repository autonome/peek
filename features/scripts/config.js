const id = 'features/scripts';
const guid = '30c25027-d367-4595-b37f-9db3de853c37';

const labels = {
  featureType: 'scripts',
  featureDisplay: 'Scripts',
  itemType: 'script',
  itemDisplay: 'Script',
  prefs: {
  }
};

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
    "enabled": {
      "description": "Whether this script is enabled or not.",
      "type": "boolean",
      "default": false
    },
  },
  "required": [ "id", "title", "address", "version", "selector", "property",
                "interval", "notifyOnChange", "storeHistory", "enabled" ]
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

const defaults = {
  prefs: {
  },
  items: [
    {
      id: 'peek:script:localhost:test',
      title: 'localhost test',
      address: 'http://localhost/',
      version: '1',
      selector: 'body > h1',
      property: 'textContent',
      interval: 300000,
      storehistory: false,
      notifyOnChange: false,
      enabled: false,
    },
  ]
};

// ui config
const ui = {
  // allow user to create new items
  allowNew: false,
  // fields that are view only
  disabled: ['screenEdge'],
};

export {
  id,
  labels,
  schemas,
  ui,
  defaults
};
