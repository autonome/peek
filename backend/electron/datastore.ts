/**
 * Electron backend - SQLite datastore
 *
 * Simple module with database functions for Electron's main process.
 * Uses better-sqlite3 for synchronous SQLite access.
 */

import Database from 'better-sqlite3';
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
} from '../types/index.js';
import { tableNames } from '../types/index.js';

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
    lastUsedAt INTEGER DEFAULT 0,
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
`;

// Module state
let db: Database.Database | null = null;

// ==================== Lifecycle ====================

export function initDatabase(dbPath: string): Database.Database {
  console.log('main', 'initializing database at:', dbPath);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(createTableStatements);

  migrateTinyBaseData();

  console.log('main', 'database initialized successfully');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('main', 'database closed');
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

export function calculateFrecency(frequency: number, lastUsedAt: number): number {
  const currentTime = Date.now();
  const daysSinceUse = (currentTime - lastUsedAt) / (1000 * 60 * 60 * 24);
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
    console.log('main', 'TinyBase data already migrated, skipping');
    return;
  }

  console.log('main', 'Migrating TinyBase data to direct tables...');

  try {
    const tinybaseRow = db.prepare('SELECT * FROM tinybase').get() as Record<string, unknown> | undefined;
    if (!tinybaseRow) {
      console.log('main', 'No TinyBase data found');
      return;
    }

    const rawData = Object.values(tinybaseRow)[1] as string;
    if (!rawData) {
      console.log('main', 'TinyBase data is empty');
      return;
    }

    const [tables] = JSON.parse(rawData) as [Record<string, Record<string, Record<string, unknown>>>];
    if (!tables) {
      console.log('main', 'No tables in TinyBase data');
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

      console.log('main', `  Migrating ${entries.length} rows from ${tableName}`);

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
    console.log('main', 'TinyBase migration complete, removed tinybase table');
  } catch (error) {
    console.error('main', 'TinyBase migration failed:', (error as Error).message);
  }
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

  getDb().prepare(`
    INSERT INTO visits (id, addressId, timestamp, duration, source, sourceId, windowType, metadata, scrollDepth, interacted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    options.interacted || 0
  );

  // Update address visit stats
  getDb().prepare(`
    UPDATE addresses SET lastVisitAt = ?, visitCount = visitCount + 1, updatedAt = ?
    WHERE id = ?
  `).run(timestamp, timestamp, addressId);

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

  sql += ' ORDER BY timestamp DESC';

  if (filter.limit) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }

  return getDb().prepare(sql).all(...params) as Visit[];
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
    INSERT INTO tags (id, name, slug, color, parentId, description, metadata, createdAt, updatedAt, frequency, lastUsedAt, frecencyScore)
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
    getDb().prepare('UPDATE tags SET frequency = ?, lastUsedAt = ?, frecencyScore = ?, updatedAt = ? WHERE id = ?')
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
    frecencyScore: calculateFrecency(tag.frequency || 0, tag.lastUsedAt || 0)
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
