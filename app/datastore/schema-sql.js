// SQL Schema definitions for direct SQLite
// Converted from TinyBase schema.js

export const createTableStatements = `
  -- Addresses: URLs with metadata
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

  -- Visits: Navigation history linked to addresses
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

  -- Content: User-created content (notes, etc.)
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

  -- Tags: Tag definitions with frecency tracking
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

  -- Address-Tag join table
  CREATE TABLE IF NOT EXISTS address_tags (
    id TEXT PRIMARY KEY,
    addressId TEXT NOT NULL,
    tagId TEXT NOT NULL,
    createdAt INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_address_tags_addressId ON address_tags(addressId);
  CREATE INDEX IF NOT EXISTS idx_address_tags_tagId ON address_tags(tagId);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_address_tags_unique ON address_tags(addressId, tagId);

  -- Blobs: Binary files/media
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

  -- Scripts data: Script execution results
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

  -- Feeds: Feed definitions
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

  -- Extensions: Extension registry
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

  -- Extension settings: Key-value storage for extension preferences
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

// List of all tables for validation and iteration
export const tableNames = [
  'addresses',
  'visits',
  'content',
  'tags',
  'address_tags',
  'blobs',
  'scripts_data',
  'feeds',
  'extensions',
  'extension_settings'
];
