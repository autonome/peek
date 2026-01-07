const {
  contextBridge,
  ipcRenderer
} = require('electron');

const src = 'preload';
console.log(src, 'init', window);

const DEBUG = !!process.env.DEBUG;
console.log('preload DEBUG:', process.env.DEBUG, '->', DEBUG);
const DEBUG_LEVELS = {
  BASIC: 1,
  FIRST_RUN: 2
};

const DEBUG_LEVEL = DEBUG_LEVELS.BASIC;
//const DEBUG_LEVEL = DEBUG_LEVELS.FIRST_RUN;

const APP_SCHEME = 'peek';
const APP_PROTOCOL = `${APP_SCHEME}:`;

const sourceAddress = window.location.toString();

const rndm = () => Math.random().toString(16).slice(2);

let api = {};

// Log to main process (shows in terminal)
api.log = (...args) => {
  ipcRenderer.send('renderer-log', { source: sourceAddress, args });
};

api.debug = DEBUG;
api.debugLevels = DEBUG_LEVELS;
api.debugLevel = DEBUG_LEVEL;

api.shortcuts = {
  /**
   * Register a keyboard shortcut
   * @param {string} shortcut - The shortcut key combination (e.g., 'Alt+1', 'CommandOrControl+Q')
   * @param {function} cb - Callback function when shortcut is triggered
   * @param {object} options - Optional configuration
   * @param {boolean} options.global - If true, shortcut works even when app doesn't have focus (default: false)
   */
  register: (shortcut, cb, options = {}) => {
    const isGlobal = options.global === true;
    console.log(src, `registering ${isGlobal ? 'global' : 'local'} shortcut ${shortcut} for ${window.location}`);

    const replyTopic = `${shortcut}${rndm()}`;

    ipcRenderer.send('registershortcut', {
      source: sourceAddress,
      shortcut,
      replyTopic,
      global: isGlobal
    });

    ipcRenderer.on(replyTopic, (ev, msg) => {
      console.log(src, 'shortcut execution reply');
      cb();
      console.log(src, 'shortcut execution reply done');
    });
  },
  /**
   * Unregister a keyboard shortcut
   * @param {string} shortcut - The shortcut to unregister
   * @param {object} options - Optional configuration (must match registration)
   * @param {boolean} options.global - If true, unregisters a global shortcut (default: false)
   */
  unregister: (shortcut, options = {}) => {
    const isGlobal = options.global === true;
    console.log(`unregistering ${isGlobal ? 'global' : 'local'} shortcut`, shortcut, 'for', window.location);
    ipcRenderer.send('unregistershortcut', {
      source: sourceAddress,
      shortcut,
      global: isGlobal
    });
  }
};

api.closeWindow = (id, callback) => {
  console.log(src, ['api.closewindow', id, 'for', window.location].join(', '));

  const replyTopic = `${id}${rndm()}`;

  const params = {
    source: sourceAddress,
    id
  };

  ipcRenderer.send('closewindow', {
    params,
    replyTopic
  });

  ipcRenderer.once(replyTopic, (ev, msg) => {
    console.log(src, 'api.closewindow', 'resp from main', msg);
    if (callback) {
      callback(msg);
    }
  });
};

api.scopes = {
  SYSTEM: 1,
  SELF: 2,
  GLOBAL: 3
};

api.publish = (topic, msg, scope = api.scopes.SELF) => {
  console.log(sourceAddress, 'publish', topic)

  // TODO: c'mon
  if (!topic) {
    return new Error('wtf');
  }

  ipcRenderer.send('publish', {
    source: sourceAddress,
    scope,
    topic,
    data: msg,
  });
};

api.subscribe = (topic, callback, scope = api.scopes.SELF) => {
  console.log(src, 'subscribe', topic)

  // TODO: c'mon
  if (!topic || !callback) {
    return new Error('wtf');
  }

  const replyTopic = `${topic}:${rndm()}`;

  ipcRenderer.send('subscribe', {
    source: sourceAddress,
    scope,
    topic,
    replyTopic
  });

  ipcRenderer.on(replyTopic, (ev, msg) => {
    DEBUG && console.log('topic', topic, msg);
    msg.source = sourceAddress;
    try {
      callback(msg);
    }
    catch(ex) {
      console.log('preload:subscribe subscriber callback errored for topic', topic, 'and source', sourceAddress, ex);
    }
  });
};

api.window = {
  open: (url, options = {}) => {
    console.log('window.open', url, options);
    return ipcRenderer.invoke('window-open', {
      source: sourceAddress,
      url,
      options
    });
  },
  close: (id = null) => {
    console.log('window.close', id);
    if (id === null) {
      window.close();
      return;
    }
    return ipcRenderer.invoke('window-close', {
      source: sourceAddress,
      id
    });
  },
  hide: (id) => {
    console.log('window.hide', id);
    return ipcRenderer.invoke('window-hide', {
      source: sourceAddress,
      id
    });
  },
  show: (id) => {
    console.log('window.show', id);
    return ipcRenderer.invoke('window-show', {
      source: sourceAddress,
      id
    });
  },
  exists: (id) => {
    console.log('window.exists', id);
    return ipcRenderer.invoke('window-exists', {
      source: sourceAddress,
      id
    });
  },
  move: (id, x, y) => {
    console.log('window.move', id, x, y);
    return ipcRenderer.invoke('window-move', {
      source: sourceAddress,
      id,
      x,
      y
    });
  },
  focus: (id) => {
    console.log('window.focus', id);
    return ipcRenderer.invoke('window-focus', {
      source: sourceAddress,
      id
    });
  },
  blur: (id) => {
    console.log('window.blur', id);
    return ipcRenderer.invoke('window-blur', {
      source: sourceAddress,
      id
    });
  },
  list: (options = {}) => {
    console.log('window.list', options);
    return ipcRenderer.invoke('window-list', {
      source: sourceAddress,
      ...options
    });
  }
};

api.modifyWindow = (winName, params) => {
  console.log('modifyWindow(): window', winName, params);
  //w.name = `${sourceAddress}:${rndm()}`;
  console.log('NAME', winName);
  ipcRenderer.send('modifywindow', {
    source: sourceAddress,
    name: winName,
    params
  });
};

// Datastore API
api.datastore = {
  addAddress: (uri, options) => {
    return ipcRenderer.invoke('datastore-add-address', { uri, options });
  },
  getAddress: (id) => {
    return ipcRenderer.invoke('datastore-get-address', { id });
  },
  updateAddress: (id, updates) => {
    return ipcRenderer.invoke('datastore-update-address', { id, updates });
  },
  queryAddresses: (filter) => {
    return ipcRenderer.invoke('datastore-query-addresses', { filter });
  },
  addVisit: (addressId, options) => {
    return ipcRenderer.invoke('datastore-add-visit', { addressId, options });
  },
  queryVisits: (filter) => {
    return ipcRenderer.invoke('datastore-query-visits', { filter });
  },
  addContent: (options) => {
    return ipcRenderer.invoke('datastore-add-content', { options });
  },
  queryContent: (filter) => {
    return ipcRenderer.invoke('datastore-query-content', { filter });
  },
  getTable: (tableName) => {
    return ipcRenderer.invoke('datastore-get-table', { tableName });
  },
  setRow: (tableName, rowId, rowData) => {
    return ipcRenderer.invoke('datastore-set-row', { tableName, rowId, rowData });
  },
  getStats: () => {
    return ipcRenderer.invoke('datastore-get-stats');
  },
  // Tag operations
  getOrCreateTag: (name) => {
    return ipcRenderer.invoke('datastore-get-or-create-tag', { name });
  },
  tagAddress: (addressId, tagId) => {
    return ipcRenderer.invoke('datastore-tag-address', { addressId, tagId });
  },
  untagAddress: (addressId, tagId) => {
    return ipcRenderer.invoke('datastore-untag-address', { addressId, tagId });
  },
  getTagsByFrecency: (domain) => {
    return ipcRenderer.invoke('datastore-get-tags-by-frecency', { domain });
  },
  getAddressTags: (addressId) => {
    return ipcRenderer.invoke('datastore-get-address-tags', { addressId });
  },
  getAddressesByTag: (tagId) => {
    return ipcRenderer.invoke('datastore-get-addresses-by-tag', { tagId });
  },
  getUntaggedAddresses: () => {
    return ipcRenderer.invoke('datastore-get-untagged-addresses', {});
  }
};

// App control API
api.quit = () => {
  ipcRenderer.send('app-quit', { source: sourceAddress });
};

// Command registration API for extensions
// Commands are registered via pubsub since cmd runs in renderer
api.commands = {
  /**
   * Register a command with the cmd palette
   * @param {Object} command - Command object with name, description, execute
   */
  register: (command) => {
    if (!command.name || !command.execute) {
      console.error('commands.register: name and execute are required');
      return;
    }

    // Store the execute handler locally (can't serialize functions via pubsub)
    window._cmdHandlers = window._cmdHandlers || {};
    window._cmdHandlers[command.name] = command.execute;

    // Register the command metadata via pubsub (GLOBAL scope for cross-window)
    ipcRenderer.send('publish', {
      source: sourceAddress,
      scope: 3, // GLOBAL - so cmd panel in separate window receives it
      topic: 'cmd:register',
      data: {
        name: command.name,
        description: command.description || '',
        source: sourceAddress
      }
    });

    // Subscribe to execution requests for this command (GLOBAL scope)
    const execTopic = `cmd:execute:${command.name}`;
    const replyTopic = `${execTopic}:${rndm()}`;

    ipcRenderer.send('subscribe', {
      source: sourceAddress,
      scope: 3,
      topic: execTopic,
      replyTopic
    });

    ipcRenderer.on(replyTopic, async (ev, msg) => {
      console.log('cmd:execute', command.name, msg);
      const handler = window._cmdHandlers?.[command.name];
      if (handler) {
        try {
          await handler(msg);
        } catch (err) {
          console.error('Error executing command', command.name, err);
        }
      }
    });

    console.log('commands.register:', command.name);
  },

  /**
   * Unregister a command from the cmd palette
   * @param {string} name - Command name to unregister
   */
  unregister: (name) => {
    // Remove local handler
    if (window._cmdHandlers) {
      delete window._cmdHandlers[name];
    }

    // Notify cmd to remove the command (GLOBAL scope for cross-window)
    ipcRenderer.send('publish', {
      source: sourceAddress,
      scope: 3,
      topic: 'cmd:unregister',
      data: { name }
    });

    console.log('commands.unregister:', name);
  }
};

// Escape handling API
// For windows with escapeMode: 'navigate' or 'auto'
// Callback should return { handled: true } if escape was handled internally
// or { handled: false } to let the window close
api.escape = {
  onEscape: (callback) => {
    ipcRenderer.on('escape-pressed', async (event, data) => {
      try {
        const result = await callback();
        ipcRenderer.send(data.responseChannel, result || { handled: false });
      } catch (err) {
        console.error('Error in escape handler:', err);
        ipcRenderer.send(data.responseChannel, { handled: false });
      }
    });
  }
};

// unused
/*
api.sendToWindow = (windowId, msg) => {
  ipcRenderer.send('sendToWindow', {
    source: sourceAddress,
    id,
    msg
  });
};

api.onMessage = callback => {
  // TODO: c'mon
  if (!topic || !callback) {
    return new Error('wtf');
  }

  const replyTopic = `${topic}:${rndm()}`;

  ipcRenderer.send('subscribe', {
    source: sourceAddress,
    topic,
    replyTopic
  });

  ipcRenderer.on(replyTopic, (ev, msg) => {
    msg.source = sourceAddress;
    callback(msg);
  });
};
*/

contextBridge.exposeInMainWorld('app', api);
console.log(src, 'api exposed');

window.addEventListener('load', () => {
  console.log(src, 'load', window);
});

/*
const handleMainWindow = () => {
  window.addEventListener('load', () => {
    const replaceText = (selector, text) => {
      const element = document.getElementById(selector)
      if (element) element.innerText = text
    }

    for (const dependency of ['chrome', 'node', 'electron']) {
      replaceText(`${dependency}-version`, process.versions[dependency])
    }
  });
};
*/

/*
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency])
  }
})
*/
