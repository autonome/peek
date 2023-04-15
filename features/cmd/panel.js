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

(async () => {

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
  // Outer container
  let panel = document.createElement('div');
  panel.id = 'cmdPanel';
  panel.classList.add('cmdPanel');

  await css(panel, {
    //border: '1px solid black',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    margin: '0',
    padding: '0',
    height: '3rem',
    width: '20rem',
    paddingLeft: '1rem',
    paddingRight: '1rem',
  });

  // Where text is shown
  let input = document.createElement('div');
  input.id = 'cmdInput';

  await css(input, {
    //border: '1px solid black',
    //overflow: 'hidden',
    whiteSpace: 'nowrap',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
    fontSize: 'large'
  });

  panel.appendChild(input);

  document.body.appendChild(panel);

  updateInputUI('Start typing...')

  // add event listeners
  document.addEventListener('keyup', onKeyup, true);
  document.addEventListener('keypress', onKeyDummyStop, true);
  document.addEventListener('keydown', onKeyDummyStop, true);
  document.addEventListener('input', onKeyDummyStop, true);
}

render();

async function css(el, props) {
  Object.keys(props).forEach(p => el.style[p] = props[p]);
}

async function execute(name, typed) {
  if (state.commands[name]) {
    // execute command
    const msg = state.commands[name].execute({typed});
    window.app.sendMessage({
      feature: 'cmd',
      data: msg
    });
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

  e.preventDefault();

  if (isModifier(e)) {
    return;
  }

  r || console.log('onKeyup', e.key, e.which)
  r || console.log('hasModifier', hasModifier(e), 'isModifier', isModifier(e), 'isIgnorable', isIgnorable(e));

  e.preventDefault();

  // if user pressed escape, go away
  if (e.key == 'Escape' && !hasModifier(e)) {
    r || console.log('onKeyUp: escape!');
    await shutdown();
  }

  // if user pressed return, attempt to execute command
  else if (e.key == 'Enter' && !hasModifier(e)) {
    r || console.log('onKeyUp: enter!', state.typed);
    let name = state.matches[state.matchIndex];
    if (Object.keys(state.commands).indexOf(name) > -1) {
      //await shutdown();
      execute(name, state.typed);
      state.lastExecuted = name;
      updateMatchCount(name);
      updateMatchFeedback(state.typed, name);
      state.typed = '';
    }
  }

  // attempt to complete typed characters to a command
  // or do other modifications based on user typed keys
  else if (!hasModifier(e) && !isModifier(e) && !isIgnorable(e)) {
    r || console.log('LEGIT... no modifier, is not a modifier and not ignorable')

    // correct on backspace
    if (e.key == 'Backspace') {
      r || console.log('back', state.typed);
      if (state.typed.length > 0) {
        r || console.log('back, no typed tho');
        state.typed = state.typed.substring(0, state.typed.length - 1);
      }
    }
    // otherwise add typed character to buffer
    else {
      r || console.log('updating', e.key);
      state.typed += e.key
    }

    // search, and update UI
    state.matches = findMatchingCommands(state.typed);
    if (state.matches.length) {
      r || console.log('matches!', state.matches);
      updateInputUI(state.typed, state.matches[0]);
      state.matchIndex = 0;
    }
    else {
      r || console.log('no matches for ', state.typed);
      updateInputUI(state.typed);
    }
  }

  // if up arrow and currently visible command is not first, select one previous
  else if (e.key == 'ArrowUp' && state.matchIndex) {
    r || console.log('onKeyUp: arrow up!');
    updateInputUI(state.typed, state.matches[--state.matchIndex]);
  }

  // if down arrow and there are more matches, select the next one
  else if (e.key == 'ArrowDown' && state.matchIndex + 1 < state.matches.length) {
    r || console.log('onKeyUp: arrow down!');
    updateInputUI(state.typed, state.matches[++state.matchIndex]);
  }

  // Old behavior on tab:
  // tab -> shift to next result
  // shift + tab -> shift to previous result
  // New behavior on tab:
  // autocomplete to the matched command
  // which allows easy adding onto a command name
  // without having to type all the same visible text
  else if (e.key == 'Tab' && state.matches) {
    r || console.log('onKeyUp: tab!');
    state.typed = state.matches[state.matchIndex]
    updateInputUI(state.typed, state.matches[state.matchIndex]);
    //if (e.shiftKey && matchIndex)
    //  updateInputUI(state.typed, state.matches[--state.matchIndex]);
    //else if (state.matchIndex + 1 < state.matches.length)
    //  updateInputUI(state.typed, state.matches[++state.matchIndex]);
  }
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

function updateInputUI(typed, completed) {
  const r = true;
  r || console.log('updateInputUI', typed, completed);
  let str = ''
  if (completed) {
    str = generateUnderlined(typed, completed);
  }
  // no match
  else if (typed) {
    str = typed;
  }

  let parser = new DOMParser();
  let doc = parser.parseFromString(str, 'text/html');

  let input = document.querySelector('#cmdInput');
  if (input && input.firstElementChild)
    input.removeChild(input.firstElementChild);
  input.appendChild(doc.firstElementChild);

  /*
  let parent = input.parentNode;
  state.matches.forEach(match => {
    let node = document.createElement('div')
    node.innerText = match
    parent.appendChild(node)
  });
  */
}

// typed text, inline matching suggestion
function generateUnderlined(typed, match) {
  const r = 1;
  r || console.log('generateUnderlined', typed, match);
  // user already matched a commmand and added params
  /*
  if (match.length > typed.length &&
      match.indexOf(typed) === 0) {
    return match;
  }
  */

  if (typed.length == 0 || match.length == 0)
    return typed;

  // look for typed within match
  var startIndex = match.toLowerCase().indexOf(typed.toLowerCase());
  if (startIndex == -1) {
    // otherwise look for match in typed
    // (why would this happen?!)
    startIndex = match.toLowerCase().indexOf(typed.toLowerCase());
    if (startIndex == -1) {
      return typed;
    }
  }

  var endIndex = startIndex + match.length;
  r || console.log('startIndex', startIndex, 'endIndex', endIndex);
  var str = ''

  // substring is empty
  if (!match) {
    r || console.log('no suggestion, so no underline')
    str = '<span>' + typed + '</span>'
  }
  // occurs at beginning
  else if (startIndex === 0) {
    r || console.log('start');
    str = '<span style="text-decoration: underline;">' + typed + '</span>' +
          '<span style="color: #6E6E6E;">' + match.substring(typed.length) + '</span>';
  }
  // occurs in middle
  else if (startIndex > 0) {
    r || console.log('middle');
    str = "<span style='color: #6E6E6E;'>" + match.substring(0, startIndex) + "</span>" +
          "<span style='text-decoration: underline;'>" + match.substring(startIndex, startIndex + typed.length) + "</span>" +
          "<span style='color: #6E6E6E;'>" + match.substring(startIndex + typed.length) + "</span>";
  }
  // occurs at the end
  else {
    r || console.log('end');
    str = "<span class='completed'>" + typed.substring(0, startIndex) + "</span>" +
          "<span class='typed'>" + match + "</span>";
  }
  return str;
}

})();
