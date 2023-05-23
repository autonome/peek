const id = 'features/core';

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
    "startupFeature": {
      "description": "Feature to load at app startup",
      "type": "string",
      "default": "Settings"
    },
    "enableTrayIcon": {
      "description": "Whether to show app icon in system tray",
      "type": "boolean",
      "default": true
    },
  },
  "required": [ "shortcutKey", "startupFeature", "enableTrayIcon" ]
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
  features: { "$ref": "#/$defs/feature" }
};

const schemas = {
  prefs: prefsSchema,
  item: itemSchema,
  items: listSchema
};

// ui config for tweakpane filling
// TODO: this needs to be per section
// or integrated some other way entirely, kind of a mess
// 
// gotta think about much more complex objects
// and also multiple types of items/lists
const ui = {
  // allow user to create new items
  allowNew: false,

  // fields that are view only
  disabled: ['title', 'address', 'settingsAddress'],

  // fields to make links
  linkify: [
    { field: 'settingsAddress',
      title: 'Settings'
    }
  ],
};

// defaults for user-modifiable preferences or data
const defaults = {
  prefs: {
    shortcutKey: 'Option+,',
    height: 600,
    width: 800,
    startupFeature: 'Settings',
    enableTrayIcon: true
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
      enabled: false
    },
    { title: 'Scripts',
      address: 'features/scripts/background.html',
      settingsAddress: 'features/scripts/settings.html',
      enabled: false
    },
    { title: 'Slides',
      address: 'features/slides/background.html',
      settingsAddress: 'features/slides/settings.html',
      enabled: false
    }
  ]
};

export {
  id,
  labels,
  schemas,
  ui,
  defaults
};
