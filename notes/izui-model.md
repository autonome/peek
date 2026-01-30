# IZUI: Inverted Zooming User Interface

Research note documenting the IZUI navigation model for Peek.

## Overview

IZUI (Inverted Zooming User Interface) inverts the traditional ZUI model:

| ZUI | IZUI |
|-----|------|
| Start from known root | Enter at any point |
| Navigate by zooming in | Navigate by zooming out (ESC) |
| Single entry point | Multiple entry points |
| Navigate forward to destination | Navigate backward to familiar ground |

## Core Principles

1. **Unbounded Entry**: Users can enter at any point via global hotkeys, commands, links, or extension actions.

2. **Predictable Exit**: ESC always walks backward through navigation until reaching the entry point.

3. **Context Preservation**: Each window preserves its internal state for return visits.

## Implementation Status

### Current: Minimal Parent Tracking (v1)

The initial implementation uses simple parent-child relationships:
- Windows track their opener via `source` address
- On ESC/close, focus restores to parent window
- No central stack data structure needed

See `app/izui.js` for implementation.

### Future: Full Stack Model (v2)

For more complex navigation patterns, a full stack model may be needed.

#### Stack Structure

```
IzuiStack {
  id: string              // Unique stack identifier
  entries: StackEntry[]   // Ordered list, index 0 = oldest
  entryMode: 'active' | 'transient'
  createdAt: number
}

StackEntry {
  windowId: number
  address: string
  params: object
  pushedAt: number
}
```

#### Entry Modes

**Active Mode**: Peek was already focused when stack was created.
- ESC navigates internal state before closing
- Designed for deep navigation workflows

**Transient Mode**: Peek was invoked from another app via global hotkey.
- ESC closes immediately to return user to previous app
- Minimal friction for quick peek-and-return workflows

#### Stack Operations

- **Push**: Window opened from current context
- **Pop**: ESC pressed, window at root state
- **Destroy**: Last entry popped

## Implementation Options Evaluated

### Option A: Client-side only (pubsub coordination)

Stack state in each renderer, coordinated via pubsub.

**Pros**: Backend-agnostic
**Cons**: Eventually consistent, race conditions, lost state if coordinator closes

### Option B: Background window coordinator

Stack state in `peek://app/background.html`, queried via pubsub.

**Pros**: Single source of truth, backend-agnostic
**Cons**: Latency on every query, complex message passing

### Option C: Duplicate backend implementation

Implement in both Electron (TypeScript) and Tauri (Rust).

**Pros**: Synchronous, no race conditions
**Cons**: Duplicate code, maintenance burden

### Option D: Minimal parent tracking (SELECTED)

Use existing `source` tracking, focus parent on close.

**Pros**: Simple, backend-agnostic, no new data structures
**Cons**: Limited to linear parent-child, no branching stacks

## Security Considerations

### Cross-Origin Navigation

| From | To | Behavior |
|------|----|----------|
| peek://app/* | peek://app/* | Same stack |
| peek://app/* | peek://ext/* | Same stack |
| peek://ext/* | peek://app/* | Same stack |
| peek://* | https://* | New stack (isolated) |
| https://* | peek://* | Blocked |
| https://* | https://* | New stack (isolated) |

External URLs should start isolated stacks to prevent untrusted content from manipulating Peek's navigation.

## History Integration (Future)

Stack operations could optionally record to history:

```javascript
trackNavigation(address, {
  source: 'izui',
  stackId: stack.id,
  action: 'push' | 'pop'
});
```

## Visual Indicators (Future)

Possible UI for stack depth:
- Breadcrumb trail
- Depth counter badge
- Mini-map of stack

## Open Questions

1. **Stack Branching**: Should stacks support multiple children from one parent?
2. **Stack Persistence**: Should stacks survive app restart for session restore?
3. **Multiple Stacks**: How should concurrent stacks interact?

## References

- `notes/escape-navigation.md` - ESC behavior design
- `notes/design-vision.md` - Original IZUI concept
- `app/izui.js` - Current implementation
