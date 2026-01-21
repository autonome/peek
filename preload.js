const {
  contextBridge,
  ipcRenderer
} = require('electron');

const src = 'preload';
const preloadStart = Date.now();

const DEBUG = !!process.env.DEBUG;
// If DEBUG is "1" or "true", enable all categories; otherwise it's a comma-separated list
const DEBUG_CATEGORIES = (process.env.DEBUG && process.env.DEBUG !== '1' && process.env.DEBUG !== 'true')
  ? process.env.DEBUG
  : '';
DEBUG && console.log(src, 'init, DEBUG:', DEBUG, 'categories:', DEBUG_CATEGORIES || '(all)');
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

// Command registration batching for startup performance
// Collects registrations and sends as single batch after debounce
let pendingRegistrations = [];
let registrationTimer = null;
const BATCH_DELAY_MS = 16; // ~1 frame

function flushRegistrations() {
  if (pendingRegistrations.length === 0) return;

  const batch = pendingRegistrations;
  pendingRegistrations = [];
  registrationTimer = null;

  ipcRenderer.send('publish', {
    source: sourceAddress,
    scope: 3, // GLOBAL
    topic: 'cmd:register-batch',
    data: { commands: batch }
  });

  DEBUG && console.log('[preload] commands.flush: sent batch of', batch.length, 'commands');
}

// Context detection for permission tiers
const isCore = sourceAddress.startsWith('peek://app/');

// Extension detection: supports both legacy (peek://ext/{id}/...) and hybrid (peek://{extId}/...) modes
// In hybrid mode, extension URLs are peek://{extId}/... where extId is NOT 'app' or 'ext'
const isLegacyExtension = sourceAddress.startsWith('peek://ext/');
const isHybridExtension = (() => {
  const match = sourceAddress.match(/^peek:\/\/([^/]+)/);
  if (!match) return false;
  const host = match[1];
  // Hybrid extension hosts are anything except 'app' and 'ext' (reserved for core)
  return host !== 'app' && host !== 'ext';
})();
const isExtension = isLegacyExtension || isHybridExtension;

/**
 * Get the extension ID from the current context
 * @returns {string|null} Extension ID or null if not in an extension context
 */
const getExtensionId = () => {
  if (isLegacyExtension) {
    // Legacy format: peek://ext/{id}/...
    const match = sourceAddress.match(/peek:\/\/ext\/([^/]+)/);
    return match ? match[1] : null;
  }
  if (isHybridExtension) {
    // Hybrid format: peek://{extId}/...
    const match = sourceAddress.match(/^peek:\/\/([^/]+)/);
    return match ? match[1] : null;
  }
  return null;
};

let api = {};

// Log to main process (shows in terminal)
api.log = (...args) => {
  ipcRenderer.send('renderer-log', { source: sourceAddress, args });
};

api.debug = DEBUG;
api.debugCategories = DEBUG_CATEGORIES;
api.debugLevels = DEBUG_LEVELS;
api.debugLevel = DEBUG_LEVEL;

// App info API
api.app = {
  /**
   * Get app info including version
   * @returns {Promise<{success: boolean, data?: {version: string, name: string, isPackaged: boolean}, error?: string}>}
   */
  getInfo: () => {
    return ipcRenderer.invoke('app-info');
  }
};

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
    DEBUG && console.log(src, `registering ${isGlobal ? 'global' : 'local'} shortcut ${shortcut} for ${window.location}`);

    const replyTopic = `${shortcut}${rndm()}`;

    ipcRenderer.send('registershortcut', {
      source: sourceAddress,
      shortcut,
      replyTopic,
      global: isGlobal
    });

    ipcRenderer.on(replyTopic, (ev, msg) => {
      DEBUG && console.log(src, 'shortcut execution reply');
      cb();
      DEBUG && console.log(src, 'shortcut execution reply done');
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
    DEBUG && console.log(`unregistering ${isGlobal ? 'global' : 'local'} shortcut`, shortcut, 'for', window.location);
    ipcRenderer.send('unregistershortcut', {
      source: sourceAddress,
      shortcut,
      global: isGlobal
    });
  }
};

api.closeWindow = (id, callback) => {
  DEBUG && console.log(src, ['api.closewindow', id, 'for', window.location].join(', '));

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
    DEBUG && console.log(src, 'api.closewindow', 'resp from main', msg);
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
  DEBUG && console.log(sourceAddress, 'publish', topic)

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
  DEBUG && console.log(src, 'subscribe', topic)

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
    // Only set source on object messages (not undefined/null/primitives)
    if (msg && typeof msg === 'object') {
      msg.source = sourceAddress;
    }
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
    DEBUG && console.log('window.open', url, options);
    return ipcRenderer.invoke('window-open', {
      source: sourceAddress,
      url,
      options
    });
  },
  close: (id = null) => {
    DEBUG && console.log('window.close', id);
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
    DEBUG && console.log('window.hide', id);
    return ipcRenderer.invoke('window-hide', {
      source: sourceAddress,
      id
    });
  },
  show: (id) => {
    DEBUG && console.log('window.show', id);
    return ipcRenderer.invoke('window-show', {
      source: sourceAddress,
      id
    });
  },
  exists: (id) => {
    DEBUG && console.log('window.exists', id);
    return ipcRenderer.invoke('window-exists', {
      source: sourceAddress,
      id
    });
  },
  move: (id, x, y) => {
    DEBUG && console.log('window.move', id, x, y);
    return ipcRenderer.invoke('window-move', {
      source: sourceAddress,
      id,
      x,
      y
    });
  },
  resize: (width, height, id = null) => {
    DEBUG && console.log('window.resize', width, height, id);
    return ipcRenderer.invoke('window-resize', {
      source: sourceAddress,
      id,
      width,
      height
    });
  },
  getPosition: (id = null) => {
    DEBUG && console.log('window.getPosition', id);
    return ipcRenderer.invoke('window-get-position', {
      source: sourceAddress,
      id
    });
  },
  focus: (id) => {
    DEBUG && console.log('window.focus', id);
    return ipcRenderer.invoke('window-focus', {
      source: sourceAddress,
      id
    });
  },
  blur: (id) => {
    DEBUG && console.log('window.blur', id);
    return ipcRenderer.invoke('window-blur', {
      source: sourceAddress,
      id
    });
  },
  list: (options = {}) => {
    DEBUG && console.log('window.list', options);
    return ipcRenderer.invoke('window-list', {
      source: sourceAddress,
      ...options
    });
  },
  devtools: (id = null) => {
    DEBUG && console.log('window.devtools', id);
    return ipcRenderer.invoke('window-devtools', {
      source: sourceAddress,
      id
    });
  }
};

api.modifyWindow = (winName, params) => {
  DEBUG && console.log('modifyWindow(): window', winName, params);
  //w.name = `${sourceAddress}:${rndm()}`;
  DEBUG && console.log('NAME', winName);
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
  getRow: (tableName, rowId) => {
    return ipcRenderer.invoke('datastore-get-row', { tableName, rowId });
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
  },

  // Item operations (mobile-style lightweight content: notes, tagsets, images)
  addItem: (type, options = {}) => {
    return ipcRenderer.invoke('datastore-add-item', { type, options });
  },
  getItem: (id) => {
    return ipcRenderer.invoke('datastore-get-item', { id });
  },
  updateItem: (id, options) => {
    return ipcRenderer.invoke('datastore-update-item', { id, options });
  },
  deleteItem: (id) => {
    return ipcRenderer.invoke('datastore-delete-item', { id });
  },
  hardDeleteItem: (id) => {
    return ipcRenderer.invoke('datastore-hard-delete-item', { id });
  },
  queryItems: (filter = {}) => {
    return ipcRenderer.invoke('datastore-query-items', { filter });
  },
  tagItem: (itemId, tagId) => {
    return ipcRenderer.invoke('datastore-tag-item', { itemId, tagId });
  },
  untagItem: (itemId, tagId) => {
    return ipcRenderer.invoke('datastore-untag-item', { itemId, tagId });
  },
  getItemTags: (itemId) => {
    return ipcRenderer.invoke('datastore-get-item-tags', { itemId });
  },
  getItemsByTag: (tagId) => {
    return ipcRenderer.invoke('datastore-get-items-by-tag', { tagId });
  }
};

// Theme API
api.theme = {
  /**
   * Get current theme settings
   * @returns {Promise<{themeId: string, colorScheme: string, isDark: boolean, effectiveScheme: string}>}
   */
  get: () => {
    return ipcRenderer.invoke('theme:get');
  },

  /**
   * Set color scheme preference
   * @param {string} colorScheme - 'system' | 'light' | 'dark'
   * @returns {Promise<{success: boolean, colorScheme?: string, effectiveScheme?: string, error?: string}>}
   */
  setColorScheme: (colorScheme) => {
    return ipcRenderer.invoke('theme:setColorScheme', colorScheme);
  },

  /**
   * Set active theme
   * @param {string} themeId - Theme ID
   * @returns {Promise<{success: boolean, themeId?: string, error?: string}>}
   */
  setTheme: (themeId) => {
    return ipcRenderer.invoke('theme:setTheme', themeId);
  },

  /**
   * List available themes (simple list for basic UI)
   * @returns {Promise<{themes: Array<{id: string, name: string, version: string, description: string, colorSchemes: string[]}>}>}
   */
  list: () => {
    return ipcRenderer.invoke('theme:list');
  },

  /**
   * Get all themes with full details (builtin + external)
   * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
   */
  getAll: () => {
    return ipcRenderer.invoke('theme:getAll');
  },

  /**
   * Open folder picker dialog to select a theme folder
   * @returns {Promise<{success: boolean, canceled?: boolean, data?: {path: string}, error?: string}>}
   */
  pickFolder: () => {
    return ipcRenderer.invoke('theme:pickFolder');
  },

  /**
   * Validate a theme folder (checks manifest.json)
   * @param {string} folderPath - Path to theme folder
   * @returns {Promise<{success: boolean, data?: {manifest: object, path: string}, error?: string}>}
   */
  validateFolder: (folderPath) => {
    return ipcRenderer.invoke('theme:validateFolder', { folderPath });
  },

  /**
   * Add a theme from a folder
   * @param {string} folderPath - Path to theme folder
   * @returns {Promise<{success: boolean, data?: {id: string, manifest: object}, error?: string}>}
   */
  add: (folderPath) => {
    return ipcRenderer.invoke('theme:add', { folderPath });
  },

  /**
   * Remove a theme
   * @param {string} id - Theme ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  remove: (id) => {
    return ipcRenderer.invoke('theme:remove', { id });
  },

  /**
   * Reload a theme (re-read CSS, notify windows)
   * @param {string} id - Theme ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  reload: (id) => {
    return ipcRenderer.invoke('theme:reload', { id });
  },

  /**
   * Subscribe to theme changes
   * @param {function} callback - Called with {colorScheme: string} when theme changes
   */
  onChange: (callback) => {
    ipcRenderer.on('theme:changed', (ev, data) => {
      callback(data);
    });
  },

  /**
   * Subscribe to theme reload events
   * @param {function} callback - Called with {themeId: string} when theme should be reloaded
   */
  onReload: (callback) => {
    ipcRenderer.on('theme:reload', (ev, data) => {
      callback(data);
    });
  },

  /**
   * Set color scheme for current window only (doesn't affect global setting)
   * When called from background.html (via commands), targets the last focused visible window.
   * @param {string} colorScheme - 'light', 'dark', 'system', or 'global' (to use global theme)
   * @returns {Promise<{success: boolean, windowId?: number, colorScheme?: string, error?: string}>}
   */
  setWindowColorScheme: async (colorScheme) => {
    // Use focused visible window ID if calling from background context,
    // otherwise use the current window ID
    let windowId = await ipcRenderer.invoke('get-focused-visible-window-id');
    if (!windowId) {
      // Fallback to current window (for direct calls from visible windows)
      windowId = await ipcRenderer.invoke('get-window-id');
    }
    if (!windowId) {
      return { success: false, error: 'No visible window to target' };
    }
    return ipcRenderer.invoke('theme:setWindowColorScheme', { windowId, colorScheme });
  }
};

// Sync API - server synchronization for bidirectional sync
api.sync = {
  /**
   * Get sync configuration
   * @returns {Promise<{success: boolean, data?: {serverUrl: string, apiKey: string, autoSync: boolean}, error?: string}>}
   */
  getConfig: () => {
    return ipcRenderer.invoke('sync-get-config');
  },

  /**
   * Set sync configuration
   * @param {object} config - { serverUrl?, apiKey?, autoSync? }
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  setConfig: (config) => {
    return ipcRenderer.invoke('sync-set-config', config);
  },

  /**
   * Pull items from server
   * @param {object} options - { since?: number } - optional timestamp to pull changes since
   * @returns {Promise<{success: boolean, data?: {pulled: number, conflicts: number}, error?: string}>}
   */
  pull: (options = {}) => {
    return ipcRenderer.invoke('sync-pull', options);
  },

  /**
   * Push local items to server
   * @param {object} options - { force?: boolean } - force push even if conflicts
   * @returns {Promise<{success: boolean, data?: {pushed: number, skipped: number}, error?: string}>}
   */
  push: (options = {}) => {
    return ipcRenderer.invoke('sync-push', options);
  },

  /**
   * Full bidirectional sync (pull then push)
   * @returns {Promise<{success: boolean, data?: {pulled: number, pushed: number, conflicts: number}, error?: string}>}
   */
  syncAll: () => {
    return ipcRenderer.invoke('sync-full');
  },

  /**
   * Get current sync status
   * @returns {Promise<{success: boolean, data?: {configured: boolean, lastSync: number, pendingCount: number}, error?: string}>}
   */
  getStatus: () => {
    return ipcRenderer.invoke('sync-status');
  }
};

// Track per-window color scheme override (null = use global)
let windowColorSchemeOverride = null;

// Apply theme on page load
(async () => {
  try {
    const theme = await ipcRenderer.invoke('theme:get');
    if (theme && theme.colorScheme !== 'system') {
      document.documentElement.setAttribute('data-theme', theme.colorScheme);
    }

    // Listen for global color scheme changes
    ipcRenderer.on('theme:changed', (ev, { colorScheme }) => {
      // Only apply global changes if this window doesn't have an override
      if (windowColorSchemeOverride !== null) {
        DEBUG && console.log('[preload] Ignoring global theme change, window has override:', windowColorSchemeOverride);
        return;
      }
      if (colorScheme === 'system') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', colorScheme);
      }
    });

    // Listen for window-specific color scheme changes
    ipcRenderer.on('theme:windowChanged', (ev, { colorScheme }) => {
      DEBUG && console.log('[preload] Window-specific color scheme:', colorScheme);
      if (colorScheme === 'global') {
        // Clear override, revert to global theme
        windowColorSchemeOverride = null;
        // Re-fetch and apply global theme
        ipcRenderer.invoke('theme:get').then(theme => {
          if (theme && theme.colorScheme !== 'system') {
            document.documentElement.setAttribute('data-theme', theme.colorScheme);
          } else {
            document.documentElement.removeAttribute('data-theme');
          }
        });
      } else {
        // Set window-specific override
        windowColorSchemeOverride = colorScheme;
        if (colorScheme === 'system') {
          document.documentElement.removeAttribute('data-theme');
        } else {
          document.documentElement.setAttribute('data-theme', colorScheme);
        }
      }
    });

    // Listen for theme changes (different theme selected) - reload CSS
    ipcRenderer.on('theme:themeChanged', (ev, { themeId }) => {
      DEBUG && console.log('[preload] Theme changed to:', themeId, '- reloading stylesheets');
      reloadStylesheets();
    });

    // Listen for theme reload requests
    ipcRenderer.on('theme:reload', (ev, { themeId }) => {
      DEBUG && console.log('[preload] Theme reload requested:', themeId);
      reloadStylesheets();
    });
  } catch (e) {
    // Theme not available yet (before app ready)
  }
})();

// Auto-apply persisted color scheme preference for this URL
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const url = window.location.href;
    // Only check for http/https URLs (not peek:// internal pages)
    if (!url || url.startsWith('peek://')) return;

    const result = await ipcRenderer.invoke('datastore-query-addresses', {});
    if (!result.success || !result.data) return;

    const addr = result.data.find(a => a.uri === url);
    if (addr && addr.metadata) {
      const meta = JSON.parse(addr.metadata);
      if (meta.colorScheme && (meta.colorScheme === 'light' || meta.colorScheme === 'dark')) {
        DEBUG && console.log('[preload] Applying persisted color scheme for URL:', meta.colorScheme);
        windowColorSchemeOverride = meta.colorScheme;
        document.documentElement.setAttribute('data-theme', meta.colorScheme);
      }
    }
  } catch (e) {
    // Ignore errors (datastore not ready, etc.)
  }
});

/**
 * Reload all stylesheets by removing and re-adding link elements
 * This forces the browser to completely re-fetch CSS including @import statements
 */
function reloadStylesheets() {
  const timestamp = Date.now();

  // Reload <link> stylesheets by removing and re-adding them
  // This is more aggressive than just changing href and ensures @imports are re-fetched
  document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
    const href = link.getAttribute('href');
    if (href) {
      const baseHref = href.split('?')[0];
      const newHref = `${baseHref}?_t=${timestamp}`;

      // Create a new link element to force complete re-fetch
      const newLink = document.createElement('link');
      newLink.rel = 'stylesheet';
      newLink.href = newHref;

      // Replace the old link with the new one
      link.parentNode.insertBefore(newLink, link);
      link.remove();
    }
  });

  // For inline <style> with @import, we need to reload them too
  document.querySelectorAll('style').forEach(style => {
    const content = style.textContent;
    if (content && content.includes('@import')) {
      // Replace @import URLs with cache-busted versions
      const newContent = content.replace(
        /@import\s+url\(['"]?([^'")\s]+)['"]?\)/g,
        (match, url) => {
          const baseUrl = url.split('?')[0];
          return `@import url('${baseUrl}?_t=${timestamp}')`;
        }
      );
      style.textContent = newContent;
    }
  });
}

// App control API
api.quit = () => {
  ipcRenderer.send('app-quit', { source: sourceAddress });
};

api.restart = () => {
  ipcRenderer.send('app-restart', { source: sourceAddress });
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
      DEBUG && console.log('cmd:execute', command.name, msg);
      const handler = window._cmdHandlers?.[command.name];
      if (handler) {
        try {
          const result = await handler(msg);
          // If caller expects a result (for chaining), publish it back
          if (msg.expectResult && msg.resultTopic) {
            ipcRenderer.send('publish', {
              source: sourceAddress,
              scope: 3,
              topic: msg.resultTopic,
              data: result
            });
          }
        } catch (err) {
          console.error('Error executing command', command.name, err);
          // Still publish result on error so panel doesn't hang
          if (msg.expectResult && msg.resultTopic) {
            ipcRenderer.send('publish', {
              source: sourceAddress,
              scope: 3,
              topic: msg.resultTopic,
              data: { error: err.message }
            });
          }
        }
      }
    });

    // Queue registration for batching (improves startup performance)
    pendingRegistrations.push({
      name: command.name,
      description: command.description || '',
      source: sourceAddress,
      accepts: command.accepts || [],
      produces: command.produces || []
    });

    // Debounce: flush after BATCH_DELAY_MS of no new registrations
    clearTimeout(registrationTimer);
    registrationTimer = setTimeout(flushRegistrations, BATCH_DELAY_MS);

    DEBUG && console.log('[preload] commands.register:', command.name);
  },

  /**
   * Flush any pending command registrations immediately
   * Useful for extensions that need commands available before debounce completes
   */
  flush: flushRegistrations,

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

    DEBUG && console.log('[preload] commands.unregister:', name);
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
   * Destroys the extension window and recreates it, reloading all code.
   * @param {string} id - Extension ID to reload
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  reload: (id) => {
    if (!api.extensions._hasPermission()) {
      return Promise.resolve({ success: false, error: 'Permission denied: only core app can manage extensions' });
    }
    return ipcRenderer.invoke('extension-reload', { id });
  },

  /**
   * Open devtools for an extension (permission required)
   * @param {string} id - Extension ID
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  devtools: (id) => {
    if (!api.extensions._hasPermission()) {
      return Promise.resolve({ success: false, error: 'Permission denied: only core app can manage extensions' });
    }
    return ipcRenderer.invoke('extension-window-devtools', { id });
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

// Extension host specific API for receiving direct IPC messages
const isExtensionHost = sourceAddress === 'peek://app/extension-host.html';
if (isExtensionHost) {
  api.ipc = {
    /**
     * Listen for IPC messages from main process
     * Used by extension host to receive ext:load commands
     * @param {string} channel - IPC channel to listen on
     * @param {function} callback - Handler for incoming messages
     */
    on: (channel, callback) => {
      ipcRenderer.on(channel, (event, ...args) => {
        callback(...args);
      });
    }
  };
}

// Generic IPC invoke for core pages (permission required for security)
// Used by diagnostic page and other core utilities
if (isCore) {
  /**
   * Invoke an IPC handler by channel name
   * Only available to core pages (peek://app/...)
   * @param {string} channel - IPC channel name
   * @param {any} data - Optional data to send
   * @returns {Promise<any>} - Result from IPC handler
   */
  api.invoke = (channel, data) => {
    return ipcRenderer.invoke(channel, data);
  };
}

contextBridge.exposeInMainWorld('app', api);
DEBUG && console.log(src, 'api exposed in', Date.now() - preloadStart, 'ms');

window.addEventListener('load', () => {
  DEBUG && console.log(src, 'window.load in', Date.now() - preloadStart, 'ms');
});

// ============================================================================
// Click-and-hold window dragging
// Allows dragging frameless windows by holding mouse down anywhere (~300ms)
// ============================================================================
(function initWindowDrag() {
  const HOLD_DELAY = 300; // ms before drag starts
  const MOVE_THRESHOLD = 5; // px - cancel hold if mouse moves more than this

  let isDragging = false;
  let holdTimer = null;
  let startMouse = null;
  let startWindowPos = null;
  let windowId = null;

  // Elements that should not trigger drag
  const isInteractive = (el) => {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    if (['input', 'textarea', 'button', 'a', 'select', 'label'].includes(tag)) return true;
    if (el.isContentEditable) return true;
    if (el.hasAttribute('data-no-drag')) return true;
    if (el.closest('[data-no-drag]')) return true;
    // Check for -webkit-app-region: no-drag
    try {
      const style = getComputedStyle(el);
      if (style.webkitAppRegion === 'no-drag') return true;
    } catch (e) {
      // Ignore errors from pseudo-elements
    }
    return false;
  };

  const cancelHold = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const endDrag = () => {
    cancelHold();
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = '';
      document.body.classList.remove('is-dragging');
    }
    startMouse = null;
    startWindowPos = null;
    windowId = null;
  };

  const onMouseDown = async (e) => {
    // Only left click, not on interactive elements
    if (e.button !== 0) return;
    if (isInteractive(e.target)) return;

    startMouse = { x: e.screenX, y: e.screenY };

    holdTimer = setTimeout(async () => {
      try {
        // If text was selected during hold period, don't start drag
        if (hasTextSelection()) {
          startMouse = null;
          return;
        }

        // Get window ID and position (use ipcRenderer directly since we're in preload)
        windowId = await ipcRenderer.invoke('get-window-id');
        if (!windowId) return;

        const pos = await ipcRenderer.invoke('window-get-position', { id: windowId });
        if (!pos.success) return;

        startWindowPos = { x: pos.x, y: pos.y };
        isDragging = true;
        document.body.style.cursor = 'grabbing';
        document.body.classList.add('is-dragging');
      } catch (err) {
        DEBUG && console.error('Failed to start drag:', err);
      }
    }, HOLD_DELAY);
  };

  // Check if text is being selected
  const hasTextSelection = () => {
    const selection = window.getSelection();
    return selection && selection.toString().length > 0;
  };

  const onMouseMove = (e) => {
    if (!startMouse) return;

    if (!isDragging) {
      // Cancel hold if mouse moves too much before delay
      const dx = Math.abs(e.screenX - startMouse.x);
      const dy = Math.abs(e.screenY - startMouse.y);
      if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
        cancelHold();
        startMouse = null;
      }
      // Cancel hold if text selection starts
      if (hasTextSelection()) {
        cancelHold();
        startMouse = null;
      }
      return;
    }

    // If text got selected somehow during drag, end drag and let selection win
    if (hasTextSelection()) {
      endDrag();
      return;
    }

    // Calculate and apply new position
    const deltaX = e.screenX - startMouse.x;
    const deltaY = e.screenY - startMouse.y;
    const newX = startWindowPos.x + deltaX;
    const newY = startWindowPos.y + deltaY;

    ipcRenderer.invoke('window-move', { id: windowId, x: newX, y: newY });
  };

  const onMouseUp = () => {
    endDrag();
  };

  // Also end drag if window loses focus
  const onBlur = () => {
    endDrag();
  };

  // Initialize on DOMContentLoaded
  const init = () => {
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);

    DEBUG && console.log('[preload] Window drag initialized');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

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
