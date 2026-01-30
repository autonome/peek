/**
 * CodeMirror Editor Module
 *
 * Provides a configured CodeMirror instance for markdown editing
 * with optional vim mode support.
 */

import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput, foldGutter } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { vim } from '@replit/codemirror-vim';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';

// Compartments for runtime-reconfigurable extensions
const vimCompartment = new Compartment();
const themeCompartment = new Compartment();

/**
 * Create a peek-themed CodeMirror theme using CSS variables
 */
const peekTheme = EditorView.theme({
  '&': {
    fontSize: '14px',
    fontFamily: 'var(--theme-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)',
    backgroundColor: 'var(--base01)',
    color: 'var(--base05)',
    borderRadius: '8px',
    border: '1px solid var(--base02)',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: 'var(--base0D)',
  },
  '.cm-content': {
    padding: '10px 14px',
    caretColor: 'var(--base05)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--base05)',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--base02)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--base02)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--base02)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--base01)',
    color: 'var(--base03)',
    border: 'none',
    borderRight: '1px solid var(--base02)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 4px',
  },
  '.cm-foldGutter': {
    width: '12px',
  },
  // Markdown-specific highlighting
  '.cm-header': {
    color: 'var(--base0D)',
    fontWeight: '600',
  },
  '.cm-strong': {
    color: 'var(--base0A)',
    fontWeight: '600',
  },
  '.cm-emphasis': {
    color: 'var(--base0E)',
    fontStyle: 'italic',
  },
  '.cm-link': {
    color: 'var(--base0C)',
    textDecoration: 'underline',
  },
  '.cm-url': {
    color: 'var(--base0C)',
  },
  '.cm-strikethrough': {
    textDecoration: 'line-through',
    color: 'var(--base03)',
  },
  '.cm-monospace, .cm-inlineCode': {
    fontFamily: 'var(--theme-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)',
    backgroundColor: 'var(--base02)',
    padding: '1px 4px',
    borderRadius: '3px',
  },
  '.cm-quote': {
    color: 'var(--base03)',
    fontStyle: 'italic',
  },
  '.cm-list': {
    color: 'var(--base09)',
  },
  // Vim-specific styles
  '.cm-fat-cursor': {
    backgroundColor: 'var(--base05) !important',
    color: 'var(--base00) !important',
  },
  '&:not(.cm-focused) .cm-fat-cursor': {
    backgroundColor: 'transparent !important',
    outline: '1px solid var(--base05)',
  },
  '.cm-vim-panel': {
    padding: '4px 10px',
    backgroundColor: 'var(--base00)',
    borderTop: '1px solid var(--base02)',
    fontFamily: 'var(--theme-font-mono, monospace)',
    fontSize: '13px',
    color: 'var(--base04)',
  },
  '.cm-vim-panel input': {
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--base05)',
    fontFamily: 'inherit',
    fontSize: 'inherit',
  },
}, { dark: true });

/**
 * Create a CodeMirror editor instance
 * @param {Object} options - Configuration options
 * @param {HTMLElement} options.parent - Parent element to mount editor in
 * @param {string} options.content - Initial content
 * @param {boolean} options.vimMode - Enable vim mode
 * @param {boolean} options.showLineNumbers - Show line numbers
 * @param {Function} options.onChange - Callback when content changes
 * @returns {EditorView} - CodeMirror EditorView instance
 */
export function createEditor({ parent, content = '', vimMode = false, showLineNumbers = true, onChange }) {
  const extensions = [
    // Core extensions
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightSelectionMatches(),

    // Keymaps
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),

    // Language support
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

    // Theming
    themeCompartment.of(peekTheme),

    // Vim mode (initially based on setting)
    vimCompartment.of(vimMode ? vim() : []),

    // Change listener
    EditorView.updateListener.of(update => {
      if (update.docChanged && onChange) {
        onChange(update.state.doc.toString());
      }
    }),
  ];

  // Optional line numbers
  if (showLineNumbers) {
    extensions.push(lineNumbers(), foldGutter());
  }

  const state = EditorState.create({
    doc: content,
    extensions,
  });

  const view = new EditorView({
    state,
    parent,
  });

  return view;
}

/**
 * Toggle vim mode on an existing editor
 * @param {EditorView} view - CodeMirror EditorView instance
 * @param {boolean} enabled - Whether to enable vim mode
 */
export function setVimMode(view, enabled) {
  view.dispatch({
    effects: vimCompartment.reconfigure(enabled ? vim() : []),
  });
}

/**
 * Get the current content from the editor
 * @param {EditorView} view - CodeMirror EditorView instance
 * @returns {string} - Current document content
 */
export function getContent(view) {
  return view.state.doc.toString();
}

/**
 * Set the content of the editor
 * @param {EditorView} view - CodeMirror EditorView instance
 * @param {string} content - New content
 */
export function setContent(view, content) {
  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: content,
    },
  });
}

/**
 * Focus the editor
 * @param {EditorView} view - CodeMirror EditorView instance
 */
export function focus(view) {
  view.focus();
}

/**
 * Destroy the editor instance
 * @param {EditorView} view - CodeMirror EditorView instance
 */
export function destroy(view) {
  view.destroy();
}

export { EditorView, EditorState };
