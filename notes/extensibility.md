# Peek Extensibility Model

Balance minimal install/development/distribution barriers with web-level safety at runtime.

## Current Implementation

### Extension Structure

Extensions live in `./extensions/{name}/` with:

```
extensions/
├── groups/
│   ├── manifest.json      # Extension metadata
│   ├── background.js      # Main logic (ES module)
│   ├── config.js          # Configuration
│   ├── home.html          # UI pages
│   └── ...
├── peeks/
│   └── ...
└── slides/
    └── ...
```

### Manifest Format

```json
{
  "id": "groups",
  "shortname": "groups",
  "name": "Groups",
  "description": "Tag-based grouping of addresses",
  "version": "1.0.0",
  "background": "background.js",
  "builtin": true
}
```

**Required fields:**
- `id` - Unique extension identifier
- `shortname` - URL path segment (lowercase alphanumeric + hyphens)
- `name` - Display name
- `background` - Background script filename

**Optional fields:**
- `description` - Extension description
- `version` - Semver version string
- `builtin` - If true, has full API access (default: false)

### Extension URLs

Extensions are accessed via the `peek://ext/` protocol:

```
peek://ext/{shortname}/{file}
```

Examples:
- `peek://ext/groups/home.html`
- `peek://ext/peeks/settings.html`
- `peek://ext/slides/background.js`

**Reserved shortnames** (cannot be used):
- `app`, `ext`, `extensions`, `settings`, `system`

### Extension Loader

Located at `app/extensions/loader.js`, handles:

- **Loading**: Fetches manifest, validates, registers shortname, imports background script
- **Unloading**: Calls uninit(), unregisters shortname, removes from registry
- **Reloading**: Unload + load cycle
- **Conflict detection**: Rejects extensions with duplicate shortnames

Built-in extensions are registered in the loader:
```javascript
export const builtinExtensions = [
  { id: 'groups', path: 'peek://ext/groups', backgroundScript: 'background.js' },
  { id: 'peeks', path: 'peek://ext/peeks', backgroundScript: 'background.js' },
  { id: 'slides', path: 'peek://ext/slides', backgroundScript: 'background.js' }
];
```

### Permissions Model

**Coarse permission levels:**
- `builtin: true` → Full API access including extension management
- `builtin: false` → Restricted from `api.extensions` management APIs

**Permission check:** Only `peek://app/...` addresses can manage extensions.

### Extension Management API

```javascript
// List running extensions (no permission required)
const result = await api.extensions.list();
// { success: true, data: [{ id, shortname, manifest, ... }] }

// Get extension manifest (no permission required)
const result = await api.extensions.getManifest('groups');
// { success: true, data: { id, shortname, name, ... } }

// Load/unload/reload (permission required - core app only)
await api.extensions.load('groups');
await api.extensions.unload('groups');
await api.extensions.reload('groups');
```

### Background Script Pattern

```javascript
// extensions/myext/background.js
import { openStore } from 'peek://app/utils.js';
import appConfig from './config.js';

const api = window.app;
const { id, defaults, storageKeys } = appConfig;
const store = openStore(id, defaults);

const init = () => {
  // Register shortcuts, commands, subscriptions
  api.shortcuts.register('Option+x', handleShortcut, { global: true });
  api.commands.register({ name: 'my command', execute: handler });
};

const uninit = () => {
  // Clean up
  api.shortcuts.unregister('Option+x', { global: true });
  api.commands.unregister('my command');
};

export default { id, init, uninit };
```

---

## Design Goals

- Extensions are a folder with a manifest and web content files
- They're opened under the peek:// protocol, each in a web content process
- Their main window is hidden, like the Peek background content process
- Extensions are run directly from their local folder
- Extensions are managed in the settings app (add/remove, enable/disable)

Note: The implementation shifts logic into the background web app vs node.js space, enabling future non-Electron backends.

## Capabilities via Injected API

- Window management
- Datastore access
- Command registration
- Hotkey registration
- Pubsub messaging

## Command API

Extensions can register commands that appear in the cmd palette.

### Registration

```javascript
// Register a command
api.commands.register({
  name: 'my command',           // Searchable name (required)
  description: 'Description',   // Shown in palette (optional)
  execute: async (ctx) => {     // Handler function (required)
    // ctx contains: typed, name, params, search
    console.log('Command executed:', ctx);
  }
});

// Unregister when extension unloads
api.commands.unregister('my command');
```

### Context Object

The `execute` function receives a context object:

```javascript
{
  typed: 'my command foo bar',  // Full typed string
  name: 'my command',           // Matched command name
  params: ['foo', 'bar'],       // Parameters after command
  search: 'foo bar'             // Text after command (for search-style commands)
}
```

### Implementation Details

- Commands are registered via pubsub with GLOBAL scope (cross-window)
- Execute handlers are stored locally (functions can't cross IPC)
- The cmd background process maintains a registry of registered commands
- The cmd panel queries the registry when opened
- Execution requests are published back to the registering extension

### Example: Groups Extension

```javascript
const init = () => {
  api.commands.register({
    name: 'groups',
    description: 'Open the groups manager',
    execute: async (ctx) => {
      api.window.open('peek://ext/groups/home.html', { ... });
    }
  });
};

const uninit = () => {
  api.commands.unregister('groups');
};
```

Dev workflow:

- User can open/close devtools for a given extension (via a cmd)
- User can reload a given extension (via a cmd)
- Hot reloading using node fs watcher to watch folder for changes, and reload

Open questions, for later:

- Dirty writes - add ext or sys as source. also ensure no direct writes, only api adds
- Sharded space, in/outbox style too maybe
- Trade off exfiltration-proof-ness for sensitive access, eg history?
- How to provide authorship verification? regular website + sigs
- How to provide tamper detection?
- How to do extension-specific settings? Manifest link to bundled settings UI? Or a api for placement into Settings app?
- How to allow for maximal unloading vs always persistent
- How to do remixes, eg take verified extension X, copy and hack
- figure out in-extension settings vs jamming in global settings
- syncable settings (extension decides)

Mobile, for later:
- open web pages
- if calls a registration api, user can choose to add
- permissions
- expose peek api upon approval
- also, preverification via sync


