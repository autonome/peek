/**
 * Cmd Panel - command input and execution UI
 *
 * Runs in isolated panel window (peek://ext/cmd/panel.html)
 * Uses api.settings for persistent adaptive matching data
 */
import { id, labels, schemas, storageKeys, defaults } from './config.js';
import './commands.js'; // Load commands module to dispatch cmd-update-commands event

console.log('[cmd:panel] loaded');

const debug = window.app.debug;
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
  lastExecuted: '' // text last typed by user when last they hit return
};

// Load adaptive data on startup
loadAdaptiveData().then(data => {
  state.adaptiveFeedback = data.feedback;
  state.matchCounts = data.counts;
  console.log('[cmd:panel] Loaded adaptive data');
});

window.addEventListener('cmd-update-commands', function(e) {
  debug && console.log('[cmd:panel] received updated commands');
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
    if (['ArrowUp', 'ArrowDown', 'Tab', 'Escape', 'Enter'].includes(e.key)) {
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
}

render();

/**
 * Handles special key presses (arrows, tab, enter, escape)
 */
function handleSpecialKey(e) {
  const commandInput = document.getElementById('command-input');

  // Escape key - close window
  if (e.key === 'Escape' && !hasModifier(e)) {
    shutdown();
    return;
  }

  // Enter key - execute command
  if (e.key === 'Enter' && !hasModifier(e)) {
    // Check if the typed text is a URL - if so, use the "open" command
    const trimmedText = commandInput.value.trim();
    const urlResult = getValidURL(trimmedText);
    if (urlResult.valid && state.commands['open']) {
      debug && console.log('Detected URL, using open command:', urlResult.url);
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

  // Arrow Up - navigate results up
  if (e.key === 'ArrowUp' && state.matchIndex > 0) {
    state.matchIndex--;
    updateCommandUI();
    updateResultsUI();
    return;
  }

  // Arrow Down - navigate results down
  if (e.key === 'ArrowDown' && state.matchIndex + 1 < state.matches.length) {
    state.matchIndex++;
    updateCommandUI();
    updateResultsUI();
    return;
  }

  // Tab key - autocomplete
  if (e.key === 'Tab' && state.matches.length > 0) {
    // Get any parameters after the command (text after a space)
    // If no params yet, add a space so user can start typing params immediately
    const params = commandInput.value.includes(' ')
      ? commandInput.value.substring(commandInput.value.indexOf(' '))
      : ' ';

    // Set the command to the full match plus any parameters
    state.typed = state.matches[state.matchIndex] + params;
    commandInput.value = state.typed;

    // Update UI and matches
    state.matches = findMatchingCommands(state.typed);
    updateCommandUI();
    updateResultsUI();

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

  return {
    typed,       // Full typed string
    name,        // Command name
    params,      // Array of parameters
    search       // Text after command name (for search-style commands)
  };
}

/**
 * Executes a command
 */
async function execute(name, typed) {
  api.log('execute() called with:', name, typed);
  if (state.commands[name]) {
    api.log('executing cmd', name, typed);
    const context = buildExecutionContext(name, typed);
    debug && console.log('execution context', context);
    state.commands[name].execute(context);
    setTimeout(shutdown, 100);
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
  const r = debug; // Only log if in debug mode
  r && console.log('findMatchingCommands', text, state.commands.length);

  let matches = [];

  // No text, no matches
  if (!text) {
    return matches;
  }

  // Get the command part (text before the first space)
  const commandPart = text.split(' ')[0];
  const hasParameters = text.includes(' ');

  r && console.log('Command part:', commandPart, 'Has parameters:', hasParameters);

  // Iterate over all commands, searching for matches
  for (const name of Object.keys(state.commands)) {
    // Match when:
    // 1. typed string is anywhere in a command name
    // 2. command name is at beginning of typed string (for commands with parameters)
    r && console.log('testing option...', name);

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
 */
function updateCommandUI() {
  const commandText = document.getElementById('command-text');
  commandText.innerHTML = '';

  // If no typed text, show nothing
  if (!state.typed) {
    return;
  }

  // If no matches, just show the typed text
  if (state.matches.length === 0) {
    const typedSpan = document.createElement('span');
    typedSpan.className = 'typed';
    typedSpan.textContent = state.typed;
    commandText.appendChild(typedSpan);
    return;
  }

  const selectedMatch = state.matches[state.matchIndex];
  if (!selectedMatch) {
    const typedSpan = document.createElement('span');
    typedSpan.className = 'typed';
    typedSpan.textContent = state.typed;
    commandText.appendChild(typedSpan);
    return;
  }

  // Check if we have parameters (text after the command)
  const hasParameters = state.typed.includes(' ');
  const typedCommand = hasParameters ? state.typed.substring(0, state.typed.indexOf(' ')) : state.typed;
  const typedParams = hasParameters ? state.typed.substring(state.typed.indexOf(' ')) : '';

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
  } else {
    // No match position found, just show typed text
    const typedSpan = document.createElement('span');
    typedSpan.className = 'typed';
    typedSpan.textContent = state.typed;
    commandText.appendChild(typedSpan);
  }
}

/**
 * Updates the results list UI
 */
function updateResultsUI() {
  const resultsContainer = document.getElementById('results');
  resultsContainer.innerHTML = '';

  if (state.matches.length === 0) {
    return;
  }

  // Create and append result items
  state.matches.forEach((match, index) => {
    const item = document.createElement('div');
    item.className = 'command-item';
    if (index === state.matchIndex) {
      item.classList.add('selected');
    }
    item.textContent = match;

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
