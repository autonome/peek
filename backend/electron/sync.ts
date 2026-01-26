/**
 * Desktop Sync Module
 *
 * Handles bidirectional sync between the desktop app and the server.
 * Uses the unified item types (url, text, tagset, image) across all platforms.
 *
 * Sync Protocol:
 * - Pull: GET /items (or /items/since/:timestamp for incremental)
 * - Push: POST /items for each local item
 * - Conflict resolution: last-write-wins based on updatedAt
 */

import type {
  Item,
  ItemType,
  SyncConfig,
  SyncResult,
  ServerItem,
  Tag,
} from '../types/index.js';
import {
  getDb,
  queryItems,
  addItem,
  updateItem,
  getItemTags,
  getOrCreateTag,
  tagItem,
} from './datastore.js';
import { DEBUG } from './config.js';
import { DATASTORE_VERSION, PROTOCOL_VERSION } from '../version.js';
import {
  getActiveProfile,
  getSyncConfig as getProfileSyncConfig,
  updateLastSyncTime,
  enableSync,
} from './profiles.js';

// ==================== Settings Storage ====================

// Note: Sync configuration is now stored per-profile in profiles.db
// Legacy extension_settings storage is deprecated

/**
 * Get sync configuration for the active profile
 */
export function getSyncConfig(): SyncConfig {
  try {
    const activeProfile = getActiveProfile();
    const profileSyncConfig = getProfileSyncConfig(activeProfile.id);

    if (!profileSyncConfig) {
      // Sync not configured for this profile
      return {
        serverUrl: getServerUrl(),
        apiKey: '',
        lastSyncTime: 0,
        autoSync: getAutoSync(),
      };
    }

    // Construct full sync config from profile data
    return {
      serverUrl: getServerUrl(),
      apiKey: profileSyncConfig.apiKey,
      lastSyncTime: activeProfile.lastSyncAt || 0,
      autoSync: getAutoSync(),
    };
  } catch (error) {
    DEBUG && console.error('[sync] Failed to get sync config:', error);
    return {
      serverUrl: getServerUrl(),
      apiKey: '',
      lastSyncTime: 0,
      autoSync: false,
    };
  }
}

/**
 * Get server URL from settings or environment
 * Priority: 1. User-configured (extension_settings), 2. Env var, 3. Default
 */
function getServerUrl(): string {
  const db = getDb();

  try {
    // Try to get from extension_settings
    const row = db.prepare(`
      SELECT value FROM extension_settings
      WHERE extensionId = 'sync' AND key = 'serverUrl'
    `).get() as { value: string } | undefined;

    if (row && row.value) {
      // Values in extension_settings are JSON-stringified
      try {
        return JSON.parse(row.value);
      } catch {
        // If parse fails, return as-is (shouldn't happen)
        return row.value;
      }
    }
  } catch (error) {
    // If query fails, fall through to defaults
  }

  // Fall back to env var or default
  return process.env.SYNC_SERVER_URL || 'https://peek-node.up.railway.app';
}

/**
 * Save server URL to settings
 */
function setServerUrl(url: string): void {
  const db = getDb();

  // Values in extension_settings must be JSON-stringified
  const jsonValue = JSON.stringify(url);

  db.prepare(`
    INSERT OR REPLACE INTO extension_settings (id, extensionId, key, value, updatedAt)
    VALUES (?, 'sync', 'serverUrl', ?, ?)
  `).run(`sync-serverUrl`, jsonValue, Date.now());
}

/**
 * Get autoSync setting from extension_settings
 */
function getAutoSync(): boolean {
  const db = getDb();

  try {
    const row = db.prepare(`
      SELECT value FROM extension_settings
      WHERE extensionId = 'sync' AND key = 'autoSync'
    `).get() as { value: string } | undefined;

    if (row && row.value) {
      try {
        return JSON.parse(row.value) === true;
      } catch {
        return false;
      }
    }
  } catch (error) {
    // If query fails, return default
  }

  return false;
}

/**
 * Save autoSync setting
 */
function setAutoSync(enabled: boolean): void {
  const db = getDb();

  const jsonValue = JSON.stringify(enabled);

  db.prepare(`
    INSERT OR REPLACE INTO extension_settings (id, extensionId, key, value, updatedAt)
    VALUES (?, 'sync', 'autoSync', ?, ?)
  `).run(`sync-autoSync`, jsonValue, Date.now());
}

/**
 * Save sync configuration to active profile
 * Note: This is a compatibility wrapper for the Sync UI.
 * Saves serverUrl (global), apiKey, and serverProfileSlug (per-profile).
 */
export function setSyncConfig(config: Partial<SyncConfig>): void {
  try {
    const activeProfile = getActiveProfile();

    // Update serverUrl if provided (stored globally in extension_settings)
    if (config.serverUrl !== undefined && config.serverUrl !== '') {
      setServerUrl(config.serverUrl);
      DEBUG && console.log(`[sync] Updated server URL: ${config.serverUrl}`);
    }

    // Update apiKey if provided
    // For now, assume serverProfileSlug is "default" when set from Sync UI
    // (Users can customize via Profiles UI for advanced per-profile mapping)
    if (config.apiKey !== undefined && config.apiKey !== '') {
      const currentConfig = getProfileSyncConfig(activeProfile.id);
      const serverProfileSlug = currentConfig?.serverProfileSlug || 'default';

      // Enable sync with the provided apiKey
      enableSync(activeProfile.id, config.apiKey, serverProfileSlug);
      DEBUG && console.log(`[sync] Updated sync config for profile ${activeProfile.slug}`);
    }

    // Update lastSyncTime if provided
    if (config.lastSyncTime !== undefined) {
      updateLastSyncTime(activeProfile.id, config.lastSyncTime);
    }

    // Update autoSync if provided
    if (config.autoSync !== undefined) {
      setAutoSync(config.autoSync);
      DEBUG && console.log(`[sync] Updated autoSync: ${config.autoSync}`);
    }
  } catch (error) {
    DEBUG && console.error('[sync] Failed to set sync config:', error);
  }
}

// ==================== Timestamp Conversion ====================

/**
 * Convert Unix milliseconds (desktop) to ISO string (server)
 */
function toISOString(unixMs: number): string {
  return new Date(unixMs).toISOString();
}

/**
 * Convert ISO string (server) to Unix milliseconds (desktop)
 */
function fromISOString(isoString: string): number {
  return new Date(isoString).getTime();
}

// ==================== Server API Helpers ====================

interface FetchOptions {
  method?: string;
  body?: unknown;
}

/**
 * Make an authenticated request to the sync server.
 * Sends version headers and checks server's response version headers.
 */
async function serverFetch<T>(
  serverUrl: string,
  apiKey: string,
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const url = `${serverUrl.replace(/\/$/, '')}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Peek-Datastore-Version': String(DATASTORE_VERSION),
      'X-Peek-Protocol-Version': String(PROTOCOL_VERSION),
      'X-Peek-Client': 'desktop',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Server error ${response.status}: ${error}`);
  }

  // Check server version headers (if present)
  // If server returns no version headers (rollback/legacy), skip check
  const serverDS = response.headers.get('X-Peek-Datastore-Version');
  const serverProto = response.headers.get('X-Peek-Protocol-Version');

  if (serverDS) {
    const serverDSNum = parseInt(serverDS, 10);
    if (serverDSNum !== DATASTORE_VERSION) {
      throw new Error(
        `Datastore version mismatch: server=${serverDSNum}, client=${DATASTORE_VERSION}. Please update your app.`
      );
    }
  }

  if (serverProto) {
    const serverProtoNum = parseInt(serverProto, 10);
    if (serverProtoNum !== PROTOCOL_VERSION) {
      throw new Error(
        `Protocol version mismatch: server=${serverProtoNum}, client=${PROTOCOL_VERSION}. Please update your app.`
      );
    }
  }

  return response.json() as Promise<T>;
}

// ==================== Pull (Server → Desktop) ====================

interface PullResult {
  pulled: number;
  conflicts: number;
}

/**
 * Pull items from server and merge into local database
 *
 * For each server item:
 * - If not found locally (by syncId): insert with syncId=server.id, syncSource='server'
 * - If found and server newer: update local
 * - If found and local newer: skip (will be pushed later)
 */
export async function pullFromServer(
  serverUrl: string,
  apiKey: string,
  since?: number
): Promise<PullResult> {
  DEBUG && console.log('[sync] Pulling from server...', since ? `since ${toISOString(since)}` : 'full');

  // Get active profile to determine which server profile to sync with
  const activeProfile = getActiveProfile();
  const profileSyncConfig = getProfileSyncConfig(activeProfile.id);

  if (!profileSyncConfig) {
    throw new Error('Sync not configured for active profile');
  }

  // Fetch items from server with profile parameter
  // Use profile UUID on the wire - immutable even if profile is renamed
  // Include slug as fallback for migration (server may not have UUID registered yet)
  let path = '/items';
  if (since && since > 0) {
    path = `/items/since/${toISOString(since)}`;
  }
  path += `?profile=${encodeURIComponent(activeProfile.id)}&slug=${encodeURIComponent(profileSyncConfig.serverProfileSlug || activeProfile.slug)}`;

  DEBUG && console.log(`[sync] Fetching from: ${serverUrl}${path}`);

  const response = await serverFetch<{ items: ServerItem[] }>(serverUrl, apiKey, path);
  const serverItems = response.items;

  DEBUG && console.log(`[sync] Received ${serverItems.length} items from server`);

  let pulled = 0;
  let conflicts = 0;
  let skipped = 0;

  for (const serverItem of serverItems) {
    const result = mergeServerItem(serverItem);
    if (result === 'pulled') pulled++;
    if (result === 'conflict') conflicts++;
    if (result === 'skipped') skipped++;
  }

  DEBUG && console.log(`[sync] Pull complete: ${pulled} pulled, ${conflicts} conflicts, ${skipped} skipped`);

  return { pulled, conflicts };
}

/**
 * Merge a single server item into the local database
 */
function mergeServerItem(serverItem: ServerItem): 'pulled' | 'conflict' | 'skipped' {
  const db = getDb();

  // Find local item by syncId matching server id
  const localItem = db.prepare(
    'SELECT * FROM items WHERE syncId = ? AND deletedAt = 0'
  ).get(serverItem.id) as Item | undefined;

  const serverUpdatedAt = fromISOString(serverItem.updated_at);

  if (!localItem) {
    // Item doesn't exist locally - insert it
    DEBUG && console.log(`[sync] Inserting new item from server: ${serverItem.id}`);

    const { id: localId } = addItem(serverItem.type as ItemType, {
      content: serverItem.content || undefined,
      metadata: serverItem.metadata ? JSON.stringify(serverItem.metadata) : undefined,
      syncId: serverItem.id,
      syncSource: 'server',
    });

    // Update timestamps to match server, and set syncedAt to track when we synced this item
    const now = Date.now();
    db.prepare(`
      UPDATE items SET createdAt = ?, updatedAt = ?, syncedAt = ? WHERE id = ?
    `).run(fromISOString(serverItem.created_at), serverUpdatedAt, now, localId);

    // Add tags
    syncTagsToItem(localId, serverItem.tags);

    return 'pulled';
  }

  // Item exists - check timestamps for conflict resolution
  if (serverUpdatedAt > localItem.updatedAt) {
    // Server is newer - update local
    DEBUG && console.log(`[sync] Updating local item from server: ${serverItem.id}`);

    updateItem(localItem.id, {
      content: serverItem.content || undefined,
      metadata: serverItem.metadata ? JSON.stringify(serverItem.metadata) : undefined,
    });

    // Update timestamps to match server, and set syncedAt to track when we synced this item
    const now = Date.now();
    db.prepare(`
      UPDATE items SET updatedAt = ?, syncedAt = ? WHERE id = ?
    `).run(serverUpdatedAt, now, localItem.id);

    // Update tags
    syncTagsToItem(localItem.id, serverItem.tags);

    return 'pulled';
  }

  if (localItem.updatedAt > serverUpdatedAt) {
    // Local is newer - this is a conflict, local wins
    DEBUG && console.log(`[sync] Conflict: local is newer for ${serverItem.id}, keeping local`);
    return 'conflict';
  }

  // Same timestamp - skip
  DEBUG && console.log(`[sync] Skipping item (same timestamp): ${serverItem.id}`);
  return 'skipped';
}

/**
 * Sync tags from server to a local item
 */
function syncTagsToItem(itemId: string, tagNames: string[]): void {
  const db = getDb();

  // Remove existing tags for this item
  db.prepare('DELETE FROM item_tags WHERE itemId = ?').run(itemId);

  // Add new tags
  for (const tagName of tagNames) {
    const { tag } = getOrCreateTag(tagName);
    tagItem(itemId, tag.id);
  }
}

// ==================== Push (Desktop → Server) ====================

interface PushResult {
  pushed: number;
  failed: number;
}

/**
 * Push unsynced local items to server
 *
 * Query items where:
 * - syncSource is empty (never synced), OR
 * - updatedAt > lastSyncTime (modified since last sync)
 */
export async function pushToServer(
  serverUrl: string,
  apiKey: string,
  lastSyncTime: number
): Promise<PushResult> {
  DEBUG && console.log('[sync] Pushing to server...', lastSyncTime > 0 ? `since ${toISOString(lastSyncTime)}` : 'all unsynced');

  const db = getDb();

  // Find items to push
  // Push items that:
  // 1. Have never been synced (syncSource = ''), OR
  // 2. Have been locally modified after their last sync (updatedAt > syncedAt)
  // This prevents re-pushing items that were just pulled from the server
  let items: Item[];
  if (lastSyncTime > 0) {
    // Incremental: items modified locally after their last sync, or never synced
    items = db.prepare(`
      SELECT * FROM items
      WHERE deletedAt = 0 AND (syncSource = '' OR (syncedAt > 0 AND updatedAt > syncedAt))
    `).all() as Item[];
  } else {
    // Full: all items that haven't been synced
    items = db.prepare(`
      SELECT * FROM items
      WHERE deletedAt = 0 AND syncSource = ''
    `).all() as Item[];
  }

  DEBUG && console.log(`[sync] Found ${items.length} items to push`);

  let pushed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await pushSingleItem(serverUrl, apiKey, item);
      pushed++;
    } catch (error) {
      DEBUG && console.log(`[sync] Failed to push item ${item.id}:`, (error as Error).message);
      failed++;
    }
  }

  DEBUG && console.log(`[sync] Push complete: ${pushed} pushed, ${failed} failed`);

  return { pushed, failed };
}

/**
 * Push a single item to the server
 */
async function pushSingleItem(
  serverUrl: string,
  apiKey: string,
  item: Item
): Promise<void> {
  const db = getDb();

  // Get active profile to determine which server profile to sync with
  const activeProfile = getActiveProfile();
  const profileSyncConfig = getProfileSyncConfig(activeProfile.id);

  if (!profileSyncConfig) {
    throw new Error('Sync not configured for active profile');
  }

  // Get tags for this item
  const tags = getItemTags(item.id);
  const tagNames = tags.map((t: Tag) => t.name);

  // Parse metadata
  let metadata: Record<string, unknown> | null = null;
  if (item.metadata && item.metadata !== '{}') {
    try {
      metadata = JSON.parse(item.metadata);
    } catch {
      // Invalid JSON, skip metadata
    }
  }

  // Build request body
  const body: {
    type: string;
    content?: string | null;
    tags: string[];
    metadata?: Record<string, unknown>;
    sync_id?: string;
  } = {
    type: item.type,
    content: item.content,
    tags: tagNames,
    sync_id: item.syncId || item.id,  // Use existing syncId or local id
  };

  if (metadata) {
    body.metadata = metadata;
  }

  // POST to server with profile parameter
  // Use profile UUID on the wire - immutable even if profile is renamed
  // Include slug as fallback for migration (server may not have UUID registered yet)
  const path = `/items?profile=${encodeURIComponent(activeProfile.id)}&slug=${encodeURIComponent(profileSyncConfig.serverProfileSlug || activeProfile.slug)}`;
  const response = await serverFetch<{ id: string; created: boolean }>(
    serverUrl,
    apiKey,
    path,
    { method: 'POST', body }
  );

  // Update local item with sync info and set syncedAt to track when we synced
  const now = Date.now();
  db.prepare(`
    UPDATE items SET syncId = ?, syncSource = 'server', syncedAt = ? WHERE id = ?
  `).run(response.id, now, item.id);

  DEBUG && console.log(`[sync] Pushed item ${item.id} → ${response.id}`);
}

// ==================== Full Bidirectional Sync ====================

/**
 * Perform a full bidirectional sync
 *
 * 1. Pull from server (including updates since last sync)
 * 2. Push local changes to server
 * 3. Update lastSyncTime in profile
 */
export async function syncAll(serverUrl: string, apiKey: string): Promise<SyncResult> {
  const config = getSyncConfig();
  const startTime = Date.now();

  DEBUG && console.log('[sync] Starting full sync...');

  let pulled = 0;
  let pushed = 0;
  let conflicts = 0;

  try {
    // Pull first (to get any server changes)
    const pullResult = await pullFromServer(serverUrl, apiKey, config.lastSyncTime);
    pulled = pullResult.pulled;
    conflicts = pullResult.conflicts;

    // Then push local changes
    const pushResult = await pushToServer(serverUrl, apiKey, config.lastSyncTime);
    pushed = pushResult.pushed;

    // Update last sync time in active profile
    const activeProfile = getActiveProfile();
    updateLastSyncTime(activeProfile.id, startTime);

    DEBUG && console.log(`[sync] Sync complete: ${pulled} pulled, ${pushed} pushed, ${conflicts} conflicts`);

    return {
      pulled,
      pushed,
      conflicts,
      lastSyncTime: startTime,
    };
  } catch (error) {
    DEBUG && console.error('[sync] Sync failed:', error);
    throw error;
  }
}

// ==================== Status ====================

/**
 * Get current sync status
 */
export function getSyncStatus(): {
  configured: boolean;
  lastSyncTime: number;
  pendingCount: number;
} {
  const config = getSyncConfig();
  const db = getDb();

  // Count items that need to be synced
  // Same logic as push: never synced OR locally modified after last sync
  const pendingCount = (db.prepare(`
    SELECT COUNT(*) as count FROM items
    WHERE deletedAt = 0 AND (syncSource = '' OR (syncedAt > 0 AND updatedAt > syncedAt))
  `).get() as { count: number }).count;

  return {
    configured: !!(config.serverUrl && config.apiKey),
    lastSyncTime: config.lastSyncTime,
    pendingCount,
  };
}
