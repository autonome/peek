# Peek Backend Architecture

Peek supports multiple backend implementations that share the same renderer code (`app/`). This document describes the portability architecture.

## Design Principles

1. **Backend Abstraction**: The `app/` directory contains all renderer code and must work unchanged with any backend
2. **Shared API Contract**: All backends expose the same Peek API (`window.app`) - see `docs/PEEK-API.md`
3. **Shared Data**: Backends use the same SQLite schema and can share database files
4. **Profile Isolation**: Data is separated by profile (dev, default, etc.)

## Directory Structure

```
peek/
├── app/                    # Renderer code (backend-agnostic)
│   ├── background.html     # Main entry point
│   ├── index.js            # Core app logic
│   ├── windows.js          # Window management
│   └── ...
├── backend/
│   ├── electron/           # Electron desktop backend
│   │   ├── index.js        # Main process
│   │   ├── preload.js      # Peek API implementation (Electron)
│   │   ├── protocol.ts     # peek:// handler
│   │   └── datastore.ts    # SQLite operations
│   ├── tauri/              # Tauri desktop backend
│   │   ├── src-tauri/      # Rust backend
│   │   │   ├── src/
│   │   │   │   ├── lib.rs      # App setup
│   │   │   │   ├── protocol.rs # peek:// handler
│   │   │   │   ├── datastore.rs# SQLite operations
│   │   │   │   └── commands/   # IPC handlers
│   │   │   └── Cargo.toml
│   │   └── preload.js      # Peek API implementation (Tauri)
│   ├── tauri-mobile/       # Tauri mobile app (iOS/Android)
│   │   ├── src/            # React frontend
│   │   └── src-tauri/      # Rust backend
│   └── server/             # Webhook API server (Node.js/Hono)
│       ├── index.js        # HTTP server
│       ├── db.js           # SQLite operations
│       └── users.js        # Multi-user auth
└── extensions/             # Extension code (uses Peek API)
```

## Backend Responsibilities

Each backend must implement:

### 1. Custom Protocol (`peek://`)
- `peek://app/...` → Serve files from `app/` directory
- `peek://ext/{id}/...` → Serve extension files
- MIME type detection
- Path traversal protection

### 2. Window Management
- `window_open(source, url, options)` → Create new window
- `window_close(id)` → Close window
- `window_hide(id)` / `window_show(id)` → Toggle visibility
- `window_focus(id)` → Bring to front
- `window_list()` → List all windows

### 3. SQLite Datastore
All backends use the same schema (see `app/datastore/schema.js`):
- `addresses` - URIs and metadata
- `visits` - Navigation history
- `tags` - Tag definitions
- `address_tags` - Tag associations
- `extensions` - Extension registry
- `blobs` - Binary data storage

Database location: `{app_data}/{profile}/datastore.sqlite`

### 4. Peek API Injection
Inject the `window.app` API before any page scripts run. See `docs/PEEK-API.md` for the complete API reference.

## API Contract

All backends must expose the Peek API (`window.app`) with these core methods:

```javascript
window.app = {
  // Window management
  window: {
    open(url, options) → Promise<{success, id}>
    close(id?) → Promise<{success}>
    hide(id?) → Promise<{success}>
    show(id?) → Promise<{success}>
    focus(id?) → Promise<{success}>
    list() → Promise<{success, data: WindowInfo[]}>
  },

  // Datastore
  datastore: {
    addAddress(uri, options) → Promise<{success, data}>
    getAddress(id) → Promise<{success, data}>
    updateAddress(id, updates) → Promise<{success}>
    queryAddresses(filter) → Promise<{success, data}>
    addVisit(addressId, options) → Promise<{success, data}>
    queryVisits(filter) → Promise<{success, data}>
    getOrCreateTag(name) → Promise<{success, data}>
    tagAddress(addressId, tagId) → Promise<{success}>
    untagAddress(addressId, tagId) → Promise<{success}>
    getAddressTags(addressId) → Promise<{success, data}>
    getTable(tableName) → Promise<{success, data}>
    setRow(tableName, rowId, rowData) → Promise<{success}>
    getStats() → Promise<{success, data}>
  },

  // PubSub messaging
  publish(topic, msg, scope),
  subscribe(topic, callback, scope),

  // Shortcuts
  shortcuts: {
    register(shortcut, callback, options),
    unregister(shortcut, options)
  },

  // Commands (for cmd palette)
  commands: {
    register(command),
    unregister(name),
    getAll() → Promise<Command[]>
  },

  // Logging
  log(...args),

  // Constants
  debug: boolean,
  scopes: { SYSTEM, SELF, GLOBAL }
}
```

## Running Backends

### Electron
```bash
yarn start              # Normal mode
yarn debug              # With DevTools
PROFILE=test yarn start # Custom profile
```

### Tauri
```bash
cd backend/tauri/src-tauri
cargo run                    # Normal mode
HEADLESS=1 cargo run         # No visible windows (testing)
PROFILE=test cargo run       # Custom profile
PEEK_DEVTOOLS=1 cargo run    # Auto-open DevTools
```

Or use the helper script:
```bash
./scripts/tauri-run.sh 10           # Run headless for 10 seconds
./scripts/tauri-run.sh 10 --visible # Run with visible windows
./scripts/tauri-run.sh 0            # Run interactively
```

### Server (Webhook API)

The server backend is different from the desktop backends - it's a remote HTTP API for syncing data from the mobile app, not a local desktop application.

```bash
# From project root
yarn server:install     # Install dependencies (first time)
yarn server:start       # Run production server
yarn server:dev         # Run with hot reload
yarn server:test        # Run tests
yarn server:healthcheck # Verify server starts

# From backend/server/
npm install
npm start
npm run dev
npm test
```

See `backend/server/README.md` for full API documentation.

## Adding a New Backend

1. Create `backend/{name}/` directory
2. Implement custom protocol handler for `peek://`
3. Implement SQLite datastore with shared schema
4. Implement window management commands
5. Implement the Peek API (`window.app`) matching `docs/PEEK-API.md`
6. Inject the API before page scripts run

The renderer code (`app/`) should work without modification.

## Data Sync Strategy

Currently, backends share the same SQLite database file:
- Only one backend should run at a time
- SQLite WAL mode enables better concurrent read access
- Future: real-time sync via file watching or sync service
