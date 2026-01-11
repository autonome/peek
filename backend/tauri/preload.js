/**
 * Tauri Preload Adapter
 *
 * Provides the same `window.app` API as Electron's preload.js.
 * This script is injected by Tauri's initialization_script mechanism
 * so it runs before any page scripts.
 */
(function() {
  'use strict';

  // Skip if already initialized or not in Tauri
  if (window.app || !window.__TAURI__) {
    return;
  }

  const DEBUG = false;
  const DEBUG_LEVELS = { BASIC: 1, FIRST_RUN: 2 };
  const DEBUG_LEVEL = DEBUG_LEVELS.BASIC;

  const sourceAddress = window.location.toString();
  const rndm = () => Math.random().toString(16).slice(2);

  // Context detection
  const isCore = sourceAddress.startsWith('peek://app/');
  const isExtension = sourceAddress.startsWith('peek://ext/');

  const getExtensionId = () => {
    if (!isExtension) return null;
    const match = sourceAddress.match(/peek:\/\/ext\/([^/]+)/);
    return match ? match[1] : null;
  };

  // Tauri APIs
  const { invoke } = window.__TAURI__.core;
  const { emit, listen } = window.__TAURI__.event;
  const { getCurrentWebviewWindow } = window.__TAURI__.webviewWindow;

  // Local shortcut handlers (for non-global shortcuts)
  const localShortcutHandlers = new Map();

  // PubSub subscriptions tracking
  const subscriptions = new Map();

  const api = {};

  // Log to main process
  api.log = (...args) => {
    invoke('log_message', { source: sourceAddress, args: args.map(a => String(a)) }).catch(() => {});
  };

  api.debug = DEBUG;
  api.debugLevels = DEBUG_LEVELS;
  api.debugLevel = DEBUG_LEVEL;

  api.scopes = {
    SYSTEM: 1,
    SELF: 2,
    GLOBAL: 3
  };

  // ==================== Shortcuts ====================

  api.shortcuts = {
    register: (shortcut, cb, options = {}) => {
      const isGlobal = options.global === true;
      console.log(`[tauri] registering ${isGlobal ? 'global' : 'local'} shortcut ${shortcut}`);

      if (isGlobal) {
        // Global shortcuts not yet implemented in Tauri MVP
        console.warn('[tauri] Global shortcuts not yet implemented');
      } else {
        localShortcutHandlers.set(shortcut, cb);
      }
    },

    unregister: (shortcut, options = {}) => {
      const isGlobal = options.global === true;
      console.log(`[tauri] unregistering ${isGlobal ? 'global' : 'local'} shortcut ${shortcut}`);

      if (!isGlobal) {
        localShortcutHandlers.delete(shortcut);
      }
    }
  };

  // ==================== Window Management ====================
  // Must match Electron's API exactly

  api.window = {
    open: async (url, options = {}) => {
      console.log('[tauri] window.open', url);
      try {
        const result = await invoke('window_open', { source: sourceAddress, url, options });
        // Tauri returns { success, data: { id } } - transform to match Electron's { success, id }
        if (result.success && result.data) {
          return { success: true, id: result.data.id };
        }
        return result;
      } catch (e) {
        console.error('[tauri] window.open error:', e);
        return { success: false, error: String(e) };
      }
    },

    close: async (idOrOptions = null) => {
      // Electron API: close(id) or close({ id })
      let id = null;
      if (idOrOptions === null || idOrOptions === undefined) {
        // Close current window
        const currentWindow = getCurrentWebviewWindow();
        await currentWindow.close();
        return { success: true };
      } else if (typeof idOrOptions === 'object') {
        id = idOrOptions.id;
      } else {
        id = idOrOptions;
      }
      return invoke('window_close', { id });
    },

    hide: async (idOrOptions) => {
      const id = typeof idOrOptions === 'object' ? idOrOptions.id : idOrOptions;
      return invoke('window_hide', { id });
    },

    show: async (idOrOptions) => {
      const id = typeof idOrOptions === 'object' ? idOrOptions.id : idOrOptions;
      return invoke('window_show', { id });
    },

    focus: async (idOrOptions) => {
      const id = typeof idOrOptions === 'object' ? idOrOptions.id : idOrOptions;
      return invoke('window_focus', { id });
    },

    blur: async (idOrOptions) => {
      // Not implemented yet - return success
      return { success: true };
    },

    exists: async (idOrOptions) => {
      const id = typeof idOrOptions === 'object' ? idOrOptions.id : idOrOptions;
      const result = await invoke('window_list', {});
      if (result.success && result.data) {
        const exists = result.data.some(w => w.id === id || w.label === id);
        return { success: true, data: exists };
      }
      return { success: false, data: false };
    },

    move: async (idOrOptions, x, y) => {
      // Not implemented yet
      return { success: true };
    },

    list: async (options = {}) => {
      return invoke('window_list', { options });
    }
  };

  api.closeWindow = (id, callback) => {
    api.window.close(id).then(result => {
      if (callback) callback(result);
    });
  };

  api.modifyWindow = (winName, params) => {
    // Not implemented yet
    console.log('[tauri] modifyWindow not implemented');
  };

  // ==================== PubSub ====================

  api.publish = (topic, msg, scope = api.scopes.SELF) => {
    console.log('[tauri] publish', topic);
    emit(`pubsub:${topic}`, { source: sourceAddress, scope, data: msg }).catch(e => {
      console.error('[tauri] publish error:', e);
    });
  };

  api.subscribe = (topic, callback, scope = api.scopes.SELF) => {
    console.log('[tauri] subscribe', topic);

    const key = `${sourceAddress}:${topic}`;

    listen(`pubsub:${topic}`, (event) => {
      const msg = event.payload || {};
      msg.source = sourceAddress;
      try {
        callback(msg);
      } catch (ex) {
        console.error('[tauri] subscriber callback error for topic', topic, ex);
      }
    }).then(unlisten => {
      subscriptions.set(key, unlisten);
    }).catch(e => {
      console.error('[tauri] subscribe error:', e);
    });
  };

  // ==================== Datastore ====================

  api.datastore = {
    addAddress: (uri, options) => invoke('datastore_add_address', { uri, options }),
    getAddress: (id) => invoke('datastore_get_address', { id }),
    updateAddress: (id, updates) => invoke('datastore_update_address', { id, updates }),
    queryAddresses: (filter) => invoke('datastore_query_addresses', { filter }),
    addVisit: (addressId, options) => invoke('datastore_add_visit', { addressId, options }),
    queryVisits: (filter) => invoke('datastore_query_visits', { filter }),
    addContent: (options) => invoke('datastore_add_content', { options }),
    queryContent: (filter) => invoke('datastore_query_content', { filter }),
    getTable: (tableName) => invoke('datastore_get_table', { tableName }),
    setRow: (tableName, rowId, rowData) => invoke('datastore_set_row', { tableName, rowId, rowData }),
    getStats: () => invoke('datastore_get_stats', {}),
    getOrCreateTag: (name) => invoke('datastore_get_or_create_tag', { name }),
    tagAddress: (addressId, tagId) => invoke('datastore_tag_address', { addressId, tagId }),
    untagAddress: (addressId, tagId) => invoke('datastore_untag_address', { addressId, tagId }),
    getTagsByFrecency: (domain) => ({ success: true, data: [] }), // Not implemented
    getAddressTags: (addressId) => invoke('datastore_get_address_tags', { addressId }),
    getAddressesByTag: (tagId) => ({ success: true, data: [] }), // Not implemented
    getUntaggedAddresses: () => ({ success: true, data: [] }) // Not implemented
  };

  // ==================== Commands ====================

  api.commands = {
    register: (command) => {
      if (!command.name || !command.execute) {
        console.error('commands.register: name and execute are required');
        return;
      }
      window._cmdHandlers = window._cmdHandlers || {};
      window._cmdHandlers[command.name] = command.execute;

      // Publish command registration
      api.publish('cmd:register', {
        name: command.name,
        description: command.description || '',
        source: sourceAddress
      }, api.scopes.GLOBAL);

      console.log('[tauri] commands.register:', command.name);
    },

    unregister: (name) => {
      if (window._cmdHandlers) {
        delete window._cmdHandlers[name];
      }
      api.publish('cmd:unregister', { name }, api.scopes.GLOBAL);
      console.log('[tauri] commands.unregister:', name);
    },

    getAll: async () => {
      // Return empty array for now - cmd registry not implemented
      return [];
    }
  };

  // ==================== Extensions ====================

  api.extensions = {
    _hasPermission: () => sourceAddress.startsWith('peek://app/'),

    list: async () => ({ success: true, data: [] }),
    load: async (id) => ({ success: false, error: 'Not implemented in Tauri MVP' }),
    unload: async (id) => ({ success: false, error: 'Not implemented in Tauri MVP' }),
    reload: async (id) => ({ success: false, error: 'Not implemented in Tauri MVP' }),
    getManifest: async (id) => ({ success: false, error: 'Not implemented' }),
    pickFolder: async () => ({ success: false, error: 'Not implemented' }),
    validateFolder: async (path) => ({ success: false, error: 'Not implemented' }),
    add: async (path, manifest, enabled) => ({ success: false, error: 'Not implemented' }),
    remove: async (id) => ({ success: false, error: 'Not implemented' }),
    update: async (id, updates) => ({ success: false, error: 'Not implemented' }),
    getAll: async () => ({ success: true, data: [] }),
    get: async (id) => ({ success: false, error: 'Not found' }),
    getSettingsSchema: async (extId) => ({ success: false, error: 'Not implemented' })
  };

  // ==================== Settings ====================

  api.settings = {
    get: async () => {
      const extId = getExtensionId();
      if (!extId) return { success: false, error: 'Not an extension context' };
      return { success: true, data: {} };
    },
    set: async (settings) => {
      const extId = getExtensionId();
      if (!extId) return { success: false, error: 'Not an extension context' };
      return { success: true };
    },
    getKey: async (key) => {
      const extId = getExtensionId();
      if (!extId) return { success: false, error: 'Not an extension context' };
      return { success: true, data: null };
    },
    setKey: async (key, value) => {
      const extId = getExtensionId();
      if (!extId) return { success: false, error: 'Not an extension context' };
      return { success: true };
    }
  };

  // ==================== Escape ====================

  api.escape = {
    onEscape: (callback) => {
      // Will be called when ESC is pressed
      window._escapeCallback = callback;
    }
  };

  // ==================== App Control ====================

  api.quit = () => {
    console.log('[tauri] quit requested');
    // Not implemented yet
  };

  // ==================== Keyboard Handling ====================

  // Local shortcut handler
  document.addEventListener('keydown', (e) => {
    const parts = [];
    if (e.altKey) parts.push('Alt');
    if (e.ctrlKey) parts.push('Control');
    if (e.metaKey) parts.push('Command');
    if (e.shiftKey) parts.push('Shift');

    if (e.key.length === 1) {
      parts.push(e.key.toUpperCase());
    } else {
      parts.push(e.key);
    }

    const shortcut = parts.join('+');
    const variations = [
      shortcut,
      shortcut.replace('Alt', 'Option'),
      shortcut.replace('Control', 'CommandOrControl'),
      shortcut.replace('Command', 'CommandOrControl'),
    ];

    for (const variant of variations) {
      const handler = localShortcutHandlers.get(variant);
      if (handler) {
        e.preventDefault();
        handler();
        break;
      }
    }
  });

  // ESC key handling
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') {
      if (window._escapeCallback) {
        Promise.resolve(window._escapeCallback()).then(result => {
          if (!result || !result.handled) {
            getCurrentWebviewWindow().close();
          }
        }).catch(() => {
          getCurrentWebviewWindow().close();
        });
      } else {
        getCurrentWebviewWindow().close();
      }
    }
  });

  // Expose API globally
  window.app = api;

  console.log('[tauri:preload] API initialized for:', sourceAddress);
})();
