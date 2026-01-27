/**
 * Sync Engine
 *
 * Bidirectional sync protocol: pull/push/merge with last-write-wins conflict resolution.
 * Runtime-agnostic — uses fetch() (available in Node 18+, all browsers, Tauri WebView).
 *
 * Config is provided via callbacks so each runtime can store it however it wants
 * (chrome.storage.local, SQLite extension_settings, env vars, etc.).
 */

import { DATASTORE_VERSION, PROTOCOL_VERSION } from './version.js';

/**
 * @typedef {Object} SyncConfig
 * @property {string} serverUrl
 * @property {string} apiKey
 * @property {string} [serverProfileId]
 * @property {number} lastSyncTime - Unix ms
 */

export class SyncEngine {
  /**
   * @param {import('./data.js').DataEngine} dataEngine
   * @param {Object} options
   * @param {() => Promise<SyncConfig>|SyncConfig} options.getConfig
   * @param {(updates: Partial<SyncConfig>) => Promise<void>|void} options.setConfig
   * @param {typeof globalThis.fetch} [options.fetch] - Custom fetch for testing
   */
  constructor(dataEngine, { getConfig, setConfig, fetch: customFetch }) {
    this.data = dataEngine;
    this.getConfig = getConfig;
    this.setConfig = setConfig;
    this._fetch = customFetch || globalThis.fetch;
  }

  // ==================== Pull (Server → Client) ====================

  /**
   * Pull items from server and merge into local storage.
   * @param {Object} [options]
   * @param {number} [options.since] - Override lastSyncTime
   * @returns {Promise<{pulled: number, conflicts: number}>}
   */
  async pullFromServer(options = {}) {
    const config = await this.getConfig();
    if (!config.serverUrl || !config.apiKey) {
      return { pulled: 0, conflicts: 0 };
    }

    const since = options.since ?? config.lastSyncTime;

    let path = '/items';
    if (since && since > 0) {
      path = `/items/since/${toISOString(since)}`;
    }
    if (config.serverProfileId) {
      path += `?profile=${encodeURIComponent(config.serverProfileId)}`;
    }

    const response = await this._serverFetch(
      config.serverUrl,
      config.apiKey,
      path
    );
    const serverItems = response.items || [];

    let pulled = 0;
    let conflicts = 0;

    for (const serverItem of serverItems) {
      const result = await this._mergeServerItem(serverItem);
      if (result === 'pulled') pulled++;
      if (result === 'conflict') conflicts++;
    }

    return { pulled, conflicts };
  }

  // ==================== Push (Client → Server) ====================

  /**
   * Push unsynced local items to server.
   * @returns {Promise<{pushed: number, failed: number}>}
   */
  async pushToServer() {
    const config = await this.getConfig();
    if (!config.serverUrl || !config.apiKey) {
      return { pushed: 0, failed: 0 };
    }

    const allItems = await this.data.queryItems({ includeDeleted: false });
    const lastSyncTime = config.lastSyncTime || 0;

    let itemsToPush;
    if (lastSyncTime > 0) {
      // Incremental: never synced OR locally modified after their last sync
      itemsToPush = allItems.filter(
        i =>
          i.syncSource === '' ||
          (i.syncedAt > 0 && i.updatedAt > i.syncedAt)
      );
    } else {
      // Full: all items that haven't been synced
      itemsToPush = allItems.filter(i => i.syncSource === '');
    }

    let pushed = 0;
    let failed = 0;

    for (const item of itemsToPush) {
      try {
        const tags = await this.data.getItemTags(item.id);
        const tagNames = tags.map(t => t.name);

        let metadata = null;
        if (item.metadata && item.metadata !== '{}') {
          try {
            metadata = JSON.parse(item.metadata);
          } catch {
            // Invalid JSON, skip metadata
          }
        }

        const body = {
          type: item.type,
          content: item.content,
          tags: tagNames,
          sync_id: item.syncId || item.id,
        };
        if (metadata) body.metadata = metadata;

        let pushPath = '/items';
        if (config.serverProfileId) {
          pushPath += `?profile=${encodeURIComponent(config.serverProfileId)}`;
        }

        const response = await this._serverFetch(
          config.serverUrl,
          config.apiKey,
          pushPath,
          { method: 'POST', body }
        );

        // Update local item with sync info
        await this.data.adapter.updateItem(item.id, {
          syncId: response.id,
          syncSource: 'server',
          syncedAt: Date.now(),
        });

        pushed++;
      } catch {
        failed++;
      }
    }

    return { pushed, failed };
  }

  // ==================== Full Sync ====================

  /**
   * Full bidirectional sync: pull, then push.
   * @returns {Promise<{pulled: number, pushed: number, conflicts: number, lastSyncTime: number}>}
   */
  async syncAll() {
    const config = await this.getConfig();
    if (!config.serverUrl) {
      return { pulled: 0, pushed: 0, conflicts: 0, lastSyncTime: 0 };
    }

    await this.resetSyncStateIfServerChanged(config.serverUrl);
    const startTime = Date.now();

    const pullResult = await this.pullFromServer();
    await this.saveSyncServerConfig(config.serverUrl);
    const pushResult = await this.pushToServer();
    await this.setConfig({ lastSyncTime: startTime });

    return {
      pulled: pullResult.pulled,
      pushed: pushResult.pushed,
      conflicts: pullResult.conflicts,
      lastSyncTime: startTime,
    };
  }

  // ==================== Status ====================

  /**
   * Get current sync status.
   */
  async getSyncStatus() {
    const config = await this.getConfig();
    const allItems = await this.data.queryItems({ includeDeleted: false });
    const pendingCount = allItems.filter(
      i =>
        i.syncSource === '' ||
        (i.syncedAt > 0 && i.updatedAt > i.syncedAt)
    ).length;

    return {
      configured: !!(config.serverUrl && config.apiKey),
      lastSyncTime: config.lastSyncTime || 0,
      pendingCount,
    };
  }

  // ==================== Server-Change Detection ====================

  /**
   * Detect if the sync server has changed and reset per-item sync markers.
   * @param {string} serverUrl
   * @returns {Promise<boolean>} true if state was reset
   */
  async resetSyncStateIfServerChanged(serverUrl) {
    const config = await this.getConfig();
    const currentProfileId = config.serverProfileId || '';

    let storedUrl = '';
    let storedProfileId = '';
    try {
      const val = await this.data.getSetting('sync_lastSyncServerUrl');
      if (val) storedUrl = JSON.parse(val);
    } catch {
      /* first sync */
    }
    try {
      const val = await this.data.getSetting('sync_lastSyncProfileId');
      if (val) storedProfileId = JSON.parse(val);
    } catch {
      /* first sync */
    }

    // First sync — no stored config means we haven't tracked the server yet.
    // Don't reset items that may have been pulled in a prior pull-only sync.
    if (!storedUrl && !storedProfileId) {
      return false;
    }

    const urlChanged = storedUrl && storedUrl !== serverUrl;
    const profileChanged =
      storedProfileId && storedProfileId !== currentProfileId;

    if (urlChanged || profileChanged) {
      const allItems = await this.data.queryItems({ includeDeleted: false });
      for (const item of allItems) {
        await this.data.adapter.updateItem(item.id, {
          syncSource: '',
          syncedAt: 0,
          syncId: '',
        });
      }
      await this.setConfig({ lastSyncTime: 0 });
      return true;
    }

    return false;
  }

  /**
   * Save current server config for change detection on next sync.
   * @param {string} serverUrl
   */
  async saveSyncServerConfig(serverUrl) {
    const config = await this.getConfig();
    const currentProfileId = config.serverProfileId || '';
    await this.data.setSetting(
      'sync_lastSyncServerUrl',
      JSON.stringify(serverUrl)
    );
    await this.data.setSetting(
      'sync_lastSyncProfileId',
      JSON.stringify(currentProfileId)
    );
  }

  // ==================== Internal Helpers ====================

  /**
   * Authenticated fetch to sync server with version header checks.
   */
  async _serverFetch(serverUrl, apiKey, path, options = {}) {
    const url = `${serverUrl.replace(/\/$/, '')}${path}`;
    const response = await this._fetch(url, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Peek-Datastore-Version': String(DATASTORE_VERSION),
        'X-Peek-Protocol-Version': String(PROTOCOL_VERSION),
        'X-Peek-Client': 'sync-engine',
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

  /**
   * Merge a single server item into local storage (last-write-wins).
   * @returns {Promise<'pulled'|'conflict'|'skipped'>}
   */
  async _mergeServerItem(serverItem) {
    const serverUpdatedAt = fromISOString(serverItem.updated_at);

    // Find local item by syncId
    const localItem = await this.data.adapter.findItemBySyncId(serverItem.id);

    if (!localItem) {
      // New item from server — insert
      const { id: localId } = await this.data.addItem(serverItem.type, {
        content: serverItem.content || null,
        metadata: serverItem.metadata
          ? JSON.stringify(serverItem.metadata)
          : null,
        syncId: serverItem.id,
        syncSource: 'server',
      });

      // Overwrite timestamps to match server
      await this.data.adapter.updateItem(localId, {
        createdAt: fromISOString(serverItem.created_at),
        updatedAt: serverUpdatedAt,
        syncedAt: Date.now(),
      });

      // Sync tags
      await this._syncTagsToItem(localId, serverItem.tags || []);
      return 'pulled';
    }

    // Item exists — check timestamps
    if (serverUpdatedAt > localItem.updatedAt) {
      // Server is newer — update local
      await this.data.updateItem(localItem.id, {
        content: serverItem.content || null,
        metadata: serverItem.metadata
          ? JSON.stringify(serverItem.metadata)
          : null,
      });
      await this.data.adapter.updateItem(localItem.id, {
        updatedAt: serverUpdatedAt,
        syncedAt: Date.now(),
      });

      await this._syncTagsToItem(localItem.id, serverItem.tags || []);
      return 'pulled';
    }

    if (localItem.updatedAt > serverUpdatedAt) {
      // Local is newer — conflict (local wins)
      return 'conflict';
    }

    // Same timestamp — skip
    return 'skipped';
  }

  /**
   * Replace item tags with server-provided tag names.
   */
  async _syncTagsToItem(itemId, tagNames) {
    await this.data.adapter.clearItemTags(itemId);
    for (const tagName of tagNames) {
      const { tag } = await this.data.getOrCreateTag(tagName);
      await this.data.adapter.tagItem(itemId, tag.id);
    }
  }
}

// ==================== Timestamp Conversion ====================

/** Convert Unix ms to ISO string (for server API). */
function toISOString(unixMs) {
  return new Date(unixMs).toISOString();
}

/** Convert ISO string or integer timestamp to Unix ms (from server API). */
function fromISOString(value) {
  if (typeof value === 'number') return value;
  return new Date(value).getTime();
}
