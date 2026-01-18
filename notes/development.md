# Peek Development Guide

## Project Overview

Peek is a web user agent application that provides alternative ways to interact with web pages through keyboard shortcuts, modal windows, and background scripts. It's designed as a concept preview exploring task-aligned interfaces for the web, moving beyond traditional tabbed browsers.

**Multi-Backend Architecture**: Peek supports multiple backends (Electron, Tauri) that can coexist and sync data. The `app/` directory is **backend-agnostic** and must not contain backend-specific code. Backend-specific code lives in `backend/{electron,tauri}/`.

## Key Commands

### Development
```bash
yarn install              # Install dependencies
yarn debug                # Run in development mode (with devtools)
yarn start                # Start normally
yarn package              # Package (output: out/mac-arm64/)
yarn package:install      # Package and install to /Applications (macOS)
yarn make                 # Build distributable packages
yarn npm audit            # Check for security vulnerabilities

# Tauri backend
yarn tauri:dev            # Run Tauri in development
yarn tauri:build          # Build Tauri for production
yarn tauri:check          # Check Tauri compiles
yarn tauri:test           # Run Tauri smoke tests (Rust)

# Tauri Mobile (iOS/Android)
yarn tauri:ios:dev        # Run on iOS simulator
yarn tauri:ios:build      # Build for iOS
yarn tauri:ios:xcode      # Open Xcode project
yarn tauri:android:dev    # Run on Android emulator
```

### Testing
```bash
yarn test                 # Run all tests (headless)
yarn test:electron        # Run Electron tests only
yarn test:visible         # Run with visible windows
yarn test:grep "pattern"  # Run specific test by name
```

**Testing Policy**: When fixing bugs or adding features, always add tests to cover the change. Tests live in `tests/desktop/smoke.spec.ts`.

## Architecture Overview

### Core Structure

1. **Main Process** (`index.js`):
   - Manages app lifecycle, windows, shortcuts, IPC communication
   - Implements custom `peek://` protocol for internal navigation
   - Handles profile management and data persistence
   - Hosts the TinyBase datastore with IPC handlers for renderer access

2. **Renderer Process** (`app/`):
   - Core app logic loads from `peek://app/background.html`
   - Extension loader at `app/extensions/loader.js`
   - Feature modules: scripts, cmd (registered in `app/features.js`)
   - Built-in extensions: groups, peeks, slides (in `./extensions/`)
   - Settings UI at `peek://app/settings/settings.html`

3. **Peek API** (`window.app`):
   - `api.window.*` for window management
   - `api.shortcuts.*` for hotkeys (local by default, `{ global: true }` for OS-level)
   - `api.datastore.*` for data persistence
   - `api.commands.*` for command palette integration
   - `api.theme.*` for theme management
   - `api.publish()`/`api.subscribe()` for cross-window messaging

### Backend Structure
```
backend/
├── electron/          # Electron backend (current primary)
│   ├── datastore.ts   # SQLite via better-sqlite3
│   ├── ipc.ts         # IPC handlers
│   └── protocol.ts    # peek:// protocol handler
└── tauri/             # Tauri backend (Rust)
    ├── src-tauri/
    │   ├── src/
    │   │   ├── lib.rs          # App setup
    │   │   ├── datastore.rs    # SQLite via rusqlite
    │   │   └── commands/       # IPC command handlers
    │   └── tests/smoke.rs      # Rust smoke tests
    └── preload.js              # Peek API implementation (Tauri)
```

**Data Sync**: Both backends use the same SQLite database path (`~/.config/Peek/{profile}/datastore.sqlite`). Only one backend should run at a time (file lock).

### Custom Protocol
- `peek://app/...` - Core application files (from `app/` directory)
- `peek://ext/{shortname}/...` - Extension files
- `peek://tauri/...` - Tauri backend files (only in Tauri)

### Extensions Architecture

Extensions run in isolated BrowserWindow processes at `peek://ext/{id}/background.html`.

```
extensions/
├── example/              # Hello world example
├── groups/
├── peeks/
└── slides/
    ├── manifest.json           # Extension metadata
    ├── settings-schema.json    # Settings UI schema (optional)
    ├── background.html         # Entry point
    └── background.js           # Main logic (ES module export)
```

**Background script pattern:**
```javascript
const api = window.app;

const extension = {
  id: 'example',
  labels: { name: 'Example' },

  init() {
    api.shortcuts.register('Option+x', handler, { global: true });
    api.commands.register({ name: 'my-cmd', description: '...', execute: fn });
  },

  uninit() {
    api.shortcuts.unregister('Option+x', { global: true });
    api.commands.unregister('my-cmd');
  }
};

export default extension;
```

### Window Management
- Windows identified by keys for lifecycle management (e.g., `peek:${address}`)
- Modal windows use `type: 'panel'` to return focus to previous app on close
- Parameters: `modal`, `keepLive`, `persistState`, `transparent`, `height`, `width`, `key`
- "Escape IZUI" design - ESC key always returns to previous context

### Data Storage

**Settings Storage (localStorage)**:
- Profile-based data separation in `{userData}/{PROFILE}/` directory
- Features use `openStore(id, defaults, clear)` utility from `app/utils.js`

**Datastore (TinyBase)**:
- In-memory TinyBase store for structured data
- Runs in main process with IPC handlers for renderer access
- Schema defined in `app/datastore/schema.js`
- Tables: `addresses`, `visits`, `content`, `tags`, `blobs`, `scripts_data`, `feeds`

**Profile Management**:
- Packaged app uses `default` profile
- Running from source (`yarn start`) uses `dev` profile
- `PROFILE` env var overrides automatic detection

## Common Pitfalls

1. Don't use relative paths in peek:// URLs - use absolute paths
2. Remember to unregister shortcuts when features unload
3. Windows opened by features should be tracked and closed on unload
4. Modal windows require both `modal: true` and `type: 'panel'`
5. Window keys must be unique - use pattern like `peek:${address}`
6. Check if items are enabled (`item.enabled == true`) before registering shortcuts
7. Datastore API returns `{ success, data }` - always check `result.success`
8. Pubsub subscriptions are keyed by source - same source subscribing twice overwrites
9. **Never put backend-specific code in `app/`**

## Code Style

- ES6 modules throughout (type: "module" in package.json)
- Async/await preferred over callbacks
- Console logging for debugging (controlled by DEBUG env var)
- No TypeScript in app/, pure JavaScript
- Uses `nodemon` for hot reload during development

## Security Notes

- This is a concept preview, NOT production-ready
- No formal security audit performed
- Different security model than traditional browsers
- Be cautious with cross-origin access and custom APIs

## Mobile Development (Tauri iOS/Android)

Mobile development uses the separate `peek-save` app in `backend/tauri-mobile/`.

**CRITICAL - Build with Xcode GUI for iOS:**
- NEVER run `xcodebuild` commands from terminal for final builds
- Use Xcode GUI (Product → Build, Product → Run) for reliable builds

**CRITICAL - Do NOT run `xcodegen generate`:**
- The Xcode project has custom settings that xcodegen overwrites
