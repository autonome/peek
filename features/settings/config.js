
const labels = {
  featureType: 'settings',
  featureDisplay: 'Settings',
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

// TODO: schemaize 0-9 constraints for peeks
const schemas = {
  prefs: prefsSchema,
};

// ui config for tweakpane filling
const ui = {
  // allow user to create new items
  allowNew: false,
  // fields that are view only
  disabled: [],
};

// defaults for user-modifiable preferences or data
const defaults = {
  prefs: {
    shortcutKey: 'Option+,',
    height: 600,
    width: 800,
  }
};

/*
export {
  labels,
  schemas,
  ui,
  defaults
};
*/

