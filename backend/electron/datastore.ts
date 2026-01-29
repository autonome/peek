/**
 * Electron backend - SQLite datastore
 *
 * Simple module with database functions for Electron's main process.
 * Uses better-sqlite3 for synchronous SQLite access.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  TableName,
  Address,
  Visit,
  Content,
  Tag,
  AddressTag,
  DatastoreStats,
  AddressFilter,
  VisitFilter,
  ContentFilter,
  AddressOptions,
  VisitOptions,
  ContentOptions,
  Item,
  ItemTag,
  ItemType,
  ItemOptions,
  ItemFilter,
  ItemVisit,
  ItemVisitFilter,
  ItemVisitOptions,
} from '../types/index.js';
import { tableNames } from '../types/index.js';
import { DEBUG } from './config.js';
import { DATASTORE_VERSION } from '../version.js';
import { addDeviceMetadata } from './device.js';

// Load canonical schema for validation
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA = JSON.parse(
  readFileSync(join(__dirname, '../../schema/v1.json'), 'utf-8')
);
const REQUIRED_SYNC_COLUMNS: Record<string, string[]> = SCHEMA.validation.required_sync_columns;

// Flag: set to true if stored datastore version > code version (downgrade detected)
let syncDisabledDueToVersionMismatch = false;

// SQL Schema
const createTableStatements = `
  CREATE TABLE IF NOT EXISTS addresses (
    id TEXT PRIMARY KEY,
    uri TEXT NOT NULL,
    protocol TEXT DEFAULT 'https',
    domain TEXT,
    path TEXT DEFAULT '',
    title TEXT DEFAULT '',
    mimeType TEXT DEFAULT 'text/html',
    favicon TEXT DEFAULT '',
    description TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    createdAt INTEGER,
    updatedAt INTEGER,
    lastVisitAt INTEGER DEFAULT 0,
    visitCount INTEGER DEFAULT 0,
    starred INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_addresses_uri ON addresses(uri);
  CREATE INDEX IF NOT EXISTS idx_addresses_domain ON addresses(domain);
  CREATE INDEX IF NOT EXISTS idx_addresses_protocol ON addresses(protocol);
  CREATE INDEX IF NOT EXISTS idx_addresses_lastVisitAt ON addresses(lastVisitAt);
  CREATE INDEX IF NOT EXISTS idx_addresses_visitCount ON addresses(visitCount);
  CREATE INDEX IF NOT EXISTS idx_addresses_starred ON addresses(starred);

  CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY,
    addressId TEXT,
    timestamp INTEGER,
    duration INTEGER DEFAULT 0,
    source TEXT DEFAULT 'direct',
    sourceId TEXT DEFAULT '',
    windowType TEXT DEFAULT 'main',
    metadata TEXT DEFAULT '{}',
    scrollDepth INTEGER DEFAULT 0,
    interacted INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_visits_addressId ON visits(addressId);
  CREATE INDEX IF NOT EXISTS idx_visits_timestamp ON visits(timestamp);
  CREATE INDEX IF NOT EXISTS idx_visits_source ON visits(source);

  CREATE TABLE IF NOT EXISTS content (
    id TEXT PRIMARY KEY,
    title TEXT DEFAULT 'Untitled',
    content TEXT DEFAULT '',
    mimeType TEXT DEFAULT 'text/plain',
    contentType TEXT DEFAULT 'plain',
    language TEXT DEFAULT '',
    encoding TEXT DEFAULT 'utf-8',
    tags TEXT DEFAULT '',
    addressRefs TEXT DEFAULT '',
    parentId TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    createdAt INTEGER,
    updatedAt INTEGER,
    syncPath TEXT DEFAULT '',
    synced INTEGER DEFAULT 0,
    starred INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_content_contentType ON content(contentType);
  CREATE INDEX IF NOT EXISTS idx_content_mimeType ON content(mimeType);
  CREATE INDEX IF NOT EXISTS idx_content_synced ON content(synced);
  CREATE INDEX IF NOT EXISTS idx_content_updatedAt ON content(updatedAt);

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT,
    color TEXT DEFAULT '#999999',
    parentId TEXT DEFAULT '',
    description TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    createdAt INTEGER,
    updatedAt INTEGER,
    frequency INTEGER DEFAULT 0,
    lastUsed INTEGER DEFAULT 0,
    frecencyScore INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
  CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
  CREATE INDEX IF NOT EXISTS idx_tags_parentId ON tags(parentId);
  CREATE INDEX IF NOT EXISTS idx_tags_frecencyScore ON tags(frecencyScore);

  CREATE TABLE IF NOT EXISTS address_tags (
    id TEXT PRIMARY KEY,
    addressId TEXT NOT NULL,
    tagId TEXT NOT NULL,
    createdAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_address_tags_addressId ON address_tags(addressId);
  CREATE INDEX IF NOT EXISTS idx_address_tags_tagId ON address_tags(tagId);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_address_tags_unique ON address_tags(addressId, tagId);

  CREATE TABLE IF NOT EXISTS blobs (
    id TEXT PRIMARY KEY,
    filename TEXT,
    mimeType TEXT,
    mediaType TEXT,
    size INTEGER,
    hash TEXT,
    extension TEXT,
    path TEXT,
    addressId TEXT DEFAULT '',
    contentId TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    createdAt INTEGER,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0,
    thumbnail TEXT DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_blobs_mediaType ON blobs(mediaType);
  CREATE INDEX IF NOT EXISTS idx_blobs_mimeType ON blobs(mimeType);
  CREATE INDEX IF NOT EXISTS idx_blobs_addressId ON blobs(addressId);
  CREATE INDEX IF NOT EXISTS idx_blobs_contentId ON blobs(contentId);

  CREATE TABLE IF NOT EXISTS scripts_data (
    id TEXT PRIMARY KEY,
    scriptId TEXT,
    scriptName TEXT,
    addressId TEXT,
    selector TEXT,
    content TEXT,
    contentType TEXT DEFAULT 'text',
    metadata TEXT DEFAULT '{}',
    extractedAt INTEGER,
    previousValue TEXT DEFAULT '',
    changed INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_scripts_data_scriptId ON scripts_data(scriptId);
  CREATE INDEX IF NOT EXISTS idx_scripts_data_addressId ON scripts_data(addressId);
  CREATE INDEX IF NOT EXISTS idx_scripts_data_changed ON scripts_data(changed);

  CREATE TABLE IF NOT EXISTS feeds (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT DEFAULT '',
    type TEXT,
    query TEXT DEFAULT '',
    schedule TEXT DEFAULT '',
    source TEXT DEFAULT 'internal',
    tags TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    createdAt INTEGER,
    updatedAt INTEGER,
    lastFetchedAt INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_feeds_type ON feeds(type);
  CREATE INDEX IF NOT EXISTS idx_feeds_enabled ON feeds(enabled);

  CREATE TABLE IF NOT EXISTS extensions (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT DEFAULT '',
    version TEXT DEFAULT '1.0.0',
    path TEXT,
    backgroundUrl TEXT DEFAULT '',
    settingsUrl TEXT DEFAULT '',
    iconPath TEXT DEFAULT '',
    builtin INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    status TEXT DEFAULT 'installed',
    installedAt INTEGER,
    updatedAt INTEGER,
    lastErrorAt INTEGER DEFAULT 0,
    lastError TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_extensions_enabled ON extensions(enabled);
  CREATE INDEX IF NOT EXISTS idx_extensions_status ON extensions(status);
  CREATE INDEX IF NOT EXISTS idx_extensions_builtin ON extensions(builtin);

  CREATE TABLE IF NOT EXISTS extension_settings (
    id TEXT PRIMARY KEY,
    extensionId TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    updatedAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_extension_settings_extensionId ON extension_settings(extensionId);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_extension_settings_unique ON extension_settings(extensionId, key);

  CREATE TABLE IF NOT EXISTS migrations (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    completedAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS themes (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT DEFAULT '',
    version TEXT DEFAULT '1.0.0',
    author TEXT DEFAULT '',
    path TEXT,
    builtin INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    installedAt INTEGER,
    updatedAt INTEGER,
    lastError TEXT DEFAULT '',
    lastErrorAt INTEGER DEFAULT 0,
    metadata TEXT DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_themes_enabled ON themes(enabled);
  CREATE INDEX IF NOT EXISTS idx_themes_builtin ON themes(builtin);

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('url', 'text', 'tagset', 'image')),
    content TEXT,
    mimeType TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    syncId TEXT DEFAULT '',
    syncSource TEXT DEFAULT '',
    syncedAt INTEGER DEFAULT 0,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER DEFAULT 0,
    starred INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    visitCount INTEGER DEFAULT 0,
    lastVisitAt INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
  CREATE INDEX IF NOT EXISTS idx_items_syncId ON items(syncId);
  CREATE INDEX IF NOT EXISTS idx_items_deletedAt ON items(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_items_createdAt ON items(createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_items_starred ON items(starred);

  CREATE TABLE IF NOT EXISTS item_tags (
    id TEXT PRIMARY KEY,
    itemId TEXT NOT NULL,
    tagId TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_item_tags_itemId ON item_tags(itemId);
  CREATE INDEX IF NOT EXISTS idx_item_tags_tagId ON item_tags(tagId);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_item_tags_unique ON item_tags(itemId, tagId);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS item_visits (
    id TEXT PRIMARY KEY,
    itemId TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    duration INTEGER DEFAULT 0,
    source TEXT DEFAULT 'direct',
    sourceId TEXT DEFAULT '',
    windowType TEXT DEFAULT 'main',
    metadata TEXT DEFAULT '{}',
    scrollDepth INTEGER DEFAULT 0,
    interacted INTEGER DEFAULT 0,
    prevId TEXT DEFAULT NULL,
    nextId TEXT DEFAULT NULL,
    FOREIGN KEY(itemId) REFERENCES items(id)
  );
  CREATE INDEX IF NOT EXISTS idx_item_visits_itemId ON item_visits(itemId);
  CREATE INDEX IF NOT EXISTS idx_item_visits_timestamp ON item_visits(timestamp);
  CREATE INDEX IF NOT EXISTS idx_item_visits_prevId ON item_visits(prevId);
  CREATE INDEX IF NOT EXISTS idx_item_visits_nextId ON item_visits(nextId);

  CREATE TABLE IF NOT EXISTS item_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    type TEXT DEFAULT 'manual',
    query TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_item_groups_type ON item_groups(type);
  CREATE INDEX IF NOT EXISTS idx_item_groups_deletedAt ON item_groups(deletedAt);

  CREATE TABLE IF NOT EXISTS item_group_members (
    id TEXT PRIMARY KEY,
    groupId TEXT NOT NULL,
    itemId TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    createdAt INTEGER NOT NULL,
    FOREIGN KEY(groupId) REFERENCES item_groups(id),
    FOREIGN KEY(itemId) REFERENCES items(id)
  );
  CREATE INDEX IF NOT EXISTS idx_item_group_members_groupId ON item_group_members(groupId);
  CREATE INDEX IF NOT EXISTS idx_item_group_members_itemId ON item_group_members(itemId);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_item_group_members_unique ON item_group_members(groupId, itemId);
`;

// Module state
let db: Database.Database | null = null;

// ==================== Schema Validation ====================

/**
 * Validate that the database has all required sync columns from the canonical schema.
 * Called after migrations to ensure schema consistency across all backends.
 */
function validateSyncSchema(): void {
  if (!db) throw new Error('Database not initialized');

  const missing: string[] = [];

  for (const [table, cols] of Object.entries(REQUIRED_SYNC_COLUMNS)) {
    const actual = new Set(
      db.prepare(`PRAGMA table_info(${table})`).all().map((c: { name: string }) => c.name)
    );
    for (const col of cols) {
      if (!actual.has(col)) {
        missing.push(`${table}.${col}`);
      }
    }
  }

  if (missing.length > 0) {
    // Log actual schema state for debugging
    for (const table of Object.keys(REQUIRED_SYNC_COLUMNS)) {
      const actual = db.prepare(`PRAGMA table_info(${table})`).all();
      console.error(`[schema] ${table} actual columns: ${(actual as { name: string }[]).map(c => c.name).join(', ')}`);
    }
    throw new Error(
      `[schema] Required sync columns missing: ${missing.join(', ')}. ` +
      `Database may need migration. See schema/v1.json for canonical schema.`
    );
  }

  DEBUG && console.log('main', 'schema validation passed');
}

// ==================== Lifecycle ====================

export function initDatabase(dbPath: string): Database.Database {
  DEBUG && console.log('main', 'initializing database at:', dbPath);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(createTableStatements);

  migrateTinyBaseData();
  migrateSyncColumns();
  migrateItemTypes();
  migrateItemVisitColumns();
  migrateAddressesToItems();
  migrateVisitChaining();
  migrateDeduplicateItems();
  migrateItemFrecencyColumns();
  migrateAllAddressesToItems();
  migrateVisitsToItemVisits();

  // Validate schema against canonical definition
  validateSyncSchema();

  // Check and write datastore version
  checkAndWriteDatastoreVersion();

  DEBUG && console.log('main', 'database initialized successfully');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    DEBUG && console.log('main', 'database closed');
  }
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// ==================== Helpers ====================

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function now(): number {
  return Date.now();
}

export function parseUrl(uri: string): { protocol: string; domain: string; path: string } {
  try {
    const url = new URL(uri);
    return {
      protocol: url.protocol.replace(':', ''),
      domain: url.hostname,
      path: url.pathname + url.search + url.hash,
    };
  } catch {
    return {
      protocol: 'unknown',
      domain: uri,
      path: '',
    };
  }
}

export function normalizeUrl(uri: string): string {
  if (!uri) return uri;

  try {
    const url = new URL(uri);

    // Remove trailing slash from path (except for root)
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }

    // Remove default ports
    if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
      url.port = '';
    }

    // Sort query parameters for consistency
    if (url.search) {
      const params = new URLSearchParams(url.search);
      const sortedParams = new URLSearchParams([...params.entries()].sort());
      url.search = sortedParams.toString();
    }

    return url.toString();
  } catch {
    return uri;
  }
}

export function isValidTable(tableName: string): tableName is TableName {
  return (tableNames as readonly string[]).includes(tableName);
}

export function calculateFrecency(frequency: number, lastUsed: number): number {
  const currentTime = Date.now();
  const daysSinceUse = (currentTime - lastUsed) / (1000 * 60 * 60 * 24);
  const decayFactor = 1 / (1 + daysSinceUse / 7);
  return Math.round(frequency * 10 * decayFactor);
}

// ==================== Migration ====================

function migrateTinyBaseData(): void {
  if (!db) return;

  // Check if tinybase table exists
  const tinybaseExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tinybase'`)
    .get();

  if (!tinybaseExists) {
    return;
  }

  // Check if we already migrated
  const existingData = db.prepare('SELECT COUNT(*) as count FROM addresses').get() as { count: number };
  if (existingData.count > 0) {
    DEBUG && console.log('main', 'TinyBase data already migrated, skipping');
    return;
  }

  DEBUG && console.log('main', 'Migrating TinyBase data to direct tables...');

  try {
    const tinybaseRow = db.prepare('SELECT * FROM tinybase').get() as Record<string, unknown> | undefined;
    if (!tinybaseRow) {
      DEBUG && console.log('main', 'No TinyBase data found');
      return;
    }

    const rawData = Object.values(tinybaseRow)[1] as string;
    if (!rawData) {
      DEBUG && console.log('main', 'TinyBase data is empty');
      return;
    }

    const [tables] = JSON.parse(rawData) as [Record<string, Record<string, Record<string, unknown>>>];
    if (!tables) {
      DEBUG && console.log('main', 'No tables in TinyBase data');
      return;
    }

    const tablesToMigrate = [
      'addresses', 'visits', 'tags', 'address_tags', 'extension_settings',
      'extensions', 'content', 'blobs', 'scripts_data', 'feeds',
    ];

    for (const tableName of tablesToMigrate) {
      const tableData = tables[tableName];
      if (!tableData || typeof tableData !== 'object') continue;

      const entries = Object.entries(tableData);
      if (entries.length === 0) continue;

      DEBUG && console.log('main', `  Migrating ${entries.length} rows from ${tableName}`);

      for (const [id, row] of entries) {
        try {
          const fullRow = { id, ...row } as Record<string, unknown>;
          const columns = Object.keys(fullRow);
          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map((col) => fullRow[col]);

          db.prepare(
            `INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`
          ).run(...values);
        } catch (err) {
          console.error('main', `  Error migrating row ${id} in ${tableName}:`, (err as Error).message);
        }
      }
    }

    db.exec('DROP TABLE IF EXISTS tinybase');
    DEBUG && console.log('main', 'TinyBase migration complete, removed tinybase table');
  } catch (error) {
    console.error('main', 'TinyBase migration failed:', (error as Error).message);
  }
}

/**
 * Add sync columns to existing tables for cross-device sync support
 */
function migrateSyncColumns(): void {
  if (!db) return;

  const tablesToMigrate = ['addresses', 'content', 'tags', 'items'];

  for (const table of tablesToMigrate) {
    // Check if syncId column already exists
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    const hasSyncId = columns.some(col => col.name === 'syncId');

    if (!hasSyncId) {
      DEBUG && console.log('main', `Adding sync columns to ${table}`);
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN syncId TEXT DEFAULT ''`);
        db.exec(`ALTER TABLE ${table} ADD COLUMN syncSource TEXT DEFAULT ''`);
      } catch (error) {
        // Column might already exist in some edge cases
        DEBUG && console.log('main', `Sync columns migration for ${table}:`, (error as Error).message);
      }
    }
  }
}

/**
 * Helper to detect if content looks like a URL
 */
function isUrlLike(content: string | null): boolean {
  if (!content) return false;
  try {
    const url = new URL(content);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Migrate item types from old 'note' to new 'url'/'text' types
 * Also adds syncedAt column if missing and ensures CHECK constraint includes 'url'
 */
function migrateItemTypes(): void {
  if (!db) return;

  // Check if items table exists
  const tableExists = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='items'`
  ).get();

  if (!tableExists) return;

  // Check columns and constraint
  const columns = db.prepare(`PRAGMA table_info(items)`).all() as { name: string }[];
  const hasSyncedAt = columns.some(col => col.name === 'syncedAt');

  // Add syncedAt column if missing
  if (!hasSyncedAt) {
    DEBUG && console.log('main', 'Adding syncedAt column to items table');
    try {
      db.exec(`ALTER TABLE items ADD COLUMN syncedAt INTEGER DEFAULT 0`);
    } catch (error) {
      DEBUG && console.log('main', `syncedAt column migration:`, (error as Error).message);
    }
  }

  // Check if CHECK constraint allows 'url' type by looking at the table schema
  const tableSchema = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='items'`
  ).get() as { sql: string } | undefined;

  const needsConstraintUpdate = tableSchema && !tableSchema.sql.includes("'url'");

  // Check if we have any 'note' type items that need migration
  const noteItems = db.prepare(`SELECT id, content FROM items WHERE type = 'note'`).all() as { id: string; content: string | null }[];

  // Recreate table if CHECK constraint needs update OR if there are 'note' items
  if (needsConstraintUpdate || noteItems.length > 0) {
    DEBUG && console.log('main', `Migrating items table: constraint update=${needsConstraintUpdate}, note items=${noteItems.length}`);

    // SQLite doesn't allow modifying CHECK constraints, so we need to recreate the table
    db.exec(`
      CREATE TABLE IF NOT EXISTS items_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('url', 'text', 'tagset', 'image')),
        content TEXT,
        mimeType TEXT DEFAULT '',
        metadata TEXT DEFAULT '{}',
        syncId TEXT DEFAULT '',
        syncSource TEXT DEFAULT '',
        syncedAt INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        deletedAt INTEGER DEFAULT 0,
        starred INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0,
        visitCount INTEGER DEFAULT 0,
        lastVisitAt INTEGER DEFAULT 0
      )
    `);

    // Copy data, converting 'note' type
    const allItems = db.prepare(`SELECT * FROM items`).all() as Array<Record<string, unknown>>;
    const insertStmt = db.prepare(`
      INSERT INTO items_new (id, type, content, mimeType, metadata, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt, starred, archived, visitCount, lastVisitAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of allItems) {
      let newType = item.type as string;
      if (newType === 'note') {
        newType = isUrlLike(item.content as string | null) ? 'url' : 'text';
      }
      insertStmt.run(
        item.id,
        newType,
        item.content,
        item.mimeType || '',
        item.metadata || '{}',
        item.syncId || '',
        item.syncSource || '',
        item.syncedAt || 0,
        item.createdAt,
        item.updatedAt,
        item.deletedAt || 0,
        item.starred || 0,
        item.archived || 0,
        item.visitCount || 0,
        item.lastVisitAt || 0
      );
    }

    db.exec(`DROP TABLE items`);
    db.exec(`ALTER TABLE items_new RENAME TO items`);

    // Recreate indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
      CREATE INDEX IF NOT EXISTS idx_items_syncId ON items(syncId);
      CREATE INDEX IF NOT EXISTS idx_items_deletedAt ON items(deletedAt);
      CREATE INDEX IF NOT EXISTS idx_items_createdAt ON items(createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_items_starred ON items(starred);
      CREATE INDEX IF NOT EXISTS idx_items_lastVisitAt ON items(lastVisitAt);
      CREATE INDEX IF NOT EXISTS idx_items_visitCount ON items(visitCount);
    `);

    DEBUG && console.log('main', 'Items table migration complete');
  }
}

/**
 * Add visit tracking columns to items table for existing databases
 */
function migrateItemVisitColumns(): void {
  if (!db) return;

  const columns = db.prepare(`PRAGMA table_info(items)`).all() as { name: string }[];
  const hasVisitCount = columns.some(col => col.name === 'visitCount');

  if (!hasVisitCount) {
    DEBUG && console.log('main', 'Adding visit columns to items table');
    try {
      db.exec(`ALTER TABLE items ADD COLUMN visitCount INTEGER DEFAULT 0`);
      db.exec(`ALTER TABLE items ADD COLUMN lastVisitAt INTEGER DEFAULT 0`);
    } catch (error) {
      DEBUG && console.log('main', `Visit columns migration for items:`, (error as Error).message);
    }
  }

  // Always ensure indexes exist (handles both new and migrated tables)
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_items_lastVisitAt ON items(lastVisitAt)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_items_visitCount ON items(visitCount)`);
  } catch (error) {
    DEBUG && console.log('main', `Visit indexes for items:`, (error as Error).message);
  }
}

/**
 * Migrate tagged addresses from addresses/address_tags to items/item_tags
 * This ensures old tagged data is visible in the new Tags UI
 */
function migrateAddressesToItems(): void {
  if (!db) return;

  const MIGRATION_ID = 'addresses_to_items_v1';

  // Check if already migrated
  const migrationRecord = db.prepare('SELECT * FROM migrations WHERE id = ?').get(MIGRATION_ID) as { status: string } | undefined;
  if (migrationRecord && migrationRecord.status === 'complete') {
    DEBUG && console.log('main', 'Addresses to items migration already complete');
    return;
  }

  // Get all addresses that have tags
  const taggedAddresses = db.prepare(`
    SELECT DISTINCT a.* FROM addresses a
    INNER JOIN address_tags at ON a.id = at.addressId
  `).all() as Address[];

  if (taggedAddresses.length === 0) {
    // Mark as complete even if no data to migrate
    db.prepare('INSERT OR REPLACE INTO migrations (id, status, completedAt) VALUES (?, ?, ?)').run(MIGRATION_ID, 'complete', Date.now());
    DEBUG && console.log('main', 'No tagged addresses to migrate');
    return;
  }

  DEBUG && console.log('main', `Migrating ${taggedAddresses.length} tagged addresses to items table`);

  let migratedCount = 0;

  for (const addr of taggedAddresses) {
    // Check if item with this URL already exists
    const existingItem = db.prepare('SELECT * FROM items WHERE type = ? AND content = ? AND deletedAt = 0').get('url', addr.uri) as Item | undefined;

    let itemId: string;

    if (existingItem) {
      // Use existing item
      itemId = existingItem.id;
    } else {
      // Create new item for this URL
      itemId = generateId('item');
      const timestamp = now();

      // Build metadata from address
      const metadata: Record<string, unknown> = {};
      if (addr.title) metadata.title = addr.title;
      if (addr.description) metadata.description = addr.description;
      if (addr.favicon) metadata.favicon = addr.favicon;
      if (addr.metadata) {
        try {
          const addrMeta = typeof addr.metadata === 'string' ? JSON.parse(addr.metadata) : addr.metadata;
          Object.assign(metadata, addrMeta);
        } catch {
          // Ignore invalid JSON
        }
      }

      db.prepare(`
        INSERT INTO items (id, type, content, mimeType, metadata, syncId, syncSource, createdAt, updatedAt, deletedAt, starred, archived, visitCount, lastVisitAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `).run(
        itemId,
        'url',
        addr.uri,
        addr.mimeType || 'text/html',
        JSON.stringify(metadata),
        '',
        '',
        addr.createdAt || timestamp,
        addr.updatedAt || timestamp,
        addr.starred || 0,
        addr.archived || 0,
        addr.visitCount || 0,
        addr.lastVisitAt || 0
      );

      migratedCount++;
    }

    // Copy tag associations
    const addressTags = db.prepare('SELECT * FROM address_tags WHERE addressId = ?').all(addr.id) as AddressTag[];

    for (const at of addressTags) {
      // Check if item-tag link already exists
      const existingLink = db.prepare('SELECT * FROM item_tags WHERE itemId = ? AND tagId = ?').get(itemId, at.tagId);
      if (!existingLink) {
        const linkId = generateId('item_tag');
        db.prepare('INSERT INTO item_tags (id, itemId, tagId, createdAt) VALUES (?, ?, ?, ?)').run(
          linkId,
          itemId,
          at.tagId,
          at.createdAt || now()
        );
      }
    }
  }

  // Mark migration as complete
  db.prepare('INSERT OR REPLACE INTO migrations (id, status, completedAt) VALUES (?, ?, ?)').run(MIGRATION_ID, 'complete', Date.now());
  DEBUG && console.log('main', `Migrated ${migratedCount} addresses to items, copied tag associations`);
}

/**
 * Add prevId/nextId columns to visits table for history chaining
 */
function migrateVisitChaining(): void {
  if (!db) return;

  const columns = db.prepare(`PRAGMA table_info(visits)`).all() as { name: string }[];
  const hasPrevId = columns.some(col => col.name === 'prevId');

  if (!hasPrevId) {
    DEBUG && console.log('main', 'Adding chaining columns to visits table');
    try {
      db.exec(`ALTER TABLE visits ADD COLUMN prevId TEXT DEFAULT NULL`);
      db.exec(`ALTER TABLE visits ADD COLUMN nextId TEXT DEFAULT NULL`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_visits_prevId ON visits(prevId)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_visits_nextId ON visits(nextId)`);

      // Backfill existing visits with chaining
      const visits = db.prepare('SELECT id FROM visits ORDER BY timestamp ASC').all() as { id: string }[];
      if (visits.length > 1) {
        const updatePrev = db.prepare('UPDATE visits SET prevId = ? WHERE id = ?');
        const updateNext = db.prepare('UPDATE visits SET nextId = ? WHERE id = ?');
        const backfill = db.transaction(() => {
          for (let i = 1; i < visits.length; i++) {
            updatePrev.run(visits[i - 1].id, visits[i].id);
            updateNext.run(visits[i].id, visits[i - 1].id);
          }
        });
        backfill();
        DEBUG && console.log('main', `Backfilled chaining for ${visits.length} visits`);
      }
    } catch (error) {
      DEBUG && console.log('main', `Visit chaining migration:`, (error as Error).message);
    }
  }

  // Ensure indexes exist even if columns were added previously
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_visits_prevId ON visits(prevId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_visits_nextId ON visits(nextId)`);
  } catch (error) {
    DEBUG && console.log('main', `Visit chaining indexes:`, (error as Error).message);
  }
}

/**
 * One-time deduplication of items.
 * Removes duplicate url/text items (same type+content) and duplicate tagsets (same sorted tag names).
 * Keeps the item with the most recent updatedAt; prefers items with a syncId.
 */
function migrateDeduplicateItems(): void {
  if (!db) return;

  // Check if already done
  const flag = db.prepare('SELECT value FROM settings WHERE key = ?').get('dedup_cleanup_v1') as { value: string } | undefined;
  if (flag) return;

  DEBUG && console.log('main', 'Running one-time dedup cleanup...');
  let totalRemoved = 0;

  // --- Deduplicate url/text items by (type, content) ---
  const dupGroups = db.prepare(`
    SELECT type, content, COUNT(*) as cnt
    FROM items
    WHERE deletedAt = 0 AND type IN ('url', 'text') AND content IS NOT NULL AND content != ''
    GROUP BY type, content
    HAVING cnt > 1
  `).all() as { type: string; content: string; cnt: number }[];

  for (const group of dupGroups) {
    const items = db.prepare(`
      SELECT id, syncId, updatedAt
      FROM items
      WHERE type = ? AND content = ? AND deletedAt = 0
      ORDER BY
        CASE WHEN syncId IS NOT NULL AND syncId != '' THEN 0 ELSE 1 END,
        updatedAt DESC
    `).all(group.type, group.content) as { id: string; syncId: string; updatedAt: number }[];

    for (let i = 1; i < items.length; i++) {
      db.prepare('DELETE FROM item_tags WHERE itemId = ?').run(items[i].id);
      db.prepare('DELETE FROM items WHERE id = ?').run(items[i].id);
      totalRemoved++;
    }
  }

  // --- Deduplicate tagsets by sorted tag names ---
  const tagsets = db.prepare(`
    SELECT id, syncId, updatedAt
    FROM items
    WHERE type = 'tagset' AND deletedAt = 0
  `).all() as { id: string; syncId: string; updatedAt: number }[];

  const tagsetGroups = new Map<string, { id: string; syncId: string; updatedAt: number }[]>();
  for (const ts of tagsets) {
    const tagNames = (db.prepare(`
      SELECT t.name FROM tags t
      JOIN item_tags it ON t.id = it.tagId
      WHERE it.itemId = ?
      ORDER BY t.name
    `).all(ts.id) as { name: string }[]).map(t => t.name).join('\0');

    if (!tagsetGroups.has(tagNames)) {
      tagsetGroups.set(tagNames, []);
    }
    tagsetGroups.get(tagNames)!.push(ts);
  }

  for (const [, items] of tagsetGroups) {
    if (items.length <= 1) continue;

    items.sort((a, b) => {
      const aHasSync = a.syncId && a.syncId !== '' ? 0 : 1;
      const bHasSync = b.syncId && b.syncId !== '' ? 0 : 1;
      if (aHasSync !== bHasSync) return aHasSync - bHasSync;
      return b.updatedAt - a.updatedAt;
    });

    for (let i = 1; i < items.length; i++) {
      db.prepare('DELETE FROM item_tags WHERE itemId = ?').run(items[i].id);
      db.prepare('DELETE FROM items WHERE id = ?').run(items[i].id);
      totalRemoved++;
    }
  }

  // Set flag so this doesn't run again
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('dedup_cleanup_v1', '1');

  if (totalRemoved > 0) {
    console.log(`[dedup] Removed ${totalRemoved} duplicate items`);
  } else {
    DEBUG && console.log('main', 'Dedup cleanup: no duplicates found');
  }
}

/**
 * Add frecencyScore, title, domain, favicon columns to items table for URL history unification.
 * These columns are local-only (not synced) and support frecency-based sorting.
 */
function migrateItemFrecencyColumns(): void {
  if (!db) return;

  const columns = db.prepare(`PRAGMA table_info(items)`).all() as { name: string }[];
  const hasFrecencyScore = columns.some(col => col.name === 'frecencyScore');

  if (!hasFrecencyScore) {
    DEBUG && console.log('main', 'Adding frecency columns to items table');
    try {
      db.exec(`ALTER TABLE items ADD COLUMN frecencyScore INTEGER DEFAULT 0`);
      db.exec(`ALTER TABLE items ADD COLUMN title TEXT DEFAULT ''`);
      db.exec(`ALTER TABLE items ADD COLUMN domain TEXT DEFAULT ''`);
      db.exec(`ALTER TABLE items ADD COLUMN favicon TEXT DEFAULT ''`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_items_frecencyScore ON items(frecencyScore DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_items_domain ON items(domain)`);
    } catch (error) {
      DEBUG && console.log('main', `Item frecency columns migration:`, (error as Error).message);
    }
  }

  // Always ensure indexes exist
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_items_frecencyScore ON items(frecencyScore DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_items_domain ON items(domain)`);
  } catch (error) {
    DEBUG && console.log('main', `Item frecency indexes:`, (error as Error).message);
  }
}

/**
 * Calculate frecency score for an item based on visit history.
 * Uses a time-decay algorithm where recent visits contribute more.
 */
export function calculateItemFrecency(visits: Array<{ timestamp: number; interacted: number; source: string }>): number {
  let score = 0;
  for (const visit of visits) {
    const ageDays = (Date.now() - visit.timestamp) / (1000 * 60 * 60 * 24);
    const decay = 1 / (1 + Math.pow(ageDays / 7, 0.5));
    // Weight: interacted visits count more, direct navigations count less than link clicks
    const weight = visit.interacted ? 2 : (visit.source === 'direct' ? 0.5 : 1);
    score += weight * decay;
  }
  return Math.round(score * 10);
}

/**
 * Migrate ALL addresses to items (not just tagged ones).
 * This extends the earlier migrateAddressesToItems() which only migrated tagged addresses.
 * Creates items for all addresses and tracks address.id → item.id mapping for visit migration.
 */
function migrateAllAddressesToItems(): void {
  if (!db) return;

  const MIGRATION_ID = 'all_addresses_to_items_v1';

  // Check if already migrated
  const migrationRecord = db.prepare('SELECT * FROM migrations WHERE id = ?').get(MIGRATION_ID) as { status: string } | undefined;
  if (migrationRecord && migrationRecord.status === 'complete') {
    DEBUG && console.log('main', 'All addresses to items migration already complete');
    return;
  }

  // Get ALL addresses (not just tagged ones)
  const allAddresses = db.prepare('SELECT * FROM addresses').all() as Address[];

  if (allAddresses.length === 0) {
    db.prepare('INSERT OR REPLACE INTO migrations (id, status, completedAt) VALUES (?, ?, ?)').run(MIGRATION_ID, 'complete', Date.now());
    DEBUG && console.log('main', 'No addresses to migrate');
    return;
  }

  DEBUG && console.log('main', `Migrating ${allAddresses.length} addresses to items table`);

  let createdCount = 0;
  let mergedCount = 0;

  // Build address.id → item.id mapping for visit migration
  const addressToItemMap: Record<string, string> = {};

  for (const addr of allAddresses) {
    // Check if item with this URL already exists
    const existingItem = db.prepare('SELECT * FROM items WHERE type = ? AND content = ? AND deletedAt = 0').get('url', addr.uri) as Item | undefined;

    if (existingItem) {
      // Map to existing item, merge metadata
      addressToItemMap[addr.id] = existingItem.id;

      // Merge metadata: combine address metadata with item metadata
      let itemMeta: Record<string, unknown> = {};
      try {
        itemMeta = typeof existingItem.metadata === 'string' ? JSON.parse(existingItem.metadata) : existingItem.metadata || {};
      } catch { /* ignore */ }

      // Update with address data if item is missing it
      const updates: string[] = [];
      const values: unknown[] = [];

      if (!itemMeta.title && addr.title) {
        itemMeta.title = addr.title;
      }
      if (!itemMeta.favicon && addr.favicon) {
        itemMeta.favicon = addr.favicon;
      }

      // Also set the denormalized columns
      if (addr.title) {
        updates.push('title = ?');
        values.push(addr.title);
      }
      if (addr.domain) {
        updates.push('domain = ?');
        values.push(addr.domain);
      }
      if (addr.favicon) {
        updates.push('favicon = ?');
        values.push(addr.favicon);
      }

      // Merge visit stats (take max)
      if ((addr.visitCount || 0) > (existingItem.visitCount || 0)) {
        updates.push('visitCount = ?');
        values.push(addr.visitCount);
      }
      if ((addr.lastVisitAt || 0) > (existingItem.lastVisitAt || 0)) {
        updates.push('lastVisitAt = ?');
        values.push(addr.lastVisitAt);
      }
      if (addr.starred && !existingItem.starred) {
        updates.push('starred = ?');
        values.push(1);
      }

      if (updates.length > 0) {
        updates.push('metadata = ?');
        values.push(JSON.stringify(itemMeta));
        updates.push('updatedAt = ?');
        values.push(now());
        values.push(existingItem.id);

        db.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      }

      mergedCount++;
    } else {
      // Create new item for this URL
      const itemId = generateId('item');
      const timestamp = now();
      addressToItemMap[addr.id] = itemId;

      // Build metadata from address
      const metadata: Record<string, unknown> = {};
      if (addr.title) metadata.title = addr.title;
      if (addr.description) metadata.description = addr.description;
      if (addr.favicon) metadata.favicon = addr.favicon;
      if (addr.metadata) {
        try {
          const addrMeta = typeof addr.metadata === 'string' ? JSON.parse(addr.metadata) : addr.metadata;
          Object.assign(metadata, addrMeta);
        } catch { /* ignore invalid JSON */ }
      }

      db.prepare(`
        INSERT INTO items (id, type, content, mimeType, metadata, syncId, syncSource, createdAt, updatedAt, deletedAt, starred, archived, visitCount, lastVisitAt, frecencyScore, title, domain, favicon)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0, ?, ?, ?)
      `).run(
        itemId,
        'url',
        addr.uri,
        addr.mimeType || 'text/html',
        JSON.stringify(metadata),
        '',
        '',
        addr.createdAt || timestamp,
        addr.updatedAt || timestamp,
        addr.starred || 0,
        addr.archived || 0,
        addr.visitCount || 0,
        addr.lastVisitAt || 0,
        addr.title || '',
        addr.domain || '',
        addr.favicon || ''
      );

      createdCount++;

      // Copy tag associations from address_tags to item_tags
      const addressTags = db.prepare('SELECT * FROM address_tags WHERE addressId = ?').all(addr.id) as AddressTag[];
      for (const at of addressTags) {
        const existingLink = db.prepare('SELECT * FROM item_tags WHERE itemId = ? AND tagId = ?').get(itemId, at.tagId);
        if (!existingLink) {
          const linkId = generateId('item_tag');
          db.prepare('INSERT INTO item_tags (id, itemId, tagId, createdAt) VALUES (?, ?, ?, ?)').run(
            linkId,
            itemId,
            at.tagId,
            at.createdAt || now()
          );
        }
      }
    }
  }

  // Store the mapping for visit migration
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('address_to_item_map', JSON.stringify(addressToItemMap));

  // Mark migration as complete
  db.prepare('INSERT OR REPLACE INTO migrations (id, status, completedAt) VALUES (?, ?, ?)').run(MIGRATION_ID, 'complete', Date.now());
  DEBUG && console.log('main', `Migrated addresses to items: ${createdCount} created, ${mergedCount} merged`);
}

/**
 * Migrate visits from visits table to item_visits table.
 * Uses the address_to_item_map created by migrateAllAddressesToItems().
 * Preserves visit chaining (prevId/nextId).
 */
function migrateVisitsToItemVisits(): void {
  if (!db) return;

  const MIGRATION_ID = 'visits_to_item_visits_v1';

  // Check if already migrated
  const migrationRecord = db.prepare('SELECT * FROM migrations WHERE id = ?').get(MIGRATION_ID) as { status: string } | undefined;
  if (migrationRecord && migrationRecord.status === 'complete') {
    DEBUG && console.log('main', 'Visits to item_visits migration already complete');
    return;
  }

  // Load address → item mapping
  const mapRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('address_to_item_map') as { value: string } | undefined;
  if (!mapRow) {
    DEBUG && console.log('main', 'No address_to_item_map found, skipping visit migration');
    db.prepare('INSERT OR REPLACE INTO migrations (id, status, completedAt) VALUES (?, ?, ?)').run(MIGRATION_ID, 'complete', Date.now());
    return;
  }

  const addressToItemMap: Record<string, string> = JSON.parse(mapRow.value);

  // Get all visits
  const allVisits = db.prepare('SELECT * FROM visits ORDER BY timestamp ASC').all() as Visit[];

  if (allVisits.length === 0) {
    db.prepare('INSERT OR REPLACE INTO migrations (id, status, completedAt) VALUES (?, ?, ?)').run(MIGRATION_ID, 'complete', Date.now());
    DEBUG && console.log('main', 'No visits to migrate');
    return;
  }

  DEBUG && console.log('main', `Migrating ${allVisits.length} visits to item_visits table`);

  // Build old visit.id → new item_visit.id mapping for chaining
  const visitIdMap: Record<string, string> = {};
  let migratedCount = 0;
  let skippedCount = 0;

  // First pass: create all item_visits without chaining
  for (const visit of allVisits) {
    const itemId = addressToItemMap[visit.addressId];
    if (!itemId) {
      // Address wasn't migrated (shouldn't happen, but handle gracefully)
      skippedCount++;
      continue;
    }

    // Check if this visit was already migrated
    const existingItemVisit = db.prepare('SELECT id FROM item_visits WHERE timestamp = ? AND itemId = ?').get(visit.timestamp, itemId);
    if (existingItemVisit) {
      visitIdMap[visit.id] = (existingItemVisit as { id: string }).id;
      continue;
    }

    const itemVisitId = generateId('item_visit');
    visitIdMap[visit.id] = itemVisitId;

    db.prepare(`
      INSERT INTO item_visits (id, itemId, timestamp, duration, source, sourceId, windowType, metadata, scrollDepth, interacted, prevId, nextId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
    `).run(
      itemVisitId,
      itemId,
      visit.timestamp,
      visit.duration || 0,
      visit.source || 'direct',
      visit.sourceId || '',
      visit.windowType || 'main',
      visit.metadata || '{}',
      visit.scrollDepth || 0,
      visit.interacted || 0
    );

    migratedCount++;
  }

  // Second pass: update chaining (prevId/nextId)
  for (const visit of allVisits) {
    const newVisitId = visitIdMap[visit.id];
    if (!newVisitId) continue;

    const newPrevId = visit.prevId ? visitIdMap[visit.prevId] : null;
    const newNextId = visit.nextId ? visitIdMap[visit.nextId] : null;

    if (newPrevId || newNextId) {
      db.prepare('UPDATE item_visits SET prevId = ?, nextId = ? WHERE id = ?').run(
        newPrevId || null,
        newNextId || null,
        newVisitId
      );
    }
  }

  // Calculate initial frecency scores for all URL items
  const urlItems = db.prepare('SELECT id FROM items WHERE type = ? AND deletedAt = 0').all('url') as { id: string }[];
  for (const item of urlItems) {
    const visits = db.prepare('SELECT timestamp, interacted, source FROM item_visits WHERE itemId = ?').all(item.id) as Array<{ timestamp: number; interacted: number; source: string }>;
    const frecencyScore = calculateItemFrecency(visits);
    db.prepare('UPDATE items SET frecencyScore = ? WHERE id = ?').run(frecencyScore, item.id);
  }

  // Mark migration as complete
  db.prepare('INSERT OR REPLACE INTO migrations (id, status, completedAt) VALUES (?, ?, ?)').run(MIGRATION_ID, 'complete', Date.now());
  DEBUG && console.log('main', `Migrated ${migratedCount} visits to item_visits, skipped ${skippedCount}, calculated frecency for ${urlItems.length} items`);
}

// ==================== Version Check ====================

/**
 * Check stored datastore version against code version.
 * - If stored > code: old binary running against newer schema — disable sync
 * - If stored < code: upgrade — update stored version
 * - If stored == code or no stored version: write current version
 */
function checkAndWriteDatastoreVersion(): void {
  if (!db) return;

  const row = db.prepare(`
    SELECT value FROM extension_settings
    WHERE extensionId = 'system' AND key = 'datastore_version'
  `).get() as { value: string } | undefined;

  if (row) {
    let storedVersion: number;
    try {
      storedVersion = parseInt(JSON.parse(row.value), 10);
    } catch {
      storedVersion = parseInt(row.value, 10);
    }

    if (storedVersion > DATASTORE_VERSION) {
      // Downgrade detected: stored version is newer than code
      console.error(
        `[datastore] DATASTORE VERSION MISMATCH: stored=${storedVersion}, code=${DATASTORE_VERSION}. ` +
        `This binary is older than the database schema. Sync will be disabled to prevent data corruption.`
      );
      syncDisabledDueToVersionMismatch = true;
      return;
    }

    if (storedVersion < DATASTORE_VERSION) {
      // Upgrade: update stored version
      DEBUG && console.log('main', `Upgrading datastore version: ${storedVersion} → ${DATASTORE_VERSION}`);
    }
  }

  // Write current version
  db.prepare(`
    INSERT OR REPLACE INTO extension_settings (id, extensionId, key, value, updatedAt)
    VALUES (?, 'system', 'datastore_version', ?, ?)
  `).run('system-datastore_version', JSON.stringify(DATASTORE_VERSION), Date.now());

  syncDisabledDueToVersionMismatch = false;
}

/**
 * Returns true if sync should be disabled due to a datastore version mismatch
 * (old binary running against a database migrated by a newer version).
 */
export function isSyncDisabledDueToVersion(): boolean {
  return syncDisabledDueToVersionMismatch;
}

// ==================== Address Operations ====================

export function addAddress(uri: string, options: AddressOptions = {}): { id: string } {
  const normalizedUri = normalizeUrl(uri);
  const parsed = parseUrl(normalizedUri);
  const addressId = generateId('addr');
  const timestamp = now();

  getDb().prepare(`
    INSERT INTO addresses (id, uri, protocol, domain, path, title, mimeType, favicon, description, tags, metadata, createdAt, updatedAt, lastVisitAt, visitCount, starred, archived)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    addressId,
    normalizedUri,
    options.protocol || parsed.protocol,
    options.domain || parsed.domain,
    options.path || parsed.path,
    options.title || '',
    options.mimeType || 'text/html',
    options.favicon || '',
    options.description || '',
    options.tags || '',
    options.metadata || '{}',
    timestamp,
    timestamp,
    options.lastVisitAt || 0,
    options.visitCount || 0,
    options.starred || 0,
    options.archived || 0
  );

  return { id: addressId };
}

export function getAddress(id: string): Address | undefined {
  return getDb().prepare('SELECT * FROM addresses WHERE id = ?').get(id) as Address | undefined;
}

export function updateAddress(id: string, updates: Partial<Address>): Address | undefined {
  const existing = getAddress(id);
  if (!existing) return undefined;

  const updated = { ...existing, ...updates, updatedAt: now() };
  const columns = Object.keys(updated).filter(k => k !== 'id');
  const setClause = columns.map(col => `${col} = ?`).join(', ');
  const values = columns.map(col => updated[col as keyof Address]);

  getDb().prepare(`UPDATE addresses SET ${setClause} WHERE id = ?`).run(...values, id);
  return updated as Address;
}

export function queryAddresses(filter: AddressFilter = {}): Address[] {
  let sql = 'SELECT * FROM addresses WHERE 1=1';
  const params: (string | number)[] = [];

  if (filter.domain) {
    sql += ' AND domain = ?';
    params.push(filter.domain);
  }
  if (filter.protocol) {
    sql += ' AND protocol = ?';
    params.push(filter.protocol);
  }
  if (filter.starred !== undefined) {
    sql += ' AND starred = ?';
    params.push(filter.starred);
  }
  if (filter.tag) {
    sql += ' AND tags LIKE ?';
    params.push(`%${filter.tag}%`);
  }

  const sortMap: Record<string, string> = {
    lastVisit: 'lastVisitAt DESC',
    visitCount: 'visitCount DESC',
    created: 'createdAt DESC'
  };
  sql += ` ORDER BY ${sortMap[filter.sortBy || ''] || 'updatedAt DESC'}`;

  if (filter.limit) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }

  return getDb().prepare(sql).all(...params) as Address[];
}

// ==================== Visit Operations ====================

export function addVisit(addressId: string, options: VisitOptions = {}): { id: string } {
  const visitId = generateId('visit');
  const timestamp = now();
  const d = getDb();

  // Find the most recent visit for chaining
  const prevVisit = d.prepare('SELECT id FROM visits ORDER BY timestamp DESC LIMIT 1').get() as { id: string } | undefined;
  const prevId = prevVisit ? prevVisit.id : null;

  d.prepare(`
    INSERT INTO visits (id, addressId, timestamp, duration, source, sourceId, windowType, metadata, scrollDepth, interacted, prevId, nextId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    visitId,
    addressId,
    options.timestamp || timestamp,
    options.duration || 0,
    options.source || 'direct',
    options.sourceId || '',
    options.windowType || 'main',
    options.metadata || '{}',
    options.scrollDepth || 0,
    options.interacted || 0,
    prevId
  );

  // Update nextId on the previous visit
  if (prevId) {
    d.prepare('UPDATE visits SET nextId = ? WHERE id = ?').run(visitId, prevId);
  }

  // Update address visit stats
  d.prepare(`
    UPDATE addresses SET lastVisitAt = ?, visitCount = visitCount + 1, updatedAt = ?
    WHERE id = ?
  `).run(timestamp, timestamp, addressId);

  // Also update any items with matching URL content
  const address = getAddress(addressId);
  if (address && address.uri) {
    d.prepare(`
      UPDATE items SET lastVisitAt = ?, visitCount = visitCount + 1, updatedAt = ?
      WHERE type = 'url' AND content = ? AND deletedAt = 0
    `).run(timestamp, timestamp, address.uri);
  }

  return { id: visitId };
}

export function queryVisits(filter: VisitFilter = {}): Visit[] {
  let sql = 'SELECT * FROM visits WHERE 1=1';
  const params: (string | number)[] = [];

  if (filter.addressId) {
    sql += ' AND addressId = ?';
    params.push(filter.addressId);
  }
  if (filter.source) {
    sql += ' AND source = ?';
    params.push(filter.source);
  }
  if (filter.since) {
    sql += ' AND timestamp >= ?';
    params.push(filter.since);
  }
  if (filter.until) {
    sql += ' AND timestamp <= ?';
    params.push(filter.until);
  }

  sql += ' ORDER BY timestamp DESC';

  if (filter.limit) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }

  return getDb().prepare(sql).all(...params) as Visit[];
}

// ==================== History Operations ====================

export interface HistoryFilter {
  since?: number;
  until?: number;
  source?: string;
  limit?: number;
  offset?: number;
}

export interface HistoryEntry {
  id: string;
  addressId: string;
  timestamp: number;
  duration: number;
  source: string;
  sourceId: string;
  windowType: string;
  metadata: string;
  scrollDepth: number;
  interacted: number;
  prevId: string | null;
  nextId: string | null;
  uri: string;
  title: string;
  domain: string;
  protocol: string;
  favicon: string;
}

/**
 * Track a window load: find or create address, then add visit with chaining
 */
export function trackWindowLoad(uri: string, options: {
  source?: string;
  sourceId?: string;
  windowType?: string;
  title?: string;
} = {}): { visitId: string; addressId: string } {
  const normalizedUri = normalizeUrl(uri);

  // Find existing address by URI
  const existing = getDb().prepare('SELECT id FROM addresses WHERE uri = ?').get(normalizedUri) as { id: string } | undefined;

  let addressId: string;
  if (existing) {
    addressId = existing.id;
    // Update title if provided and different
    if (options.title) {
      getDb().prepare('UPDATE addresses SET title = ?, updatedAt = ? WHERE id = ? AND (title = \'\' OR title IS NULL)').run(options.title, now(), addressId);
    }
  } else {
    const result = addAddress(uri, { title: options.title || '' });
    addressId = result.id;
  }

  const visit = addVisit(addressId, {
    source: options.source || 'window',
    sourceId: options.sourceId || '',
    windowType: options.windowType || 'main',
  });

  return { visitId: visit.id, addressId };
}

/**
 * Get history entries (visits joined with addresses) with filtering
 */
export function getHistory(filter: HistoryFilter = {}): HistoryEntry[] {
  let sql = `
    SELECT v.*, a.uri, a.title, a.domain, a.protocol, a.favicon
    FROM visits v
    LEFT JOIN addresses a ON v.addressId = a.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (filter.since) {
    sql += ' AND v.timestamp >= ?';
    params.push(filter.since);
  }
  if (filter.until) {
    sql += ' AND v.timestamp <= ?';
    params.push(filter.until);
  }
  if (filter.source) {
    sql += ' AND v.source = ?';
    params.push(filter.source);
  }

  sql += ' ORDER BY v.timestamp DESC';

  if (filter.limit) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }
  if (filter.offset) {
    sql += ' OFFSET ?';
    params.push(filter.offset);
  }

  return getDb().prepare(sql).all(...params) as HistoryEntry[];
}

// ==================== Content Operations ====================

export function addContent(options: ContentOptions = {}): { id: string } {
  const contentId = generateId('content');
  const timestamp = now();

  getDb().prepare(`
    INSERT INTO content (id, title, content, mimeType, contentType, language, encoding, tags, addressRefs, parentId, metadata, createdAt, updatedAt, syncPath, synced, starred, archived)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    contentId,
    options.title || 'Untitled',
    options.content || '',
    options.mimeType || 'text/plain',
    options.contentType || 'plain',
    options.language || '',
    options.encoding || 'utf-8',
    options.tags || '',
    options.addressRefs || '',
    options.parentId || '',
    options.metadata || '{}',
    timestamp,
    timestamp,
    options.syncPath || '',
    options.synced || 0,
    options.starred || 0,
    options.archived || 0
  );

  return { id: contentId };
}

export function queryContent(filter: ContentFilter = {}): Content[] {
  let sql = 'SELECT * FROM content WHERE 1=1';
  const params: (string | number)[] = [];

  if (filter.contentType) {
    sql += ' AND contentType = ?';
    params.push(filter.contentType);
  }
  if (filter.mimeType) {
    sql += ' AND mimeType = ?';
    params.push(filter.mimeType);
  }
  if (filter.synced !== undefined) {
    sql += ' AND synced = ?';
    params.push(filter.synced);
  }
  if (filter.starred !== undefined) {
    sql += ' AND starred = ?';
    params.push(filter.starred);
  }
  if (filter.tag) {
    sql += ' AND tags LIKE ?';
    params.push(`%${filter.tag}%`);
  }

  const sortMap: Record<string, string> = {
    updated: 'updatedAt DESC',
    created: 'createdAt DESC'
  };
  sql += ` ORDER BY ${sortMap[filter.sortBy || ''] || 'updatedAt DESC'}`;

  if (filter.limit) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }

  return getDb().prepare(sql).all(...params) as Content[];
}

// ==================== Tag Operations ====================

export function getOrCreateTag(name: string): { tag: Tag; created: boolean } {
  const slug = name.toLowerCase().trim().replace(/\s+/g, '-');
  const timestamp = now();

  const existingTag = getDb().prepare('SELECT * FROM tags WHERE LOWER(name) = LOWER(?)').get(name) as Tag | undefined;
  if (existingTag) {
    return { tag: existingTag, created: false };
  }

  const tagId = generateId('tag');
  getDb().prepare(`
    INSERT INTO tags (id, name, slug, color, parentId, description, metadata, createdAt, updatedAt, frequency, lastUsed, frecencyScore)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tagId, name.trim(), slug, '#999999', '', '', '{}', timestamp, timestamp, 0, 0, 0);

  const newTag = getDb().prepare('SELECT * FROM tags WHERE id = ?').get(tagId) as Tag;
  return { tag: newTag, created: true };
}

export function tagAddress(addressId: string, tagId: string): { link: AddressTag; alreadyExists: boolean } {
  const timestamp = now();

  const existingLink = getDb().prepare('SELECT * FROM address_tags WHERE addressId = ? AND tagId = ?').get(addressId, tagId) as AddressTag | undefined;
  if (existingLink) {
    return { link: existingLink, alreadyExists: true };
  }

  const linkId = generateId('address_tag');
  getDb().prepare('INSERT INTO address_tags (id, addressId, tagId, createdAt) VALUES (?, ?, ?, ?)').run(linkId, addressId, tagId, timestamp);

  // Update tag frequency and frecency
  const tag = getDb().prepare('SELECT * FROM tags WHERE id = ?').get(tagId) as Tag | undefined;
  if (tag) {
    const newFrequency = (tag.frequency || 0) + 1;
    const frecencyScore = calculateFrecency(newFrequency, timestamp);
    getDb().prepare('UPDATE tags SET frequency = ?, lastUsed = ?, frecencyScore = ?, updatedAt = ? WHERE id = ?')
      .run(newFrequency, timestamp, frecencyScore, timestamp, tagId);
  }

  const newLink = getDb().prepare('SELECT * FROM address_tags WHERE id = ?').get(linkId) as AddressTag;
  return { link: newLink, alreadyExists: false };
}

export function untagAddress(addressId: string, tagId: string): boolean {
  const result = getDb().prepare('DELETE FROM address_tags WHERE addressId = ? AND tagId = ?').run(addressId, tagId);
  return result.changes > 0;
}

export function getTagsByFrecency(domain?: string): Tag[] {
  let tags = getDb().prepare('SELECT * FROM tags').all() as Tag[];

  // Recalculate frecency scores
  tags = tags.map(tag => ({
    ...tag,
    frecencyScore: calculateFrecency(tag.frequency || 0, tag.lastUsed || 0)
  }));

  // If domain provided, boost tags used on same-domain addresses
  if (domain) {
    const domainTagIds = new Set(
      (getDb().prepare(`
        SELECT DISTINCT at.tagId FROM address_tags at
        JOIN addresses a ON at.addressId = a.id
        WHERE a.domain = ?
      `).all(domain) as { tagId: string }[]).map(row => row.tagId)
    );

    tags = tags.map(tag => ({
      ...tag,
      frecencyScore: domainTagIds.has(tag.id) ? tag.frecencyScore * 2 : tag.frecencyScore
    }));
  }

  tags.sort((a, b) => b.frecencyScore - a.frecencyScore);
  return tags;
}

export function getAddressTags(addressId: string): Tag[] {
  return getDb().prepare(`
    SELECT t.* FROM tags t
    JOIN address_tags at ON t.id = at.tagId
    WHERE at.addressId = ?
  `).all(addressId) as Tag[];
}

export function getAddressesByTag(tagId: string): Address[] {
  return getDb().prepare(`
    SELECT a.* FROM addresses a
    JOIN address_tags at ON a.id = at.addressId
    WHERE at.tagId = ?
  `).all(tagId) as Address[];
}

export function getUntaggedAddresses(): Address[] {
  return getDb().prepare(`
    SELECT a.* FROM addresses a
    LEFT JOIN address_tags at ON a.id = at.addressId
    WHERE at.id IS NULL
    ORDER BY a.visitCount DESC
  `).all() as Address[];
}

// ==================== Generic Table Operations ====================

export function getTable(tableName: TableName): Record<string, Record<string, unknown>> {
  const rows = getDb().prepare(`SELECT * FROM ${tableName}`).all() as Array<{ id: string } & Record<string, unknown>>;
  const table: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    table[row.id] = row;
  }
  return table;
}

export function setRow(tableName: TableName, rowId: string, rowData: Record<string, unknown>): void {
  const row: Record<string, unknown> = { id: rowId, ...rowData };
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(col => row[col]);

  getDb().prepare(`INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);
}

export function getRow(tableName: TableName, rowId: string): Record<string, unknown> | null {
  const result = getDb().prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(rowId);
  return (result as Record<string, unknown>) || null;
}

export function getStats(): DatastoreStats {
  const d = getDb();
  return {
    totalAddresses: (d.prepare('SELECT COUNT(*) as count FROM addresses').get() as { count: number }).count,
    totalVisits: (d.prepare('SELECT COUNT(*) as count FROM visits').get() as { count: number }).count,
    avgVisitDuration: (d.prepare('SELECT AVG(duration) as avg FROM visits').get() as { avg: number | null }).avg || 0,
    totalContent: (d.prepare('SELECT COUNT(*) as count FROM content').get() as { count: number }).count,
    syncedContent: (d.prepare('SELECT COUNT(*) as count FROM content WHERE synced = 1').get() as { count: number }).count
  };
}

// ==================== Item Operations (mobile-style lightweight content) ====================

/**
 * Add a new item (note, tagset, or image)
 */
export function addItem(type: ItemType, options: ItemOptions = {}): { id: string } {
  const itemId = generateId('item');
  const timestamp = now();

  // Parse existing metadata and add device tracking
  let metadata: Record<string, unknown> = {};
  if (options.metadata) {
    try {
      metadata = typeof options.metadata === 'string'
        ? JSON.parse(options.metadata)
        : options.metadata;
    } catch {
      // Invalid JSON, start fresh
    }
  }

  // Add device metadata (only if not from sync - sync items preserve original metadata)
  if (!options.syncSource) {
    metadata = addDeviceMetadata(metadata, true);
  }

  const metadataJson = JSON.stringify(metadata);

  getDb().prepare(`
    INSERT INTO items (id, type, content, mimeType, metadata, syncId, syncSource, createdAt, updatedAt, deletedAt, starred, archived)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    itemId,
    type,
    options.content ?? null,
    options.mimeType || '',
    metadataJson,
    options.syncId || '',
    options.syncSource || '',
    timestamp,
    timestamp,
    options.starred || 0,
    options.archived || 0
  );

  return { id: itemId };
}

/**
 * Get an item by ID
 */
export function getItem(itemId: string): Item | null {
  const result = getDb().prepare('SELECT * FROM items WHERE id = ? AND deletedAt = 0').get(itemId);
  return (result as Item) || null;
}

/**
 * Update an existing item
 */
export function updateItem(itemId: string, options: ItemOptions): boolean {
  const timestamp = now();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (options.content !== undefined) {
    updates.push('content = ?');
    values.push(options.content);
  }
  if (options.mimeType !== undefined) {
    updates.push('mimeType = ?');
    values.push(options.mimeType);
  }
  if (options.metadata !== undefined) {
    // Get existing item to merge metadata
    const existingItem = getItem(itemId);
    let metadata: Record<string, unknown> = {};

    // Parse existing metadata
    if (existingItem && existingItem.metadata) {
      try {
        metadata = typeof existingItem.metadata === 'string'
          ? JSON.parse(existingItem.metadata)
          : existingItem.metadata;
      } catch {
        // Invalid JSON, start fresh
      }
    }

    // Parse new metadata
    let newMetadata: Record<string, unknown> = {};
    if (options.metadata) {
      try {
        newMetadata = typeof options.metadata === 'string'
          ? JSON.parse(options.metadata)
          : options.metadata;
      } catch {
        // Invalid JSON, use empty object
      }
    }

    // Merge: new metadata overwrites existing, except _sync which is merged
    metadata = { ...metadata, ...newMetadata };

    // Add device metadata for modification (only if not from sync)
    if (!options.syncSource) {
      metadata = addDeviceMetadata(metadata, false);
    }

    updates.push('metadata = ?');
    values.push(JSON.stringify(metadata));
  }
  if (options.syncId !== undefined) {
    updates.push('syncId = ?');
    values.push(options.syncId);
  }
  if (options.syncSource !== undefined) {
    updates.push('syncSource = ?');
    values.push(options.syncSource);
  }
  if (options.starred !== undefined) {
    updates.push('starred = ?');
    values.push(options.starred);
  }
  if (options.archived !== undefined) {
    updates.push('archived = ?');
    values.push(options.archived);
  }

  if (updates.length === 0) return false;

  updates.push('updatedAt = ?');
  values.push(timestamp);
  values.push(itemId);

  const result = getDb().prepare(
    `UPDATE items SET ${updates.join(', ')} WHERE id = ? AND deletedAt = 0`
  ).run(...values);

  return result.changes > 0;
}

/**
 * Soft delete an item (sets deletedAt timestamp)
 */
export function deleteItem(itemId: string): boolean {
  const timestamp = now();
  const result = getDb().prepare(
    'UPDATE items SET deletedAt = ?, updatedAt = ? WHERE id = ? AND deletedAt = 0'
  ).run(timestamp, timestamp, itemId);
  return result.changes > 0;
}

/**
 * Permanently delete an item and its tags
 */
export function hardDeleteItem(itemId: string): boolean {
  getDb().prepare('DELETE FROM item_tags WHERE itemId = ?').run(itemId);
  const result = getDb().prepare('DELETE FROM items WHERE id = ?').run(itemId);
  return result.changes > 0;
}

/**
 * Query items with optional filters
 */
export function queryItems(filter: ItemFilter = {}): Item[] {
  const conditions: string[] = [];
  const values: unknown[] = [];

  // By default, exclude soft-deleted items
  if (!filter.includeDeleted) {
    conditions.push('deletedAt = 0');
  }

  if (filter.type) {
    conditions.push('type = ?');
    values.push(filter.type);
  }
  if (filter.starred !== undefined) {
    conditions.push('starred = ?');
    values.push(filter.starred);
  }
  if (filter.archived !== undefined) {
    conditions.push('archived = ?');
    values.push(filter.archived);
  }
  if (filter.domain) {
    conditions.push('domain = ?');
    values.push(filter.domain);
  }
  if (filter.search) {
    // Search in content (URL), title, and domain
    conditions.push('(content LIKE ? OR title LIKE ? OR domain LIKE ?)');
    const searchPattern = `%${filter.search}%`;
    values.push(searchPattern, searchPattern, searchPattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Support multiple sort options
  let orderBy: string;
  switch (filter.sortBy) {
    case 'frecency':
      orderBy = 'frecencyScore DESC, lastVisitAt DESC';
      break;
    case 'lastVisit':
      orderBy = 'lastVisitAt DESC';
      break;
    case 'visitCount':
      orderBy = 'visitCount DESC';
      break;
    case 'updated':
      orderBy = 'updatedAt DESC';
      break;
    case 'created':
    default:
      orderBy = 'createdAt DESC';
  }

  const limit = filter.limit ? `LIMIT ${filter.limit}` : '';

  return getDb().prepare(
    `SELECT * FROM items ${whereClause} ORDER BY ${orderBy} ${limit}`
  ).all(...values) as Item[];
}

// ==================== Item-Tag Operations ====================

/**
 * Tag an item
 */
export function tagItem(itemId: string, tagId: string): { link: ItemTag; alreadyExists: boolean } {
  const timestamp = now();

  const existingLink = getDb().prepare(
    'SELECT * FROM item_tags WHERE itemId = ? AND tagId = ?'
  ).get(itemId, tagId) as ItemTag | undefined;

  if (existingLink) {
    return { link: existingLink, alreadyExists: true };
  }

  const linkId = generateId('item_tag');
  getDb().prepare(
    'INSERT INTO item_tags (id, itemId, tagId, createdAt) VALUES (?, ?, ?, ?)'
  ).run(linkId, itemId, tagId, timestamp);

  // Update tag frequency and frecency
  const tag = getDb().prepare('SELECT * FROM tags WHERE id = ?').get(tagId) as Tag | undefined;
  if (tag) {
    const newFrequency = (tag.frequency || 0) + 1;
    const frecencyScore = calculateFrecency(newFrequency, timestamp);
    getDb().prepare(
      'UPDATE tags SET frequency = ?, lastUsed = ?, frecencyScore = ?, updatedAt = ? WHERE id = ?'
    ).run(newFrequency, timestamp, frecencyScore, timestamp, tagId);
  }

  const newLink = getDb().prepare('SELECT * FROM item_tags WHERE id = ?').get(linkId) as ItemTag;
  return { link: newLink, alreadyExists: false };
}

/**
 * Remove a tag from an item
 */
export function untagItem(itemId: string, tagId: string): boolean {
  const result = getDb().prepare(
    'DELETE FROM item_tags WHERE itemId = ? AND tagId = ?'
  ).run(itemId, tagId);
  return result.changes > 0;
}

/**
 * Get all tags for an item
 */
export function getItemTags(itemId: string): Tag[] {
  return getDb().prepare(`
    SELECT t.* FROM tags t
    JOIN item_tags it ON t.id = it.tagId
    WHERE it.itemId = ?
  `).all(itemId) as Tag[];
}

/**
 * Get all items with a specific tag
 */
export function getItemsByTag(tagId: string): Item[] {
  return getDb().prepare(`
    SELECT i.* FROM items i
    JOIN item_tags it ON i.id = it.itemId
    WHERE it.tagId = ? AND i.deletedAt = 0
  `).all(tagId) as Item[];
}

// ==================== Item Visit Operations ====================

/**
 * Record a visit to an item. Updates visit stats and frecency score.
 */
export function recordItemVisit(itemId: string, options: ItemVisitOptions = {}): { id: string } {
  const visitId = generateId('item_visit');
  const timestamp = options.timestamp || now();
  const d = getDb();

  // Find the most recent item visit for chaining
  const prevVisit = d.prepare('SELECT id FROM item_visits ORDER BY timestamp DESC LIMIT 1').get() as { id: string } | undefined;
  const prevId = prevVisit ? prevVisit.id : null;

  d.prepare(`
    INSERT INTO item_visits (id, itemId, timestamp, duration, source, sourceId, windowType, metadata, scrollDepth, interacted, prevId, nextId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    visitId,
    itemId,
    timestamp,
    options.duration || 0,
    options.source || 'direct',
    options.sourceId || '',
    options.windowType || 'main',
    options.metadata || '{}',
    options.scrollDepth || 0,
    options.interacted || 0,
    prevId
  );

  // Update nextId on the previous visit
  if (prevId) {
    d.prepare('UPDATE item_visits SET nextId = ? WHERE id = ?').run(visitId, prevId);
  }

  // Update item visit stats and recalculate frecency
  updateItemVisitStats(itemId);

  return { id: visitId };
}

/**
 * Get visits for an item with optional filters
 */
export function getItemVisits(itemId: string, filter: ItemVisitFilter = {}): ItemVisit[] {
  let sql = 'SELECT * FROM item_visits WHERE itemId = ?';
  const params: (string | number)[] = [itemId];

  if (filter.source) {
    sql += ' AND source = ?';
    params.push(filter.source);
  }
  if (filter.since) {
    sql += ' AND timestamp >= ?';
    params.push(filter.since);
  }
  if (filter.until) {
    sql += ' AND timestamp <= ?';
    params.push(filter.until);
  }

  sql += ' ORDER BY timestamp DESC';

  if (filter.limit) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }

  return getDb().prepare(sql).all(...params) as ItemVisit[];
}

/**
 * Query item visits across all items
 */
export function queryItemVisits(filter: ItemVisitFilter = {}): ItemVisit[] {
  let sql = 'SELECT * FROM item_visits WHERE 1=1';
  const params: (string | number)[] = [];

  if (filter.itemId) {
    sql += ' AND itemId = ?';
    params.push(filter.itemId);
  }
  if (filter.source) {
    sql += ' AND source = ?';
    params.push(filter.source);
  }
  if (filter.since) {
    sql += ' AND timestamp >= ?';
    params.push(filter.since);
  }
  if (filter.until) {
    sql += ' AND timestamp <= ?';
    params.push(filter.until);
  }

  sql += ' ORDER BY timestamp DESC';

  if (filter.limit) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }

  return getDb().prepare(sql).all(...params) as ItemVisit[];
}

/**
 * Update visit count, lastVisitAt, and frecency score for an item
 */
export function updateItemVisitStats(itemId: string): void {
  const d = getDb();
  const timestamp = now();

  // Get all visits for this item
  const visits = d.prepare('SELECT timestamp, interacted, source FROM item_visits WHERE itemId = ?').all(itemId) as Array<{ timestamp: number; interacted: number; source: string }>;

  const visitCount = visits.length;
  const lastVisitAt = visits.length > 0 ? Math.max(...visits.map(v => v.timestamp)) : 0;
  const frecencyScore = calculateItemFrecency(visits);

  d.prepare('UPDATE items SET visitCount = ?, lastVisitAt = ?, frecencyScore = ?, updatedAt = ? WHERE id = ?').run(
    visitCount,
    lastVisitAt,
    frecencyScore,
    timestamp,
    itemId
  );
}

/**
 * Unified entry point for tracking navigation.
 * Finds or creates an item for the URL, then records a visit.
 * This is the main API for tracking page loads.
 */
export function trackNavigation(uri: string, options: {
  source?: string;
  sourceId?: string;
  windowType?: string;
  title?: string;
  favicon?: string;
  interacted?: number;
} = {}): { visitId: string; itemId: string; created: boolean } {
  const normalizedUri = normalizeUrl(uri);
  const parsed = parseUrl(normalizedUri);
  const d = getDb();
  let created = false;

  // Find existing item by URL
  const existing = d.prepare('SELECT id FROM items WHERE type = ? AND content = ? AND deletedAt = 0').get('url', normalizedUri) as { id: string } | undefined;

  let itemId: string;
  if (existing) {
    itemId = existing.id;
    // Update title/favicon if provided and item is missing them
    const updates: string[] = [];
    const values: unknown[] = [];

    if (options.title) {
      updates.push('title = CASE WHEN title = \'\' OR title IS NULL THEN ? ELSE title END');
      values.push(options.title);
    }
    if (options.favicon) {
      updates.push('favicon = CASE WHEN favicon = \'\' OR favicon IS NULL THEN ? ELSE favicon END');
      values.push(options.favicon);
    }

    if (updates.length > 0) {
      values.push(itemId);
      d.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
  } else {
    // Create new item for this URL
    itemId = generateId('item');
    const timestamp = now();
    created = true;

    const metadata: Record<string, unknown> = {};
    if (options.title) metadata.title = options.title;
    if (options.favicon) metadata.favicon = options.favicon;

    d.prepare(`
      INSERT INTO items (id, type, content, mimeType, metadata, syncId, syncSource, createdAt, updatedAt, deletedAt, starred, archived, visitCount, lastVisitAt, frecencyScore, title, domain, favicon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?, ?)
    `).run(
      itemId,
      'url',
      normalizedUri,
      'text/html',
      JSON.stringify(metadata),
      '',
      '',
      timestamp,
      timestamp,
      options.title || '',
      parsed.domain,
      options.favicon || ''
    );
  }

  // Record the visit
  const visit = recordItemVisit(itemId, {
    source: options.source || 'window',
    sourceId: options.sourceId || '',
    windowType: options.windowType || 'main',
    interacted: options.interacted || 0,
  });

  // Also track in legacy visits table for backward compatibility
  // (This ensures old code that queries addresses/visits still works)
  const addressResult = d.prepare('SELECT id FROM addresses WHERE uri = ?').get(normalizedUri) as { id: string } | undefined;
  if (addressResult) {
    addVisit(addressResult.id, {
      source: options.source || 'window',
      sourceId: options.sourceId || '',
      windowType: options.windowType || 'main',
    });
  }

  return { visitId: visit.id, itemId, created };
}

/**
 * Query items by frecency, optimized for history/omnibox use cases.
 * Returns URL items sorted by frecency score.
 */
export function queryItemsByFrecency(filter: {
  search?: string;
  domain?: string;
  limit?: number;
  since?: number;
} = {}): Item[] {
  const conditions: string[] = ['type = ?', 'deletedAt = 0'];
  const values: unknown[] = ['url'];

  if (filter.search) {
    conditions.push('(content LIKE ? OR title LIKE ? OR domain LIKE ?)');
    const searchPattern = `%${filter.search}%`;
    values.push(searchPattern, searchPattern, searchPattern);
  }
  if (filter.domain) {
    conditions.push('domain = ?');
    values.push(filter.domain);
  }
  if (filter.since) {
    conditions.push('lastVisitAt >= ?');
    values.push(filter.since);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const limit = filter.limit ? `LIMIT ${filter.limit}` : 'LIMIT 50';

  return getDb().prepare(
    `SELECT * FROM items ${whereClause} ORDER BY frecencyScore DESC, lastVisitAt DESC ${limit}`
  ).all(...values) as Item[];
}

/**
 * Backward compatibility: query addresses and transform to Address shape.
 * This wraps queryItems for code that still uses the old address API.
 */
export function queryAddressesCompat(filter: AddressFilter = {}): Address[] {
  // Map address filter to item filter
  const itemFilter: ItemFilter = {
    type: 'url',
  };

  if (filter.starred !== undefined) {
    itemFilter.starred = filter.starred;
  }
  if (filter.domain) {
    itemFilter.domain = filter.domain;
  }
  if (filter.limit) {
    itemFilter.limit = filter.limit;
  }

  // Map sortBy
  switch (filter.sortBy) {
    case 'lastVisit':
      itemFilter.sortBy = 'lastVisit';
      break;
    case 'visitCount':
      itemFilter.sortBy = 'visitCount';
      break;
    case 'created':
    default:
      itemFilter.sortBy = 'created';
  }

  const items = queryItems(itemFilter);

  // Transform items to Address shape
  return items.map(item => {
    const parsed = parseUrl(item.content || '');
    let metadata: Record<string, unknown> = {};
    try {
      metadata = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata || {};
    } catch { /* ignore */ }

    return {
      id: item.id,
      uri: item.content || '',
      protocol: parsed.protocol,
      domain: item.domain || parsed.domain,
      path: parsed.path,
      title: item.title || (metadata.title as string) || '',
      mimeType: item.mimeType || 'text/html',
      favicon: item.favicon || (metadata.favicon as string) || '',
      description: (metadata.description as string) || '',
      tags: '',
      metadata: item.metadata,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lastVisitAt: item.lastVisitAt,
      visitCount: item.visitCount,
      starred: item.starred,
      archived: item.archived,
    };
  });
}
