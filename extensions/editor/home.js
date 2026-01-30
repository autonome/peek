/**
 * Editor Home - Pure markdown editor with three-panel layout.
 *
 * Features:
 * - Outline sidebar (TOC from headers)
 * - CodeMirror editor with vim mode support
 * - Preview sidebar (live markdown rendering)
 * - Resizable panels
 * - Focus mode
 */

import { EditorLayout } from './editor-layout.js';

const api = window.app;
const debug = api?.debug;

// Editor layout instance
let editorLayout = null;

// Settings store for vim mode preference
let settingsStore = null;
const SETTINGS_KEY = 'vimMode';

/**
 * Sample markdown content for new documents
 */
const SAMPLE_CONTENT = `# Welcome to the Editor

This is a **markdown editor** with live preview and outline navigation.

## Features

- **Outline sidebar** - Click headers to jump to them
- **Live preview** - See rendered markdown as you type
- **Vim mode** - Toggle vim keybindings in the toolbar
- **Focus mode** - Distraction-free editing

## Getting Started

Start typing to edit this document. Use the toolbar buttons to toggle sidebars.

### Keyboard Shortcuts

- \`Cmd+Shift+O\` - Toggle outline sidebar
- \`Cmd+Shift+P\` - Toggle preview sidebar
- \`Escape\` - Exit focus mode

## Code Example

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

## Lists

- Item one
- Item two
- Item three

1. First
2. Second
3. Third

## Links and Images

[Visit GitHub](https://github.com)

> This is a blockquote.
> It can span multiple lines.

---

*Happy writing!*
`;

/**
 * Initialize the editor
 */
const init = async () => {
  debug && console.log('[editor] Home init');

  const rootEl = document.getElementById('editor-root');
  if (!rootEl) {
    console.error('[editor] Root element not found');
    return;
  }

  // Load vim mode preference
  let vimMode = false;
  if (api?.utils?.createDatastoreStore) {
    try {
      settingsStore = await api.utils.createDatastoreStore('editor', { vimMode: false });
      vimMode = settingsStore.get(SETTINGS_KEY) || false;
      debug && console.log('[editor] Loaded vimMode setting:', vimMode);
    } catch (err) {
      debug && console.log('[editor] Failed to load settings:', err);
    }
  }

  // Check URL params for content or file path
  const params = new URLSearchParams(window.location.search);
  const contentParam = params.get('content');
  const fileParam = params.get('file');

  let initialContent = SAMPLE_CONTENT;

  // If content provided via URL param, use it
  if (contentParam) {
    initialContent = contentParam;
  }

  // If file path provided, try to load it
  if (fileParam && api?.fs?.readFile) {
    try {
      const result = await api.fs.readFile(fileParam);
      if (result.success) {
        initialContent = result.data;
      }
    } catch (err) {
      debug && console.log('[editor] Failed to load file:', err);
    }
  }

  // Create editor layout
  editorLayout = new EditorLayout({
    container: rootEl,
    initialContent,
    vimMode,
    onContentChange: handleContentChange,
  });

  // Set up escape handler
  if (api?.escape) {
    api.escape.onEscape(() => {
      if (editorLayout?.isInFocusMode()) {
        editorLayout.exitFocusMode();
        return { handled: true };
      }
      return { handled: false };
    });
  }

  // Listen for vim mode changes to persist
  const vimCheckbox = document.querySelector('.vim-toggle input');
  if (vimCheckbox) {
    vimCheckbox.addEventListener('change', async () => {
      const enabled = vimCheckbox.checked;
      if (settingsStore) {
        try {
          await settingsStore.set(SETTINGS_KEY, enabled);
          debug && console.log('[editor] Saved vimMode setting:', enabled);
        } catch (err) {
          debug && console.log('[editor] Failed to save vimMode setting:', err);
        }
      }
    });
  }

  debug && console.log('[editor] Editor initialized');
};

/**
 * Handle content changes
 */
const handleContentChange = (content) => {
  // Publish change event for other extensions
  if (api?.publish) {
    api.publish('editor:contentChanged', { content }, api.scopes.GLOBAL);
  }
};

/**
 * Clean up on unload
 */
const cleanup = () => {
  if (editorLayout) {
    editorLayout.destroy();
    editorLayout = null;
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Clean up on unload
window.addEventListener('beforeunload', cleanup);
