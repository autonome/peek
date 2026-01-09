# Peek Extensions

Extensions are isolated modules that run in their own BrowserWindow processes and communicate with the core app via IPC and pubsub messaging.

## Extension Structure

Each extension lives in its own directory under `extensions/`:

```
extensions/
  example/
    manifest.json           # Extension metadata
    settings-schema.json    # Settings UI schema (optional)
    background.html         # Entry point (loads background.js)
    background.js           # Main extension logic
    *.html, *.js, *.css     # Additional UI files
```

### manifest.json

Required fields:
```json
{
  "id": "example",
  "shortname": "example",
  "name": "Example Extension",
  "description": "What this extension does",
  "version": "1.0.0",
  "background": "background.html"
}
```

Optional fields:
```json
{
  "builtin": true,
  "settingsSchema": "./settings-schema.json"
}
```

### settings-schema.json

Defines the settings UI for the extension. Used by Settings to render configuration forms.

```json
{
  "prefs": {
    "type": "object",
    "properties": {
      "greeting": {
        "type": "string",
        "description": "Custom greeting message",
        "default": "Hello World"
      }
    }
  },
  "storageKeys": {
    "PREFS": "prefs"
  },
  "defaults": {
    "prefs": {
      "greeting": "Hello World"
    }
  }
}
```

For extensions with list-based settings (like peeks/slides), add an `item` schema:
```json
{
  "prefs": { ... },
  "item": {
    "type": "object",
    "properties": {
      "title": { "type": "string", "title": "Title" },
      "enabled": { "type": "boolean", "title": "Enabled" }
    }
  },
  "storageKeys": {
    "PREFS": "prefs",
    "ITEMS": "items"
  },
  "defaults": {
    "prefs": { ... },
    "items": []
  }
}
```

### background.html

Entry point that loads the extension as an ES module:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>My Extension</title>
</head>
<body>
<script type="module">
  import extension from './background.js';

  const api = window.app;
  const extId = extension.id;

  console.log(`[ext:${extId}] background.html loaded`);

  // Signal ready to main process
  api.publish('ext:ready', {
    id: extId,
    manifest: {
      id: extension.id,
      labels: extension.labels,
      version: '1.0.0'
    }
  }, api.scopes.SYSTEM);

  // Initialize extension
  if (extension.init) {
    console.log(`[ext:${extId}] calling init()`);
    extension.init();
  }

  // Handle shutdown
  api.subscribe('app:shutdown', () => {
    if (extension.uninit) extension.uninit();
  }, api.scopes.SYSTEM);

  api.subscribe(`ext:${extId}:shutdown`, () => {
    if (extension.uninit) extension.uninit();
  }, api.scopes.SYSTEM);
</script>
</body>
</html>
```

### background.js

Main extension logic as an ES module:

```javascript
const api = window.app;

const extension = {
  id: 'example',
  labels: {
    name: 'Example'
  },

  init() {
    console.log('[example] init');

    // Register commands
    api.commands.register({
      name: 'my-command',
      description: 'Does something',
      execute: () => {
        console.log('Command executed!');
      }
    });

    // Register shortcuts
    api.shortcuts.register('Option+x', () => {
      console.log('Shortcut triggered!');
    });

    // Subscribe to events
    api.subscribe('some:event', (msg) => {
      console.log('Event received:', msg);
    }, api.scopes.GLOBAL);
  },

  uninit() {
    console.log('[example] uninit');
    api.commands.unregister('my-command');
    api.shortcuts.unregister('Option+x');
  }
};

export default extension;
```

## Extension API

Extensions access the API via `window.app`:

### Commands
```javascript
api.commands.register({ name, description, execute })
api.commands.unregister(name)
```

### Shortcuts
```javascript
api.shortcuts.register(shortcut, callback)  // e.g., 'Option+1'
api.shortcuts.unregister(shortcut)
```

### Pubsub Messaging
```javascript
api.publish(topic, data, scope)
api.subscribe(topic, callback, scope)

// Scopes
api.scopes.SELF    // Only this window
api.scopes.SYSTEM  // System-level events
api.scopes.GLOBAL  // All windows
```

### Windows
```javascript
api.window.open(url, options)
// Options: modal, keepLive, transparent, height, width, key
```

### Datastore
```javascript
await api.datastore.getRow(table, id)
await api.datastore.setRow(table, id, data)
await api.datastore.deleteRow(table, id)
await api.datastore.getTable(table)
```

### Extension Settings
```javascript
await api.extensions.getSettings(extId)
await api.extensions.setSettings(extId, key, value)
```

## Extension Loading

### Built-in Extensions

Built-in extensions are registered in `index.js`:
```javascript
registerExtensionPath('example', path.join(__dirname, 'extensions', 'example'));
```

And listed in `loadEnabledExtensions()`:
```javascript
const builtinExtensions = ['groups', 'peeks', 'slides'];
```

### External Extensions

External extensions are:
1. Added via Settings UI (stored in datastore `extensions` table)
2. Loaded on startup if `enabled === 1` and have a valid `path`

## Settings Integration

Extensions with `settingsSchema` in their manifest automatically get a settings section in the Settings UI. The schema is loaded at runtime when the extension window is created.

Settings are stored in the `extension_settings` datastore table with:
- `extensionId`: The extension's ID
- `key`: Setting key (e.g., 'prefs', 'items')
- `value`: JSON-encoded setting value

Extensions can listen for settings changes:
```javascript
api.subscribe(`${extId}:settings-changed`, (msg) => {
  // Reload configuration
}, api.scopes.GLOBAL);
```

## Lifecycle Events

- `ext:ready` - Published when extension is initialized
- `ext:all-loaded` - Published when all extensions finish loading
- `app:shutdown` - Sent before app closes
- `ext:{id}:shutdown` - Sent when specific extension is being unloaded
- `{extId}:settings-changed` - Sent when extension settings are modified

## Debugging

Console logs from extensions are forwarded to stdout with prefix `[ext:{id}]`.

Run with `DEBUG=1 yarn start` for verbose logging.
