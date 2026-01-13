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

// Context detection for permission tiers
const isCore = sourceAddress.startsWith('peek://app/');
const isExtension = sourceAddress.startsWith('peek://ext/');

/**
 * Get the extension ID from the current context
 * @returns {string|null} Extension ID or null if not in an extension context
 */
const getExtensionId = () => {
  if (!isExtension) return null;
  const match = sourceAddress.match(/peek:\/\/ext\/([^/]+)/);
  return match ? match[1] : null;
};

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
// Commands API
// Extensions should wait for cmd:ready before registering commands.
// The cmd extension is loaded first and publishes cmd:ready when initialized.

api.commands = {
  /**
   * Register a command with the cmd palette
   * IMPORTANT: Extensions should wait for cmd:ready before calling this.
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

    // Publish registration to cmd extension (GLOBAL scope)
    ipcRenderer.send('publish', {
      source: sourceAddress,
      scope: 3,
      topic: 'cmd:register',
      data: {
        name: command.name,
        description: command.description || '',
        source: sourceAddress
      }
    });

    console.log('[preload] commands.register:', command.name);
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

    console.log('[preload] commands.unregister:', name);
  },

  /**
   * Get all registered commands
   * Note: Commands are owned by cmd extension - use pubsub cmd:query-commands
   * @returns {Promise<Array>} Empty array - use pubsub directly
   */
  getAll: async () => {
    // Commands are queried via pubsub cmd:query-commands
    // Return empty - caller should use pubsub directly
    return [];
  }
};

// Extension management API
// Only available to core app (peek://app/...) and builtin extensions
// Uses pubsub to communicate with the extension loader in background.html
api.extensions = {
  /**
   * Check if caller has permission to manage extensions
   * Permission is denied for external extensions (non-builtin)
   * @returns {boolean}
   */
  _hasPermission: () => {
    // Core app always has permission
    if (sourceAddress.startsWith('peek://app/')) {
      return true;
    }
    // External extensions are not allowed to manage extensions
    // (builtin extensions run from peek://ext/ but are loaded by core)
    return false;
  },

  /**
   * Get list of running extensions (read-only, no permission check)
   * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
   */
  list: () => {
    return ipcRenderer.invoke('extension-window-list');
  },

  /**
   * Load an extension (permission required)
   * @param {string} id - Extension ID to load
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  load: (id) => {
    if (!api.extensions._hasPermission()) {
      return Promise.resolve({ success: false, error: 'Permission denied: only core app can manage extensions' });
    }
    return new Promise((resolve) => {
      const replyTopic = `ext:load:reply:${rndm()}`;

      ipcRenderer.send('subscribe', {
        source: sourceAddress,
        scope: 1,
        topic: replyTopic,
        replyTopic: replyTopic
      });

      const handler = (ev, msg) => {
        ipcRenderer.removeListener(replyTopic, handler);
        resolve(msg);
      };
      ipcRenderer.on(replyTopic, handler);

      ipcRenderer.send('publish', {
        source: sourceAddress,
        scope: 1,
        topic: 'ext:load',
        data: { id, replyTopic }
      });

      setTimeout(() => {
        ipcRenderer.removeListener(replyTopic, handler);
        resolve({ success: false, error: 'Timeout loading extension' });
      }, 10000);
    });
  },

  /**
   * Unload an extension (permission required)
   * @param {string} id - Extension ID to unload
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  unload: (id) => {
    if (!api.extensions._hasPermission()) {
      return Promise.resolve({ success: false, error: 'Permission denied: only core app can manage extensions' });
    }
    return new Promise((resolve) => {
      const replyTopic = `ext:unload:reply:${rndm()}`;

      ipcRenderer.send('subscribe', {
        source: sourceAddress,
        scope: 1,
        topic: replyTopic,
        replyTopic: replyTopic
      });

      const handler = (ev, msg) => {
        ipcRenderer.removeListener(replyTopic, handler);
        resolve(msg);
      };
      ipcRenderer.on(replyTopic, handler);

      ipcRenderer.send('publish', {
        source: sourceAddress,
        scope: 1,
        topic: 'ext:unload',
        data: { id, replyTopic }
      });

      setTimeout(() => {
        ipcRenderer.removeListener(replyTopic, handler);
        resolve({ success: false, error: 'Timeout unloading extension' });
      }, 10000);
    });
  },

  /**
   * Reload an extension (permission required)
   * @param {string} id - Extension ID to reload
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  reload: (id) => {
    if (!api.extensions._hasPermission()) {
      return Promise.resolve({ success: false, error: 'Permission denied: only core app can manage extensions' });
    }
    return new Promise((resolve) => {
      const replyTopic = `ext:reload:reply:${rndm()}`;

      ipcRenderer.send('subscribe', {
        source: sourceAddress,
        scope: 1,
        topic: replyTopic,
        replyTopic: replyTopic
      });

      const handler = (ev, msg) => {
        ipcRenderer.removeListener(replyTopic, handler);
        resolve(msg);
      };
      ipcRenderer.on(replyTopic, handler);

      ipcRenderer.send('publish', {
        source: sourceAddress,
        scope: 1,
        topic: 'ext:reload',
        data: { id, replyTopic }
      });

      setTimeout(() => {
        ipcRenderer.removeListener(replyTopic, handler);
        resolve({ success: false, error: 'Timeout reloading extension' });
      }, 10000);
    });
  },

  /**
   * Get manifest for a running extension (read-only, no permission check)
   * @param {string} id - Extension ID
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  getManifest: (id) => {
    return new Promise((resolve) => {
      const replyTopic = `ext:manifest:reply:${rndm()}`;

      ipcRenderer.send('subscribe', {
        source: sourceAddress,
        scope: 1,
        topic: replyTopic,
        replyTopic: replyTopic
      });

      const handler = (ev, msg) => {
        ipcRenderer.removeListener(replyTopic, handler);
        resolve(msg);
      };
      ipcRenderer.on(replyTopic, handler);

      ipcRenderer.send('publish', {
        source: sourceAddress,
        scope: 1,
        topic: 'ext:manifest',
        data: { id, replyTopic }
      });

      setTimeout(() => {
        ipcRenderer.removeListener(replyTopic, handler);
        resolve({ success: false, error: 'Timeout getting manifest' });
      }, 5000);
    });
  },

  // ===== Datastore-backed extension management (persisted) =====

  /**
   * Open folder picker dialog to select an extension folder
   * @returns {Promise<{success: boolean, canceled?: boolean, data?: {path: string}, error?: string}>}
   */
  pickFolder: () => {
    return ipcRenderer.invoke('extension-pick-folder');
  },

  /**
   * Validate an extension folder (checks manifest.json)
   * @param {string} folderPath - Path to extension folder
   * @returns {Promise<{success: boolean, valid: boolean, errors?: string[], manifest?: object, error?: string}>}
   */
  validateFolder: (folderPath) => {
    return ipcRenderer.invoke('extension-validate-folder', { folderPath });
  },

  /**
   * Add extension to datastore (persisted)
   * @param {string} folderPath - Path to extension folder
   * @param {object} manifest - Parsed manifest (can be partial/invalid)
   * @param {boolean} enabled - Whether to enable immediately
   * @returns {Promise<{success: boolean, data?: {id: string}, error?: string}>}
   */
  add: (folderPath, manifest, enabled = false) => {
    if (!api.extensions._hasPermission()) {
      return Promise.resolve({ success: false, error: 'Permission denied' });
    }
    return ipcRenderer.invoke('extension-add', { folderPath, manifest, enabled });
  },

  /**
   * Remove extension from datastore
   * @param {string} id - Extension ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  remove: (id) => {
    if (!api.extensions._hasPermission()) {
      return Promise.resolve({ success: false, error: 'Permission denied' });
    }
    return ipcRenderer.invoke('extension-remove', { id });
  },

  /**
   * Update extension in datastore (enable/disable, etc.)
   * @param {string} id - Extension ID
   * @param {object} updates - Fields to update
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  update: (id, updates) => {
    if (!api.extensions._hasPermission()) {
      return Promise.resolve({ success: false, error: 'Permission denied' });
    }
    return ipcRenderer.invoke('extension-update', { id, updates });
  },

  /**
   * Get all extensions from datastore (includes non-running)
   * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
   */
  getAll: () => {
    return ipcRenderer.invoke('extension-get-all');
  },

  /**
   * Get single extension from datastore
   * @param {string} id - Extension ID
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  get: (id) => {
    return ipcRenderer.invoke('extension-get', { id });
  },

  /**
   * Get settings schema for an extension
   * Reads schema from file specified in manifest.settingsSchema
   * @param {string} extId - Extension ID
   * @returns {Promise<{success: boolean, data?: {extId, name, schema}, error?: string}>}
   */
  getSettingsSchema: (extId) => {
    return ipcRenderer.invoke('extension-settings-schema', { extId });
  }
};

// Extension settings API (for isolated extension processes)
// Extensions can only access their own settings via datastore
api.settings = {
  /**
   * Get settings for the current extension
   * Only works from extension context (peek://ext/{id}/...)
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  get: () => {
    const extId = getExtensionId();
    if (!extId) {
      return Promise.resolve({ success: false, error: 'Not an extension context' });
    }
    return ipcRenderer.invoke('extension-settings-get', { extId });
  },

  /**
   * Save settings for the current extension
   * Only works from extension context (peek://ext/{id}/...)
   * @param {object} settings - Settings object to save (keys: prefs, items, etc.)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  set: (settings) => {
    const extId = getExtensionId();
    if (!extId) {
      return Promise.resolve({ success: false, error: 'Not an extension context' });
    }
    return ipcRenderer.invoke('extension-settings-set', { extId, settings });
  },

  /**
   * Get a single setting key for the current extension
   * @param {string} key - Setting key (e.g., 'prefs', 'items')
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  getKey: (key) => {
    const extId = getExtensionId();
    if (!extId) {
      return Promise.resolve({ success: false, error: 'Not an extension context' });
    }
    return ipcRenderer.invoke('extension-settings-get-key', { extId, key });
  },

  /**
   * Set a single setting key for the current extension
   * @param {string} key - Setting key
   * @param {any} value - Value to set (will be JSON stringified)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  setKey: (key, value) => {
    const extId = getExtensionId();
    if (!extId) {
      return Promise.resolve({ success: false, error: 'Not an extension context' });
    }
    return ipcRenderer.invoke('extension-settings-set-key', { extId, key, value });
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

/**
 * File operations
 */
api.files = {
  /**
   * Show native save dialog and write content to file
   * @param {string} content - Content to save
   * @param {object} options - Options { filename, mimeType }
   * @returns {Promise<{success: boolean, path?: string, canceled?: boolean, error?: string}>}
   */
  save: (content, options = {}) => {
    return ipcRenderer.invoke('file-save-dialog', {
      content,
      filename: options.filename,
      mimeType: options.mimeType
    });
  }
};

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
