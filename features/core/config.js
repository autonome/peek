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
    "showTrayIcon": {
      "description": "Whether to show app icon in system tray",
      "type": "boolean",
      "default": true
    },
    "showInDockAndSwitcher": {
      "description": "Whether to hide or show app in OS dock and app switcher",
      "type": "boolean",
      "default": false
    },
  },
  "required": [ "shortcutKey", "startupFeature", "enableTrayIcon", "showInDockAndSwitcher" ]
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
    "enabled": {
      "description": "Whether the feature is enabled or not - defaults to true",
      "type": "boolean",
      "default": true
    },
    "settingsAddress": {
      "description": "URL to load feature settings",
      "type": "string",
      "format": "uri"
    },
  },
  "required": [ "title", "address", "enabled", "settingsAddress" ]
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
  disabled: ['title', 'address' ],

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
    startupFeature: 'feature/core/settings',
    showTrayIcon: true,
    showInTrayAndSwitcher: true
  },
  items: [
    { title: 'Cmd',
      address: 'features/cmd/background.html',
      enabled: false,
      settingsAddress: 'features/cmd/settings.html',
    },
    { title: 'Groups',
      address: 'features/groups/background.html',
      enabled: false,
      settingsAddress: 'features/groups/settings.html',
    },
    { title: 'Peeks',
      address: 'features/peeks/background.html',
      enabled: false,
      settingsAddress: 'features/peeks/settings.html',
    },
    { title: 'Scripts',
      address: 'features/scripts/background.html',
      enabled: false,
      settingsAddress: 'features/scripts/settings.html',
    },
    { title: 'Slides',
      address: 'features/slides/background.html',
      enabled: false,
      settingsAddress: 'features/slides/settings.html',
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
