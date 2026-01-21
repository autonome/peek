# Peek UX Rules

Design principles and interaction rules for the Peek app.

---

## General Principles

### Interaction Priority
When multiple interactions could trigger from the same gesture, follow this priority:

1. **Text selection** - Fine-grained, intentional interaction wins
2. **Interactive elements** - Buttons, inputs, links have their own behaviors
3. **Window-level actions** - Dragging, resizing, etc.

### Don't Fight the Platform
- Respect native behaviors where possible
- Use standard keyboard shortcuts (Cmd+C, Cmd+V, etc.)
- Match platform conventions for focus, selection, scrolling

---

## Window Dragging

Frameless windows can be dragged by click-and-hold anywhere on the window body.

### Activation
| Parameter | Value | Purpose |
|-----------|-------|---------|
| Hold delay | 300ms | Time before drag activates |
| Movement threshold | 5px | Cancel if mouse moves before delay |

### Rules

**1. Text selection wins over dragging**
- If text is selected during the hold period, drag won't activate
- If text gets selected during an active drag, drag ends immediately
- Rationale: Text selection is more intentional/fine-grained

**2. Interactive elements are excluded**
These never trigger drag:
- `<input>`, `<textarea>`, `<button>`, `<a>`, `<select>`, `<label>`
- `contenteditable` elements
- Elements with `data-no-drag` attribute or inside `[data-no-drag]` container
- Elements with `-webkit-app-region: no-drag` CSS

**3. All windows support dragging**
- Internal pages (`peek://...`)
- External web pages (`https://...`)

### Opting Out

```html
<!-- Attribute -->
<div data-no-drag>Won't trigger drag</div>

<!-- CSS -->
<style>.my-element { -webkit-app-region: no-drag; }</style>
```

### Visual Feedback
- Cursor changes to `grabbing` during drag
- Body gets `is-dragging` class

---

## Keyboard Navigation

### Escape Key Behavior
Escape should progressively dismiss/cancel in this order:
1. Close modals/dialogs
2. Clear search/filter input
3. Exit current mode (e.g., edit mode)
4. Navigate back/up in hierarchy

### Focus Management
- Focus should be visible and obvious
- Tab order should be logical
- Modals trap focus until dismissed

---

## Command Palette

### Search Behavior
- Fuzzy matching on command names
- Results update as you type
- First result is auto-selected

### Execution
- Enter executes selected command
- Escape closes palette
- Arrow keys navigate results

---

*This document will grow as we establish more UX patterns.*
