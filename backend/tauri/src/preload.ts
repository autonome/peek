/**
 * Tauri Preload Adapter
 *
 * This module provides the same `window.app` API as the Electron preload.js,
 * but using Tauri's invoke() for IPC communication.
 *
 * Usage: Include this script in your HTML before other app scripts:
 * <script type="module" src="peek://app/backend/tauri/src/preload.js"></script>
 */

import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

const DEBUG = false;
const sourceAddress = window.location.toString();

// Helper to generate random IDs
const rndm = () => Math.random().toString(16).slice(2);

// Context detection
const isCore = sourceAddress.startsWith('peek://app/');
const isExtension = sourceAddress.startsWith('peek://ext/');

const getExtensionId = (): string | null => {
  if (!isExtension) return null;
  const match = sourceAddress.match(/peek:\/\/ext\/([^/]+)/);
  return match ? match[1] : null;
};

// Local shortcut handlers (for shortcuts registered from this window)
const localShortcutHandlers = new Map<string, () => void>();

// PubSub subscriptions
const pubsubSubscriptions = new Map<string, (msg: unknown) => void>();

interface Api {
  debug: boolean;
  log: (...args: unknown[]) => void;
  scopes: {
    SYSTEM: number;
    SELF: number;
    GLOBAL: number;
  };
  shortcuts: {
    register: (shortcut: string, cb: () => void, options?: { global?: boolean }) => void;
    unregister: (shortcut: string, options?: { global?: boolean }) => void;
  };
  window: {
    open: (url: string, options?: Record<string, unknown>) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;
    close: (id?: string | null) => Promise<{ success: boolean; error?: string }>;
    hide: (id?: string) => Promise<{ success: boolean; error?: string }>;
    show: (id?: string) => Promise<{ success: boolean; error?: string }>;
    focus: (id?: string) => Promise<{ success: boolean; error?: string }>;
    list: (options?: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown[]; error?: string }>;
    exists: (id: string) => Promise<{ success: boolean; data?: boolean; error?: string }>;
  };
  publish: (topic: string, msg: unknown, scope?: number) => void;
  subscribe: (topic: string, callback: (msg: unknown) => void, scope?: number) => void;
  datastore: {
    addAddress: (uri: string, options?: Record<string, unknown>) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;
    getAddress: (id: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    updateAddress: (id: string, updates: Record<string, unknown>) => Promise<{ success: boolean; data?: boolean; error?: string }>;
    queryAddresses: (filter?: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown[]; error?: string }>;
    addVisit: (addressId: string, options?: Record<string, unknown>) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;
    queryVisits: (filter?: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown[]; error?: string }>;
    getOrCreateTag: (name: string) => Promise<{ success: boolean; data?: { tag: unknown; created: boolean }; error?: string }>;
    tagAddress: (addressId: string, tagId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    untagAddress: (addressId: string, tagId: string) => Promise<{ success: boolean; data?: boolean; error?: string }>;
    getAddressTags: (addressId: string) => Promise<{ success: boolean; data?: unknown[]; error?: string }>;
    getTable: (tableName: string) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;
    setRow: (tableName: string, rowId: string, rowData: Record<string, unknown>) => Promise<{ success: boolean; data?: boolean; error?: string }>;
    getStats: () => Promise<{ success: boolean; data?: unknown; error?: string }>;
  };
  commands: {
    register: (command: { name: string; description?: string; execute: (ctx: unknown) => void | Promise<void> }) => void;
    unregister: (name: string) => void;
    getAll: () => Promise<{ success: boolean; data?: unknown[]; error?: string }>;
  };
  extensions: {
    list: () => Promise<{ success: boolean; data?: unknown[]; error?: string }>;
    load: (id: string) => Promise<{ success: boolean; error?: string }>;
    unload: (id: string) => Promise<{ success: boolean; error?: string }>;
    reload: (id: string) => Promise<{ success: boolean; error?: string }>;
  };
  settings: {
    get: () => Promise<{ success: boolean; data?: unknown; error?: string }>;
    set: (settings: unknown) => Promise<{ success: boolean; error?: string }>;
    getKey: (key: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    setKey: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>;
  };
}

const api: Api = {
  debug: DEBUG,

  log: (...args: unknown[]) => {
    invoke('log_message', { source: sourceAddress, args });
  },

  scopes: {
    SYSTEM: 1,
    SELF: 2,
    GLOBAL: 3,
  },

  // ==================== Shortcuts ====================

  shortcuts: {
    register: (shortcut: string, cb: () => void, options: { global?: boolean } = {}) => {
      const isGlobal = options.global === true;
      console.log(`[tauri:preload] Registering ${isGlobal ? 'global' : 'local'} shortcut: ${shortcut}`);

      if (isGlobal) {
        // Global shortcuts - would need tauri-plugin-global-shortcut
        // For MVP, we'll skip this and implement in Phase 2
        console.warn('[tauri:preload] Global shortcuts not yet implemented in Tauri backend');
      } else {
        // Local shortcuts - handle via keyboard events
        localShortcutHandlers.set(shortcut, cb);
      }
    },

    unregister: (shortcut: string, options: { global?: boolean } = {}) => {
      const isGlobal = options.global === true;
      console.log(`[tauri:preload] Unregistering ${isGlobal ? 'global' : 'local'} shortcut: ${shortcut}`);

      if (!isGlobal) {
        localShortcutHandlers.delete(shortcut);
      }
    },
  },

  // ==================== Window Management ====================

  window: {
    open: async (url: string, options: Record<string, unknown> = {}) => {
      console.log('[tauri:preload] window.open', url, options);
      return invoke('window_open', { source: sourceAddress, url, options });
    },

    close: async (id: string | null = null) => {
      console.log('[tauri:preload] window.close', id);
      if (id === null) {
        const currentWindow = getCurrentWebviewWindow();
        await currentWindow.close();
        return { success: true };
      }
      return invoke('window_close', { id });
    },

    hide: async (id?: string) => {
      console.log('[tauri:preload] window.hide', id);
      return invoke('window_hide', { id });
    },

    show: async (id?: string) => {
      console.log('[tauri:preload] window.show', id);
      return invoke('window_show', { id });
    },

    focus: async (id?: string) => {
      console.log('[tauri:preload] window.focus', id);
      // Tauri doesn't have a separate focus command, use show
      return invoke('window_show', { id });
    },

    list: async (options: Record<string, unknown> = {}) => {
      return invoke('window_list', { options });
    },

    exists: async (id: string) => {
      const result = await invoke<{ success: boolean; data: unknown[] }>('window_list', {});
      if (result.success && result.data) {
        const exists = result.data.some((w: any) => w.id === id || w.label === id);
        return { success: true, data: exists };
      }
      return { success: false, data: false };
    },
  },

  // ==================== PubSub ====================

  publish: (topic: string, msg: unknown, scope: number = 2) => {
    console.log('[tauri:preload] publish', topic);
    // For MVP, emit Tauri events
    emit(`pubsub:${topic}`, { source: sourceAddress, scope, data: msg });
  },

  subscribe: (topic: string, callback: (msg: unknown) => void, scope: number = 2) => {
    console.log('[tauri:preload] subscribe', topic);
    pubsubSubscriptions.set(topic, callback);

    // Listen for Tauri events
    listen(`pubsub:${topic}`, (event) => {
      const msg = event.payload as { source: string; scope: number; data: unknown };
      try {
        callback(msg);
      } catch (ex) {
        console.error('[tauri:preload] subscriber callback error for topic', topic, ex);
      }
    });
  },

  // ==================== Datastore ====================

  datastore: {
    addAddress: async (uri: string, options: Record<string, unknown> = {}) => {
      return invoke('datastore_add_address', { uri, options });
    },

    getAddress: async (id: string) => {
      return invoke('datastore_get_address', { id });
    },

    updateAddress: async (id: string, updates: Record<string, unknown>) => {
      return invoke('datastore_update_address', { id, updates });
    },

    queryAddresses: async (filter: Record<string, unknown> = {}) => {
      return invoke('datastore_query_addresses', { filter });
    },

    addVisit: async (addressId: string, options: Record<string, unknown> = {}) => {
      return invoke('datastore_add_visit', { addressId, options });
    },

    queryVisits: async (filter: Record<string, unknown> = {}) => {
      return invoke('datastore_query_visits', { filter });
    },

    getOrCreateTag: async (name: string) => {
      return invoke('datastore_get_or_create_tag', { name });
    },

    tagAddress: async (addressId: string, tagId: string) => {
      return invoke('datastore_tag_address', { addressId, tagId });
    },

    untagAddress: async (addressId: string, tagId: string) => {
      return invoke('datastore_untag_address', { addressId, tagId });
    },

    getAddressTags: async (addressId: string) => {
      return invoke('datastore_get_address_tags', { addressId });
    },

    getTable: async (tableName: string) => {
      return invoke('datastore_get_table', { tableName });
    },

    setRow: async (tableName: string, rowId: string, rowData: Record<string, unknown>) => {
      return invoke('datastore_set_row', { tableName, rowId, rowData });
    },

    getStats: async () => {
      return invoke('datastore_get_stats', {});
    },
  },

  // ==================== Commands (Stub for MVP) ====================

  commands: {
    register: (command) => {
      console.log('[tauri:preload] commands.register', command.name);
      // MVP: Store locally, full implementation in Phase 2
    },

    unregister: (name: string) => {
      console.log('[tauri:preload] commands.unregister', name);
    },

    getAll: async () => {
      return { success: true, data: [] };
    },
  },

  // ==================== Extensions (Stub for MVP) ====================

  extensions: {
    list: async () => {
      return { success: true, data: [] };
    },

    load: async (id: string) => {
      console.warn('[tauri:preload] extensions.load not yet implemented');
      return { success: false, error: 'Not implemented' };
    },

    unload: async (id: string) => {
      console.warn('[tauri:preload] extensions.unload not yet implemented');
      return { success: false, error: 'Not implemented' };
    },

    reload: async (id: string) => {
      console.warn('[tauri:preload] extensions.reload not yet implemented');
      return { success: false, error: 'Not implemented' };
    },
  },

  // ==================== Settings (Stub for MVP) ====================

  settings: {
    get: async () => {
      const extId = getExtensionId();
      if (!extId) return { success: false, error: 'Not in extension context' };
      // MVP: Return empty settings
      return { success: true, data: {} };
    },

    set: async (settings: unknown) => {
      const extId = getExtensionId();
      if (!extId) return { success: false, error: 'Not in extension context' };
      return { success: true };
    },

    getKey: async (key: string) => {
      const extId = getExtensionId();
      if (!extId) return { success: false, error: 'Not in extension context' };
      return { success: true, data: null };
    },

    setKey: async (key: string, value: unknown) => {
      const extId = getExtensionId();
      if (!extId) return { success: false, error: 'Not in extension context' };
      return { success: true };
    },
  },
};

// Set up local keyboard shortcut handler
document.addEventListener('keydown', (e) => {
  // Build shortcut string from event
  const parts: string[] = [];
  if (e.altKey) parts.push('Alt');
  if (e.ctrlKey) parts.push('Control');
  if (e.metaKey) parts.push('Command');
  if (e.shiftKey) parts.push('Shift');

  // Add the key
  if (e.key.length === 1) {
    parts.push(e.key.toUpperCase());
  } else {
    parts.push(e.key);
  }

  const shortcut = parts.join('+');

  // Check for registered handlers (try various formats)
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

// Handle ESC key
document.addEventListener('keyup', (e) => {
  if (e.key === 'Escape') {
    const currentWindow = getCurrentWebviewWindow();
    currentWindow.close();
  }
});

// Expose API globally
(window as any).app = api;

// Log initialization
console.log('[tauri:preload] Initialized for:', sourceAddress);

export default api;
