# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Peek is an Electron-based web user agent application that provides alternative ways to interact with web pages through keyboard shortcuts, modal windows, and background scripts. It's designed as a concept preview exploring task-aligned interfaces for the web, moving beyond traditional tabbed browsers.

## Key Commands

### Development
```bash
# Install dependencies
yarn install

# Run in development mode with hot reload
yarn debug

# Start the application normally
yarn start

# Package the application
yarn package

# Build distributable packages
yarn make

# Install packaged app to Applications folder (macOS)
yarn moveapp
```

### Testing & Linting
- No formal test suite configured yet
- Linting: Currently outputs "No linting configured" - needs implementation

## Architecture Overview

### Core Structure
The application uses a multi-window Electron architecture with:

1. **Main Process** (`index.js`):
   - Manages app lifecycle, windows, shortcuts, IPC communication
   - Implements custom `peek://` protocol for internal navigation
   - Handles profile management and data persistence
   - Manages window cache using Map with keys for window identification
   - Coordinates shortcut registrations from multiple sources via IPC
   - Core app loads from `peek://app/background.html` (configurable at index.js:42)

2. **Renderer Process** (`app/`):
   - Core app logic loads from `peek://app/background.html`
   - Feature modules: peeks, slides, scripts, cmd, groups (registered in `app/features.js`)
   - Settings UI using lil-gui library at `peek://app/settings/settings.html`
   - Window management abstraction in `app/windows.js`
   - Each feature exports: `id`, `labels`, `schemas`, `storageKeys`, `defaults`, `init()` method

3. **Preload Script** (`preload.js`):
   - Bridges main/renderer with secure API exposure via contextBridge
   - Provides `api.shortcuts.register(shortcut, callback)` for global hotkeys with auto-generated reply topics
   - Provides `api.window.open(address, params)` for window creation
   - Provides `api.publish(topic, msg, scope)` and `api.subscribe(topic, callback)` for pubsub messaging
   - All API calls automatically include source address for tracking

### Custom Protocol
- Uses `peek://` scheme for internal pages
- Cross-origin network access enabled for peek:// pages
- Special APIs available: window control, global hotkeys, pubsub messaging

### Features Architecture
Each feature (peeks/slides/scripts/cmd/groups) follows this pattern:
- `index.js`: Main feature logic with init/uninit lifecycle
- `config.js`: Feature configuration and defaults
- Features register shortcuts and manage their own windows
- Communication via pubsub messaging system

Features must export:
```javascript
export default {
  id,           // unique feature identifier
  labels,       // display names
  schemas,      // data schemas
  storageKeys,  // storage key constants
  defaults,     // default configuration
  init          // initialization function
}
```

All features are registered in `app/features.js` and accessed via feature collection object.

### Window Management
- Custom window API supporting modal, transparent, persistent windows
- Windows identified by keys for lifecycle management (e.g., `peek:${address}`)
- Modal windows use `type: 'panel'` to return focus to previous app on close
- Window parameters: `modal`, `keepLive`, `persistState`, `transparent`, `height`, `width`, `key`
- Windows cached in Map for reuse when `keepLive: true`
- Two main methods: `windows.openModalWindow()` and `windows.createWindow()`
- "Escape IZUI" design - ESC key always returns to previous context

### Data Storage
- Profile-based data separation in `{userData}/{PROFILE}/` directory
- Chromium data stored at `{userData}/{PROFILE}/chromium/`
- Features use `openStore(id, defaults, clear)` utility from `app/utils.js`
- Settings stored in localStorage with custom store abstraction via `store.get()` and `store.set()`
- Profile determined by `PROFILE` env var (defaults to 'debug' in DEBUG mode, 'default' otherwise)

## Important Development Notes

### Security Considerations
- This is a concept preview, NOT production-ready
- No formal security audit performed
- Different security model than traditional browsers
- Be cautious with cross-origin access and custom APIs

### Window Features
- Windows can be: modal, transparent, persistent, chromeless
- Global shortcuts use Alt/Opt + keys (0-9, arrows)
- ESC key or blur closes modal windows
- Cmd/Ctrl+W also closes windows

### Feature Lifecycle
When implementing or modifying features:
1. Features must implement init() and uninit() methods
2. Register shortcuts through `api.shortcuts.register(shortcut, callback)`
3. Track and clean up shortcuts on uninit with `api.shortcuts.unregister(shortcut)`
4. Use `windows.openModalWindow(address, params)` or `windows.createWindow(address, params)` for window management
5. Communicate via `api.publish(topic, msg, scope)` and `api.subscribe(topic, callback)` for cross-feature messaging
6. Use `openStore(id, defaults, clear)` for feature-specific storage
7. Features check if items are enabled before registering shortcuts (see `app/peeks/index.js` for example)

### Code Style
- ES6 modules throughout (type: "module" in package.json)
- Async/await preferred over callbacks
- Console logging for debugging (controlled by DEBUG env var)
- No TypeScript, pure JavaScript
- Uses `nodemon` for hot reload during development
- DevTools configurable via `openDevTools` and `detachedDevTools` window parameters

## Current Development Focus

From TODO.md, key areas being worked on:
- Feature lifecycle management (load/unload/reload)
- Shortcut lifecycle improvements
- Window management refinements
- Making features properly clean up resources

## Common Pitfalls to Avoid

1. Don't use relative paths in peek:// URLs - use absolute paths
2. Remember to unregister shortcuts when features unload via `api.shortcuts.unregister()`
3. Windows opened by features should be tracked and closed on unload
4. The app can run with different profiles via PROFILE env var (e.g., `PROFILE=myprofile yarn start`)
5. Debug mode enabled via DEBUG=1 environment variable
6. Modal windows require both `modal: true` and `type: 'panel'` to properly return focus
7. Window keys must be unique - use pattern like `peek:${address}` to avoid collisions
8. Check if items are enabled (`item.enabled == true`) before registering shortcuts
9. IPC messages auto-attach source address - don't manually add source tracking

## Git Commit Policy

- User (dietrich ayala) is sole author of all commits
- Do not add co-author lines or "Generated with Claude" to commit messages
- Do not commit changes - leave commits to the user