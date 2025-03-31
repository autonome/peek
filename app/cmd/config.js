const id = 'cee1225d-40ac-41e5-a34c-e2edba69d599';

const labels = {
  name: 'Cmd',
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

const schemas = {
  prefs: prefsSchema,
};

const storageKeys = {
  PREFS: 'prefs',
};

const defaults = {
  prefs: {
    shortcutKey: 'Control+Space'
  },
};

export {
  id,
  labels,
  schemas,
  storageKeys,
  defaults
};
