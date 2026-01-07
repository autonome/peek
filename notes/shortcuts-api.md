# Peek Shortcuts API

The shortcuts API allows features and extensions to register keyboard shortcuts that trigger callbacks.

## Overview

Peek supports two types of shortcuts:

- **Global shortcuts**: Work system-wide, even when the app doesn't have focus. Useful for invoking the app from other applications.
- **Local shortcuts**: Only work when Peek has focus. Safer for actions that shouldn't be triggered accidentally from other apps.

By default, shortcuts are **local** (app-only). Pass `{ global: true }` to register a global shortcut.

## API Reference

### `api.shortcuts.register(shortcut, callback, options)`

Register a keyboard shortcut.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `shortcut` | string | Yes | Key combination (e.g., `'Alt+1'`, `'CommandOrControl+Shift+P'`) |
| `callback` | function | Yes | Function to call when shortcut is triggered |
| `options` | object | No | Configuration options |
| `options.global` | boolean | No | If `true`, shortcut works system-wide. Default: `false` |

**Example:**

```javascript
// Local shortcut (only works when app has focus)
api.shortcuts.register('Alt+Q', () => {
  console.log('Quit shortcut pressed');
  api.quit();
});

// Global shortcut (works even when app doesn't have focus)
api.shortcuts.register('Alt+1', () => {
  console.log('Opening peek 1');
  openPeek(1);
}, { global: true });
```

### `api.shortcuts.unregister(shortcut, options)`

Unregister a previously registered shortcut.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `shortcut` | string | Yes | The shortcut to unregister |
| `options` | object | No | Configuration options |
| `options.global` | boolean | No | Must match the registration. Default: `false` |

**Example:**

```javascript
// Unregister a local shortcut
api.shortcuts.unregister('Alt+Q');

// Unregister a global shortcut
api.shortcuts.unregister('Alt+1', { global: true });
```

## Shortcut String Format

Shortcuts use Electron's accelerator format. Common modifiers:

| Modifier | Mac | Windows/Linux |
|----------|-----|---------------|
| `CommandOrControl` | Cmd | Ctrl |
| `Command` / `Cmd` | Cmd | N/A |
| `Control` / `Ctrl` | Ctrl | Ctrl |
| `Alt` / `Option` | Option | Alt |
| `Shift` | Shift | Shift |
| `Meta` / `Super` | Cmd | Win |

**Examples:**

- `Alt+1` - Option/Alt + 1
- `CommandOrControl+Shift+P` - Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux)
- `Option+Up` - Option + Arrow Up
- `Ctrl+Q` - Control + Q

## When to Use Global vs Local

### Use Global Shortcuts For:

- **Invoking the app** (e.g., opening peeks, slides, command palette)
- **Quick access features** that users expect to work from any context
- **Features explicitly configured** as system-wide by the user

### Use Local Shortcuts For:

- **Destructive actions** like quit - prevents accidental triggers from other apps
- **Feature-internal navigation** that only makes sense when the app is active
- **Context-sensitive actions** that depend on app state

## Implementation Details

### Global Shortcuts

Uses Electron's `globalShortcut` module. These shortcuts:

- Work even when the app doesn't have focus
- Are registered at the OS level
- May conflict with shortcuts from other applications
- Are unregistered when the app quits

### Local Shortcuts

Uses Electron's `before-input-event` on each BrowserWindow. These shortcuts:

- Only work when a Peek window has focus
- Are handled before the webpage receives the input
- Cannot conflict with other applications
- Are more secure for sensitive operations
- Use physical key codes (not characters) for matching, so Option+, works correctly on Mac even though it produces '≤'

### Internal Architecture

```
Renderer Process (preload.js)
    │
    │ api.shortcuts.register(shortcut, cb, { global: true/false })
    │
    ▼
IPC: 'registershortcut' { shortcut, replyTopic, global }
    │
    ▼
Main Process (index.js)
    │
    ├─ global=true  ──▶ globalShortcut.register()
    │                   (stored in `shortcuts` Map)
    │
    └─ global=false ──▶ localShortcuts Map
                        (handled via before-input-event)
```

## Feature Examples

### Peeks (Global)

Peeks use global shortcuts so users can quickly invoke them from any app:

```javascript
api.shortcuts.register(`Option+${keyNum}`, () => {
  openPeekWindow(item);
}, { global: true });
```

### Quit (Local)

The quit shortcut is local to prevent accidentally quitting the app:

```javascript
api.shortcuts.register('Option+Q', () => {
  app.quit();
});  // No global flag - defaults to local
```

## Best Practices

1. **Default to local** - Only use global shortcuts when necessary
2. **Match register/unregister** - Pass the same `global` option to both calls
3. **Clean up on uninit** - Always unregister shortcuts when a feature unloads
4. **Track registered shortcuts** - Keep a list for cleanup:

```javascript
let registeredShortcuts = [];

const init = () => {
  const shortcut = 'Alt+1';
  api.shortcuts.register(shortcut, callback, { global: true });
  registeredShortcuts.push(shortcut);
};

const uninit = () => {
  registeredShortcuts.forEach(shortcut => {
    api.shortcuts.unregister(shortcut, { global: true });
  });
  registeredShortcuts = [];
};
```

## Future Considerations

- **UI for viewing shortcuts**: Settings panel showing all registered shortcuts
- **Conflict detection**: Warn when a shortcut is already registered
- **User customization**: Allow users to rebind shortcuts
- **Shortcut categories**: Group shortcuts by feature for better organization
