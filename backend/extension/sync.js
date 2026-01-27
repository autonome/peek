/**
 * Browser Extension Sync Module
 *
 * Handles bidirectional sync between the extension and the server.
 * Port of backend/electron/sync.ts using fetch().
 */

import { DATASTORE_VERSION, PROTOCOL_VERSION } from './version.js';
import {
  queryItems,
  addItem,
  updateItem,
  getItemTags,
  getOrCreateTag,
  tagItem,
  getRawDb,
} from './datastore.js';
import { getCurrentProfile, getSyncConfig as getProfileSyncConfig, updateLastSyncTime } from './profiles.js';

const SERVER_URL_KEY = 'peek_sync_serverUrl';
const AUTO_SYNC_KEY = 'peek_sync_autoSync';
const DEFAULT_SERVER_URL = 'https://peek-node.up.railway.app';

// ==================== Config ====================

export async function getSyncConfig() {
  const urlData = await chrome.storage.local.get({ [SERVER_URL_KEY]: DEFAULT_SERVER_URL });
  const autoData = await chrome.storage.local.get({ [AUTO_SYNC_KEY]: false });
  const serverUrl = urlData[SERVER_URL_KEY];
  const autoSync = autoData[AUTO_SYNC_KEY];

  const profileResult = await getCurrentProfile();
  if (!profileResult.success || !profileResult.data) {
    return { success: true, data: { serverUrl, apiKey: '', lastSyncTime: 0, autoSync } };
  }

  const profile = profileResult.data;
  const syncConfigResult = await getProfileSyncConfig(profile.id);
  const syncConfig = syncConfigResult.data;

  return {
    success: true,
    data: {
      serverUrl,
      apiKey: syncConfig?.apiKey || '',
      lastSyncTime: profile.lastSyncAt || 0,
      autoSync,
    },
  };
}

export async function setSyncConfig(config) {
  if (config.serverUrl !== undefined) {
    await chrome.storage.local.set({ [SERVER_URL_KEY]: config.serverUrl });
  }
  if (config.autoSync !== undefined) {
    await chrome.storage.local.set({ [AUTO_SYNC_KEY]: config.autoSync });
  }
  // apiKey and serverProfileSlug are stored on the profile via profiles.enableSync
  return { success: true };
}

// ==================== Server Fetch ====================

async function serverFetch(serverUrl, apiKey, path, options = {}) {
  const url = `${serverUrl.replace(/\/$/, '')}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Peek-Datastore-Version': String(DATASTORE_VERSION),
      'X-Peek-Protocol-Version': String(PROTOCOL_VERSION),
      'X-Peek-Client': 'extension',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Server error ${response.status}: ${error}`);
  }

  // Check server version headers
  const serverDS = response.headers.get('X-Peek-Datastore-Version');
  const serverProto = response.headers.get('X-Peek-Protocol-Version');

  if (serverDS) {
    const serverDSNum = parseInt(serverDS, 10);
    if (serverDSNum !== DATASTORE_VERSION) {
      throw new Error(
        `Datastore version mismatch: server=${serverDSNum}, client=${DATASTORE_VERSION}. Please update.`
      );
    }
  }

  if (serverProto) {
    const serverProtoNum = parseInt(serverProto, 10);
    if (serverProtoNum !== PROTOCOL_VERSION) {
      throw new Error(
        `Protocol version mismatch: server=${serverProtoNum}, client=${PROTOCOL_VERSION}. Please update.`
      );
    }
  }

  return response.json();
}

// ==================== Timestamp Conversion ====================

function toISOString(unixMs) {
  return new Date(unixMs).toISOString();
}

function fromISOString(isoString) {
  return new Date(isoString).getTime();
}

// ==================== Pull (Server -> Extension) ====================

export async function pullFromServer(options = {}) {
  const configResult = await getSyncConfig();
  const config = configResult.data;

  if (!config.serverUrl || !config.apiKey) {
    return { success: false, error: 'Sync not configured' };
  }

  const profileResult = await getCurrentProfile();
  if (!profileResult.success) {
    return { success: false, error: 'No active profile' };
  }
  const profile = profileResult.data;
  const syncConfigResult = await getProfileSyncConfig(profile.id);
  if (!syncConfigResult.data) {
    return { success: false, error: 'Sync not configured for active profile' };
  }
  const profileSyncConfig = syncConfigResult.data;

  const since = options.since ?? config.lastSyncTime;

  let path = '/items';
  if (since && since > 0) {
    path = `/items/since/${toISOString(since)}`;
  }
  path += `?profile=${encodeURIComponent(profile.id)}&slug=${encodeURIComponent(profileSyncConfig.serverProfileSlug || profile.slug)}`;

  const response = await serverFetch(config.serverUrl, config.apiKey, path);
  const serverItems = response.items || [];

  let pulled = 0;
  let conflicts = 0;

  for (const serverItem of serverItems) {
    const result = await mergeServerItem(serverItem);
    if (result === 'pulled') pulled++;
    if (result === 'conflict') conflicts++;
  }

  return { success: true, data: { pulled, conflicts } };
}

async function mergeServerItem(serverItem) {
  // Find local item by syncId
  const allItemsResult = await queryItems({ includeDeleted: false });
  const allItems = allItemsResult.data || [];
  const localItem = allItems.find(i => i.syncId === serverItem.id);

  const serverUpdatedAt = fromISOString(serverItem.updated_at);

  if (!localItem) {
    // Insert new item
    const result = await addItem(serverItem.type, {
      content: serverItem.content || undefined,
      metadata: serverItem.metadata ? JSON.stringify(serverItem.metadata) : undefined,
      syncId: serverItem.id,
      syncSource: 'server',
    });

    if (result.success) {
      // Update timestamps to match server
      const db = getRawDb();
      const txn = db.transaction('items', 'readwrite');
      const store = txn.objectStore('items');

      const req = store.get(result.data.id);
      req.onsuccess = () => {
        const item = req.result;
        if (item) {
          item.createdAt = fromISOString(serverItem.created_at);
          item.updatedAt = serverUpdatedAt;
          item.syncedAt = Date.now();
          store.put(item);
        }
      };

      await new Promise((resolve, reject) => {
        txn.oncomplete = resolve;
        txn.onerror = () => reject(txn.error);
      });

      // Sync tags
      await syncTagsToItem(result.data.id, serverItem.tags || []);
    }

    return 'pulled';
  }

  // Item exists - check timestamps
  if (serverUpdatedAt > localItem.updatedAt) {
    // Server newer - update local
    await updateItem(localItem.id, {
      content: serverItem.content || undefined,
      metadata: serverItem.metadata ? JSON.stringify(serverItem.metadata) : undefined,
    });

    // Update timestamps
    const db = getRawDb();
    const txn = db.transaction('items', 'readwrite');
    const store = txn.objectStore('items');
    const req = store.get(localItem.id);
    req.onsuccess = () => {
      const item = req.result;
      if (item) {
        item.updatedAt = serverUpdatedAt;
        item.syncedAt = Date.now();
        store.put(item);
      }
    };
    await new Promise((resolve, reject) => {
      txn.oncomplete = resolve;
      txn.onerror = () => reject(txn.error);
    });

    await syncTagsToItem(localItem.id, serverItem.tags || []);
    return 'pulled';
  }

  if (localItem.updatedAt > serverUpdatedAt) {
    return 'conflict';
  }

  return 'skipped';
}

async function syncTagsToItem(itemId, tagNames) {
  // Get current tags and remove them
  const currentTagsResult = await getItemTags(itemId);
  const currentTags = currentTagsResult.data || [];

  // We need to use raw DB to remove all item_tags for this item
  const db = getRawDb();
  const txn = db.transaction('item_tags', 'readwrite');
  const store = txn.objectStore('item_tags');
  const index = store.index('itemId');
  const req = index.getAll(itemId);
  req.onsuccess = () => {
    for (const link of req.result) {
      store.delete(link.id);
    }
  };
  await new Promise((resolve, reject) => {
    txn.oncomplete = resolve;
    txn.onerror = () => reject(txn.error);
  });

  // Add new tags
  for (const tagName of tagNames) {
    const tagResult = await getOrCreateTag(tagName);
    if (tagResult.success && tagResult.data) {
      await tagItem(itemId, tagResult.data.tag.id);
    }
  }
}

// ==================== Push (Extension -> Server) ====================

export async function pushToServer(options = {}) {
  const configResult = await getSyncConfig();
  const config = configResult.data;

  if (!config.serverUrl || !config.apiKey) {
    return { success: false, error: 'Sync not configured' };
  }

  const profileResult = await getCurrentProfile();
  if (!profileResult.success) {
    return { success: false, error: 'No active profile' };
  }
  const profile = profileResult.data;
  const syncConfigResult = await getProfileSyncConfig(profile.id);
  if (!syncConfigResult.data) {
    return { success: false, error: 'Sync not configured for active profile' };
  }
  const profileSyncConfig = syncConfigResult.data;

  // Find items to push
  const allItemsResult = await queryItems({ includeDeleted: false });
  const allItems = allItemsResult.data || [];

  const lastSyncTime = config.lastSyncTime || 0;

  let itemsToPush;
  if (lastSyncTime > 0) {
    // Incremental: never synced OR locally modified after sync
    itemsToPush = allItems.filter(
      i => i.syncSource === '' || (i.syncedAt > 0 && i.updatedAt > i.syncedAt)
    );
  } else {
    // Full: all unsynced
    itemsToPush = allItems.filter(i => i.syncSource === '');
  }

  let pushed = 0;
  let failed = 0;

  for (const item of itemsToPush) {
    try {
      // Get tags
      const tagsResult = await getItemTags(item.id);
      const tagNames = (tagsResult.data || []).map(t => t.name);

      let metadata = null;
      if (item.metadata && item.metadata !== '{}') {
        try { metadata = JSON.parse(item.metadata); } catch {}
      }

      const body = {
        type: item.type,
        content: item.content,
        tags: tagNames,
        sync_id: item.syncId || item.id,
      };
      if (metadata) body.metadata = metadata;

      const path = `/items?profile=${encodeURIComponent(profile.id)}&slug=${encodeURIComponent(profileSyncConfig.serverProfileSlug || profile.slug)}`;
      const response = await serverFetch(
        config.serverUrl,
        config.apiKey,
        path,
        { method: 'POST', body }
      );

      // Update local item with sync info
      const db = getRawDb();
      const txn = db.transaction('items', 'readwrite');
      const store = txn.objectStore('items');
      const req = store.get(item.id);
      req.onsuccess = () => {
        const local = req.result;
        if (local) {
          local.syncId = response.id;
          local.syncSource = 'server';
          local.syncedAt = Date.now();
          store.put(local);
        }
      };
      await new Promise((resolve, reject) => {
        txn.oncomplete = resolve;
        txn.onerror = () => reject(txn.error);
      });

      pushed++;
    } catch (error) {
      failed++;
    }
  }

  return { success: true, data: { pushed, failed } };
}

// ==================== Full Sync ====================

export async function syncAll() {
  const startTime = Date.now();

  const pullResult = await pullFromServer();
  if (!pullResult.success) {
    return pullResult;
  }

  const pushResult = await pushToServer();
  if (!pushResult.success) {
    return pushResult;
  }

  // Update last sync time
  const profileResult = await getCurrentProfile();
  if (profileResult.success && profileResult.data) {
    await updateLastSyncTime(profileResult.data.id, startTime);
  }

  return {
    success: true,
    data: {
      pulled: pullResult.data.pulled,
      pushed: pushResult.data.pushed,
      conflicts: pullResult.data.conflicts,
      lastSyncTime: startTime,
    },
  };
}

// ==================== Status ====================

export async function getSyncStatus() {
  const configResult = await getSyncConfig();
  const config = configResult.data;

  // Count pending items
  const allItemsResult = await queryItems({ includeDeleted: false });
  const allItems = allItemsResult.data || [];
  const pendingCount = allItems.filter(
    i => i.syncSource === '' || (i.syncedAt > 0 && i.updatedAt > i.syncedAt)
  ).length;

  return {
    success: true,
    data: {
      configured: !!(config.serverUrl && config.apiKey),
      lastSyncTime: config.lastSyncTime,
      pendingCount,
    },
  };
}
