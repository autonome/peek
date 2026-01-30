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

// Settings key for vim mode preference
const SETTINGS_KEY = 'editor.vimMode';

/**
 * Sample markdown content for testing folding features.
 * Tests: headers (6 levels), nested lists, code blocks.
 */
const SAMPLE_CONTENT = `# Level 1 Header - Main Document

This content is under a level 1 header.

## Level 2 - Features

Content under level 2.

### Level 3 - Folding Types

We support multiple folding types.

#### Level 4 - Header Folding

Headers fold everything until the next header of same or higher level.

##### Level 5 - Deep Nesting

This is deeply nested content.

###### Level 6 - Maximum Depth

This is the deepest header level supported.

Back to level 5 content.

##### Level 5 - Another Section

Another level 5 section.

#### Level 4 - List Folding

Lists with children are foldable:

- Parent item with children
  - Child item one
  - Child item two
    - Grandchild item
    - Another grandchild
  - Child item three
- Simple item (no children)
- Another parent
  - Single child

Numbered lists also fold:

1. First parent
   1. Sub-item one
   2. Sub-item two
2. Second parent
   - Mixed child
   - Another mixed

#### Level 4 - Code Block Folding

Top-level code blocks fold their contents:

\`\`\`javascript
function example() {
    if (condition) {
        doSomething();
    }
    return result;
}

class MyClass {
    constructor() {
        this.x = 1;
    }

    method() {
        return this.x;
    }
}
\`\`\`

### Level 3 - Vim Fold Commands

Test these vim commands (enable vim mode first):

| Command | Action |
|---------|--------|
| \`za\` | Toggle fold under cursor |
| \`zo\` | Open fold under cursor |
| \`zc\` | Close fold under cursor |
| \`zR\` | Open all folds |
| \`zM\` | Close all folds |
| \`zr\` | Reduce folding (open one level) |
| \`zm\` | More folding (close one level) |

## Level 2 - Another Top Section

This tests that level 2 properly ends the previous level 2 section.

### Level 3 - Final Nested

Final nested content.

## Level 2 - Conclusion

End of test document.
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

  // Load vim mode preference from localStorage
  let vimMode = false;
  try {
    vimMode = localStorage.getItem(SETTINGS_KEY) === 'true';
    debug && console.log('[editor] Loaded vimMode setting:', vimMode);
  } catch (err) {
    debug && console.log('[editor] Failed to load settings:', err);
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
    onVimModeChange: handleVimModeChange,
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
 * Handle vim mode changes - persist to localStorage
 */
const handleVimModeChange = (enabled) => {
  try {
    localStorage.setItem(SETTINGS_KEY, enabled ? 'true' : 'false');
    console.log('[editor] Saved vimMode setting:', enabled);
  } catch (err) {
    console.error('[editor] Failed to save vimMode setting:', err);
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
