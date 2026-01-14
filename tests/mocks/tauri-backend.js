/**
 * Mock Peek API for Frontend Testing
 *
 * This mock provides the Peek API (window.app) with in-memory storage.
 * Used for testing the frontend in isolation without a real backend.
 *
 * See docs/PEEK-API.md for the API reference.
 * Injected via Playwright's addInitScript before page navigation.
 */
(function() {
  'use strict';

  // Skip if already initialized
  if (window.app) {
    return;
  }

  // ==================== In-Memory Data Store ====================

  const store = {
    addresses: new Map(),
    visits: new Map(),
    content: new Map(),
    tags: new Map(),
    addressTags: new Map(), // addressId -> Set<tagId>
    tagAddresses: new Map(), // tagId -> Set<addressId>
    extensionSettings: new Map(),
    extensions: new Map(),
    commands: new Map(),
    windows: new Map(),
    shortcuts: new Map(),
    subscriptions: new Map()
  };

  let idCounter = 1;
  const generateId = (prefix) => `${prefix}_${Date.now()}_${(idCounter++).toString(16)}`;

  // ==================== Window Tracking ====================

  let windowIdCounter = 100;
  const generateWindowId = () => windowIdCounter++;

  // ==================== API Implementation ====================

  const api = {};

  api.log = (...args) => {
    console.log('[mock]', ...args);
  };

  api.debug = false;
  api.debugLevels = { BASIC: 1, FIRST_RUN: 2 };
  api.debugLevel = 1;

  api.scopes = {
    SYSTEM: 1,
    SELF: 2,
    GLOBAL: 3
  };

  // ==================== Shortcuts ====================

  api.shortcuts = {
    register: async (shortcut, cb, options = {}) => {
      store.shortcuts.set(shortcut, { callback: cb, options });
      return { success: true };
    },

    unregister: async (shortcut, options = {}) => {
      store.shortcuts.delete(shortcut);
      return { success: true };
    }
  };

  // ==================== Window Management ====================

  api.window = {
    open: async (url, options = {}) => {
      const id = generateWindowId();
      store.windows.set(id, {
        id,
        url,
        options,
        visible: true,
        focused: true,
        createdAt: Date.now()
      });
      console.log('[mock] window.open:', url, 'id:', id);

      // If Playwright's exposed function is available, actually open a page
      if (typeof window.__mockWindowOpen === 'function') {
        try {
          const result = await window.__mockWindowOpen(url, options);
          if (result && result.id !== undefined) {
            // Use the Playwright page id
            return { success: true, id: result.id };
          }
        } catch (e) {
          console.log('[mock] __mockWindowOpen error:', e);
        }
      }

      return { success: true, id };
    },

    close: async (idOrOptions = null) => {
      let id = null;
      if (idOrOptions === null || idOrOptions === undefined) {
        return { success: true };
      } else if (typeof idOrOptions === 'object') {
        id = idOrOptions.id;
      } else {
        id = idOrOptions;
      }
      store.windows.delete(id);
      console.log('[mock] window.close:', id);
      return { success: true };
    },

    hide: async (idOrOptions) => {
      const id = typeof idOrOptions === 'object' ? idOrOptions.id : idOrOptions;
      const win = store.windows.get(id);
      if (win) win.visible = false;
      return { success: true };
    },

    show: async (idOrOptions) => {
      const id = typeof idOrOptions === 'object' ? idOrOptions.id : idOrOptions;
      const win = store.windows.get(id);
      if (win) win.visible = true;
      return { success: true };
    },

    focus: async (idOrOptions) => {
      const id = typeof idOrOptions === 'object' ? idOrOptions.id : idOrOptions;
      const win = store.windows.get(id);
      if (win) win.focused = true;
      return { success: true };
    },

    blur: async (idOrOptions) => {
      return { success: true };
    },

    exists: async (idOrOptions) => {
      const id = typeof idOrOptions === 'object' ? idOrOptions.id : idOrOptions;
      return { success: true, data: store.windows.has(id) };
    },

    move: async (idOrOptions, x, y) => {
      return { success: true };
    },

    list: async (options = {}) => {
      const windows = Array.from(store.windows.values());
      return { success: true, windows };
    }
  };

  api.closeWindow = (id, callback) => {
    api.window.close(id).then(result => {
      if (callback) callback(result);
    });
  };

  api.modifyWindow = (winName, params) => {
    console.log('[mock] modifyWindow not implemented');
  };

  // ==================== PubSub ====================

  api.publish = (topic, msg, scope = api.scopes.SELF) => {
    console.log('[mock] publish:', topic);
    const callbacks = store.subscriptions.get(topic) || [];
    callbacks.forEach(cb => {
      try {
        cb({ ...msg, source: 'mock' });
      } catch (e) {
        console.error('[mock] publish callback error:', e);
      }
    });
  };

  api.subscribe = (topic, callback, scope = api.scopes.SELF) => {
    console.log('[mock] subscribe:', topic);
    if (!store.subscriptions.has(topic)) {
      store.subscriptions.set(topic, []);
    }
    store.subscriptions.get(topic).push(callback);
  };

  // ==================== Datastore ====================

  api.datastore = {
    addAddress: async (uri, options = {}) => {
      const id = generateId('addr');
      const domain = uri.match(/https?:\/\/([^/]+)/)?.[1] || null;
      const protocol = uri.match(/^(\w+):/)?.[1] || 'https';

      const address = {
        id,
        uri,
        title: options.title || uri,
        description: options.description || null,
        domain,
        protocol,
        starred: options.starred || 0,
        visitCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      store.addresses.set(id, address);
      console.log('[mock] addAddress:', uri, 'id:', id);
      return { success: true, id, data: address };
    },

    getAddress: async (id) => {
      const address = store.addresses.get(id);
      if (address) {
        return { success: true, data: address };
      }
      return { success: false, error: 'Address not found' };
    },

    updateAddress: async (id, updates) => {
      const address = store.addresses.get(id);
      if (address) {
        Object.assign(address, updates, { updatedAt: Date.now() });
        return { success: true, data: address };
      }
      return { success: false, error: 'Address not found' };
    },

    queryAddresses: async (filter = {}) => {
      let addresses = Array.from(store.addresses.values());

      if (filter.domain) {
        addresses = addresses.filter(a => a.domain === filter.domain);
      }
      if (filter.starred !== undefined) {
        addresses = addresses.filter(a => a.starred === filter.starred);
      }
      if (filter.limit) {
        addresses = addresses.slice(0, filter.limit);
      }

      return { success: true, data: addresses };
    },

    addVisit: async (addressId, options = {}) => {
      const id = generateId('visit');
      const visit = {
        id,
        addressId,
        timestamp: Date.now(),
        duration: options.duration || 0
      };
      store.visits.set(id, visit);

      // Update address visit count
      const address = store.addresses.get(addressId);
      if (address) {
        address.visitCount = (address.visitCount || 0) + 1;
      }

      return { success: true, id, data: visit };
    },

    queryVisits: async (filter = {}) => {
      let visits = Array.from(store.visits.values());

      if (filter.addressId) {
        visits = visits.filter(v => v.addressId === filter.addressId);
      }
      if (filter.limit) {
        visits = visits.slice(0, filter.limit);
      }

      return { success: true, data: visits };
    },

    addContent: async (options = {}) => {
      const id = generateId('content');
      const content = { id, ...options, createdAt: Date.now() };
      store.content.set(id, content);
      return { success: true, id, data: content };
    },

    queryContent: async (filter = {}) => {
      const content = Array.from(store.content.values());
      return { success: true, data: content };
    },

    getTable: async (tableName) => {
      let data = {};

      switch (tableName) {
        case 'addresses':
          store.addresses.forEach((v, k) => data[k] = v);
          break;
        case 'visits':
          store.visits.forEach((v, k) => data[k] = v);
          break;
        case 'tags':
          store.tags.forEach((v, k) => data[k] = v);
          break;
        case 'extension_settings':
          store.extensionSettings.forEach((v, k) => data[k] = v);
          break;
        default:
          break;
      }

      return { success: true, data };
    },

    setRow: async (tableName, rowId, rowData) => {
      switch (tableName) {
        case 'extension_settings':
          store.extensionSettings.set(rowId, rowData);
          break;
        case 'addresses':
          store.addresses.set(rowId, rowData);
          break;
        default:
          console.log('[mock] setRow for unknown table:', tableName);
      }
      return { success: true };
    },

    getStats: async () => {
      return {
        success: true,
        data: {
          totalAddresses: store.addresses.size,
          totalVisits: store.visits.size,
          totalTags: store.tags.size
        }
      };
    },

    getOrCreateTag: async (name) => {
      // Check if tag exists
      for (const [id, tag] of store.tags) {
        if (tag.name === name) {
          return { success: true, data: tag };
        }
      }

      // Create new tag
      const id = generateId('tag');
      const tag = {
        id,
        name,
        count: 0,
        frecency: 0,
        createdAt: Date.now()
      };
      store.tags.set(id, tag);
      store.tagAddresses.set(id, new Set());

      return { success: true, data: tag };
    },

    tagAddress: async (addressId, tagId) => {
      if (!store.addressTags.has(addressId)) {
        store.addressTags.set(addressId, new Set());
      }
      store.addressTags.get(addressId).add(tagId);

      if (!store.tagAddresses.has(tagId)) {
        store.tagAddresses.set(tagId, new Set());
      }
      store.tagAddresses.get(tagId).add(addressId);

      // Update tag count
      const tag = store.tags.get(tagId);
      if (tag) {
        tag.count = store.tagAddresses.get(tagId).size;
      }

      return { success: true };
    },

    untagAddress: async (addressId, tagId) => {
      const addressTags = store.addressTags.get(addressId);
      if (addressTags) {
        addressTags.delete(tagId);
      }

      const tagAddresses = store.tagAddresses.get(tagId);
      if (tagAddresses) {
        tagAddresses.delete(addressId);
      }

      return { success: true };
    },

    getTagsByFrecency: async (limit = 10) => {
      const tags = Array.from(store.tags.values())
        .sort((a, b) => b.frecency - a.frecency)
        .slice(0, limit);
      return { success: true, data: tags };
    },

    getAddressTags: async (addressId) => {
      const tagIds = store.addressTags.get(addressId) || new Set();
      const tags = Array.from(tagIds).map(id => store.tags.get(id)).filter(Boolean);
      return { success: true, data: tags };
    },

    getAddressesByTag: async (tagId) => {
      const addressIds = store.tagAddresses.get(tagId) || new Set();
      const addresses = Array.from(addressIds).map(id => store.addresses.get(id)).filter(Boolean);
      return { success: true, data: addresses };
    },

    getUntaggedAddresses: async (limit = 10) => {
      const tagged = new Set();
      store.addressTags.forEach((tags, addrId) => {
        if (tags.size > 0) tagged.add(addrId);
      });

      const untagged = Array.from(store.addresses.values())
        .filter(a => !tagged.has(a.id))
        .slice(0, limit);

      return { success: true, data: untagged };
    }
  };

  // ==================== Commands ====================

  api.commands = {
    register: (command) => {
      if (!command.name || !command.execute) {
        console.error('[mock] commands.register: name and execute required');
        return;
      }
      store.commands.set(command.name, command);
      console.log('[mock] commands.register:', command.name);
    },

    unregister: (name) => {
      store.commands.delete(name);
      console.log('[mock] commands.unregister:', name);
    },

    getAll: async () => {
      return Array.from(store.commands.values()).map(c => ({
        name: c.name,
        description: c.description || ''
      }));
    }
  };

  // ==================== Extensions ====================

  // Pre-populate with built-in extensions
  const builtinExtensions = ['groups', 'peeks', 'slides'];
  builtinExtensions.forEach(id => {
    store.extensions.set(id, {
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      path: `/extensions/${id}`,
      enabled: true,
      builtin: true,
      createdAt: Date.now()
    });
  });

  api.extensions = {
    _hasPermission: () => true,

    list: async () => {
      const running = Array.from(store.extensions.values()).filter(e => e.enabled);
      return { success: true, data: running };
    },

    load: async (id) => {
      const ext = store.extensions.get(id);
      if (ext) {
        ext.enabled = true;
        return { success: true };
      }
      return { success: false, error: 'Extension not found' };
    },

    unload: async (id) => {
      const ext = store.extensions.get(id);
      if (ext) {
        ext.enabled = false;
        return { success: true };
      }
      return { success: false, error: 'Extension not found' };
    },

    reload: async (id) => {
      return { success: true };
    },

    getManifest: async (id) => {
      return { success: false, error: 'Not implemented' };
    },

    pickFolder: async () => {
      return { success: true, canceled: true };
    },

    validateFolder: async (folderPath) => {
      // Mock validation - extract extension name from path
      const parts = folderPath.split('/');
      const name = parts[parts.length - 1];

      return {
        success: true,
        data: {
          manifest: {
            id: name,
            name: name.charAt(0).toUpperCase() + name.slice(1),
            version: '1.0.0',
            description: `Mock ${name} extension`
          }
        }
      };
    },

    add: async (folderPath, manifest, enabled, lastError = null) => {
      const id = manifest.id || manifest.shortname || manifest.name.toLowerCase();
      const ext = {
        id,
        name: manifest.name,
        path: folderPath,
        enabled: enabled,
        builtin: false,
        manifest,
        lastError,
        createdAt: Date.now()
      };
      store.extensions.set(id, ext);
      return { success: true, data: ext };
    },

    remove: async (id) => {
      store.extensions.delete(id);
      return { success: true };
    },

    update: async (id, updates) => {
      const ext = store.extensions.get(id);
      if (ext) {
        Object.assign(ext, updates);
        return { success: true, data: ext };
      }
      return { success: false, error: 'Extension not found' };
    },

    getAll: async () => {
      return { success: true, data: Array.from(store.extensions.values()) };
    },

    get: async (id) => {
      const ext = store.extensions.get(id);
      if (ext) {
        return { success: true, data: ext };
      }
      return { success: false, error: 'Extension not found' };
    },

    getSettingsSchema: async (extId) => {
      return { success: false, error: 'Not implemented' };
    }
  };

  // ==================== Settings ====================

  api.settings = {
    get: async () => {
      return { success: true, data: {} };
    },
    set: async (settings) => {
      return { success: true };
    },
    getKey: async (key) => {
      return { success: true, data: null };
    },
    setKey: async (key, value) => {
      return { success: true };
    }
  };

  // ==================== Escape ====================

  api.escape = {
    onEscape: (callback) => {
      window._escapeCallback = callback;
    }
  };

  // ==================== App Control ====================

  api.quit = () => {
    console.log('[mock] quit requested');
  };

  // ==================== Register hello command ====================

  api.commands.register({
    name: 'hello',
    description: 'Say hello',
    execute: () => {
      console.log('[mock] Hello from mock!');
    }
  });

  // ==================== Expose API ====================

  window.app = api;

  // Also expose store for test inspection
  window.__mockStore = store;

  console.log('[mock] Tauri backend mock initialized');
})();
