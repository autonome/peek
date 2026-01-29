# Research Report: Modes/Scopes - Prior Art, Patterns, and Approaches

## Executive Summary

Modern applications use sophisticated context-aware command systems built on several proven patterns:

1. **Modal vs. Modeless Design**: Modal systems (like Vim's modes) can be powerful but create "mode errors" when users aren't aware of their current state. The key to usability is strong visual indication.

2. **Scope Declaration**: Major frameworks (VS Code, Emacs, macOS) use explicit scope/context systems where commands declare when they're applicable (when clauses, context keys, responder chains).

3. **Visual Feedback**: Applications that implement modes successfully use redundant indicators: status bars, cursor changes, color shifts, and header overlays.

4. **Command Availability**: The `canExecute` pattern gates command availability based on context, preventing mode errors by disabling inappropriate commands.

5. **Target Window/Element**: Different frameworks have distinct patterns for determining command targets (focus vs. active, responder chains, content scope).

---

## 1. Modal Editing Systems

### Vim/Neovim Architecture

Neovim implements modal editing as a core architectural principle:

- **Global State Variable**: Tracks current mode with ModeChanged autocmd events for hooking state changes
- **Modes**: Normal (commands), Insert (text entry), Visual (selection)
- **Operator-Motion Paradigm**: Core text manipulation separates "what to do" (operator) from "where to do it" (motion)
- **Tree-Based Undo**: Non-linear undo/redo operations

**Implementation insight**: Neovim uses explicit state management with event hooks, allowing extensions to observe mode changes in real time.

Sources:
- [Mode System and Text Operations - DeepWiki](https://deepwiki.com/neovim/neovim/2.5-mode-system-and-text-operations)
- [Usr_02 - Neovim Official Docs](https://neovim.io/doc/user/usr_02.html)
- [Vim Mode - Zed Code Editor](https://zed.dev/docs/vim)

### Emacs Major/Minor Mode Architecture

Emacs uses a more flexible, stacked approach:

- **Major Modes**: Only one active at a time, language/task-specific
- **Minor Modes**: Many can be active simultaneously, independent utilities
- **Buffer Context**: Operations are buffer-local; modes maintain state per-buffer
- **Hook System**: Major modes run hooks on initialization for user customization
- **Mode-Specific Context Menus**: Buffer-local `context-menu-functions` for dynamic menus

**Key difference from Vim**: Emacs allows combining orthogonal minor modes, rather than exclusive states.

Sources:
- [Major and Minor Modes - GNU Emacs Lisp Reference](https://www.gnu.org/software/emacs/manual/html_node/elisp/Major-Mode-Conventions.html)
- [Emacs Beginner's HOWTO: Emacs Modes](https://tldp.org/HOWTO/Emacs-Beginner-HOWTO-3.html)

---

## 2. Context-Aware Command Systems

### VS Code: When Clauses and Context Keys

VS Code's command scoping is one of the most comprehensive systems:

- **When Clauses**: Boolean expressions that enable/disable keybindings and commands based on context
- **Context Discovery**: Built-in inspector to identify available context keys
- **Contribution Points**: `menus.commandPalette` restricts when commands appear via `when` clauses
- **Examples**: `inDebugMode`, `editorFocus`, `editorLangId == 'markdown'`

**Pattern**: Commands declare context requirements declaratively in package.json, avoiding tight coupling.

```
Example: "F5 only works when debuggersAvailable && !inDebugMode"
```

Sources:
- [When Clause Contexts - VS Code API](https://code.visualstudio.com/api/references/when-clause-contexts)
- [Command Palette UX Guidelines - VS Code](https://code.visualstudio.com/api/ux-guidelines/command-palette)

### Sublime Text: Context-Based Key Bindings

Sublime uses context filtering in `.sublime-keymap` files:

- Context filtering limits key binding scope to specific conditions
- Limited documentation but follows similar patterns to key binding systems
- Contexts affect both keybindings and command availability

Sources:
- [Command Palette - Sublime Text Docs](https://docs.sublimetext.io/guide/extensibility/command_palette.html)

### macOS NSApplication: Responder Chain for Command Targeting

macOS uses a sophisticated responder chain for command routing:

- **Responder Chain Order**: FirstResponder -> content view -> window -> delegate -> app -> app delegate
- **Scope Determination**: Untargeted actions search the responder chain until finding an implementer
- **Key Window vs. Main Window**: If key window differs from main, also checks main window's chain
- **Command Targeting**: `sendAction:to:from:` dispatches to proper scope automatically

**Critical distinction**: Supports both focused (receives input) and active (foreground) windows.

Sources:
- [Event Architecture - Apple Developer](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/EventArchitecture/EventArchitecture.html)
- [Responder Chain - Christian Tietze](https://christiantietze.de/posts/2023/08/cocoa-appkit-responder-chain/)
- [Menus, Hotkeys, & Command Dispatch (Mac) - Chromium](https://www.chromium.org/developers/design-documents/command-dispatch-mac/)

---

## 3. Launcher/Command Palette Patterns

### VS Code Command Palette

- **Default behavior**: All commands appear unless restricted
- **Scoping via `when` clauses**: Control visibility based on context (language, focus, etc.)
- **Three concepts**: Activation Events, Contribution Points, VS Code API
- **Separation**: Extensions can restrict command visibility without modifying appearance

### Alfred & Raycast

Modern launcher patterns focus on smart context awareness:

- **Alfred**: Context-aware workflows based on selected files/text
- **Raycast**: Environment API provides context about extension runtime
  - Can detect which app is frontmost
  - Can access selected text/files from other applications
  - Supports launching from background with context awareness

Sources:
- [Raycast Environment API](https://developers.raycast.com/api-reference/environment)
- [Raycast vs Alfred comparison](https://www.raycast.com/raycast-vs-alfred)

---

## 4. Browser Extension Context Systems

### Content Script Scoping

Browser extensions compartmentalize context:

- **Isolated Worlds**: Content scripts cannot access page context or extension variables
- **Messaging**: `runtime.sendMessage()` and `tabs.sendMessage()` bridge contexts
- **Page Context Detection**: `menus.getTargetElement()` retrieves right-clicked element in WebExtensions API

### Vimium/Surfingkeys: Vim-Mode Browser Extensions

These extensions implement modal systems within browsers:

- **Modes**: Normal, Insert/Transparent, Visual, PassThrough
- **Lurk Mode**: Inactive until Alt+i or 'p' pressed on matching pages
- **Auto-exit**: PassThrough exits after 1 second
- **JavaScript Configuration**: Entire configuration system uses JS for extensibility

**Implementation approach**: Maps keyboard shortcuts to custom JS functions, enabling powerful automation.

Sources:
- [Surfingkeys GitHub](https://github.com/brookhong/Surfingkeys)
- [Browser Extension Message Passing - Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Content Scripts - MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts)

---

## 5. Visual Mode Indication Patterns

### Status Bar Indicators

Strong visual indication is critical to prevent mode errors:

- **Text Indicators**: "--INSERT--", "--NORMAL--", "--VISUAL--" in status bar
- **Redundant Indicators**: At minimum, combine:
  - Status text (gray text on bottom right)
  - Cursor style changes (block vs. thin vs. underline)
  - Highlight line colors (different per mode)
- **Vim Example**: Different colors for each mode in status bar provides immediate visual feedback

### Discoverability and Feedback

According to Nielsen Norman Group research:
- Mode errors occur when users perform actions appropriate for different modes
- Invisible or poorly signaled transitions cause confusion
- Historical perspective: Larry Tesler (Xerox PARC/Apple) had license plate "NO MODES" due to mode problems

Sources:
- [Modes in User Interfaces - Nielsen Norman Group](https://www.nngroup.com/articles/modes/)
- [Mode (User Interface) - Wikipedia](https://en.wikipedia.org/wiki/Mode_(user_interface))
- [Carbon Design System - Status Indicators](https://carbondesignsystem.com/patterns/status-indicator-pattern/)

---

## 6. Command Scope Declaration Patterns

### The `canExecute` Pattern

Frameworks like WPF implement guard conditions on commands:

- **ICommand Interface**: `Execute(param)`, `CanExecute(param)` -> bool, `CanExecuteChanged` event
- **Guard Function**: Returns false to disable command in UI automatically
- **Example**: "Create Client" command's CanExecute checks if client already exists in repository
- **Dynamic Updates**: `CanExecuteChanged` event notifies UI to re-query state

**Benefit**: Prevents mode errors by making inappropriate commands visually unavailable.

Sources:
- [The Command Pattern & WPF - Medium](https://medium.com/@apurvkumar2/the-command-pattern-wpf-part-i-a19a5414e8eb)
- [Command Pattern - Refactoring Guru](https://refactoring.guru/design-patterns/command)

### Context-Sensitive Menus

Design principles for context-aware command systems:

- **Dynamic Availability**: Commands adapt based on selection type/quantity/mode
- **Consistency**: Actions in context menus should also appear in main menus
- **Simplicity**: Limit to relevant actions; avoid overwhelming users
- **Discoverability**: Visual indicators that context menu exists

Sources:
- [Contextual Menus: Delivering Relevant Tools - NNG](https://www.nngroup.com/articles/contextual-menus/)
- [Context-Sensitive User Interface - Wikipedia](https://en.wikipedia.org/wiki/Context-sensitive_user_interface)

---

## 7. Target Window/Scope Identification

### Active vs. Focused Windows

Critical distinction in multi-window applications:

- **Focused Window**: Currently receives keyboard input
- **Active Window**: Visually prominent (highlighted titlebar), may differ from focused
- **Multi-Display**: Can have multiple active windows (one per display), but only one focused

### Implementation Patterns

**Windows/UI Frameworks**:
- Focus rectangles and highlighting for keyboard navigation
- Keytips (Alt+key badges) showing access key scope (primary vs. secondary)
- FocusVisualStyle for keyboard-triggered visual changes

**Peek's Current Approach**:
Your TODO mentions "target window is usually what user was looking at before opening cmd" - this aligns with responder chain patterns where commands naturally route to the last active/focused responder.

Sources:
- [Guidelines for Visual Feedback - Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/develop/input/guidelines-for-visualfeedback)
- [Focus (Computing) - Wikipedia](https://en.wikipedia.org/wiki/Focus_(computing))

---

## 8. Design Principles for Modes

### When to Use Modal Systems

Modal systems work well when:
- Too many options to fit in static UI
- User needs focused context (like Photoshop tools)
- Power users expect efficiency through mode switching

Modal systems create problems when:
- Transitions are invisible or poorly signaled -> **mode errors**
- Users must pause critical work to figure out state
- Modes interact with rare use cases (users forget the mode exists)

### Best Practices to Prevent Mode Errors

1. **Redundant Indicators**: At least two visual indicators (text + cursor + color)
2. **Strong Differentiation**: Make mode visually obvious, not subtle
3. **Avoid Critical Scenarios**: Don't use modes where errors are catastrophic
4. **Escape Routes**: Always provide easy way to exit mode
5. **Feedback**: Confirm mode transitions with visual/audio feedback

Sources:
- [Modal & Nonmodal Dialogs - Nielsen Norman Group](https://www.nngroup.com/articles/modal-nonmodal-dialog/)
- [Mastering Modal UX - Eleken](https://www.eleken.co/blog-posts/modal-ux)

---

## Recommendations for Peek

### 1. Explicit Scope Declaration

Recommend implementing commands with scope metadata:

```javascript
{
  name: "theme dark",
  scope: 'window',  // or 'page' or 'global'
  target: 'lastActive',  // or 'focused', or explicit selector
  canExecute: (context) => context.window !== null,
  execute: (context) => { /* ... */ }
}
```

### 2. Visual Scope Indication

Implement multi-layered mode indication:
- **Header Display**: "Target: [window title]" when window-scoped command selected
- **Status Bar**: Show current mode/target in subtle yet clear format
- **Cursor Feedback**: Change cursor style based on mode
- **Highlight**: Optional highlight on target window edge

### 3. Target Window Resolution

Adopt pattern similar to macOS responder chain:
- Default to "last active window" (what user was looking at before opening cmd)
- Provide explicit targeting via selection
- Show resolved target clearly before execution

### 4. Page Mode System

For page-specific modes (web viewing, group editing):
- Use Emacs-style major/minor modes hybrid:
  - **Major Mode**: Current context (page, group, settings)
  - **Minor Modes**: Features that can be combined (preview, edit, annotate)
- Declare hotkeys per mode in metadata
- Use hooks system for mode activation/deactivation

### 5. Command Palette Scoping

Adopt VS Code's when-clause approach:
- Don't show all commands always
- Filter based on current context with declarative rules
- Show reason if command is unavailable ("only in page mode")

### 6. Modal Error Prevention

- Always show current mode in UI (never hide it)
- Provide explicit "exit mode" command with clear keybinding (ESC)
- Test with users unfamiliar with mode system
- Document mode transitions clearly

### 7. Conditional Hotkeys

Implement like Vim/Surfingkeys:
- Same keys do different things in different modes
- Publish hotkey reference per mode
- Show available hotkeys on demand (help panel per mode)

---

## Implementation Approach Summary

The most successful pattern combines elements from multiple systems:

| Aspect | Recommended Pattern | From System |
|--------|-------------------|-------------|
| Scope Declaration | Explicit metadata (scope, target, canExecute) | VS Code + WPF |
| Visual Indication | Status bar + cursor + highlight (redundant) | Vim + Windows UI |
| Target Resolution | Responder chain with explicit override | macOS NSApplication |
| Mode Organization | Major/minor mode stack | Emacs |
| Context Awareness | When-clause boolean expressions | VS Code |
| Guard Conditions | canExecute() with event notifications | WPF ICommand |
| Page Modes | Surfingkeys/Vimium extension model | Browser extensions |

---

## Resources and References

**HCI & Design:**
- [Modes in User Interfaces - NNG](https://www.nngroup.com/articles/modes/)
- [Modal vs Modeless Design - NNG](https://www.nngroup.com/articles/modal-nonmodal-dialog/)

**Editor Systems:**
- [Neovim Official Documentation](https://neovim.io)
- [GNU Emacs Manual - Modes](https://www.gnu.org/software/emacs/manual/html_node/emacs/Modes.html)

**IDE/Framework Patterns:**
- [VS Code When Clauses API](https://code.visualstudio.com/api/references/when-clause-contexts)
- [VS Code Command Palette Guidelines](https://code.visualstudio.com/api/ux-guidelines/command-palette)
- [macOS Event Architecture](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/EventArchitecture/EventArchitecture.html)

**Browser Extensions:**
- [Chrome Message Passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [MDN Content Scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts)
- [Surfingkeys Repository](https://github.com/brookhong/Surfingkeys)

**UI Patterns:**
- [Contextual Menus - NNG](https://www.nngroup.com/articles/contextual-menus/)
- [Carbon Design System - Status Indicators](https://carbondesignsystem.com/patterns/status-indicator-pattern/)
