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

// ==================== Settings Storage ====================

const SYNC_SETTINGS_KEY = 'sync';

/**
 * Get sync configuration from settings
 */
export function getSyncConfig(): SyncConfig {
  const db = getDb();
  const getKey = (key: string): string | null => {
    const row = db.prepare(
      'SELECT value FROM extension_settings WHERE extensionId = ? AND key = ?'
    ).get(SYNC_SETTINGS_KEY, key) as { value: string } | undefined;
    if (!row?.value) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  };

  return {
    serverUrl: getKey('serverUrl') || '',
    apiKey: getKey('apiKey') || '',
    lastSyncTime: parseInt(getKey('lastSyncTime') || '0', 10) || 0,
    autoSync: getKey('autoSync') === 'true',
  };
}

/**
 * Save sync configuration to settings
 */
export function setSyncConfig(config: Partial<SyncConfig>): void {
  const db = getDb();
  const timestamp = Date.now();

  const setKey = (key: string, value: string | number | boolean): void => {
    const jsonValue = JSON.stringify(value);
    db.prepare(`
      INSERT OR REPLACE INTO extension_settings (id, extensionId, key, value, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(`${SYNC_SETTINGS_KEY}_${key}`, SYNC_SETTINGS_KEY, key, jsonValue, timestamp);
  };

  if (config.serverUrl !== undefined) setKey('serverUrl', config.serverUrl);
  if (config.apiKey !== undefined) setKey('apiKey', config.apiKey);
  if (config.lastSyncTime !== undefined) setKey('lastSyncTime', config.lastSyncTime);
  if (config.autoSync !== undefined) setKey('autoSync', config.autoSync);
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
 * Make an authenticated request to the sync server
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
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Server error ${response.status}: ${error}`);
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

  // Fetch items from server
  let path = '/items';
  if (since && since > 0) {
    path = `/items/since/${toISOString(since)}`;
  }

  const response = await serverFetch<{ items: ServerItem[] }>(serverUrl, apiKey, path);
  const serverItems = response.items;

  DEBUG && console.log(`[sync] Received ${serverItems.length} items from server`);

  let pulled = 0;
  let conflicts = 0;

  for (const serverItem of serverItems) {
    const result = mergeServerItem(serverItem);
    if (result === 'pulled') pulled++;
    if (result === 'conflict') conflicts++;
  }

  DEBUG && console.log(`[sync] Pull complete: ${pulled} pulled, ${conflicts} conflicts`);

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

    // Update timestamps to match server
    db.prepare(`
      UPDATE items SET createdAt = ?, updatedAt = ? WHERE id = ?
    `).run(fromISOString(serverItem.created_at), serverUpdatedAt, localId);

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

    // Update timestamps to match server
    db.prepare(`
      UPDATE items SET updatedAt = ? WHERE id = ?
    `).run(serverUpdatedAt, localItem.id);

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
  let items: Item[];
  if (lastSyncTime > 0) {
    // Incremental: items modified since last sync, or never synced
    items = db.prepare(`
      SELECT * FROM items
      WHERE deletedAt = 0 AND (syncSource = '' OR updatedAt > ?)
    `).all(lastSyncTime) as Item[];
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
  } = {
    type: item.type,
    content: item.content,
    tags: tagNames,
  };

  if (metadata) {
    body.metadata = metadata;
  }

  // POST to server
  const response = await serverFetch<{ id: string; created: boolean }>(
    serverUrl,
    apiKey,
    '/items',
    { method: 'POST', body }
  );

  // Update local item with sync info
  db.prepare(`
    UPDATE items SET syncId = ?, syncSource = 'server' WHERE id = ?
  `).run(response.id, item.id);

  DEBUG && console.log(`[sync] Pushed item ${item.id} → ${response.id}`);
}

// ==================== Full Bidirectional Sync ====================

/**
 * Perform a full bidirectional sync
 *
 * 1. Pull from server (including updates since last sync)
 * 2. Push local changes to server
 * 3. Update lastSyncTime
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

    // Update last sync time
    setSyncConfig({ lastSyncTime: startTime });

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
  const pendingCount = (db.prepare(`
    SELECT COUNT(*) as count FROM items
    WHERE deletedAt = 0 AND (syncSource = '' OR updatedAt > ?)
  `).get(config.lastSyncTime) as { count: number }).count;

  return {
    configured: !!(config.serverUrl && config.apiKey),
    lastSyncTime: config.lastSyncTime,
    pendingCount,
  };
}
