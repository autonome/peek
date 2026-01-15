/**
 * Cmd Panel - command input and execution UI
 *
 * Runs in isolated panel window (peek://ext/cmd/panel.html)
 * Uses api.settings for persistent adaptive matching data
 */
import { id, labels, schemas, storageKeys, defaults } from './config.js';
import './commands.js'; // Load commands module to dispatch cmd-update-commands event
import { log } from 'peek://app/log.js';

log('cmd:panel', 'loaded');

const api = window.app;

// Storage keys for persistent adaptive matching
const STORAGE_KEY_FEEDBACK = 'adaptiveFeedback';
const STORAGE_KEY_COUNTS = 'matchCounts';

// Cache for adaptive data
let adaptiveDataCache = null;

/**
 * Load persisted adaptive data from extension settings
 */
const loadAdaptiveData = async () => {
  if (adaptiveDataCache) {
    return adaptiveDataCache;
  }

  const result = await api.settings.get();
  if (result.success && result.data) {
    adaptiveDataCache = {
      feedback: result.data[STORAGE_KEY_FEEDBACK] || {},
      counts: result.data[STORAGE_KEY_COUNTS] || {}
    };
  } else {
    adaptiveDataCache = { feedback: {}, counts: {} };
  }
  return adaptiveDataCache;
};

/**
 * Save adaptive data to extension settings
 */
const saveAdaptiveData = async (feedback, counts) => {
  adaptiveDataCache = { feedback, counts };

  // Get current settings and merge
  const result = await api.settings.get();
  const currentData = result.success && result.data ? result.data : {};

  await api.settings.set({
    ...currentData,
    [STORAGE_KEY_FEEDBACK]: feedback,
    [STORAGE_KEY_COUNTS]: counts
  });
};

// Initialize with empty data - will be loaded asynchronously
let state = {
  commands: [], // array of command names
  matches: [], // array of commands matching the typed text
  matchIndex: 0, // index of selected match
  matchCounts: {}, // match counts - selectedcommand:numberofselections
  adaptiveFeedback: {}, // adaptive matching - typed -> { command: count, ... }
  typed: '', // text typed by user so far, if any
  lastExecuted: '', // text last typed by user when last they hit return

  // UI visibility state
  showResults: false, // Whether to show the results dropdown

  // Output selection mode - for selecting an item from command output
  outputSelectionMode: false, // Whether we're selecting from command output
  outputItems: [], // Array of items to select from
  outputItemIndex: 0, // Currently selected output item
  outputMimeType: null, // MIME type of output items
  outputSourceCommand: null, // Command that produced the output

  // Chain mode state for command composition
  chainMode: false, // Whether we're in chain mode (piping output between commands)
  chainContext: null, // Current chain data: { data, mimeType, title, sourceCommand }
  chainStack: [], // History stack for undo (array of chainContext objects)

  // Execution state for showing progress
  executing: false, // Whether a command is currently executing
  executingCommand: null, // Name of the command being executed
  executionTimeout: null, // Timeout handle for cancellation
  executionError: null // Error message if execution failed
};

// Load adaptive data on startup
loadAdaptiveData().then(data => {
  state.adaptiveFeedback = data.feedback;
  state.matchCounts = data.counts;
  log('cmd:panel', 'Loaded adaptive data');
});

// Window sizing constants
const COLLAPSED_HEIGHT = 60;  // Just the command bar
const EXPANDED_HEIGHT = 400;  // With results/preview

/**
 * Resize the window based on content visibility
 */
function updateWindowSize() {
  const resultsVisible = document.getElementById('results')?.classList.contains('visible');
  const previewVisible = document.getElementById('preview-container')?.classList.contains('visible');
  const chainVisible = document.getElementById('chain-indicator')?.classList.contains('visible');
  const execVisible = document.getElementById('execution-state')?.classList.contains('visible');

  const needsExpanded = resultsVisible || previewVisible || chainVisible || execVisible || state.outputSelectionMode;
  const targetHeight = needsExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;

  api.window.resize(600, targetHeight);
}

window.addEventListener('cmd-update-commands', function(e) {
  log('cmd:panel', 'received updated commands');
  state.commands = e.detail;
});

async function render() {
  // Get elements
  const commandInput = document.getElementById('command-input');
  const commandText = document.getElementById('command-text');
  const resultsContainer = document.getElementById('results');

  // Set up input tracking
  commandInput.value = '';
  commandInput.focus();

  // Add event listeners to the input
  commandInput.addEventListener('input', () => {
    state.typed = commandInput.value;
    // Reset showResults when user types (they'll press down to see results)
    state.showResults = false;

    if (state.typed) {
      // Always pass full text to findMatchingCommands so it can detect parameters
      state.matches = findMatchingCommands(state.typed);
      state.matchIndex = 0;
    } else {
      state.matches = [];
      state.matchIndex = 0;
    }
    updateCommandUI();
    updateResultsUI();
  });

  commandInput.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowRight', 'Tab', 'Escape', 'Enter'].includes(e.key)) {
      // Only prevent default for ArrowRight in output selection mode
      if (e.key === 'ArrowRight' && !state.outputSelectionMode) {
        return; // Let normal cursor movement happen
      }
      e.preventDefault(); // Prevent default for special keys
      handleSpecialKey(e);
    }
  });

  // Keep focus on input
  window.addEventListener('blur', () => {
    setTimeout(() => commandInput.focus(), 10);
  });

  window.addEventListener('focus', () => {
    commandInput.focus();
  });

  // Handle visibility changes
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      updateCommandUI();
    }
  });

  // Initial focus
  setTimeout(() => {
    commandInput.focus();
  }, 50);

  // Reset state when panel becomes visible (handles keepLive reuse)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // Reset execution state when panel is shown
      hideExecutionState();
      // Exit output selection mode if panel was reused
      if (state.outputSelectionMode) {
        exitOutputSelectionMode();
      }
      // Exit chain mode if panel was reused
      if (state.chainMode) {
        exitChainMode();
      }
      // Reset showResults
      state.showResults = false;
    }
  });

  // Chain cancel button handler
  const chainCancelBtn = document.getElementById('chain-cancel');
  if (chainCancelBtn) {
    chainCancelBtn.addEventListener('click', () => {
      exitChainMode();
      commandInput.value = '';
      state.typed = '';
      commandInput.focus();
      updateCommandUI();
      updateResultsUI();
    });
  }

  // Execution cancel button handler
  const execCancelBtn = document.querySelector('#execution-state .exec-cancel');
  if (execCancelBtn) {
    execCancelBtn.addEventListener('click', () => {
      cancelExecution();
      commandInput.focus();
    });
  }
}

render();

/**
 * Handles special key presses (arrows, tab, enter, escape)
 */
function handleSpecialKey(e) {
  const commandInput = document.getElementById('command-input');

  // Escape key - exit modes first, then close window
  if (e.key === 'Escape' && !hasModifier(e)) {
    // Exit output selection mode first
    if (state.outputSelectionMode) {
      exitOutputSelectionMode();
      commandInput.value = '';
      state.typed = '';
      updateCommandUI();
      updateResultsUI();
      return;
    }

    // Exit chain mode next
    if (state.chainMode) {
      exitChainMode();
      commandInput.value = '';
      state.typed = '';
      updateCommandUI();
      updateResultsUI();
      return;
    }

    // Hide results if visible
    if (state.showResults) {
      state.showResults = false;
      updateResultsUI();
      return;
    }

    shutdown();
    return;
  }

  // Enter key - execute command (but not if in output selection mode - handled above)
  if (e.key === 'Enter' && !hasModifier(e) && !state.outputSelectionMode) {
    // Check if the typed text is a URL - if so, use the "open" command
    const trimmedText = commandInput.value.trim();
    const urlResult = getValidURL(trimmedText);
    if (urlResult.valid && state.commands['open']) {
      log('cmd:panel', 'Detected URL, using open command:', urlResult.url);
      state.lastExecuted = 'open';
      updateMatchCount('open');
      updateAdaptiveFeedback(trimmedText.split(' ')[0], 'open');

      // Execute open command with the URL
      execute('open', 'open ' + trimmedText);

      // Clear input and UI
      commandInput.value = '';
      state.typed = '';
      updateCommandUI();
      updateResultsUI();
      return;
    }

    // Otherwise, execute the matched command
    const name = state.matches[state.matchIndex];
    if (name && Object.keys(state.commands).indexOf(name) > -1) {
      // Preserve any parameters when executing
      const typedText = commandInput.value;

      // Store command name for history and adaptive feedback
      const commandPart = typedText.split(' ')[0];
      state.lastExecuted = name;
      updateMatchCount(name);
      updateAdaptiveFeedback(commandPart, name);

      // Execute with full typed text
      execute(name, typedText);

      // Clear input and UI
      commandInput.value = '';
      state.typed = '';
      updateCommandUI();
      updateResultsUI();
    }
    return;
  }

  // Arrow Up - navigate results or output items up
  if (e.key === 'ArrowUp') {
    if (state.outputSelectionMode && state.outputItemIndex > 0) {
      // Navigate output items
      state.outputItemIndex--;
      updateOutputSelectionUI();
      return;
    } else if (state.showResults && state.matchIndex > 0) {
      // Navigate command results
      state.matchIndex--;
      updateCommandUI();
      updateResultsUI();
      return;
    }
    return;
  }

  // Arrow Down - show results or navigate down
  if (e.key === 'ArrowDown') {
    if (state.outputSelectionMode) {
      // Navigate output items
      if (state.outputItemIndex + 1 < state.outputItems.length) {
        state.outputItemIndex++;
        updateOutputSelectionUI();
      }
      return;
    }

    // Show results if not already visible
    if (!state.showResults && state.matches.length > 0) {
      state.showResults = true;
      updateResultsUI();
      return;
    }

    // Navigate down in results
    if (state.showResults && state.matchIndex + 1 < state.matches.length) {
      state.matchIndex++;
      updateCommandUI();
      updateResultsUI();
      return;
    }
    return;
  }

  // Right Arrow or Enter in output selection mode - proceed to chaining
  if (state.outputSelectionMode && (e.key === 'ArrowRight' || e.key === 'Enter')) {
    selectOutputItem();
    return;
  }

  // Tab key - autocomplete or cycle through matches
  if (e.key === 'Tab' && state.matches.length > 0) {
    const currentMatch = state.matches[state.matchIndex];
    const currentValue = commandInput.value.trim();

    // Check if we already completed to a match (need to cycle to next)
    // This is true if current value starts with current match + space or equals current match
    const alreadyCompleted = currentValue === currentMatch ||
                            currentValue.startsWith(currentMatch + ' ');

    if (alreadyCompleted && state.matches.length > 1) {
      // Cycle to next match
      state.matchIndex = (state.matchIndex + 1) % state.matches.length;
    }
    // else: first completion, stay on current matchIndex

    const match = state.matches[state.matchIndex];

    // Set to the match with a trailing space
    state.typed = match + ' ';
    commandInput.value = state.typed;

    // Update UI but DON'T recalculate matches - keep cycling through current set
    updateCommandUI();
    // Don't call updateResultsUI() here - it would recalculate matches

    // Place cursor at the end
    setTimeout(() => {
      commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length);
    }, 0);

    return;
  }
}

/**
 * Builds execution context from typed string and command name
 */
function buildExecutionContext(name, typed) {
  // Split typed text by command name to get parts
  const parts = typed.trim().split(name).map(s => s.trim());
  // Parameters are everything after the command name
  const params = parts.slice(1).filter(p => p.length > 0);
  // Search is the joined params (text after command name)
  const search = params.length > 0 ? params.join(' ') : null;

  const context = {
    typed,       // Full typed string
    name,        // Command name
    params,      // Array of parameters
    search       // Text after command name (for search-style commands)
  };

  // Add chain data if in chain mode
  if (state.chainMode && state.chainContext) {
    context.input = state.chainContext.data;           // Input data from previous command
    context.inputMimeType = state.chainContext.mimeType; // MIME type of input data
    context.inputTitle = state.chainContext.title;     // Human-readable title
    context.inputSource = state.chainContext.sourceCommand; // Source command name
  }

  return context;
}

// ===== Chain Mode Functions =====

/**
 * Check if a MIME pattern matches an actual MIME type
 * Supports wildcards like star/star for any type, text/star for text subtypes
 */
function mimeTypeMatches(pattern, actual) {
  if (!pattern || !actual) return false;
  if (pattern === '*/*' || pattern === actual) return true;

  const [pType, pSub] = pattern.split('/');
  const [aType, aSub] = actual.split('/');

  // Wildcard subtype (e.g., "text/*" matches "text/plain")
  return pSub === '*' && pType === aType;
}

/**
 * Find commands that can accept the given MIME type as input
 */
function findChainingCommands(mimeType) {
  return Object.values(state.commands).filter(cmd => {
    if (!cmd.accepts?.length) return false;
    return cmd.accepts.some(acceptedType => mimeTypeMatches(acceptedType, mimeType));
  });
}

/**
 * Enter chain mode with output from a command
 * @param {Object} output - { data, mimeType, title }
 * @param {string} sourceCommand - Name of the command that produced this output
 */
function enterChainMode(output, sourceCommand) {
  log('cmd:panel', 'Entering chain mode with output:', output.mimeType, output.title);

  state.chainMode = true;
  state.chainContext = {
    data: output.data,
    mimeType: output.mimeType,
    title: output.title || 'Output',
    sourceCommand
  };

  // Push to stack for potential undo
  state.chainStack.push({ ...state.chainContext });

  // Find commands that can accept this output
  const chainingCommands = findChainingCommands(output.mimeType);
  log('cmd:panel', 'Found', chainingCommands.length, 'commands accepting', output.mimeType);

  // Clear input and update matches to show chaining commands
  state.typed = '';
  state.matches = chainingCommands.map(cmd => cmd.name);
  state.matchIndex = 0;

  // Update UI
  updateChainUI();
  updateCommandUI();
  updateResultsUI();

  // Show preview if we have data
  if (output.data) {
    showPreview(output.data, output.mimeType, output.title);
  }
}

/**
 * Exit chain mode and reset state
 */
function exitChainMode() {
  log('cmd:panel', 'Exiting chain mode');

  state.chainMode = false;
  state.chainContext = null;
  state.chainStack = [];
  state.matches = [];
  state.matchIndex = 0;

  // Hide preview
  hidePreview();

  // Update UI
  updateChainUI();
  updateCommandUI();
  updateResultsUI();
}

/**
 * Go back one step in the chain (undo)
 */
function chainUndo() {
  if (state.chainStack.length <= 1) {
    // Can't undo past the first item, exit chain mode
    exitChainMode();
    return;
  }

  // Pop current and restore previous
  state.chainStack.pop();
  state.chainContext = { ...state.chainStack[state.chainStack.length - 1] };

  // Update matches for the restored context
  const chainingCommands = findChainingCommands(state.chainContext.mimeType);
  state.matches = chainingCommands.map(cmd => cmd.name);
  state.matchIndex = 0;

  // Update UI
  updateChainUI();
  updateCommandUI();
  updateResultsUI();

  // Update preview
  if (state.chainContext.data) {
    showPreview(state.chainContext.data, state.chainContext.mimeType, state.chainContext.title);
  }
}

// ===== Output Selection Mode Functions =====

/**
 * Enter output selection mode to let user pick an item from array output
 * @param {Array} items - Array of items to select from
 * @param {string} mimeType - MIME type of the items
 * @param {string} sourceCommand - Command that produced this output
 */
function enterOutputSelectionMode(items, mimeType, sourceCommand) {
  log('cmd:panel', 'Entering output selection mode with', items.length, 'items');

  state.outputSelectionMode = true;
  state.outputItems = items;
  state.outputItemIndex = 0;
  state.outputMimeType = mimeType;
  state.outputSourceCommand = sourceCommand;

  // Clear command input
  state.typed = '';
  state.matches = [];
  state.showResults = false;

  // Update UI to show selectable items
  updateOutputSelectionUI();
}

/**
 * Exit output selection mode
 */
function exitOutputSelectionMode() {
  log('cmd:panel', 'Exiting output selection mode');

  state.outputSelectionMode = false;
  state.outputItems = [];
  state.outputItemIndex = 0;
  state.outputMimeType = null;
  state.outputSourceCommand = null;

  // Hide preview and results
  hidePreview();
  const resultsContainer = document.getElementById('results');
  if (resultsContainer) {
    resultsContainer.classList.remove('visible');
    resultsContainer.innerHTML = '';
  }
}

/**
 * Select the currently highlighted output item and enter chain mode
 */
function selectOutputItem() {
  if (!state.outputSelectionMode || state.outputItems.length === 0) return;

  const selectedItem = state.outputItems[state.outputItemIndex];
  log('cmd:panel', 'Selected output item:', state.outputItemIndex, selectedItem);

  // Exit output selection mode
  const mimeType = state.outputMimeType;
  const sourceCommand = state.outputSourceCommand;
  exitOutputSelectionMode();

  // Enter chain mode with the selected item
  enterChainMode({
    data: selectedItem,
    mimeType: mimeType,
    title: getItemTitle(selectedItem)
  }, sourceCommand);
}

/**
 * Get a human-readable title for an item
 */
function getItemTitle(item) {
  if (typeof item === 'string') return item.slice(0, 50);
  if (typeof item === 'object' && item !== null) {
    // Try common title fields
    return item.name || item.title || item.label || item.id || JSON.stringify(item).slice(0, 50);
  }
  return String(item).slice(0, 50);
}

/**
 * Update UI for output selection mode
 */
function updateOutputSelectionUI() {
  const resultsContainer = document.getElementById('results');
  if (!resultsContainer) return;

  resultsContainer.innerHTML = '';

  if (!state.outputSelectionMode || state.outputItems.length === 0) {
    resultsContainer.classList.remove('visible');
    return;
  }

  // Show results container
  resultsContainer.classList.add('visible');

  // Create items
  state.outputItems.slice(0, 50).forEach((item, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'command-item';
    if (index === state.outputItemIndex) {
      itemEl.classList.add('selected');
    }

    // Render item content based on type
    const nameSpan = document.createElement('span');
    nameSpan.className = 'cmd-name';
    nameSpan.textContent = getItemTitle(item);
    itemEl.appendChild(nameSpan);

    // Add type indicator
    if (typeof item === 'object' && item !== null) {
      const descSpan = document.createElement('span');
      descSpan.className = 'cmd-desc';
      const keys = Object.keys(item).slice(0, 3);
      descSpan.textContent = keys.join(', ');
      itemEl.appendChild(descSpan);
    }

    // Click to select
    itemEl.addEventListener('click', () => {
      state.outputItemIndex = index;
      selectOutputItem();
    });

    resultsContainer.appendChild(itemEl);
  });

  // Show preview of selected item
  if (state.outputItems[state.outputItemIndex]) {
    showPreview(
      state.outputItems[state.outputItemIndex],
      state.outputMimeType,
      `Item ${state.outputItemIndex + 1} of ${state.outputItems.length}`
    );
  }
}

/**
 * Update chain indicator UI
 */
function updateChainUI() {
  const chainIndicator = document.getElementById('chain-indicator');
  if (!chainIndicator) return;

  if (state.chainMode && state.chainContext) {
    chainIndicator.classList.add('visible');
    document.getElementById('chain-mime').textContent = state.chainContext.mimeType;
    document.getElementById('chain-title').textContent = state.chainContext.title || '';
  } else {
    chainIndicator.classList.remove('visible');
  }
  updateWindowSize();
}

/**
 * Show preview pane with data
 */
function showPreview(data, mimeType, title) {
  const previewContainer = document.getElementById('preview-container');
  const previewContent = document.getElementById('preview-content');
  const previewMime = document.getElementById('preview-mime');
  const previewTitle = document.getElementById('preview-title');

  if (!previewContainer || !previewContent) {
    log('cmd:panel', 'Preview container not found');
    return;
  }

  // Render content based on MIME type
  const renderer = getRenderer(mimeType);
  previewContent.innerHTML = renderer(data);

  // Update header
  if (previewMime) previewMime.textContent = mimeType;
  if (previewTitle) previewTitle.textContent = title || '';

  // Show container
  previewContainer.classList.add('visible');
  updateWindowSize();
}

/**
 * Hide preview pane
 */
function hidePreview() {
  const previewContainer = document.getElementById('preview-container');
  if (previewContainer) {
    previewContainer.classList.remove('visible');
  }
  updateWindowSize();
}

// ===== MIME Type Renderers =====

/**
 * Get renderer for MIME type
 */
function getRenderer(mimeType) {
  const renderers = {
    'application/json': renderJson,
    'text/csv': renderCsv,
    'text/plain': renderPlain,
    'text/html': renderHtml
  };

  // Try exact match first
  if (renderers[mimeType]) {
    return renderers[mimeType];
  }

  // Try type-only match (e.g., "text/*")
  const [type] = mimeType.split('/');
  if (type === 'text') {
    return renderPlain;
  }

  // Default fallback
  return renderDefault;
}

function renderJson(data) {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;

    // If it's an array, render as a nice list/table
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Check if items are objects (render as table) or primitives (render as list)
      if (typeof parsed[0] === 'object' && parsed[0] !== null) {
        return renderJsonTable(parsed);
      } else {
        // Simple array of primitives
        const items = parsed.slice(0, 50).map((item, i) =>
          `<div class="preview-list-item">${i + 1}. ${escapeHtml(String(item))}</div>`
        ).join('');
        const more = parsed.length > 50 ? `<div class="preview-more">... and ${parsed.length - 50} more</div>` : '';
        return `<div class="preview-list">${items}${more}</div>`;
      }
    }

    // For objects or other types, show formatted JSON
    return `<pre class="preview-json">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
  } catch (e) {
    return `<pre class="preview-error">Invalid JSON: ${escapeHtml(String(data))}</pre>`;
  }
}

function renderJsonTable(data) {
  // Get all unique keys from the objects
  const keys = new Set();
  data.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach(k => keys.add(k));
    }
  });
  const headers = Array.from(keys).slice(0, 6); // Limit columns

  // Build table
  const headerRow = headers.map(h => `<th>${escapeHtml(String(h))}</th>`).join('');
  const rows = data.slice(0, 30).map(item => {
    const cells = headers.map(h => {
      const val = item[h];
      const display = val === null || val === undefined ? '' :
                      typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `<td>${escapeHtml(display.slice(0, 50))}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const more = data.length > 30 ? `<div class="preview-more">Showing 30 of ${data.length} items</div>` : '';

  return `<table class="preview-table"><thead><tr>${headerRow}</tr></thead><tbody>${rows}</tbody></table>${more}`;
}

function renderCsv(data) {
  const lines = String(data).split('\n').slice(0, 20); // Limit to 20 lines
  const rows = lines.map(line => {
    const cells = line.split(',').map(cell => `<td>${escapeHtml(cell.trim())}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table class="preview-csv">${rows}</table>`;
}

function renderPlain(data) {
  const text = String(data).slice(0, 2000); // Limit length
  return `<pre class="preview-plain">${escapeHtml(text)}</pre>`;
}

function renderHtml(data) {
  // Sanitize and show snippet of HTML
  const text = String(data).slice(0, 2000);
  return `<pre class="preview-html">${escapeHtml(text)}</pre>`;
}

function renderDefault(data) {
  const text = String(data).slice(0, 1000);
  return `<pre class="preview-default">${escapeHtml(text)}</pre>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ===== Execution State Functions =====

const EXECUTION_TIMEOUT_MS = 30000; // 30 second timeout

/**
 * Show execution state (spinner + command name)
 */
function showExecutionState(commandName) {
  state.executing = true;
  state.executingCommand = commandName;
  state.executionError = null;

  const execState = document.getElementById('execution-state');
  if (!execState) return;

  execState.classList.remove('error');
  execState.classList.add('visible');

  const spinner = execState.querySelector('.spinner');
  const execText = execState.querySelector('.exec-text');

  if (spinner) spinner.style.display = 'block';
  if (execText) execText.textContent = `Running "${commandName}"...`;
  updateWindowSize();
}

/**
 * Hide execution state
 */
function hideExecutionState() {
  state.executing = false;
  state.executingCommand = null;
  state.executionError = null;

  if (state.executionTimeout) {
    clearTimeout(state.executionTimeout);
    state.executionTimeout = null;
  }

  const execState = document.getElementById('execution-state');
  if (execState) {
    execState.classList.remove('visible');
    execState.classList.remove('error');
  }
  updateWindowSize();
}

/**
 * Show execution error
 */
function showExecutionError(commandName, errorMsg) {
  state.executing = false;
  state.executionError = errorMsg;

  if (state.executionTimeout) {
    clearTimeout(state.executionTimeout);
    state.executionTimeout = null;
  }

  const execState = document.getElementById('execution-state');
  if (!execState) return;

  execState.classList.add('error');
  execState.classList.add('visible');

  const spinner = execState.querySelector('.spinner');
  const execText = execState.querySelector('.exec-text');

  if (spinner) spinner.style.display = 'none';
  if (execText) {
    execText.innerHTML = `<span class="exec-error">"${escapeHtml(commandName)}" failed: ${escapeHtml(errorMsg)}</span>`;
  }
  updateWindowSize();

  // Auto-hide error after 5 seconds
  setTimeout(() => {
    if (state.executionError === errorMsg) {
      hideExecutionState();
    }
  }, 5000);
}

/**
 * Cancel current execution
 */
function cancelExecution() {
  log('cmd:panel', 'Cancelling execution');
  hideExecutionState();
}

/**
 * Executes a command
 */
async function execute(name, typed) {
  log('cmd:panel', 'execute() called with:', name, typed);
  if (!state.commands[name]) return;

  log('cmd:panel', 'executing cmd', name, typed);
  const context = buildExecutionContext(name, typed);
  log('cmd:panel', 'execution context', context);

  // Delay showing execution state - only show if command takes > 150ms
  // This prevents flash for fast commands
  const SHOW_SPINNER_DELAY_MS = 150;
  const showStateTimer = setTimeout(() => {
    showExecutionState(name);
  }, SHOW_SPINNER_DELAY_MS);

  // Set up timeout
  const timeoutPromise = new Promise((_, reject) => {
    state.executionTimeout = setTimeout(() => {
      reject(new Error(`Command timed out after ${EXECUTION_TIMEOUT_MS / 1000}s`));
    }, EXECUTION_TIMEOUT_MS);
  });

  try {
    // Execute command with timeout
    const result = await Promise.race([
      state.commands[name].execute(context),
      timeoutPromise
    ]);

    // Clear timers
    clearTimeout(showStateTimer);
    if (state.executionTimeout) {
      clearTimeout(state.executionTimeout);
      state.executionTimeout = null;
    }

    // Hide execution state (in case it was shown)
    hideExecutionState();

    log('cmd:panel', 'command result:', result);

    // Check if command produced chainable output
    if (result && result.output && result.output.data && result.output.mimeType) {
      const outputData = result.output.data;

      // If output is an array, enter output selection mode first
      // User picks an item, then we enter chain mode with that item
      if (Array.isArray(outputData) && outputData.length > 0) {
        // Enter output selection mode to let user pick an item
        enterOutputSelectionMode(outputData, result.output.mimeType, name);

        // Clear input for selection
        const commandInput = document.getElementById('command-input');
        if (commandInput) {
          commandInput.value = '';
          commandInput.focus();
        }
        // Don't shutdown - stay open for selection
        return;
      }

      // Single item output - enter chain mode directly
      enterChainMode(result.output, name);

      // Clear input for next command
      const commandInput = document.getElementById('command-input');
      if (commandInput) {
        commandInput.value = '';
        commandInput.focus();
      }
      // Don't shutdown - stay open for chaining
      return;
    }

    // No output or end of chain - close panel
    if (state.chainMode) {
      exitChainMode();
    }

    // Check result action type
    // 'prompt' - command shows a dialog/prompt, keep panel open for user interaction
    if (result && result.action === 'prompt') {
      return;
    }

    setTimeout(shutdown, 100);
  } catch (err) {
    // Clear the show state timer on error too
    clearTimeout(showStateTimer);

    log.error('cmd:panel', 'Command execution error:', err);

    // Show error state
    showExecutionError(name, err.message || 'Unknown error');

    // Don't close panel on error - let user see the error and try again
  }
}

/**
 * Closes the window
 */
async function shutdown() {
  window.close();
}

/**
 * Finds commands matching the typed text
 */
function findMatchingCommands(text) {
  log('cmd:panel', 'findMatchingCommands', text, Object.keys(state.commands).length);

  let matches = [];

  // No text, no matches
  if (!text) {
    return matches;
  }

  // Get the command part (text before the first space)
  const commandPart = text.split(' ')[0];
  const hasParameters = text.includes(' ');

  log('cmd:panel', 'Command part:', commandPart, 'Has parameters:', hasParameters);

  // Iterate over all commands, searching for matches
  for (const name of Object.keys(state.commands)) {
    // Match when:
    // 1. typed string is anywhere in a command name
    // 2. command name is at beginning of typed string (for commands with parameters)
    log('cmd:panel', 'testing option...', name);

    const matchesCommand = name.toLowerCase().indexOf(commandPart.toLowerCase()) !== -1;
    const isCommandWithParams = hasParameters && text.toLowerCase().startsWith(name.toLowerCase() + ' ');

    if (matchesCommand || isCommandWithParams) {
      matches.push(name);
    }
  }

  // Sort by:
  // 1. Exact match with parameters (highest priority)
  // 2. Adaptive score
  // 3. Match count (frecency)
  matches.sort(function(a, b) {
    // If we have parameters, prioritize exact command match
    if (hasParameters) {
      const aExact = a.toLowerCase() === commandPart.toLowerCase();
      const bExact = b.toLowerCase() === commandPart.toLowerCase();
      if (aExact && !bExact) return -1;
      if (bExact && !aExact) return 1;
    }

    // Then compare adaptive scores for this typed string
    const aAdaptive = getAdaptiveScore(commandPart, a);
    const bAdaptive = getAdaptiveScore(commandPart, b);

    // If there's a significant difference in adaptive scores, use that
    if (Math.abs(aAdaptive - bAdaptive) > 0.01) {
      return bAdaptive - aAdaptive;
    }

    // Otherwise fall back to match count (frecency)
    const aCount = state.matchCounts[a] || 0;
    const bCount = state.matchCounts[b] || 0;
    return bCount - aCount;
  });

  return matches;
}

/**
 * Updates the adaptive feedback for a typed string -> command selection
 * Uses asymptotic scoring: score = count / (count + k)
 * This creates ever-strengthening reinforcement based on user decisions
 */
function updateAdaptiveFeedback(typed, name) {
  // Initialize feedback for this typed string if needed
  if (!state.adaptiveFeedback[typed]) {
    state.adaptiveFeedback[typed] = {};
  }

  // Increment the count for this typed -> command pair
  if (!state.adaptiveFeedback[typed][name]) {
    state.adaptiveFeedback[typed][name] = 0;
  }
  state.adaptiveFeedback[typed][name]++;

  // Also record feedback for all prefixes of the typed string
  // This helps with single-character matching
  for (let i = 1; i < typed.length; i++) {
    const prefix = typed.substring(0, i);
    if (!state.adaptiveFeedback[prefix]) {
      state.adaptiveFeedback[prefix] = {};
    }
    if (!state.adaptiveFeedback[prefix][name]) {
      state.adaptiveFeedback[prefix][name] = 0;
    }
    // Give partial credit to prefixes (half weight)
    state.adaptiveFeedback[prefix][name] += 0.5;
  }

  // Persist to storage
  saveAdaptiveData(state.adaptiveFeedback, state.matchCounts);
}

/**
 * Gets the adaptive score for a command given the typed string
 * Uses asymptotic formula: score = count / (count + k)
 * Returns 0-1 where higher is better
 */
function getAdaptiveScore(typed, name) {
  const k = 3; // Tuning constant - higher = slower convergence
  const feedback = state.adaptiveFeedback[typed];
  if (!feedback || !feedback[name]) {
    return 0;
  }
  const count = feedback[name];
  return count / (count + k);
}

/**
 * Updates the match count for frequency sorting
 */
function updateMatchCount(name) {
  if (!state.matchCounts[name]) {
    state.matchCounts[name] = 0;
  }
  state.matchCounts[name]++;

  // Persist to storage
  saveAdaptiveData(state.adaptiveFeedback, state.matchCounts);
}

/**
 * Updates the command text UI with proper highlighting
 * Shows typed text in white, suggestion completion in grey
 * Positions custom cursor at the start of the match
 */
function updateCommandUI() {
  const commandText = document.getElementById('command-text');
  const customCursor = document.getElementById('custom-cursor');
  commandText.innerHTML = '';

  // If no typed text, hide cursor and show nothing
  if (!state.typed) {
    if (customCursor) customCursor.style.display = 'none';
    return;
  }

  // Show cursor when typing
  if (customCursor) customCursor.style.display = 'block';

  // If no matches, just show the typed text with cursor at end
  if (state.matches.length === 0) {
    const typedSpan = document.createElement('span');
    typedSpan.className = 'typed';
    typedSpan.textContent = state.typed;
    commandText.appendChild(typedSpan);
    positionCursor(state.typed.length);
    return;
  }

  const selectedMatch = state.matches[state.matchIndex];
  if (!selectedMatch) {
    const typedSpan = document.createElement('span');
    typedSpan.className = 'typed';
    typedSpan.textContent = state.typed;
    commandText.appendChild(typedSpan);
    positionCursor(state.typed.length);
    return;
  }

  // Check if we have parameters (text after the command)
  // For multi-word commands like "open groups", we need to check if typed text
  // matches the full command name before splitting on spaces
  let typedCommand, typedParams;
  const trimmedTyped = state.typed.trim();

  // Check if typed text matches full command or command + params
  if (trimmedTyped.toLowerCase() === selectedMatch.toLowerCase()) {
    // Exact match - typed text IS the command (possibly with trailing space)
    typedCommand = trimmedTyped;
    typedParams = state.typed.substring(trimmedTyped.length); // Just the trailing space if any
  } else if (state.typed.toLowerCase().startsWith(selectedMatch.toLowerCase() + ' ')) {
    // Command with parameters - text after command name + space is params
    typedCommand = selectedMatch;
    typedParams = state.typed.substring(selectedMatch.length);
  } else {
    // Partial match - use first space as split point (original behavior)
    const hasParameters = state.typed.includes(' ');
    typedCommand = hasParameters ? state.typed.substring(0, state.typed.indexOf(' ')) : state.typed;
    typedParams = hasParameters ? state.typed.substring(state.typed.indexOf(' ')) : '';
  }

  // Find where the typed text matches in the command
  const lowerMatch = selectedMatch.toLowerCase();
  const lowerTyped = typedCommand.toLowerCase();
  const matchIndex = lowerMatch.indexOf(lowerTyped);

  if (matchIndex === 0) {
    // Typed text is at the start - show typed in white, rest in grey
    const typedSpan = document.createElement('span');
    typedSpan.className = 'typed';
    typedSpan.textContent = typedCommand;
    commandText.appendChild(typedSpan);

    // Show the rest of the command suggestion in grey
    if (selectedMatch.length > typedCommand.length) {
      const restSpan = document.createElement('span');
      restSpan.textContent = selectedMatch.substring(typedCommand.length);
      commandText.appendChild(restSpan);
    }

    // Add parameters in white
    if (typedParams) {
      const paramsSpan = document.createElement('span');
      paramsSpan.className = 'typed';
      paramsSpan.textContent = typedParams;
      commandText.appendChild(paramsSpan);
    }

    // Cursor at start (position 0)
    positionCursor(0);
  } else if (matchIndex > 0) {
    // Typed text matches in the middle - show full command with typed part highlighted
    const beforeSpan = document.createElement('span');
    beforeSpan.textContent = selectedMatch.substring(0, matchIndex);
    commandText.appendChild(beforeSpan);

    const typedSpan = document.createElement('span');
    typedSpan.className = 'typed';
    typedSpan.textContent = selectedMatch.substring(matchIndex, matchIndex + typedCommand.length);
    commandText.appendChild(typedSpan);

    const afterSpan = document.createElement('span');
    afterSpan.textContent = selectedMatch.substring(matchIndex + typedCommand.length);
    commandText.appendChild(afterSpan);

    // Add parameters in white
    if (typedParams) {
      const paramsSpan = document.createElement('span');
      paramsSpan.className = 'typed';
      paramsSpan.textContent = typedParams;
      commandText.appendChild(paramsSpan);
    }

    // Cursor at start of match
    positionCursor(matchIndex);
  } else {
    // No match position found, just show typed text
    const typedSpan = document.createElement('span');
    typedSpan.className = 'typed';
    typedSpan.textContent = state.typed;
    commandText.appendChild(typedSpan);
    positionCursor(state.typed.length);
  }
}

/**
 * Position the custom cursor at a character index in the command text
 */
function positionCursor(charIndex) {
  const customCursor = document.getElementById('custom-cursor');
  const commandText = document.getElementById('command-text');
  if (!customCursor || !commandText) return;

  // Create a temporary span to measure text width up to charIndex
  const textContent = commandText.textContent || '';
  const textToMeasure = textContent.substring(0, charIndex);

  // Create measuring element with same styling
  const measurer = document.createElement('span');
  measurer.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-family:inherit;font-size:18px;font-weight:500;';
  measurer.textContent = textToMeasure;
  commandText.appendChild(measurer);

  const width = measurer.offsetWidth;
  commandText.removeChild(measurer);

  customCursor.style.left = width + 'px';
}

/**
 * Updates the results list UI
 */
function updateResultsUI() {
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = '';

  // Don't show if in output selection mode (that has its own UI)
  if (state.outputSelectionMode) {
    return;
  }

  // Hide results if no matches or not in showResults mode
  // Exception: always show in chain mode since user needs to see available commands
  if (state.matches.length === 0 || (!state.showResults && !state.chainMode)) {
    resultsContainer.classList.remove('visible');
    updateWindowSize();
    return;
  }

  // Show results container
  resultsContainer.classList.add('visible');

  // Create and append result items
  state.matches.forEach((match, index) => {
    const item = document.createElement('div');
    item.className = 'command-item';
    if (index === state.matchIndex) {
      item.classList.add('selected');
    }

    // Get command metadata for description and badges
    const cmd = state.commands[match];

    // Build item content with name, description, and badges
    const nameSpan = document.createElement('span');
    nameSpan.className = 'cmd-name';
    nameSpan.textContent = match;
    item.appendChild(nameSpan);

    // Add description if available
    if (cmd && cmd.description) {
      const descSpan = document.createElement('span');
      descSpan.className = 'cmd-desc';
      descSpan.textContent = cmd.description;
      item.appendChild(descSpan);
    }

    // Add badges for chaining capabilities (only show in chain mode or if command has outputs)
    if (cmd && (state.chainMode || (cmd.produces && cmd.produces.length > 0))) {
      const badgesSpan = document.createElement('span');
      badgesSpan.className = 'cmd-badges';

      // Show what the command accepts (in chain mode)
      if (state.chainMode && cmd.accepts && cmd.accepts.length > 0) {
        const acceptBadge = document.createElement('span');
        acceptBadge.className = 'cmd-badge';
        acceptBadge.textContent = '← ' + cmd.accepts[0];
        badgesSpan.appendChild(acceptBadge);
      }

      // Show what the command produces
      if (cmd.produces && cmd.produces.length > 0) {
        const produceBadge = document.createElement('span');
        produceBadge.className = 'cmd-badge';
        produceBadge.textContent = '→ ' + cmd.produces[0];
        badgesSpan.appendChild(produceBadge);
      }

      if (badgesSpan.children.length > 0) {
        item.appendChild(badgesSpan);
      }
    }

    // Add click handler
    item.addEventListener('click', () => {
      state.matchIndex = index;
      execute(match, state.typed);
      state.lastExecuted = match;
      updateMatchCount(match);
      updateAdaptiveFeedback(state.typed.split(' ')[0], match);
      document.getElementById('command-input').value = '';
      state.typed = '';
      updateCommandUI();
      updateResultsUI();
    });

    resultsContainer.appendChild(item);
  });

  // Update window size based on visibility
  updateWindowSize();
}

/**
 * Checks if an event has modifier keys
 */
function hasModifier(e) {
  return e.altKey || e.ctrlKey || e.metaKey;
}

/**
 * Checks if a key is a modifier key
 */
function isModifier(e) {
  return ['Alt', 'Control', 'Shift', 'Meta'].indexOf(e.key) !== -1;
}

/**
 * Checks if a string is a valid URL (with or without protocol)
 * @param {string} str - The string to check
 * @returns {Object} - Object with valid flag and normalized URL
 */
function getValidURL(str) {
  if (!str) return { valid: false };

  // Check if it starts with a valid protocol (including peek:// for internal pages)
  const hasValidProtocol = /^(https?|ftp|file|peek):\/\//.test(str);

  if (!hasValidProtocol) {
    // Check if it looks like a domain (e.g., "example.com" or "localhost")
    const isDomainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/.*)?$/.test(str);
    const isLocalhost = /^localhost(:\d+)?(\/.*)?$/.test(str);

    if (isDomainPattern || isLocalhost) {
      const urlWithProtocol = 'https://' + str;
      try {
        new URL(urlWithProtocol);
        return { valid: true, url: urlWithProtocol };
      } catch (e) {
        return { valid: false };
      }
    }
    return { valid: false };
  }

  try {
    new URL(str);
    return { valid: true, url: str };
  } catch (e) {
    return { valid: false };
  }
}
