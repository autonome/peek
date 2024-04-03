const id = 'features/core';
const guid = '8aadaae5-2594-4968-aba0-707f0d371cfb';

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
  "title": "Application Settings",
  "description": "Peek user preferences",
  "type": "object",
  "properties": {
    "shortcutKey": {
      "description": "App keyboard shortcut to load settings",
      "type": "string",
      "default": "CommandOrControl+Shift+,"
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

const featureSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.settings.feature.schema.json",
  "title": "Feature",
  "description": "Application feature",
  "type": "object",
  "properties": {
    "id": {
      "description": "Unique id of the feature",
      "type": "string"
    },
    "name": {
      "description": "Name of the feature",
      "type": "string"
    },
    "description": {
      "description": "Description of the feature",
      "type": "string"
    },
    "start_url": {
      "description": "Address to load the feature",
      "type": "string",
      "format": "uri"
    },
    "settings_url": {
      "description": "Address to load the feature's settings",
      "type": "string",
      "format": "uri"
    },
    "enabled": {
      "description": "Whether the feature is enabled or not.",
      "type": "boolean",
      "default": true
    },
  },
  "required": [ "id", "name", "description", "start_url", "enabled" ]
};

const featureListSchema = {
  "title": "Features",
  "type": 'array',
  "features": { "$ref": "#/$defs/feature" }
};

const schemas = {
  prefs: prefsSchema,
  feature: featureSchema,
  featureList: featureListSchema
};

const storageKeys = {
  PREFS: 'prefs',
  FEATURES: 'features',
};

// defaults for user-modifiable preferences or data
const defaults = {
  prefs: {
    shortcutKey: 'Option+,',
    height: 850,
    width: 800,
    startupFeature: 'feature/core/settings',
    showTrayIcon: true,
    showInTrayAndSwitcher: true
  },
  features: [
    { id: 'cee1225d-40ac-41e5-a34c-e2edba69d599',
      name: 'Cmd',
      description: 'Command bar',
      start_url: 'features/cmd/background.html',
      enabled: false,
      settings_url: 'features/cmd/settings.html',
    },
    { id: '82de735f-a4b7-4fe6-a458-ec29939ae00d',
      name: 'Groups',
      description: 'View your web in groups',
      start_url: 'features/groups/background.html',
      enabled: false,
      settings_url: 'features/groups/settings.html',
    },
    { id: 'ef3bd271-d408-421f-9338-47b615571e43',
      name: 'Peeks',
      description: 'Peek at pages in a transient popup using keyboard shortcuts',
      start_url: 'features/peeks/background.html',
      enabled: false,
      settings_url: 'features/peeks/settings.html',
    },
    { id: '30c25027-d367-4595-b37f-9db3de853c37',
      name: 'Scripts',
      description: 'Create, manage and run content scripts',
      start_url: 'features/scripts/background.html',
      enabled: false,
      settings_url: 'features/scripts/settings.html',
    },
    { id: '434108f3-18a6-437a-b507-2f998f693bb2',
      name: 'Slides',
      description: 'Open specific pages as side/top/bottom bars',
      start_url: 'features/slides/background.html',
      enabled: false,
      settings_url: 'features/slides/settings.html',
    }
  ]
};

export {
  id,
  guid,
  labels,
  schemas,
  storageKeys,
  defaults
};
