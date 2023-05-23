import { id, labels, schemas, ui, defaults } from './config.js';
import { log as l, openStore } from "../utils.js";

const log = function(...args) { l(id, args); };

log('background');

const debug = window.app.debug;
const store = openStore(id);
const api = window.app;

const storageKeys = {
  PREFS: 'prefs',
  ITEMS: 'items',
};

let commands = {};

function onCommandsUpdated () {
  window.dispatchEvent(new CustomEvent('cmd-update-commands', { detail: commands }));
  log('main sending updated commands out', Object.keys(commands))
}

window.addEventListener('DOMContentLoaded', initializeCommandSources);

/*
command is an object with two properties:

- name: string label
- execute: method

TODO:
- add canRun check - eg, switchContainer cannot run on about: urls
- enable command generation at call time (instead of in advance)

*/
function addCommand(command) {
  commands[command.name] = command;
  onCommandsUpdated();
}

function initializeCommandSources() {
  log('initializeCommandSources');

  sourceOpenURL();
  //sourceBookmarklets();
  //sourceBookmark();
  //sourceEmail();
  //sourceGoogleDocs();
  //sourceSendToWindow();
  //sourceSwitchToWindow();
  //sourceNewContainerTab();
  //sourceSwitchTabContainer();
  onCommandsUpdated();
}

const sourceOpenURL = () => {
  const cmdName = 'open';
  addCommand({
    name: cmdName,
    execute: msg => {

      console.log(cmdName, 'msg', msg);

      const parts = msg.typed.split(' ');
      parts.shift();

      const address = parts.shift();

      const height = 600;
      const width = 800;

      const params = {
        feature: labels.featureType,
        address,
        height,
        width
      };

      window.app.openWindow(params);

      return {
        command: 'openWebWindow',
        address
      };
    }
  });
}

/*
async function sourceBookmarklets() {
  // add bookmarklets as commands
  let bmarklets = await browser.bookmarks.search({ query: 'javascript:'} );
  bmarklets.map(b => {
    return {
      name: b.title,
      async execute(cmd) {
        //let tags = cmd.typed.split(' ').filter(w => w != cmd.name)
        //console.log('tags', tags)
        let tabs = await browser.tabs.query({active:true});
        browser.tabs.executeScript(tabs[0].id, {
          code: b.url.replace('javascript:', '')
        });
      }
    };
  }).forEach(addCommand);
}
*/

/*
async function sourceBookmark() {
  addCommand({
    name: 'bookmark current page',
    async execute() {
      let tab = await browser.tabs.query({active:true});
      let node = await browser.bookmarks.create({
        title: tab[0].title,
        url: tab[0].url
      });
    }
  });
}
*/

/*
// FIXME
async function sourceEmail() {
  addCommand({
    name: 'Email page to',
    async execute(msg) {
      let tabs = await browser.tabs.query({active:true});
      let email = msg.typed.replace(msg.name, '').trim();
      let url =
        'mailto:' + email +
        '?subject=Web%20page!&body=' +
        encodeURIComponent(tabs[0].title) +
        '%0D%0A' +
        encodeURIComponent(tabs[0].url);
      tabs[0].url = url;
    }
  });
}
*/

/*
async function sourceGoogleDocs() {
  [
    {
      cmd: 'New Google doc',
      url: 'http://docs.google.com/document/create?hl=en'
    },
    {
      cmd: 'New Google sheet',
      url: 'http://spreadsheets.google.com/ccc?new&hl=en'
    }
  ].forEach(function(doc) {
    addCommand({
      name: doc.cmd,
      async execute(msg) {
        await browser.tabs.create({
          url: doc.url
        });
      }
    });
  });
}
*/

/*
async function sourceSendToWindow() {
  const cmdPrefix = 'Move to window: ';
  const windows = await browser.windows.getAll({windowTypes: ['normal']});
  windows.forEach((w) => {
    addCommand({
      name: cmdPrefix + w.title,
      async execute(msg) {
        const activeTabs = await browser.tabs.query({active: true});
        browser.tabs.move(activeTabs[0].id, {windowId: w.id, index: -1});
      }
    });
  });
}
*/

/*
async function sourceSwitchToWindow() {
  const cmdPrefix = 'Switch to window: ';
  const windows = await browser.windows.getAll({});
  windows.forEach((w) => {
    addCommand({
      name: cmdPrefix + w.title,
      async execute(msg) {
        browser.windows.update(w.id, { focused: true });
      }
    });
  });
}
*/

/*
async function sourceNewContainerTab() {
  const cmdPrefix = 'New container tab: ';
  browser.contextualIdentities.query({})
  .then((identities) => {
    if (!identities.length)
      return;
    for (let identity of identities) {
      addCommand({
        name: cmdPrefix + identity.name,
        async execute(msg) {
          browser.tabs.create({url: '', cookieStoreId: identity.cookieStoreId });
        }
      });
    }
  });
}
*/

/*
async function sourceSwitchTabContainer() {
  const cmdPrefix = 'Switch container to: ';
  browser.contextualIdentities.query({})
  .then((identities) => {
    if (!identities.length)
      return;
    for (let identity of identities) {
      addCommand({
        name: cmdPrefix + identity.name,
        async execute(msg) {
          const activeTabs = await browser.tabs.query({currentWindow: true, active: true});
          const tab = activeTabs[0];
          // some risk of losing old tab if new tab was not created successfully
          // but putting remove in creation was getting killed by window close
          // so when execution is moved to background script, try moving this back
          browser.tabs.remove(tab.id);
          browser.tabs.create({url: tab.url, cookieStoreId: identity.cookieStoreId, index: tab.index+1, pinned: tab.pinned }).then(() => {
            // tab remove should be here
          });
        }
      });
    }
  });
}
*/

/*
async function sourceNote() {
  addCommand({
    name: 'note',
    async execute(msg) {
      console.log('note execd', msg)
      if (msg.typed.indexOf(' ')) {
        let note = msg.typed.replace('note ', '');
        await saveNewNote(note) 
        notify('note saved!', note)
      }
    }
  });

  const STG_KEY = 'cmd:notes';
  const STG_TYPE = 'local';

  async function saveNewNote(note) {
    let store = await browser.storage[STG_TYPE].get(STG_KEY)
    console.log('store', store)
    if (Object.keys(store).indexOf(STG_KEY) == -1) {
      console.log('new store')
      store = {
        notes: []
      }
    }
    else {
      store = store[STG_KEY]
    }
    store.notes.push(note)

    await browser.storage[STG_TYPE].set({ [STG_KEY] : store})
    console.log('saved store', store);
  }
}
await sourceNote()
*/

function notify(title, content) {
  browser.notifications.create({
    "type": "basic",
    "iconUrl": browser.extension.getURL("images/icon.png"),
    "title": title,
    "message": content
  });
}
