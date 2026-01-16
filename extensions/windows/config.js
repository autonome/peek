const id = 'windows';

const labels = {
  name: 'Windows',
  prefs: {
    shortcutKey: 'Windows shortcut',
  }
};

const prefsSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.windows.prefs.schema.json",
  "title": "Windows preferences",
  "description": "Peek app Windows user preferences",
  "type": "object",
  "properties": {
    "shortcutKey": {
      "description": "Global OS hotkey to open Windows",
      "type": "string",
      "default": "Option+w"
    },
  },
  "required": ["shortcutKey"]
};

const schemas = {
  prefs: prefsSchema,
};

const storageKeys = {
  PREFS: 'prefs',
};

const defaults = {
  prefs: {
    shortcutKey: 'Option+w'
  },
};

export {
  id,
  labels,
  schemas,
  storageKeys,
  defaults
};
