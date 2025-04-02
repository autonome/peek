// cmd/panel.js
/*
 
TODO: NOW
* multistring search, eg "new pl" matches "new container tab: PL"
* <tab> to move to next in list (figure out vs params, chaining, etc)
* store state data in add-on, not localStorage
* placeholder text not working in release
* fix default command
* move command execution to background script

TODO: NEXT
* command suggestions (listed below - eg, see windows)
* command parameters
* command screenshots (eg, switch to window)
* command chaining

TODO: FUTURE
* remember last-executed command across restarts
* better visual fix for overflow text
* commands that identify things in the page and act on them (locations, events, people)

TODO: Settings
* add settings to right corner
* settings page
* configurable shortcut

TODO: Long running jobs
* add support for long-running jobs
* add support for "log in to <svc>"
* add notifications to right corner

TODO: Commands
* switch to window command, searching by title (named windows?)
* IPFS
* Flickr
* Pocket

*/

import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore } from "../utils.js";

console.log('panel');

const debug = window.app.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);
const api = window.app;

const address = 'peek://cmd/panel.html';


let state = {
  commands: [], // array of command names
  matches: [], // array of commands matching the typed text
  matchIndex: 0, // index of ???
  matchCounts: {}, // match counts - selectedcommand:numberofselections
  matchFeedback: {}, // adaptive matching - partiallytypedandselected:fullname
  typed: '', // text typed by user so far, if any
  lastExecuted: '' // text last typed by user when last they hit return
};

window.addEventListener('cmd-update-commands', function(e) {
  //console.log('ui received updated commands');
  state.commands = e.detail;
});

async function render() {
  // Get the command input element and results container
  const commandInput = document.getElementById('command-input');
  const resultsContainer = document.getElementById('results');
  
  // Set placeholder and focus the input
  commandInput.placeholder = 'Start typing...';
  commandInput.focus();
  
  // Add event listeners to the input
  commandInput.addEventListener('keyup', onKeyup);
  commandInput.addEventListener('keydown', (e) => {
    // Allow arrows, tab, escape
    if (!['ArrowUp', 'ArrowDown', 'Tab', 'Escape', 'Enter'].includes(e.key)) {
      return; // Don't prevent default for normal typing
    }
    e.preventDefault(); // Prevent default for special keys
  });
  
  // Make sure the input stays focused
  window.addEventListener('blur', () => {
    setTimeout(() => commandInput.focus(), 10);
  });
  
  window.addEventListener('focus', () => {
    commandInput.focus();
  });
  
  // Automatically focus the input when the window loads
  setTimeout(() => {
    commandInput.focus();
  }, 100);
}

render();

async function css(el, props) {
  Object.keys(props).forEach(p => el.style[p] = props[p]);
}

async function execute(name, typed) {
  if (state.commands[name]) {
    console.log('executing cmd', name, typed);

    // execute command
    const msg = state.commands[name].execute({typed});

    // close cmd popup
    // NOTE: this kills command execution
    // hrghhh, gotta turn execution completion promise
    // or run em async in background script
    setTimeout(shutdown, 100)
  }
}

function findMatchingCommands(text) {
  const r = true;
  r || console.log('findMatchingCommands', text, state.commands.length);

  let count = state.commands.length,
      matches = [];

  // Iterate over all commands, searching for matches
  //for (var i = 0; i < count; i++) {
  //for (const [name, properties] of Object.entries(state.commands)) {
  for (const name of Object.keys(state.commands)) {
    // Match when:
    // 1. typed string is anywhere in a command name
    // 2. command name is at beginning of typed string
    //    (eg: for command input - "weather san diego")
    r || console.log('testing option...', name);
    if (name.toLowerCase().indexOf(state.typed.toLowerCase()) != -1 ||
        state.typed.toLowerCase().indexOf(name.toLowerCase()) === 0) {
      matches.push(name);
    }
  }

  // sort by match count
  state.matches.sort(function(a, b) {
    var aCount = state.matchCounts[a] || 0;
    var bCount = state.matchCounts[b] || 0;
    return bCount - aCount;
  })

  // insert adaptive feedback
  if (state.matchFeedback[state.typed]) {
    state.matches.unshift(state.matchFeedback[state.typed])
  }

  return matches;
}

function updateMatchFeedback(typed, name) {
  state.matchFeedback[typed] = name;
}

function updateMatchCount(name) {
  if (!state.matchCounts[name]);
    state.matchCounts[name] = 0;
  state.matchCounts[name]++;
}

async function shutdown() {
  window.close();
  /*
  let container = document.querySelector('#cmdContainer');
  if (container) {
    document.body.removeChild(container);
  }
  document.removeEventListener('keyup', onKeyup, true);
  document.removeEventListener('keypress', onKeyDummyStop, true);
  document.removeEventListener('keydown', onKeyDummyStop, true);
  document.removeEventListener('input', onKeyDummyStop, true);
  */
  //console.log('ui shutdown complete');
}

function onKeyDummyStop(e) {
  e.preventDefault();
}

async function onKeyup(e) {
  // flag for logging
  const r = true;
  
  // Get the command input element and results container
  const commandInput = document.getElementById('command-input');
  const resultsContainer = document.getElementById('results');
  
  // Use the input value as the typed text
  state.typed = commandInput.value;

  if (isModifier(e)) {
    return;
  }

  // if user pressed escape, go away
  if (e.key == 'Escape' && !hasModifier(e)) {
    await shutdown();
    return;
  }

  // if user pressed return, attempt to execute command
  if (e.key == 'Enter' && !hasModifier(e)) {
    let name = state.matches[state.matchIndex];
    if (name && Object.keys(state.commands).indexOf(name) > -1) {
      execute(name, state.typed);
      state.lastExecuted = name;
      updateMatchCount(name);
      updateMatchFeedback(state.typed, name);
      commandInput.value = '';
      state.typed = '';
      resultsContainer.innerHTML = '';
    }
    return;
  }

  // Handle up/down arrows for navigation
  if (e.key == 'ArrowUp' && state.matchIndex > 0) {
    state.matchIndex--;
    updateResultsUI();
    return;
  }

  if (e.key == 'ArrowDown' && state.matchIndex + 1 < state.matches.length) {
    state.matchIndex++;
    updateResultsUI();
    return;
  }

  // Handle tab for autocompletion
  if (e.key == 'Tab' && state.matches && state.matches.length > 0) {
    commandInput.value = state.matches[state.matchIndex];
    state.typed = state.matches[state.matchIndex];
    return;
  }

  // Update matches based on typed text
  state.matches = findMatchingCommands(state.typed);
  state.matchIndex = 0;
  
  // Update the results UI
  updateResultsUI();
}

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
      resultsContainer.innerHTML = '';
    });
    
    resultsContainer.appendChild(item);
  });
}

function hasModifier(e) {
  return e.altKey || e.ctrlKey || e.metaKey;
}

function isModifier(e) {
  return ['Alt', 'Control', 'Shift', 'Meta'].indexOf(e.key) != -1;
}

function isIgnorable(e) {
  switch(e.which) {
    case 38: //up arrow
    case 40: //down arrow
    case 37: //left arrow
    case 39: //right arrow
    case 33: //page up
    case 34: //page down
    case 36: //home
    case 35: //end
    case 13: //enter
    case 9:  //tab
    case 27: //esc
    case 16: //shift  
    case 17: //ctrl  
    case 18: //alt  
    case 20: //caps lock 
    // we handle this for editing
    //case 8:  //backspace  
    // need to handle for editing also?
    case 46: //delete 
    case 224: //meta 
    case 0:
      return true;
      break;
    default:
      return false;
  }
}

// These functions are replaced by the new updateResultsUI function that 
// works with the actual HTML input field instead of custom rendering
