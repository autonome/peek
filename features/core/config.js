const source = 'core/background';

const labels = {
  featureType: 'settings',
  featureDisplay: 'Settings',
  itemType: 'feature',
  itemDisplay: 'Feature',
  prefs: {
    shortcutKey: 'Settings shortcut',
  }
};

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

const itemSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.settings.feature.schema.json",
  "title": "Peek - feature",
  "description": "Peek modular feature",
  "type": "object",
  "properties": {
    "title": {
      "description": "Name of the feature",
      "type": "string"
    },
    "address": {
      "description": "URL to load",
      "type": "string"
    },
    "settingsAddress": {
      "description": "URL to load feature settings",
      "type": "string"
    },
    "enabled": {
      "description": "Whether the feature is enabled or not - defaults to true",
      "type": "boolean",
      "default": true
    },
  },
  "required": [ "title", "address", "settingsAddress", "enabled" ]
};

const listSchema = {
  type: 'array',
  items: { "$ref": "#/$defs/feature" }
};

// TODO: schemaize 0-9 constraints for peeks
const schemas = {
  prefs: prefsSchema,
  item: itemSchema,
  items: listSchema
};

// ui config for tweakpane filling
const ui = {
  // allow user to create new items
  allowNew: false,
  // fields that are view only
  disabled: ['title', 'address', 'settingsAddress'],
};

// defaults for user-modifiable preferences or data
const defaults = {
  prefs: {
    shortcutKey: 'Option+,',
    height: 600,
    width: 800,
    openDefaultFeature: 'Settings',
    showTrayIcon: true,
  },
  items: [
    { title: 'Cmd',
      address: 'features/cmd/background.html',
      settingsAddress: 'features/cmd/settings.html',
      enabled: false
    },
    { title: 'Groups',
      address: 'features/groups/background.html',
      settingsAddress: 'features/groups/settings.html',
      enabled: false
    },
    { title: 'Peeks',
      address: 'features/peeks/background.html',
      settingsAddress: 'features/peeks/settings.html',
      enabled: true
    },
    { title: 'Scripts',
      address: 'features/scripts/background.html',
      settingsAddress: 'features/scripts/settings.html',
      enabled: false
    },
    { title: 'Slides',
      address: 'features/slides/background.html',
      settingsAddress: 'features/slides/settings.html',
      enabled: true
    },
  ]
};

/*
export {
  labels,
  schemas,
  ui,
  defaults
};
*/
