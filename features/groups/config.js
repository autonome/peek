const id = 'features/groups';
const guid = '82de735f-a4b7-4fe6-a458-ec29939ae00d';

const labels = {
  featureType: 'groups',
  featureDisplay: 'Groups',
  prefs: {
    shortcutKey: 'Groups shortcut',
  }
};

const prefsSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.groups.prefs.schema.json",
  "title": "Groups preferences",
  "description": "Peek app Groups user preferences",
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

const schemas = {
  prefs: prefsSchema,
};

const storageKeys = {
  PREFS: 'prefs',
};

const defaults = {
  prefs: {
    shortcutKey: 'Option+g'
  },
};

export {
  id,
  guid,
  labels,
  schemas,
  storageKeys,
  defaults
};
