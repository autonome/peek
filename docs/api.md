# Peek API Reference

The Peek API (`window.app`) is the unified interface for all `peek://` pages to interact with the system. It provides window management, data storage, messaging, shortcuts, theming, and more.

This API is implemented by both the Electron and Tauri backends, ensuring frontend code works unchanged across backends.

## Table of Contents

- [Context Detection](#context-detection)
- [Window Management](#window-management)
- [Datastore](#datastore)
- [PubSub Messaging](#pubsub-messaging)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Commands (Command Palette)](#commands-command-palette)
- [Theme](#theme)
- [Escape Handling](#escape-handling)
- [Logging](#logging)
- [Debug Mode](#debug-mode)
- [App Control](#app-control)
- [Extensions API](#extensions-api)
- [Settings API](#settings-api)
- [Response Format](#response-format)

---

## Context Detection

```javascript
// Check if running in peek:// context
if (window.app) {
  // API available
}

// Source address of current page
const source = window.location.toString();

// Context types:
// - peek://app/...       Core application pages
// - peek://ext/{id}/...  Extension pages
```

---

## Window Management

### `window.app.window.open(url, options)`

Open a new window.

```javascript
const result = await window.app.window.open('peek://app/settings/settings.html', {
  key: 'settings',           // Reuse window with same key
  width: 900,                // Window width
  height: 650,               // Window height
  x: 100,                    // X position
  y: 100,                    // Y position
  title: 'Settings',         // Window title
  modal: true,               // Modal behavior
  transparent: false,        // Transparent background
  decorations: true,         // Window decorations
  alwaysOnTop: false,        // Stay on top
  visible: true,             // Initially visible
  resizable: true,           // Allow resize
  draggable: true,           // Allow click-and-hold drag (default: true)
  keepLive: false,           // Keep window alive when closed
  escapeMode: 'close'        // ESC key behavior: 'close', 'navigate', or 'auto'
});
// Returns: { success: true, id: 'window_label' }
```

### `window.app.window.close(id?)`

Close a window. If no id, closes current window.

```javascript
await window.app.window.close();              // Close current
await window.app.window.close('settings');    // Close by id
await window.app.window.close({ id: 'settings' }); // Object form
```

### `window.app.window.hide(id?)` / `window.app.window.show(id?)`

Toggle window visibility.

```javascript
await window.app.window.hide('main');
await window.app.window.show('main');
```

### `window.app.window.focus(id?)`

Bring window to front and focus it.

```javascript
await window.app.window.focus('settings');
```

### `window.app.window.list()`

List all open windows.

```javascript
const result = await window.app.window.list();
// Returns: {
//   success: true,
//   data: [{
//     id: 'main',
//     label: 'main',
//     url: 'peek://app/background.html',
//     source: 'peek://app/background.html',
//     visible: false,
//     focused: false
//   }, ...]
// }
```

### `window.app.window.exists(id)`

Check if a window exists.

```javascript
const result = await window.app.window.exists('settings');
// Returns: { success: true, data: true }
```

### `window.app.invoke('window-animate', options)`

Animate a window's position and/or size.

```javascript
// Animate to new position
await window.app.invoke('window-animate', {
  id: windowId,                    // Window ID (optional, defaults to current)
  to: { x: 100, y: 100 },          // Target bounds (required)
  duration: 150                    // Animation duration in ms (default: 150)
});

// Animate from specific position
await window.app.invoke('window-animate', {
  id: windowId,
  from: { x: 0, y: -600 },         // Starting bounds (optional, defaults to current)
  to: { x: 0, y: 0, width: 800, height: 600 },
  duration: 200
});
// Uses easeOutQuad easing for smooth deceleration
```

### `window.app.invoke('window-set-always-on-top', options)`

Pin a window to stay on top of other windows.

```javascript
// Pin with normal level
await window.app.invoke('window-set-always-on-top', {
  id: windowId,
  value: true
});

// Pin above other app windows (macOS)
await window.app.invoke('window-set-always-on-top', {
  id: windowId,
  value: true,
  level: 'floating'
});

// Pin above all windows (macOS)
await window.app.invoke('window-set-always-on-top', {
  id: windowId,
  value: true,
  level: 'screen-saver'
});

// Unpin
await window.app.invoke('window-set-always-on-top', {
  id: windowId,
  value: false
});
```

---

## Datastore

All datastore methods return `{ success: boolean, data?: any, error?: string }`.

### Addresses

```javascript
// Add a new address
const result = await window.app.datastore.addAddress('https://example.com', {
  title: 'Example',
  favicon: 'https://example.com/favicon.ico'
});
// Returns: { success: true, data: { id: 'addr_123', ... } }

// Get address by ID
const addr = await window.app.datastore.getAddress('addr_123');

// Update address
await window.app.datastore.updateAddress('addr_123', {
  title: 'New Title'
});

// Query addresses
const results = await window.app.datastore.queryAddresses({
  uri: 'example.com',  // Partial match
  limit: 10,
  offset: 0
});
```

### Visits

```javascript
// Add a visit
await window.app.datastore.addVisit('addr_123', {
  referrer: 'addr_456'
});

// Query visits
const visits = await window.app.datastore.queryVisits({
  addressId: 'addr_123',
  limit: 50
});
```

### Tags

```javascript
// Get or create a tag
const tag = await window.app.datastore.getOrCreateTag('important');
// Returns: { success: true, data: { id: 'tag_123', name: 'important' } }

// Tag an address
await window.app.datastore.tagAddress('addr_123', 'tag_123');

// Untag an address
await window.app.datastore.untagAddress('addr_123', 'tag_123');

// Get tags for an address
const tags = await window.app.datastore.getAddressTags('addr_123');
```

### Generic Table Access

```javascript
// Get all rows from a table
const table = await window.app.datastore.getTable('extensions');
// Returns: { success: true, data: { row_id: { ... }, ... } }

// Set a row
await window.app.datastore.setRow('extensions', 'my-ext', {
  name: 'My Extension',
  enabled: true
});
```

### Statistics

```javascript
const stats = await window.app.datastore.getStats();
// Returns: { success: true, data: {
//   addresses: 150,
//   visits: 1200,
//   tags: 25
// }}
```

---

## PubSub Messaging

Cross-window communication via publish/subscribe.

### Scopes

```javascript
window.app.scopes = {
  SYSTEM: 1,  // System messages
  SELF: 2,    // Same source only
  GLOBAL: 3   // All windows
};
```

### `window.app.publish(topic, message, scope)`

Publish a message.

```javascript
window.app.publish('settings:changed', { theme: 'dark' }, window.app.scopes.GLOBAL);
```

### `window.app.subscribe(topic, callback, scope)`

Subscribe to messages.

```javascript
window.app.subscribe('settings:changed', (msg) => {
  console.log('Settings changed:', msg.data);
}, window.app.scopes.GLOBAL);
```

---

## Keyboard Shortcuts

### `window.app.shortcuts.register(shortcut, callback, options)`

Register a keyboard shortcut.

```javascript
// Local shortcut (only when app focused)
window.app.shortcuts.register('Command+K', () => {
  console.log('Command+K pressed');
});

// Global shortcut (works even when app not focused)
window.app.shortcuts.register('Option+Space', () => {
  console.log('Global shortcut triggered');
}, { global: true });
```

**Shortcut format:**
- Modifiers: `Command`, `Control`, `Alt`, `Option`, `Shift`, `CommandOrControl`
- Keys: `A-Z`, `0-9`, `F1-F12`, `Space`, `Enter`, `Escape`, `ArrowUp`, etc.
- Examples: `Command+Shift+P`, `Alt+1`, `Option+ArrowDown`

### `window.app.shortcuts.unregister(shortcut, options)`

Unregister a shortcut.

```javascript
window.app.shortcuts.unregister('Command+K');
window.app.shortcuts.unregister('Option+Space', { global: true });
```

---

## Commands (Command Palette)

Register commands that appear in the command palette.

### `window.app.commands.register(command)`

```javascript
window.app.commands.register({
  name: 'my-extension:do-thing',
  description: 'Do the thing',
  execute: () => {
    console.log('Doing the thing');
  }
});
```

### `window.app.commands.unregister(name)`

```javascript
window.app.commands.unregister('my-extension:do-thing');
```

### `window.app.commands.getAll()`

```javascript
const commands = await window.app.commands.getAll();
```

---

## Theme

Manage application themes and color schemes.

### `window.app.theme.get()`

Get current theme state.

```javascript
const state = await window.app.theme.get();
// Returns: {
//   success: true,
//   data: {
//     themeId: 'peek',           // Active theme ID
//     colorScheme: 'system',     // User preference: 'system', 'light', 'dark'
//     isDark: true,              // Whether dark mode is active
//     effectiveScheme: 'dark'    // Resolved scheme after system preference
//   }
// }
```

### `window.app.theme.setTheme(themeId)`

Set the active theme.

```javascript
await window.app.theme.setTheme('peek');
// Broadcasts 'theme:themeChanged' event to all windows
```

### `window.app.theme.setColorScheme(scheme)`

Set color scheme preference.

```javascript
await window.app.theme.setColorScheme('dark');   // Force dark mode
await window.app.theme.setColorScheme('light');  // Force light mode
await window.app.theme.setColorScheme('system'); // Follow OS preference
// Broadcasts 'theme:changed' event to all windows
```

### `window.app.theme.list()`

List available themes.

```javascript
const result = await window.app.theme.list();
// Returns: {
//   success: true,
//   data: [
//     { id: 'basic', name: 'Basic', version: '1.0.0' },
//     { id: 'peek', name: 'Peek', version: '1.0.0' }
//   ]
// }
```

### Theme Events

Listen for theme changes:

```javascript
// Theme changed (different theme selected)
window.app.subscribe('theme:themeChanged', (msg) => {
  console.log('Theme changed to:', msg.themeId);
}, window.app.scopes.GLOBAL);

// Color scheme changed
window.app.subscribe('theme:changed', (msg) => {
  console.log('Color scheme changed to:', msg.colorScheme);
}, window.app.scopes.GLOBAL);
```

---

## Escape Handling

Handle the ESC key to prevent window from closing.

```javascript
window.app.escape.onEscape(() => {
  if (hasUnsavedChanges) {
    showConfirmDialog();
    return { handled: true };  // Prevent close
  }
  return { handled: false };   // Allow close
});
```

---

## Logging

Log messages to the backend console.

```javascript
window.app.log('Something happened', { detail: 'value' });
// Output in terminal: [peek://app/mypage.html] Something happened { detail: 'value' }
```

---

## Debug Mode

```javascript
if (window.app.debug) {
  console.log('Debug mode enabled');
}

// Debug levels
window.app.debugLevels = { BASIC: 1, FIRST_RUN: 2 };
window.app.debugLevel; // Current level
```

---

## App Control

Control application lifecycle.

### `window.app.quit()`

Quit the application.

```javascript
window.app.quit();
```

### `window.app.restart()`

Restart the application (relaunch and quit).

```javascript
window.app.restart();
```

---

## Extensions API

Only available in core app pages (`peek://app/...`).

### Hybrid Extension Architecture

Peek uses a hybrid extension loading model:

- **Built-in extensions** (`cmd`, `groups`, `peeks`, `slides`) run as iframes in a single extension host window for memory efficiency
- **External extensions** (user-installed) run in separate BrowserWindows for crash isolation

Both types are accessible via the same API - the loading mode is transparent to callers.

### URL Schemes

- Built-in consolidated: `peek://cmd/background.html`, `peek://groups/background.html`, etc.
- External: `peek://ext/{id}/background.html`

Each extension has a unique origin for isolation regardless of loading mode.

### API Methods

```javascript
// Check permission
if (window.app.extensions._hasPermission()) {
  // List running extensions (includes both consolidated and separate window extensions)
  const exts = await window.app.extensions.list();
  // Returns: { success: true, data: [{ id, manifest, status }, ...] }

  // Load/unload extensions
  await window.app.extensions.load('my-extension');
  await window.app.extensions.unload('my-extension');
  await window.app.extensions.reload('my-extension');

  // Extension management
  const all = await window.app.extensions.getAll();
  const ext = await window.app.extensions.get('my-extension');
  await window.app.extensions.add(folderPath, manifest, enabled);
  await window.app.extensions.remove('my-extension');
  await window.app.extensions.update('my-extension', { enabled: false });
}
```

---

## Settings API

Only available in extension pages (`peek://ext/{id}/...`).

```javascript
// Get all settings
const settings = await window.app.settings.get();

// Set all settings
await window.app.settings.set({ theme: 'dark' });

// Get/set individual keys
const theme = await window.app.settings.getKey('theme');
await window.app.settings.setKey('theme', 'light');
```

---

## Response Format

All async API methods return a consistent response format:

```javascript
{
  success: true,      // Operation succeeded
  data: any,          // Result data (if applicable)
  error: string       // Error message (if success: false)
}
```

Always check `success` before using `data`:

```javascript
const result = await window.app.datastore.getAddress(id);
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

---

## Implementation Notes

The Peek API is implemented in:
- **Electron**: `preload.js` using Electron's `contextBridge`
- **Tauri**: `backend/tauri/preload.js` injected via `initialization_script`

Both implementations provide identical API surfaces, allowing frontend code to work unchanged across backends.
