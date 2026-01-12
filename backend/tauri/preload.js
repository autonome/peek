/**
 * Tauri Preload Adapter
 *
 * Provides the same `window.app` API as Electron's preload.js.
 * This script is injected by Tauri's initialization_script mechanism
 * so it runs before any page scripts.
 */
(function() {
  'use strict';

  // Always set up ESC handler for closing windows, even on external pages
  // This runs before any Tauri check to ensure ESC works everywhere
  const setupEscapeHandler = () => {
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Escape') {
        // If we have the Tauri API, use it to close
        if (window.__TAURI__ && window.__TAURI__.webviewWindow) {
          const { getCurrentWebviewWindow } = window.__TAURI__.webviewWindow;
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
        } else {
          // Fallback: try window.close()
          window.close();
        }
      }
    });
  };

  // Set up ESC handler immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEscapeHandler);
  } else {
    setupEscapeHandler();
  }

  // Skip API setup if already initialized or not in Tauri
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

  // Track global shortcut handlers and listeners for cleanup
  const globalShortcutHandlers = new Map();
  const globalShortcutListeners = new Map();

  api.shortcuts = {
    register: async (shortcut, cb, options = {}) => {
      const isGlobal = options.global === true;
      invoke('log_message', { source: sourceAddress, args: [`registering ${isGlobal ? 'global' : 'local'} shortcut: ${shortcut}`] });

      // In Tauri, we register all shortcuts as global (they work system-wide)
      // The "local" vs "global" distinction from Electron is handled differently
      // For now, treat all shortcuts as global shortcuts with event emission
      try {
        // Register via Rust command
        const result = await invoke('shortcut_register', {
          shortcut,
          source: sourceAddress
        });

        if (result.success) {
          // Listen for the shortcut event - sanitize to match Rust event naming
          // Only alphanumeric, '-', '/', ':', '_' are allowed in event names
          const safeShortcut = shortcut.replace(/[^a-zA-Z0-9\-/:_]/g, '_');
          const eventName = `shortcut:${safeShortcut}`;
          invoke('log_message', { source: sourceAddress, args: [`Setting up listener for: ${eventName}`] });
          const unlisten = await listen(eventName, (event) => {
            invoke('log_message', { source: sourceAddress, args: [`EVENT RECEIVED: ${eventName}`, JSON.stringify(event)] });
            try {
              cb();
              invoke('log_message', { source: sourceAddress, args: [`Callback executed for: ${shortcut}`] });
            } catch (e) {
              invoke('log_message', { source: sourceAddress, args: [`Callback error for ${shortcut}: ${e}`] });
            }
          });
          globalShortcutHandlers.set(shortcut, cb);
          globalShortcutListeners.set(shortcut, unlisten);
          invoke('log_message', { source: sourceAddress, args: [`${isGlobal ? 'Global' : 'Local'} shortcut registered: ${shortcut}`] });
        } else {
          console.error(`[tauri] Failed to register shortcut ${shortcut}:`, result.error);
        }
      } catch (e) {
        console.error(`[tauri] Failed to register shortcut ${shortcut}:`, e);
      }
    },

    unregister: async (shortcut, options = {}) => {
      const isGlobal = options.global === true;
      invoke('log_message', { source: sourceAddress, args: [`unregistering ${isGlobal ? 'global' : 'local'} shortcut: ${shortcut}`] });

      try {
        // Unregister via Rust command
        await invoke('shortcut_unregister', { shortcut });

        // Stop listening for the event
        const unlisten = globalShortcutListeners.get(shortcut);
        if (unlisten) {
          unlisten();
          globalShortcutListeners.delete(shortcut);
        }
        globalShortcutHandlers.delete(shortcut);
      } catch (e) {
        console.error(`[tauri] Failed to unregister shortcut ${shortcut}:`, e);
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
      const payload = event.payload || {};
      // Unwrap the data and add source - publish wraps msg in { source, scope, data: msg }
      const msg = payload.data || {};
      msg.source = payload.source || sourceAddress;
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
    getTagsByFrecency: (limit) => invoke('datastore_get_tags_by_frecency', { limit }),
    getAddressTags: (addressId) => invoke('datastore_get_address_tags', { addressId }),
    getAddressesByTag: (tagId) => invoke('datastore_get_addresses_by_tag', { tagId }),
    getUntaggedAddresses: (limit) => invoke('datastore_get_untagged_addresses', { limit })
  };

  // ==================== Commands ====================

  // Track command execution subscriptions for cleanup
  const commandSubscriptions = new Map();

  api.commands = {
    register: (command) => {
      if (!command.name || !command.execute) {
        console.error('commands.register: name and execute are required');
        return;
      }
      // Store execute handler locally
      window._cmdHandlers = window._cmdHandlers || {};
      window._cmdHandlers[command.name] = command.execute;

      // Subscribe to execution messages from the cmd panel
      const executeTopic = `cmd:execute:${command.name}`;
      listen(`pubsub:${executeTopic}`, (event) => {
        const payload = event.payload || {};
        const ctx = payload.data || {};
        console.log(`[tauri] Executing command: ${command.name}`, ctx);
        try {
          command.execute(ctx);
        } catch (e) {
          console.error(`[tauri] Command execution error for ${command.name}:`, e);
        }
      }).then(unlisten => {
        commandSubscriptions.set(command.name, unlisten);
      });

      // Register with backend
      invoke('commands_register', {
        name: command.name,
        description: command.description || '',
        source: sourceAddress
      }).catch(e => console.error('[tauri] commands.register error:', e));

      console.log('[tauri] commands.register:', command.name);
    },

    unregister: (name) => {
      if (window._cmdHandlers) {
        delete window._cmdHandlers[name];
      }
      // Clean up execution subscription
      const unlisten = commandSubscriptions.get(name);
      if (unlisten) {
        unlisten();
        commandSubscriptions.delete(name);
      }
      invoke('commands_unregister', { name }).catch(e => console.error('[tauri] commands.unregister error:', e));
      console.log('[tauri] commands.unregister:', name);
    },

    getAll: async () => {
      try {
        return await invoke('commands_get_all', {});
      } catch (e) {
        console.error('[tauri] commands.getAll error:', e);
        return [];
      }
    }
  };

  // ==================== Extensions ====================

  api.extensions = {
    _hasPermission: () => sourceAddress.startsWith('peek://app/'),

    list: async () => {
      try {
        return await invoke('extensions_list', {});
      } catch (e) {
        console.error('[tauri] extensions.list error:', e);
        return { success: false, error: String(e) };
      }
    },
    load: async (id) => ({ success: false, error: 'Not implemented in Tauri MVP' }),
    unload: async (id) => ({ success: false, error: 'Not implemented in Tauri MVP' }),
    reload: async (id) => ({ success: false, error: 'Not implemented in Tauri MVP' }),
    getManifest: async (id) => ({ success: false, error: 'Not implemented' }),

    pickFolder: async () => {
      try {
        const result = await invoke('extension_pick_folder', {});
        if (result.error === 'Canceled') {
          return { success: true, canceled: true };
        }
        return { success: true, data: result.data };
      } catch (e) {
        console.error('[tauri] extensions.pickFolder error:', e);
        return { success: false, error: String(e) };
      }
    },

    validateFolder: async (folderPath) => {
      try {
        return await invoke('extension_validate_folder', { folderPath });
      } catch (e) {
        console.error('[tauri] extensions.validateFolder error:', e);
        return { success: false, error: String(e) };
      }
    },

    add: async (folderPath, manifest, enabled, lastError = null) => {
      if (!api.extensions._hasPermission()) {
        return { success: false, error: 'Permission denied' };
      }
      try {
        return await invoke('extension_add', { folderPath, manifest, enabled, lastError });
      } catch (e) {
        console.error('[tauri] extensions.add error:', e);
        return { success: false, error: String(e) };
      }
    },

    remove: async (id) => {
      if (!api.extensions._hasPermission()) {
        return { success: false, error: 'Permission denied' };
      }
      try {
        return await invoke('extension_remove', { id });
      } catch (e) {
        console.error('[tauri] extensions.remove error:', e);
        return { success: false, error: String(e) };
      }
    },

    update: async (id, updates) => {
      if (!api.extensions._hasPermission()) {
        return { success: false, error: 'Permission denied' };
      }
      try {
        return await invoke('extension_update', { id, updates });
      } catch (e) {
        console.error('[tauri] extensions.update error:', e);
        return { success: false, error: String(e) };
      }
    },

    getAll: async () => {
      try {
        return await invoke('extension_get_all', {});
      } catch (e) {
        console.error('[tauri] extensions.getAll error:', e);
        return { success: true, data: [] };
      }
    },

    get: async (id) => {
      try {
        return await invoke('extension_get', { id });
      } catch (e) {
        console.error('[tauri] extensions.get error:', e);
        return { success: false, error: String(e) };
      }
    },

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
    invoke('app_quit', {}).catch(e => {
      console.error('[tauri] quit error:', e);
    });
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

  // ESC key handling is now set up at the top of the file to work on all pages

  // Override window.close to use Tauri's close method
  const originalClose = window.close.bind(window);
  window.close = () => {
    console.log('[tauri] window.close called');
    getCurrentWebviewWindow().close().catch(e => {
      console.error('[tauri] window.close error:', e);
      // Fallback to original
      originalClose();
    });
  };

  // Expose API globally
  window.app = api;

  // Sync running extensions' enabled state to localStorage
  // This ensures the Settings UI shows correct enabled checkboxes
  const syncExtensionState = async () => {
    try {
      const result = await invoke('extensions_list', {});
      if (result.success && result.data && result.data.length > 0) {
        // Get current features from localStorage
        const storageKey = '8aadaae5-2594-4968-aba0-707f0d371cfb'; // app config id
        const stored = localStorage.getItem(storageKey);
        const data = stored ? JSON.parse(stored) : {};
        const items = data.items || [];

        // Mark running extensions as enabled
        const runningIds = new Set(result.data.map(e => e.id.toLowerCase()));
        let changed = false;

        items.forEach(item => {
          const itemName = item.name?.toLowerCase();
          if (runningIds.has(itemName) && !item.enabled) {
            item.enabled = true;
            changed = true;
          }
        });

        if (changed) {
          data.items = items;
          localStorage.setItem(storageKey, JSON.stringify(data));
          console.log('[tauri:preload] Synced extension enabled state to localStorage');
        }
      }
    } catch (e) {
      // Ignore errors during sync
    }
  };

  // Run sync after a short delay to ensure extensions are loaded
  setTimeout(syncExtensionState, 2000);

  console.log('[tauri:preload] API initialized for:', sourceAddress);
})();
