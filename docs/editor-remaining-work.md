# Editor Extension - Remaining Work

Research note documenting what's implemented and what's missing compared to peek-edit.

## Implemented Features

### Folditall-Style Folding
- Header folding (all 6 levels) - folds until next same/higher level
- List item folding - nested lists with children are foldable
- Fenced code block folding (``` and ~~~)
- Vim fold commands work from any line within a fold region

### Vim Fold Commands
- `za` - toggle fold
- `zc` - close/fold
- `zo` - open/unfold
- `zM` - fold all
- `zR` - unfold all
- `zm` / `zr` - simplified level-based (same as zM/zR)
- `<Space>` - toggle fold (folditall behavior)

### Status Line
- Mode indicator: NORMAL (yellow), INSERT (green), VISUAL (purple)
- Cursor position: `Ln X, Col Y`
- Only visible when vim mode is enabled

### Three-Panel Layout
- Outline sidebar (left) - TOC from headers
- CodeMirror editor (center)
- Preview sidebar (right) - live markdown rendering
- Resizable panels
- Focus mode (hides sidebars)

## Missing Features (from peek-edit)

### High Priority - Core Vim

| Feature | Description |
|---------|-------------|
| Text Objects | `iw`, `aw`, `is`, `as`, `ip`, `ap`, `i"`, `a"`, `i(`, `a(`, `i{`, `a{` |
| Character Search | `f`, `F`, `t`, `T`, `;`, `,` |
| Word Search | `*` (search word under cursor forward), `#` (backward) |
| Replace Mode | `R` (continuous replace until Escape) |
| Bracket Motion | `%` (jump to matching bracket) |
| Paragraph Motion | `{`, `}` (jump between paragraphs) |
| Viewport Motion | `H` (high), `M` (middle), `L` (low of viewport) |

**Note:** Many of these may already be in `@replit/codemirror-vim` - needs verification.

### Medium Priority - Ex Commands

| Command | Description |
|---------|-------------|
| `:s/pat/repl/g` | Search and replace with flags |
| `:123` | Go to line 123 |
| `:noh` / `:nohlsearch` | Clear search highlighting |
| `:zen` / `:focus` | Enter focus/zen mode |
| `:outline` / `:ol` | Toggle outline sidebar |
| `:preview` / `:pv` | Toggle preview sidebar |
| `:sidebars` / `:sb` | Toggle both sidebars |
| `:narrow` / `:na` | Centered narrow layout mode |

### Medium Priority - Editing Commands

| Command | Description |
|---------|-------------|
| `gq{motion}` | Wrap text at 78 chars, preserve indent |
| `gJ` | Join lines without space |
| `gu{motion}` | Lowercase |
| `gU{motion}` | Uppercase |
| `g~{motion}` | Toggle case |

### Low Priority - Advanced

| Feature | Description |
|---------|-------------|
| Marks | `ma` (set mark), `'a` / `` `a `` (jump to mark) |
| Macros | `qa` (record), `q` (stop), `@a` (play), `@@` (repeat) |
| Visual Block | `<C-v>` column selection |
| Tab Completion | Tab-complete ex commands |

## Implementation Notes

### @replit/codemirror-vim

The vim plugin likely already provides many motions and text objects. Before implementing, check:
1. What motions/text objects are already available
2. How to add custom ex commands via `Vim.defineEx()`
3. Whether `Vim.map()` can extend missing features

### Ex Command Integration

To add UI control via ex commands:
```javascript
Vim.defineEx('zen', '', (cm) => {
  // Toggle focus mode
});

Vim.defineEx('outline', 'ol', (cm) => {
  // Toggle outline sidebar
});
```

### Narrow Mode

Narrow mode centers the editor with max-width constraint. CSS approach:
```css
.narrow-mode .editor-container {
  max-width: 720px;
  margin: 0 auto;
}
```

## Test Coverage

Current: 33 tests covering:
- Editor setup (3)
- Fold all/unfold all (3)
- Header folding behavior (4)
- Vim fold commands (5)
- Click-to-fold (1)
- List item folding (5)
- Code block folding (2)
- Spacebar toggle (1)
- Fold from any line (2)
- Nested behavior (2)
- Status line (5)

## Files

- `extensions/editor/codemirror.js` - Main editor with folditall algorithm
- `extensions/editor/editor-layout.js` - Three-panel layout
- `extensions/editor/status-line.js` - Vim status bar
- `extensions/editor/outline-sidebar.js` - TOC sidebar
- `extensions/editor/preview-sidebar.js` - Markdown preview
- `tests/editor/editor-folding.spec.ts` - 33 tests
- `tests/editor/test-page.html` - Test harness
