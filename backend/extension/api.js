/**
 * Peek API surface for the browser extension
 *
 * Exposes window.app with datastore, sync, profiles, and pubsub.
 * Imported directly by the options page (same extension origin).
 *
 * Wraps engine calls in { success, data } for options page compatibility.
 */

import { data, sync, getConfig, setConfig } from './engine.js';
import * as profiles from './profiles.js';
import { DATASTORE_VERSION, PROTOCOL_VERSION } from './sync/version.js';
import { getEnvironment } from './environment.js';

// Simple pub/sub
const subscribers = new Map();

function publish(topic, payload) {
  const listeners = subscribers.get(topic);
  if (listeners) {
    for (const cb of listeners) {
      try { cb(payload); } catch (e) { console.error('[peek:pubsub] error:', e); }
    }
  }
}

function subscribe(topic, callback) {
  if (!subscribers.has(topic)) {
    subscribers.set(topic, new Set());
  }
  subscribers.get(topic).add(callback);
  return () => subscribers.get(topic).delete(callback);
}

const app = {
  datastore: {
    addItem: async (type, options) => {
      const result = await data.addItem(type, options);
      return { success: true, data: result };
    },
    getItem: async (id) => {
      const item = await data.getItem(id);
      return { success: true, data: item };
    },
    updateItem: async (id, options) => {
      await data.updateItem(id, options);
      return { success: true, data: true };
    },
    deleteItem: async (id) => {
      await data.deleteItem(id);
      return { success: true, data: true };
    },
    hardDeleteItem: async (id) => {
      await data.hardDeleteItem(id);
      return { success: true, data: true };
    },
    queryItems: async (filter) => {
      const items = await data.queryItems(filter);
      return { success: true, data: items };
    },
    getOrCreateTag: async (name) => {
      const result = await data.getOrCreateTag(name);
      return { success: true, data: result };
    },
    tagItem: async (itemId, tagId) => {
      await data.tagItem(itemId, tagId);
      return { success: true, data: true };
    },
    untagItem: async (itemId, tagId) => {
      await data.untagItem(itemId, tagId);
      return { success: true, data: true };
    },
    getItemTags: async (itemId) => {
      const tags = await data.getItemTags(itemId);
      return { success: true, data: tags };
    },
    getItemsByTag: async (tagId) => {
      const items = await data.adapter.getItemsByTag(tagId);
      return { success: true, data: items };
    },
    getStats: async () => {
      const stats = await data.getStats();
      return { success: true, data: stats };
    },
  },

  sync: {
    getConfig: async () => {
      const config = await getConfig();
      return { success: true, data: config };
    },
    setConfig: async (config) => {
      await setConfig(config);
      return { success: true };
    },
    pull: async (options) => {
      const result = await sync.pullFromServer(options);
      return { success: true, data: result };
    },
    push: async (options) => {
      const result = await sync.pushToServer(options);
      return { success: true, data: result };
    },
    syncAll: async () => {
      const result = await sync.syncAll();
      return { success: true, data: result };
    },
    getStatus: async () => {
      const status = await sync.getSyncStatus();
      return { success: true, data: status };
    },
  },

  profiles: {
    ensureDefault: () => profiles.ensureDefaultProfile(),
    list: () => profiles.listProfiles(),
    create: (name) => profiles.createProfile(name),
    get: (slug) => profiles.getProfile(slug),
    getById: (id) => profiles.getProfileById(id),
    getCurrent: () => profiles.getCurrentProfile(),
    switch: (slug) => profiles.switchProfile(slug),
    delete: (id) => profiles.deleteProfile(id),
    enableSync: (id, apiKey, serverProfileId) => profiles.enableSync(id, apiKey, serverProfileId),
    disableSync: (id) => profiles.disableSync(id),
    getSyncConfig: (id) => profiles.getSyncConfig(id),
    updateLastSyncTime: (id, ts) => profiles.updateLastSyncTime(id, ts),
  },

  environment: {
    get: () => getEnvironment(),
  },

  publish,
  subscribe,

  version: {
    datastore: DATASTORE_VERSION,
    protocol: PROTOCOL_VERSION,
  },
};

export default app;

// Auto-attach to window if in browser context
if (typeof window !== 'undefined') {
  window.app = app;
}
