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

# Server (webhook API for mobile sync)
yarn server:install       # Install server dependencies
yarn server:start         # Run production server
yarn server:dev           # Run with hot reload
yarn server:test          # Run server tests
yarn server:healthcheck   # Verify server starts
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
├── electron/          # Electron desktop backend (current primary)
│   ├── datastore.ts   # SQLite via better-sqlite3
│   ├── ipc.ts         # IPC handlers
│   └── protocol.ts    # peek:// protocol handler
├── tauri/             # Tauri desktop backend (Rust)
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── lib.rs          # App setup
│   │   │   ├── datastore.rs    # SQLite via rusqlite
│   │   │   └── commands/       # IPC command handlers
│   │   └── tests/smoke.rs      # Rust smoke tests
│   └── preload.js              # Peek API implementation (Tauri)
├── tauri-mobile/      # Tauri mobile app (iOS/Android)
│   ├── src/           # React frontend
│   └── src-tauri/     # Rust backend
└── server/            # Webhook API server for mobile sync
    ├── index.js       # Hono HTTP server
    ├── db.js          # SQLite via better-sqlite3
    └── users.js       # Multi-user API key auth
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

### Quick Start (One Command)

The easiest way to set up mobile development with sync testing:

```bash
cd backend/tauri-mobile

# First time: build both debug and release Rust libraries
npm run build                    # Build frontend
cd src-tauri
cargo build --target aarch64-apple-ios-sim      # Debug (simulator)
cargo build --target aarch64-apple-ios --release # Release (device)
cd ..

# Start everything (servers, configure iOS, seed test data, open Xcode)
npm run dev:ios
```

`npm run dev:ios` does all of this automatically:
1. Resets server data for a clean slate
2. Starts backend server on a random port (10000-19999)
3. Starts frontend dev server on port 1420
4. Configures iOS simulator with server URL and API key
5. Copies both debug and release Rust libraries
6. Opens Xcode
7. Seeds test data (3 items on server, 3 on iOS)

### Available npm Scripts

```bash
# Development
npm run dev:ios      # Full dev setup (servers + config + seed + Xcode)
npm run xcode        # Just copy libraries and open Xcode
npm run seed         # Seed test data (needs SERVER_URL and API_KEY env vars)
npm run reset:server # Delete server data directory

# Building
npm run build        # Build frontend (tsc + vite)
npm run build:ios    # Build frontend + debug Rust library
npm run build:ios:release  # Build frontend + release Rust library

# Testing
npm run test         # Run integration tests
npm run test:verbose # Run tests with verbose output
```

### iOS Build Process (Manual)

If you need to build manually instead of using `npm run dev:ios`:

```bash
# 1. Build frontend
cd backend/tauri-mobile && npm install && npm run build

# 2. Build debug library (for simulator)
cd src-tauri
cargo tauri build --target aarch64-apple-ios-sim --debug
mkdir -p gen/apple/Externals/arm64/Debug
cp target/aarch64-apple-ios-sim/debug/deps/libpeek_save_lib.a gen/apple/Externals/arm64/Debug/libapp.a

# 3. Build release library (for device)
cargo tauri build --target aarch64-apple-ios
mkdir -p gen/apple/Externals/arm64/Release
cp target/aarch64-apple-ios/release/deps/libpeek_save_lib.a gen/apple/Externals/arm64/Release/libapp.a

# 4. Create assets symlink (if missing)
ln -s ../../../dist gen/apple/assets

# 5. Open Xcode and build from GUI
open gen/apple/peek-save.xcodeproj
```

### Testing Bidirectional Sync

After running `npm run dev:ios`, test data is automatically seeded:

**Server has 3 items:**
- URL: https://github.com/from-server (tags: server, github)
- URL: https://example.com/from-server-1 (tags: server, test)
- Text: "This is a text note from the server" (tags: server, note)

**iOS Simulator has 3 items:**
- URL: https://mobile-only-1.example.com (tags: mobile, local)
- URL: https://mobile-news.example.com (tags: local)
- Text: "This text was created on mobile only" (tags: mobile)

**To test:**
1. Build and run in Xcode (Cmd+R)
2. Go to Settings in the app
3. Settings should already be configured (server URL and API key)
4. Tap **Sync All** to pull and push
5. After sync, both server and iOS should have 6 items

**Gotchas:**
- The `gen/apple/assets` symlink must exist or Xcode fails with "No such file or directory"
- Debug scheme = simulator, Release scheme = device
- If Rust code changes, rebuild the library and copy again
- The "Build Rust Code" pre-build script in Xcode can hang indefinitely - pre-building avoids this
- iOS simulator can't reach `localhost` - use Mac's IP address (dev:ios handles this automatically)

## Server Backend (Webhook API)

The server backend (`backend/server/`) is a remote HTTP API for syncing data from the mobile app. It's separate from the desktop backends - it doesn't implement the Peek API, it's a standalone Node.js server.

### Server Commands
```bash
# From project root
yarn server:install      # Install dependencies (first time)
yarn server:start        # Run production server (port 3000)
yarn server:dev          # Run with hot reload
yarn server:test         # Run unit tests (92 tests)
yarn server:healthcheck  # Verify server starts and responds

# From backend/server/
npm install
npm start
npm run dev
npm test
npm run test:api:local   # Test against local server (needs PEEK_LOCAL_KEY)
npm run test:api:prod    # Test against production (needs PEEK_PROD_KEY, PEEK_PROD_URL)
```

### Server Architecture
- **Hono** - Lightweight HTTP framework (like Express but faster)
- **better-sqlite3** - SQLite database (same as Electron backend)
- **Multi-user** - Each user gets isolated database in `./data/{userId}/`
- **API key auth** - Bearer token authentication, keys hashed with SHA-256

### Server API Endpoints
All endpoints except `/` require `Authorization: Bearer <api_key>` header.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check (public) |
| `/webhook` | POST | Receive items from mobile (`{ urls, texts, tagsets }`) |
| `/urls` | GET | List saved URLs |
| `/urls/:id` | DELETE | Delete URL |
| `/urls/:id/tags` | PATCH | Update URL tags |
| `/texts` | GET/POST | List or create texts |
| `/tagsets` | GET/POST | List or create tagsets |
| `/images` | GET/POST | List or upload images |
| `/images/:id` | GET/DELETE | Get or delete image |
| `/items` | GET/POST | Unified endpoint (filter with `?type=`) |
| `/tags` | GET | List tags by frecency |

### Server Deployment (Railway)

> **For the comprehensive deployment guide**, see the "Railway Deployment (Peek Server)" section in `CLAUDE.md`. This includes step-by-step workflow, user management, production testing, and troubleshooting.

The server is configured for Railway deployment.

**Initial Setup:**
1. Connect Railway to `backend/server/` subdirectory
2. Attach a persistent volume, set `DATA_DIR` env var to mount path
3. Create users via the `users.js` module

**Deploying Updates:**
```bash
# Link to project (one-time, from backend/server/)
railway link -p <project-name> -s <service-name> -e production

# Always run tests first
npm test

# Deploy
railway up -d

# Check logs
railway logs -n 50

# Health check
curl https://peek-node.up.railway.app/
```

**Deployment Order (Server + Mobile):**
1. **Server first** - stateless, has auto-migrations that run on first request
2. **Mobile second** - works offline, adapts to server changes
3. One-way sync only: mobile → server (no pull/download sync yet)

**Migration Gotcha:**
When adding database columns via migration, ensure indexes on those columns are created AFTER the column migration runs, not in the initial CREATE TABLE statement.

### Server Database Schema
Different from desktop datastore - optimized for mobile sync:
- `items` - Unified table (type: url/text/tagset/image)
- `tags` - Tag names with frecency scoring
- `item_tags` - Many-to-many junction
- `settings` - Key-value config

Images stored on disk in `./data/{userId}/images/` with content-hash deduplication.
