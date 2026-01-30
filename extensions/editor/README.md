# Editor Extension

A markdown editor with a three-panel layout inspired by peek-edit.

## Features

- **Outline sidebar** (left) - Table of contents from markdown headers, click to jump
- **CodeMirror editor** (center) - Full-featured markdown editing with syntax highlighting
- **Preview sidebar** (right) - Live rendered markdown preview
- **Vim mode** - Toggle vim keybindings via toolbar checkbox
- **Resizable panels** - Drag borders to resize sidebars
- **Focus mode** - Hide sidebars for distraction-free editing

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Option+E` | Open editor (global) |
| `Cmd+Shift+O` | Toggle outline sidebar |
| `Cmd+Shift+P` | Toggle preview sidebar |
| `Escape` | Exit focus mode |

## Architecture

```
extensions/editor/
├── manifest.json        # Extension metadata
├── background.html/js   # Extension lifecycle, commands, shortcuts
├── home.html            # Editor page with import map for CodeMirror
├── home.js              # Editor initialization
├── home.css             # Three-panel layout styles
├── editor-layout.js     # Main layout component
├── outline-sidebar.js   # TOC sidebar (parses headers)
├── preview-sidebar.js   # Markdown preview renderer
├── codemirror.js        # CodeMirror wrapper with Peek theming
└── settings-schema.json # Vim mode preference
```

## CodeMirror Integration

Uses ES modules via import map (no bundler required). The import map in `home.html` maps bare specifiers to `peek://node_modules/` paths.

Key packages:
- `@codemirror/lang-markdown` - Markdown language support
- `@codemirror/language` - Syntax highlighting, folding
- `@replit/codemirror-vim` - Vim keybindings
- `@codemirror/search` - Search functionality

## Pubsub Events

- `editor:open` - Open editor (optional: `{ content, file }`)
- `editor:contentChanged` - Emitted when content changes

## Settings

- `vimMode` (boolean) - Remember vim mode preference across sessions
