# Peek Extensions

Extensions are isolated modules that communicate with the core app via IPC and pubsub messaging.

## Hybrid Extension Architecture

Peek uses a **hybrid extension loading model** that balances memory efficiency with crash isolation:

### Built-in Extensions (Consolidated)
Built-in extensions (`cmd`, `groups`, `peeks`, `slides`) run as **iframes in a single extension host window**:
- Share a single Electron BrowserWindow process
- Memory efficient (~80-120MB vs ~200-400MB for separate windows)
- Origin isolation via unique URL hosts (`peek://cmd/`, `peek://groups/`, etc.)
- If one crashes, others in the same host are affected

### External Extensions (Separate Windows)
External extensions (including `example` and user-installed) run in **separate BrowserWindows**:
- Each has its own Electron process
- Crash isolation - one extension crashing doesn't affect others
- Uses `peek://ext/{id}/` URL scheme
- Better for untrusted or experimental extensions

```
┌─────────────────────────────────────────────────────────────┐
│ Extension Host Window (peek://app/extension-host.html)      │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │
│ │ <iframe>    │ │ <iframe>    │ │ <iframe>    │ │<iframe> │ │
│ │ peek://cmd/ │ │peek://groups│ │peek://peeks/│ │peek://  │ │
│ │             │ │             │ │             │ │slides/  │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────┐  ┌─────────────────┐
│ BrowserWindow   │  │ BrowserWindow   │
│ peek://ext/     │  │ peek://ext/     │
│ example/        │  │ user-ext/       │
│ (separate proc) │  │ (separate proc) │
└─────────────────┘  └─────────────────┘
```

### Origin Isolation

Each extension gets a unique origin regardless of loading mode:
- Built-in: `peek://cmd/background.html` → origin `peek://cmd`
- External: `peek://ext/example/background.html` → origin `peek://ext`

This prevents cross-extension access to localStorage, DOM, and globals.

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

Extensions access the Peek API via `window.app`. See `docs/api.md` for the complete reference.

Common APIs used by extensions:

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

### Load Order and the cmd Extension

The `cmd` extension is the command registry - all other extensions register their commands with it via `api.commands.register()`. Because of this dependency:

1. **cmd loads first** (sequential) - must be ready before other extensions register commands
2. **Other extensions load in parallel** - for faster startup
3. **cmd cannot be disabled** - it's required infrastructure, not optional functionality

This is enforced in `isBuiltinExtensionEnabled()` which always returns `true` for cmd.

### Hybrid Loading Process

Extensions are loaded in hybrid mode by `loadExtensions()` in `backend/electron/main.ts`:

1. **Create extension host window** - Single BrowserWindow at `peek://app/extension-host.html`
2. **Load built-in extensions as iframes** - `cmd`, `groups`, `peeks`, `slides` loaded via IPC into the host
3. **Load external extensions as separate windows** - Each gets its own BrowserWindow

```typescript
// Which extensions use consolidated mode (defined in main.ts)
const CONSOLIDATED_EXTENSION_IDS = ['cmd', 'groups', 'peeks', 'slides'];
```

### Built-in Extensions

Built-in extensions are registered in `index.js`:
```javascript
registerExtensionPath('example', path.join(__dirname, 'extensions', 'example'));
```

Built-in extensions that are NOT in `CONSOLIDATED_EXTENSION_IDS` (like `example`) are treated as external and get separate windows. This is intentional - it exercises external extension code paths during development.

### External Extensions

External extensions are:
1. Added via Settings UI (stored in datastore `extensions` table)
2. Loaded on startup if `enabled === 1` and have a valid `path`
3. Always run in separate BrowserWindows for crash isolation

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
