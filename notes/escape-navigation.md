# Escape Navigation & Window Modes

## Modes

### Active Mode
Peek is the focused app at the OS level. User is actively working within Peek.

**Escape behavior**: Navigate back through internal state before closing.

Example flow in Groups:
1. Groups list view
2. → Click group → Group detail view
3. → Click page → Page view
4. → ESC → Back to group detail
5. → ESC → Back to groups list
6. → ESC → Close groups window

### Transient Mode
Peek was invoked via global hotkey while another app was active. User wants quick access then return to previous context.

**Escape behavior**: Close window immediately, return focus to previous app.

## Detection

How to determine mode:
- Track whether Peek was active before window opened
- If invoked via global shortcut while Peek wasn't focused → transient
- If opened from within an existing Peek window → active

## API Changes

Window open API could accept an `escapeMode` option:

```javascript
api.window.open(url, {
  escapeMode: 'navigate' | 'close' | 'auto'
});
```

- `navigate`: ESC navigates back, only closes when at root
- `close`: ESC immediately closes window
- `auto`: Determine based on active vs transient mode (default)

## Implementation

Cooperative model using IPC between main process and renderer:

### Main Process (index.js)

1. `addEscHandler()` intercepts ESC via `before-input-event`
2. For `escapeMode: 'navigate'` or `'auto'` (active), sends IPC `escape-pressed` to renderer
3. Waits 100ms for response via unique response channel
4. If renderer returns `{ handled: true }` → do nothing (renderer navigated)
5. If renderer returns `{ handled: false }` or timeout → close/hide window

### Preload API (preload.js)

```javascript
api.escape.onEscape(callback)
```

Register a callback that's invoked on ESC. Callback should return:
- `{ handled: true }` - ESC was handled (internal navigation occurred)
- `{ handled: false }` - At root state, window should close

### Renderer Usage (e.g., groups/home.js)

```javascript
api.escape.onEscape(() => {
  if (state.view === VIEW_ADDRESSES) {
    showGroups();
    return { handled: true };
  }
  return { handled: false };
});
```

### Transient Detection

When a window is opened, main process checks `BrowserWindow.getFocusedWindow()`:
- If no focused window → `transient: true` stored in window params
- For `escapeMode: 'auto'`, transient windows close immediately on ESC

## Future: Pinned Windows

Exception case: windows pinned to stay visible over all OS windows. These would:
- Ignore transient mode
- Have their own escape behavior (perhaps require explicit close action)

## Open Questions

1. How does this interact with browser-style back/forward within webviews?
2. Should there be visual indication of mode (transient vs active)?
