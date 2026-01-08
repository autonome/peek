const id = '8aadaae5-2594-4968-aba0-707f0d371cfb';

const labels = {
  name: 'Settings',
  prefs: {
    shortcutKey: 'Settings shortcut',
  }
};

const prefsSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.prefs.schema.json",
  "title": "Global Settings",
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
      "description": "Address of what to load at startup, if anything",
      "type": "string",
      "default": "Settings"
    },
    "showTrayIcon": {
      "description": "Whether to show app icon in system tray",
      "type": "boolean",
      "default": true
    },
    "showInDockAndSwitcher": {
      "description": "Always show in dock/app switcher, even when no windows are open. When disabled, dock icon only appears while windows are visible.",
      "type": "boolean",
      "default": false
    },
    "quitShortcut": {
      "description": "Global keyboard shortcut to quit the app",
      "type": "string",
      "default": "Option+q"
    },
  },
  "required": [ "shortcutKey", "startupFeature", "enableTrayIcon", "showInDockAndSwitcher", "quitShortcut" ]
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
  ITEMS: 'items',
};

// defaults for user-modifiable preferences or data
const defaults = {
  prefs: {
    shortcutKey: 'Option+,',
    quitShortcut: 'Option+q',
    height: 850,
    width: 800,
    startupFeature: 'peek://app/settings/settings.html',
    showTrayIcon: true,
    showInDockAndSwitcher: true
  },
  items: [
    { id: 'cee1225d-40ac-41e5-a34c-e2edba69d599',
      name: 'Cmd',
      description: 'Command entry',
      start_url: 'peek://app/cmd/background.html',
      enabled: true,
      settings_url: 'peek://app/cmd/settings.html',
    },
    { id: '82de735f-a4b7-4fe6-a458-ec29939ae00d',
      name: 'Groups',
      description: 'View your web in groups',
      start_url: 'peek://ext/groups/background.js',  // Extension
      enabled: false,
      settings_url: 'peek://ext/groups/settings.html',
      extension: true,  // Mark as extension-based feature
    },
    { id: 'ef3bd271-d408-421f-9338-47b615571e43',
      name: 'Peeks',
      description: 'Peek at pages in a transient popup using keyboard shortcuts',
      start_url: 'peek://ext/peeks/background.js',  // Extension
      enabled: false,
      settings_url: 'peek://app/peeks/settings.html',
      extension: true,  // Mark as extension-based feature
    },
    { id: '30c25027-d367-4595-b37f-9db3de853c37',
      name: 'Scripts',
      description: 'Create, manage and run content scripts',
      start_url: 'peek://app/scripts/background.html',
      enabled: false,
      settings_url: 'peek://app/scripts/settings.html',
    },
    { id: '434108f3-18a6-437a-b507-2f998f693bb2',
      name: 'Slides',
      description: 'Open web pages as side/top/bottom bars',
      start_url: 'peek://ext/slides/background.js',  // Extension
      enabled: false,
      settings_url: 'peek://app/slides/settings.html',
      extension: true,  // Mark as extension-based feature
    }
  ]
};

export default {
  id,
  labels,
  schemas,
  storageKeys,
  defaults
};
