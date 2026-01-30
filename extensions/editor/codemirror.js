/**
 * CodeMirror Editor Module
 *
 * Provides a configured CodeMirror instance for markdown editing
 * with optional vim mode support and folditall-style folding.
 */

import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput, foldGutter, foldService, codeFolding, foldAll, unfoldAll, foldEffect, unfoldEffect, foldedRanges, foldable } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { vim, Vim, getCM } from '@replit/codemirror-vim';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';

// Compartments for runtime-reconfigurable extensions
const vimCompartment = new Compartment();
const themeCompartment = new Compartment();

// ============================================================================
// Folditall Algorithm Helpers
// ============================================================================

/**
 * Get the header level (1-6) from a line, or 0 if not a header.
 */
function getHeaderLevel(text) {
  const match = text.match(/^(#{1,6})\s+/);
  return match ? match[1].length : 0;
}

/**
 * Check if a line is a list item (bullet or numbered).
 */
function isListItem(text) {
  return /^\s*[-*+]\s/.test(text) || /^\s*\d+[.)]\s/.test(text);
}

/**
 * Get the indentation level of a line (number of leading spaces/tabs).
 * Tabs count as 2 spaces.
 */
function getIndent(text) {
  let indent = 0;
  for (const char of text) {
    if (char === ' ') indent++;
    else if (char === '\t') indent += 2;
    else break;
  }
  return indent;
}

/**
 * Check if a line is blank or whitespace-only.
 */
function isBlankLine(text) {
  return /^\s*$/.test(text);
}

/**
 * Check if a line is a fenced code block opener (``` or ~~~).
 */
function isFencedCodeBlockOpener(text) {
  return /^(`{3,}|~{3,})/.test(text.trim());
}

/**
 * Find the closing fence for a fenced code block.
 * Returns line number of closing fence, or null if not found.
 */
function findClosingFence(doc, openerLineNum) {
  const openerLine = doc.line(openerLineNum);
  const openerText = openerLine.text.trim();
  const match = openerText.match(/^(`{3,}|~{3,})/);
  if (!match) return null;

  const fenceChar = match[1][0];
  const fenceLen = match[1].length;
  const totalLines = doc.lines;

  for (let i = openerLineNum + 1; i <= totalLines; i++) {
    const line = doc.line(i);
    const trimmed = line.text.trim();
    // Closing fence must be same char and at least same length
    const closeMatch = trimmed.match(new RegExp(`^${fenceChar}{${fenceLen},}$`));
    if (closeMatch) {
      return i;
    }
  }
  return null;
}

/**
 * Find the next non-blank line number after lineNum.
 * Returns null if no non-blank line exists.
 */
function findNextNonBlank(doc, lineNum) {
  const totalLines = doc.lines;
  for (let i = lineNum + 1; i <= totalLines; i++) {
    const line = doc.line(i);
    if (!isBlankLine(line.text)) {
      return i;
    }
  }
  return null;
}

/**
 * Check if a line can start a fold based on folditall rules:
 * - Headers always can start folds
 * - List items can start folds (if they have children)
 * - Fenced code block openers can start folds
 * - Indent-0 lines can start folds (if they have indented children)
 */
function canStartFold(text) {
  if (getHeaderLevel(text) > 0) return true;
  if (isListItem(text)) return true;
  if (isFencedCodeBlockOpener(text)) return true;
  if (getIndent(text) === 0 && !isBlankLine(text)) return true;
  return false;
}

/**
 * Check if a line has foldable children (more-indented content following it).
 */
function hasFoldableChildren(doc, lineNum) {
  const line = doc.line(lineNum);
  const text = line.text;

  // Headers always have children (until next same/higher level header)
  if (getHeaderLevel(text) > 0) return true;

  // Fenced code blocks have children if there's a closing fence
  if (isFencedCodeBlockOpener(text)) {
    return findClosingFence(doc, lineNum) !== null;
  }

  const currentIndent = getIndent(text);
  const nextNonBlankNum = findNextNonBlank(doc, lineNum);

  if (nextNonBlankNum === null) return false;

  const nextLine = doc.line(nextNonBlankNum);
  const nextText = nextLine.text;

  // Next line must be more indented (and not a header)
  if (getHeaderLevel(nextText) > 0) return false;

  return getIndent(nextText) > currentIndent;
}

/**
 * Find the end of a fold region starting at lineNum.
 * For headers: ends at next header of same or higher level.
 * For fenced code blocks: ends at the closing fence.
 * For list/indent: ends when indentation returns to same or lower level.
 */
function findFoldEnd(doc, lineNum) {
  const line = doc.line(lineNum);
  const text = line.text;
  const totalLines = doc.lines;
  const headerLevel = getHeaderLevel(text);

  if (headerLevel > 0) {
    // Header fold: ends at next header of same or higher level
    for (let i = lineNum + 1; i <= totalLines; i++) {
      const checkLine = doc.line(i);
      const checkLevel = getHeaderLevel(checkLine.text);
      if (checkLevel > 0 && checkLevel <= headerLevel) {
        return i - 1;
      }
    }
    return totalLines;
  }

  // Fenced code block fold: ends at closing fence
  if (isFencedCodeBlockOpener(text)) {
    const closingLine = findClosingFence(doc, lineNum);
    return closingLine !== null ? closingLine : lineNum;
  }

  // List/indent fold: ends when indentation returns to same or lower level
  const startIndent = getIndent(text);
  let lastContentLine = lineNum;

  for (let i = lineNum + 1; i <= totalLines; i++) {
    const checkLine = doc.line(i);
    const checkText = checkLine.text;

    // Skip blank lines but track last content
    if (isBlankLine(checkText)) continue;

    // Headers break indent folds
    if (getHeaderLevel(checkText) > 0) {
      return lastContentLine;
    }

    const checkIndent = getIndent(checkText);

    // If indent is same or less, fold ends at previous content line
    if (checkIndent <= startIndent) {
      return lastContentLine;
    }

    lastContentLine = i;
  }

  return lastContentLine;
}

/**
 * Folditall-style folding: find the fold region containing a line.
 * Searches backwards to find the nearest fold-starting line that contains this line.
 */
function findContainingFoldStart(state, lineNum) {
  const doc = state.doc;
  const currentLine = doc.line(lineNum);
  const currentText = currentLine.text;

  // If current line can start a fold and has children, return it
  if (canStartFold(currentText) && hasFoldableChildren(doc, lineNum)) {
    return currentLine.from;
  }

  const currentIndent = getIndent(currentText);

  // Search backwards for a containing fold region
  for (let i = lineNum - 1; i >= 1; i--) {
    const line = doc.line(i);
    const text = line.text;

    // Skip blank lines
    if (isBlankLine(text)) continue;

    const lineIndent = getIndent(text);
    const headerLevel = getHeaderLevel(text);

    // Headers always contain following content (until next same-level header)
    if (headerLevel > 0) {
      // Check if this header's fold extends to our line
      const foldEnd = findFoldEnd(doc, i);
      if (foldEnd >= lineNum) {
        return line.from;
      }
      continue;
    }

    // List items or indent-0 lines with less indent could contain us
    if (lineIndent < currentIndent && canStartFold(text) && hasFoldableChildren(doc, i)) {
      const foldEnd = findFoldEnd(doc, i);
      if (foldEnd >= lineNum) {
        return line.from;
      }
    }
  }

  return null;
}

/**
 * Check if a position is inside a folded range.
 */
function isPositionFolded(state, pos) {
  const folded = foldedRanges(state);
  let found = false;
  folded.between(0, state.doc.length, (from, to) => {
    if (pos >= from && pos <= to) {
      found = true;
    }
  });
  return found;
}

/**
 * Find the fold range at a position (if folded).
 */
function findFoldedRangeAt(state, pos) {
  const folded = foldedRanges(state);
  let result = null;
  folded.between(0, state.doc.length, (from, to) => {
    if (pos >= from && pos <= to) {
      result = { from, to };
    }
  });
  return result;
}

// Define vim fold commands using folditall-style region finding
Vim.defineAction('foldAll', (cm) => {
  foldAll(cm.cm6);
});

Vim.defineAction('unfoldAll', (cm) => {
  unfoldAll(cm.cm6);
});

Vim.defineAction('foldCode', (cm) => {
  const view = cm.cm6;
  const pos = view.state.selection.main.head;
  const lineNum = view.state.doc.lineAt(pos).number;

  // Find the containing fold region's start
  const foldStart = findContainingFoldStart(view.state, lineNum);
  if (foldStart !== null) {
    // Get the foldable range at the fold start
    const foldRange = foldable(view.state, foldStart, foldStart);
    if (foldRange) {
      // Create fold effect
      view.dispatch({
        effects: foldEffect.of({ from: foldRange.from, to: foldRange.to })
      });
    }
  }
});

Vim.defineAction('unfoldCode', (cm) => {
  const view = cm.cm6;
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const lineNum = line.number;

  // First check if we're in a folded range (cursor inside fold)
  const foldedRange = findFoldedRangeAt(view.state, pos);
  if (foldedRange) {
    view.dispatch({
      effects: unfoldEffect.of({ from: foldedRange.from, to: foldedRange.to })
    });
    return;
  }

  // Check if there's a fold starting at the end of current line (we're on the fold line)
  const foldAtLineEnd = findFoldedRangeAt(view.state, line.to);
  if (foldAtLineEnd) {
    view.dispatch({
      effects: unfoldEffect.of({ from: foldAtLineEnd.from, to: foldAtLineEnd.to })
    });
    return;
  }

  // Find the containing fold region and try to unfold it
  const foldStart = findContainingFoldStart(view.state, lineNum);
  if (foldStart !== null) {
    const foldStartLine = view.state.doc.lineAt(foldStart);
    const foldRange = foldable(view.state, foldStartLine.from, foldStartLine.to);
    if (foldRange) {
      // Check if this range is folded
      const folded = foldedRanges(view.state);
      let isFolded = false;
      folded.between(foldRange.from, foldRange.to, (from, to) => {
        if (from === foldRange.from) {
          isFolded = true;
        }
      });
      if (isFolded) {
        view.dispatch({
          effects: unfoldEffect.of({ from: foldRange.from, to: foldRange.to })
        });
      }
    }
  }
});

Vim.defineAction('toggleFold', (cm) => {
  const view = cm.cm6;
  const pos = view.state.selection.main.head;
  const lineNum = view.state.doc.lineAt(pos).number;

  // Find the containing fold region's start
  const foldStart = findContainingFoldStart(view.state, lineNum);
  if (foldStart === null) return;

  const line = view.state.doc.lineAt(foldStart);
  const foldRange = foldable(view.state, line.from, line.to);
  if (!foldRange) return;

  // Check if this range is currently folded
  const folded = foldedRanges(view.state);
  let isFolded = false;
  folded.between(foldRange.from, foldRange.to, (from, to) => {
    if (from === foldRange.from) {
      isFolded = true;
    }
  });

  if (isFolded) {
    view.dispatch({
      effects: unfoldEffect.of({ from: foldRange.from, to: foldRange.to })
    });
  } else {
    view.dispatch({
      effects: foldEffect.of({ from: foldRange.from, to: foldRange.to })
    });
  }
});

// Map vim fold commands
Vim.mapCommand('zc', 'action', 'foldCode', {}, { context: 'normal' });
Vim.mapCommand('zo', 'action', 'unfoldCode', {}, { context: 'normal' });
Vim.mapCommand('za', 'action', 'toggleFold', {}, { context: 'normal' });
Vim.mapCommand('zM', 'action', 'foldAll', {}, { context: 'normal' });
Vim.mapCommand('zR', 'action', 'unfoldAll', {}, { context: 'normal' });
// zr and zm are level-based - simplified to same as zR/zM for now
Vim.mapCommand('zr', 'action', 'unfoldAll', {}, { context: 'normal' });
Vim.mapCommand('zm', 'action', 'foldAll', {}, { context: 'normal' });
// Space toggles fold (like za) - folditall behavior
Vim.mapCommand('<Space>', 'action', 'toggleFold', {}, { context: 'normal' });

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
 * Folditall-style fold service.
 * Handles:
 * - Markdown headers (fold to next same/higher level header)
 * - List items with children (fold nested content)
 * - Indent-0 lines with indented children (code blocks, etc.)
 */
const folditallFoldService = foldService.of((state, lineStart, lineEnd) => {
  const doc = state.doc;
  const line = doc.lineAt(lineStart);
  const text = line.text;
  const lineNum = line.number;

  // Skip blank lines
  if (isBlankLine(text)) return null;

  // Check if this line can start a fold and has children
  if (!canStartFold(text)) return null;
  if (!hasFoldableChildren(doc, lineNum)) return null;

  // Find fold end
  const endLineNum = findFoldEnd(doc, lineNum);

  // Don't fold if there's nothing to fold
  if (endLineNum <= lineNum) return null;

  const endLine = doc.line(endLineNum);

  // Fold from end of starting line to end of last line in section
  return { from: line.to, to: endLine.to };
});

/**
 * Create a CodeMirror editor instance
 * @param {Object} options - Configuration options
 * @param {HTMLElement} options.parent - Parent element to mount editor in
 * @param {string} options.content - Initial content
 * @param {boolean} options.vimMode - Enable vim mode
 * @param {boolean} options.showLineNumbers - Show line numbers
 * @param {Function} options.onChange - Callback when content changes
 * @param {Function} options.onSelectionChange - Callback when cursor position changes (line, col)
 * @param {Function} options.onVimModeChange - Callback when vim mode changes (mode string)
 * @returns {EditorView} - CodeMirror EditorView instance
 */
export function createEditor({ parent, content = '', vimMode = false, showLineNumbers = true, onChange, onSelectionChange, onVimModeChange }) {
  // Track last known vim mode to detect changes
  let lastVimMode = 'normal';

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

    // Folding support (required for vim fold commands)
    codeFolding(),
    folditallFoldService,

    // Theming
    themeCompartment.of(peekTheme),

    // Vim mode (initially based on setting)
    vimCompartment.of(vimMode ? vim() : []),

    // Update listener for content, selection, and vim mode changes
    EditorView.updateListener.of(update => {
      // Content change
      if (update.docChanged && onChange) {
        onChange(update.state.doc.toString());
      }

      // Selection/cursor change
      if (update.selectionSet && onSelectionChange) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        const col = pos - line.from + 1;
        onSelectionChange(line.number, col);
      }

      // Vim mode change detection
      if (onVimModeChange && vimMode) {
        try {
          const cm = getCM(update.view);
          if (cm && cm.state && cm.state.vim) {
            const vimState = cm.state.vim;
            let currentMode = 'normal';

            if (vimState.insertMode) {
              currentMode = 'insert';
            } else if (vimState.visualMode) {
              currentMode = vimState.visualLine ? 'visual-line' :
                           vimState.visualBlock ? 'visual-block' : 'visual';
            } else if (vimState.mode === 'replace') {
              currentMode = 'replace';
            }

            if (currentMode !== lastVimMode) {
              lastVimMode = currentMode;
              onVimModeChange(currentMode);
            }
          }
        } catch (e) {
          // Vim not active
        }
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

  // Initial position callback
  if (onSelectionChange) {
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const col = pos - line.from + 1;
    onSelectionChange(line.number, col);
  }

  // Initial vim mode callback
  if (onVimModeChange && vimMode) {
    onVimModeChange('normal');
  }

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
