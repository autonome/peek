/**
 * Peek API surface for the browser extension
 *
 * Exposes window.app with datastore, sync, profiles, and pubsub.
 * Imported directly by the options page (same extension origin).
 */

import * as datastore from './datastore.js';
import * as sync from './sync.js';
import * as profiles from './profiles.js';
import { DATASTORE_VERSION, PROTOCOL_VERSION } from './version.js';
import { getEnvironment } from './environment.js';

// Simple pub/sub
const subscribers = new Map();

function publish(topic, data) {
  const listeners = subscribers.get(topic);
  if (listeners) {
    for (const cb of listeners) {
      try { cb(data); } catch (e) { console.error('[peek:pubsub] error:', e); }
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
    addItem: (type, options) => datastore.addItem(type, options),
    getItem: (id) => datastore.getItem(id),
    updateItem: (id, options) => datastore.updateItem(id, options),
    deleteItem: (id) => datastore.deleteItem(id),
    hardDeleteItem: (id) => datastore.hardDeleteItem(id),
    queryItems: (filter) => datastore.queryItems(filter),
    getOrCreateTag: (name) => datastore.getOrCreateTag(name),
    tagItem: (itemId, tagId) => datastore.tagItem(itemId, tagId),
    untagItem: (itemId, tagId) => datastore.untagItem(itemId, tagId),
    getItemTags: (itemId) => datastore.getItemTags(itemId),
    getItemsByTag: (tagId) => datastore.getItemsByTag(tagId),
    getTable: (name) => datastore.getTable(name),
    getRow: (name, id) => datastore.getRow(name, id),
    setRow: (name, id, data) => datastore.setRow(name, id, data),
    getStats: () => datastore.getStats(),
  },

  sync: {
    getConfig: () => sync.getSyncConfig(),
    setConfig: (config) => sync.setSyncConfig(config),
    pull: (options) => sync.pullFromServer(options),
    push: (options) => sync.pushToServer(options),
    syncAll: () => sync.syncAll(),
    getStatus: () => sync.getSyncStatus(),
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
