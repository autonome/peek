// cmd/panel.js
import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore } from "../utils.js";
import './commands.js'; // Load commands module to dispatch cmd-update-commands event

console.log('panel');

const debug = window.app.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);
const api = window.app;

let state = {
  commands: [], // array of command names
  matches: [], // array of commands matching the typed text
  matchIndex: 0, // index of selected match
  matchCounts: {}, // match counts - selectedcommand:numberofselections
  matchFeedback: {}, // adaptive matching - partiallytypedandselected:fullname
  typed: '', // text typed by user so far, if any
  lastExecuted: '' // text last typed by user when last they hit return
};

window.addEventListener('cmd-update-commands', function(e) {
  debug && console.log('ui received updated commands');
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
      // Special case: if input contains a space, display matches but highlight the prefix
      const spaceIndex = state.typed.indexOf(' ');
      if (spaceIndex !== -1) {
        const prefix = state.typed.substring(0, spaceIndex);
        const temp = findMatchingCommands(prefix);
        if (temp.length > 0) {
          state.matches = temp;
          state.matchIndex = 0;
        } else {
          state.matches = findMatchingCommands(state.typed);
          state.matchIndex = 0;
        }
      } else {
        // Regular case: update matches based on typed text
        state.matches = findMatchingCommands(state.typed);
        state.matchIndex = 0;
      }
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
    const name = state.matches[state.matchIndex];
    if (name && Object.keys(state.commands).indexOf(name) > -1) {
      // Preserve any parameters when executing
      const typedText = commandInput.value;
      
      // Store command name for history and feedback
      const commandPart = typedText.split(' ')[0];
      state.lastExecuted = name;
      updateMatchCount(name);
      updateMatchFeedback(commandPart, name);
      
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
    const params = commandInput.value.includes(' ') 
      ? commandInput.value.substring(commandInput.value.indexOf(' ')) 
      : '';
    
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
  if (state.commands[name]) {
    debug && console.log('executing cmd', name, typed);
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

  // Sort by match count
  matches.sort(function(a, b) {
    const aCount = state.matchCounts[a] || 0;
    const bCount = state.matchCounts[b] || 0;
    return bCount - aCount;
  });

  // Insert adaptive feedback at the top if present
  if (state.matchFeedback[text]) {
    // Check if it's already in the list
    const feedbackIndex = matches.indexOf(state.matchFeedback[text]);
    if (feedbackIndex !== -1) {
      // Move to the beginning
      matches.splice(feedbackIndex, 1);
    }
    matches.unshift(state.matchFeedback[text]);
  }

  return matches;
}

/**
 * Updates the match feedback for adaptive suggestions
 */
function updateMatchFeedback(typed, name) {
  state.matchFeedback[typed] = name;
}

/**
 * Updates the match count for frequency sorting
 */
function updateMatchCount(name) {
  if (!state.matchCounts[name]) {
    state.matchCounts[name] = 0;
  }
  state.matchCounts[name]++;
}

/**
 * Updates the command text UI with proper highlighting
 */
function updateCommandUI() {
  const commandText = document.getElementById('command-text');
  commandText.innerHTML = '';
  
  // If no matches or no typed text, clear the suggestion
  if (state.matches.length === 0 || !state.typed) {
    return;
  }
  
  const selectedMatch = state.matches[state.matchIndex];
  if (!selectedMatch) {
    return;
  }
  
  // Check if we have parameters (text after space)
  const hasParameters = state.typed.includes(' ');
  let matchText = state.typed;
  
  // If we have parameters, only match against the command part
  if (hasParameters) {
    matchText = state.typed.substring(0, state.typed.indexOf(' '));
  }
  
  // Find the matching part in the selected command
  const lowerSelected = selectedMatch.toLowerCase();
  const lowerMatchText = matchText.toLowerCase();
  
  // Calculate match information
  let matchIndex = lowerSelected.indexOf(lowerMatchText);
  
  // Special case for prefix match
  if (matchIndex === -1 && lowerMatchText && lowerSelected.startsWith(lowerMatchText)) {
    matchIndex = 0;
  }
  
  // If we found a match in the command part
  if (matchIndex !== -1) {
    // Split the command into parts
    const beforeMatch = selectedMatch.substring(0, matchIndex);
    const matchPart = selectedMatch.substring(matchIndex, matchIndex + matchText.length);
    const afterMatch = selectedMatch.substring(matchIndex + matchText.length);
    
    // Before the match
    if (beforeMatch) {
      const beforeSpan = document.createElement('span');
      beforeSpan.textContent = beforeMatch;
      commandText.appendChild(beforeSpan);
    }
    
    // The matched part (underlined)
    const matchSpan = document.createElement('span');
    matchSpan.className = 'matched';
    matchSpan.textContent = matchPart;
    commandText.appendChild(matchSpan);
    
    // After the match
    if (afterMatch) {
      const afterSpan = document.createElement('span');
      afterSpan.textContent = afterMatch;
      commandText.appendChild(afterSpan);
    }
    
    // Add parameters if present
    if (hasParameters) {
      const paramsText = state.typed.substring(state.typed.indexOf(' '));
      const paramsSpan = document.createElement('span');
      paramsSpan.textContent = paramsText;
      commandText.appendChild(paramsSpan);
    }
  } else {
    // No match found - just clear the suggestion
    commandText.textContent = '';
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
      updateMatchFeedback(state.typed, match);
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
