const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { DATASTORE_VERSION } = require("./version");

const DATA_DIR = process.env.DATA_DIR || "./data";

// Connection pool - one connection per user:profile
const connections = new Map();

function getConnection(userId, profileId = "default") {
  if (!userId) {
    throw new Error("userId is required");
  }

  const connectionKey = `${userId}:${profileId}`;

  if (connections.has(connectionKey)) {
    return connections.get(connectionKey);
  }

  // Create user's profile directory
  const profileDir = path.join(DATA_DIR, userId, "profiles", profileId);
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const dbPath = path.join(profileDir, "datastore.sqlite");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  initializeSchema(db);
  connections.set(connectionKey, db);

  return db;
}

function initializeSchema(db) {
  // Canonical camelCase schema — matches sync engine
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('url', 'text', 'tagset', 'image')),
      content TEXT,
      metadata TEXT,
      syncId TEXT DEFAULT '',
      syncSource TEXT DEFAULT '',
      syncedAt INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      deletedAt INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
    CREATE INDEX IF NOT EXISTS idx_items_syncId ON items(syncId);
    CREATE INDEX IF NOT EXISTS idx_items_deletedAt ON items(deletedAt);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      frequency INTEGER DEFAULT 1,
      lastUsedAt INTEGER NOT NULL,
      frecencyScore REAL DEFAULT 0.0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
    CREATE INDEX IF NOT EXISTS idx_tags_frecency ON tags(frecencyScore DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS item_tags (
      itemId TEXT NOT NULL,
      tagId TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (itemId, tagId)
    );
    CREATE INDEX IF NOT EXISTS idx_item_tags_itemId ON item_tags(itemId);
    CREATE INDEX IF NOT EXISTS idx_item_tags_tagId ON item_tags(tagId);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Write datastore version after schema init
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    "datastore_version",
    String(DATASTORE_VERSION)
  );
}

function generateUUID() {
  return crypto.randomUUID();
}

function now() {
  return Date.now();
}

function calculateFrecency(frequency, lastUsedAt) {
  const daysSinceUse = (Date.now() - lastUsedAt) / (1000 * 60 * 60 * 24);
  const decayFactor = 1.0 / (1.0 + daysSinceUse / 7.0);
  return frequency * 10.0 * decayFactor;
}

// Internal helper - needs conn passed directly
function getOrCreateTagWithConn(conn, name, timestamp) {
  const existing = conn.prepare("SELECT id, frequency FROM tags WHERE name = ?").get(name);

  if (existing) {
    const newFrequency = existing.frequency + 1;
    const frecencyScore = calculateFrecency(newFrequency, timestamp);
    conn.prepare(`
      UPDATE tags SET frequency = ?, lastUsedAt = ?, frecencyScore = ?, updatedAt = ?
      WHERE id = ?
    `).run(newFrequency, timestamp, frecencyScore, timestamp, existing.id);
    return existing.id;
  } else {
    const tagId = generateUUID();
    const frecencyScore = calculateFrecency(1, timestamp);
    conn.prepare(`
      INSERT INTO tags (id, name, frequency, lastUsedAt, frecencyScore, createdAt, updatedAt)
      VALUES (?, ?, 1, ?, ?, ?, ?)
    `).run(tagId, name, timestamp, frecencyScore, timestamp, timestamp);
    return tagId;
  }
}

// Unified save function for all item types
function saveItem(userId, type, content, tags = [], metadata = null, syncId = null, profileId = "default") {
  const conn = getConnection(userId, profileId);
  const timestamp = now();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  let itemId;

  if (syncId) {
    // Sync path: match by syncId only. No content-based fallback — syncId is canonical.

    // Check if syncId matches a server item by its own ID (client sends server ID on re-push)
    const existingById = conn.prepare(
      "SELECT id FROM items WHERE id = ? AND deletedAt = 0"
    ).get(syncId);

    if (existingById) {
      itemId = existingById.id;
    }

    // Check syncId column (client's local ID from first push)
    if (!itemId) {
      const existingBySyncId = conn.prepare(
        "SELECT id FROM items WHERE syncId = ? AND deletedAt = 0"
      ).get(syncId);

      if (existingBySyncId) {
        itemId = existingBySyncId.id;
      }
    }

    // Update matched item with full content from client
    if (itemId) {
      conn.prepare(
        "UPDATE items SET type = ?, content = ?, metadata = COALESCE(?, metadata), updatedAt = ? WHERE id = ?"
      ).run(type, content, metadataJson, timestamp, itemId);
      conn.prepare("DELETE FROM item_tags WHERE itemId = ?").run(itemId);
    }
  }

  // No content-based dedup — always create new item if no syncId match

  // Create new item if no match found
  if (!itemId) {
    itemId = generateUUID();
    conn.prepare(`
      INSERT INTO items (id, type, content, metadata, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt)
      VALUES (?, ?, ?, ?, ?, '', 0, ?, ?, 0)
    `).run(itemId, type, content, metadataJson, syncId || '', timestamp, timestamp);
  }

  for (const tagName of tags) {
    const tagId = getOrCreateTagWithConn(conn, tagName, timestamp);
    conn.prepare(`
      INSERT OR IGNORE INTO item_tags (itemId, tagId, createdAt)
      VALUES (?, ?, ?)
    `).run(itemId, tagId, timestamp);
  }

  return itemId;
}

function saveUrl(userId, url, tags = [], metadata = null, profileId = "default") {
  return saveItem(userId, "url", url, tags, metadata, null, profileId);
}

function saveText(userId, content, tags = [], metadata = null, profileId = "default") {
  return saveItem(userId, "text", content, tags, metadata, null, profileId);
}

function saveTagset(userId, tags = [], metadata = null, profileId = "default") {
  return saveItem(userId, "tagset", null, tags, metadata, null, profileId);
}

function getItems(userId, type = null, profileId = "default") {
  const conn = getConnection(userId, profileId);

  let query = `
    SELECT id, type, content, metadata, createdAt, updatedAt
    FROM items
    WHERE deletedAt = 0
  `;
  const params = [];

  if (type) {
    query += " AND type = ?";
    params.push(type);
  }

  query += " ORDER BY createdAt DESC";

  const items = conn.prepare(query).all(...params);

  const getTagsStmt = conn.prepare(`
    SELECT t.name
    FROM tags t
    JOIN item_tags it ON t.id = it.tagId
    WHERE it.itemId = ?
  `);

  return items.map((row) => {
    const result = {
      id: row.id,
      type: row.type,
      content: row.content,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      tags: getTagsStmt.all(row.id).map((t) => t.name),
    };
    if (row.metadata) {
      result.metadata = JSON.parse(row.metadata);
    }
    return result;
  });
}

function getSavedUrls(userId, profileId = "default") {
  return getItems(userId, "url", profileId).map((item) => {
    const result = {
      id: item.id,
      url: item.content,
      saved_at: item.created_at,
      tags: item.tags,
    };
    if (item.metadata) result.metadata = item.metadata;
    return result;
  });
}

function getTexts(userId, profileId = "default") {
  return getItems(userId, "text", profileId).map((item) => {
    const result = {
      id: item.id,
      content: item.content,
      created_at: item.created_at,
      updated_at: item.updated_at,
      tags: item.tags,
    };
    if (item.metadata) result.metadata = item.metadata;
    return result;
  });
}

function getTagsets(userId, profileId = "default") {
  return getItems(userId, "tagset", profileId).map((item) => {
    const result = {
      id: item.id,
      created_at: item.created_at,
      updated_at: item.updated_at,
      tags: item.tags,
    };
    if (item.metadata) result.metadata = item.metadata;
    return result;
  });
}

function getTagsByFrecency(userId, profileId = "default") {
  const conn = getConnection(userId, profileId);

  return conn.prepare(`
    SELECT name, frequency, lastUsedAt, frecencyScore
    FROM tags
    ORDER BY frecencyScore DESC
  `).all();
}

function deleteItem(userId, id, profileId = "default") {
  const conn = getConnection(userId, profileId);
  conn.prepare("DELETE FROM items WHERE id = ?").run(id);
}

function deleteUrl(userId, id, profileId = "default") {
  return deleteItem(userId, id, profileId);
}

function updateItemTags(userId, id, tags, profileId = "default") {
  const conn = getConnection(userId, profileId);
  const timestamp = now();

  conn.prepare("DELETE FROM item_tags WHERE itemId = ?").run(id);

  for (const tagName of tags) {
    const tagId = getOrCreateTagWithConn(conn, tagName, timestamp);
    conn.prepare(`
      INSERT OR IGNORE INTO item_tags (itemId, tagId, createdAt)
      VALUES (?, ?, ?)
    `).run(id, tagId, timestamp);
  }

  conn.prepare("UPDATE items SET updatedAt = ? WHERE id = ?").run(timestamp, id);
}

function updateUrlTags(userId, id, tags, profileId = "default") {
  return updateItemTags(userId, id, tags, profileId);
}

function getSetting(userId, key, profileId = "default") {
  const conn = getConnection(userId, profileId);
  const row = conn.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setSetting(userId, key, value, profileId = "default") {
  const conn = getConnection(userId, profileId);
  conn.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

function closeAllConnections() {
  for (const [userId, conn] of connections) {
    conn.close();
  }
  connections.clear();
}

function closeConnection(userId, profileId = "default") {
  const connectionKey = `${userId}:${profileId}`;
  if (connections.has(connectionKey)) {
    connections.get(connectionKey).close();
    connections.delete(connectionKey);
  }
}

// === Image functions ===

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

function getUserImagesDir(userId, profileId = "default") {
  const profileDir = path.join(DATA_DIR, userId, "profiles", profileId);
  return path.join(profileDir, "images");
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function getExtensionFromMime(mimeType) {
  const mimeToExt = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  return mimeToExt[mimeType] || "bin";
}

function saveImage(userId, filename, buffer, mimeType, tags = [], profileId = "default") {
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`Image exceeds maximum size of ${MAX_IMAGE_SIZE / 1024 / 1024} MB`);
  }

  if (!mimeType.startsWith("image/")) {
    throw new Error("Invalid MIME type: must be an image");
  }

  const conn = getConnection(userId, profileId);
  const timestamp = now();

  // Compute hash for file deduplication (not item dedup)
  const hash = hashBuffer(buffer);
  const ext = getExtensionFromMime(mimeType);
  const imageFilename = `${hash}.${ext}`;

  // Ensure images directory exists
  const imagesDir = getUserImagesDir(userId, profileId);
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const imagePath = path.join(imagesDir, imageFilename);

  // Write file only if it doesn't exist (file-level dedup)
  if (!fs.existsSync(imagePath)) {
    fs.writeFileSync(imagePath, buffer);
  }

  // Create item record
  const itemId = generateUUID();
  const metadata = JSON.stringify({
    mime: mimeType,
    size: buffer.length,
    hash: hash,
    ext: ext,
  });

  conn.prepare(`
    INSERT INTO items (id, type, content, metadata, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt)
    VALUES (?, 'image', ?, ?, '', '', 0, ?, ?, 0)
  `).run(itemId, filename, metadata, timestamp, timestamp);

  // Add tags
  for (const tagName of tags) {
    const tagId = getOrCreateTagWithConn(conn, tagName, timestamp);
    conn.prepare(`
      INSERT OR IGNORE INTO item_tags (itemId, tagId, createdAt)
      VALUES (?, ?, ?)
    `).run(itemId, tagId, timestamp);
  }

  return itemId;
}

function getImages(userId, profileId = "default") {
  const conn = getConnection(userId, profileId);

  const items = conn.prepare(`
    SELECT id, content, metadata, createdAt, updatedAt
    FROM items
    WHERE type = 'image' AND deletedAt = 0
    ORDER BY createdAt DESC
  `).all();

  const getTagsStmt = conn.prepare(`
    SELECT t.name
    FROM tags t
    JOIN item_tags it ON t.id = it.tagId
    WHERE it.itemId = ?
  `);

  return items.map((row) => {
    const metadata = row.metadata ? JSON.parse(row.metadata) : {};
    return {
      id: row.id,
      filename: row.content,
      mime: metadata.mime,
      size: metadata.size,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      tags: getTagsStmt.all(row.id).map((t) => t.name),
    };
  });
}

function getImageById(userId, itemId, profileId = "default") {
  const conn = getConnection(userId, profileId);

  const row = conn.prepare(`
    SELECT id, content, metadata, createdAt, updatedAt
    FROM items
    WHERE id = ? AND type = 'image' AND deletedAt = 0
  `).get(itemId);

  if (!row) return null;

  const metadata = row.metadata ? JSON.parse(row.metadata) : {};
  return {
    id: row.id,
    filename: row.content,
    metadata: metadata,
  };
}

function getImagePath(userId, itemId, profileId = "default") {
  const image = getImageById(userId, itemId, profileId);
  if (!image || !image.metadata.hash) return null;

  const imagesDir = getUserImagesDir(userId, profileId);
  return path.join(imagesDir, `${image.metadata.hash}.${image.metadata.ext}`);
}

function deleteImage(userId, itemId, profileId = "default") {
  const conn = getConnection(userId, profileId);

  // Get image metadata before deleting
  const image = getImageById(userId, itemId, profileId);
  if (!image) return;

  const hash = image.metadata?.hash;
  const ext = image.metadata?.ext;

  // Delete the item record
  conn.prepare("DELETE FROM items WHERE id = ?").run(itemId);

  // Check if any other items reference the same file
  if (hash) {
    const othersWithSameHash = conn.prepare(`
      SELECT id FROM items
      WHERE type = 'image' AND metadata LIKE ? AND deletedAt = 0
    `).get(`%"hash":"${hash}"%`);

    // Only delete file if no other items reference it
    if (!othersWithSameHash) {
      const imagesDir = getUserImagesDir(userId, profileId);
      const imagePath = path.join(imagesDir, `${hash}.${ext}`);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
  }
}

/**
 * Get items modified since a given timestamp
 * Used for incremental sync - returns items where updatedAt > timestamp
 */
function getItemsSince(userId, timestamp, type = null, profileId = "default") {
  const conn = getConnection(userId, profileId);

  let query = `
    SELECT id, type, content, metadata, createdAt, updatedAt
    FROM items
    WHERE deletedAt = 0 AND updatedAt > ?
  `;
  const params = [timestamp];

  if (type) {
    query += " AND type = ?";
    params.push(type);
  }

  query += " ORDER BY updatedAt ASC";

  const items = conn.prepare(query).all(...params);

  const getTagsStmt = conn.prepare(`
    SELECT t.name
    FROM tags t
    JOIN item_tags it ON t.id = it.tagId
    WHERE it.itemId = ?
  `);

  return items.map((row) => {
    const result = {
      id: row.id,
      type: row.type,
      content: row.content,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      tags: getTagsStmt.all(row.id).map((t) => t.name),
    };
    if (row.metadata) {
      result.metadata = JSON.parse(row.metadata);
    }
    return result;
  });
}

/**
 * Get a single item by ID
 */
function getItemById(userId, itemId, profileId = "default") {
  const conn = getConnection(userId, profileId);

  const row = conn.prepare(`
    SELECT id, type, content, metadata, createdAt, updatedAt
    FROM items
    WHERE id = ? AND deletedAt = 0
  `).get(itemId);

  if (!row) return null;

  const getTagsStmt = conn.prepare(`
    SELECT t.name
    FROM tags t
    JOIN item_tags it ON t.id = it.tagId
    WHERE it.itemId = ?
  `);

  const result = {
    id: row.id,
    type: row.type,
    content: row.content,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    tags: getTagsStmt.all(row.id).map((t) => t.name),
  };
  if (row.metadata) {
    result.metadata = JSON.parse(row.metadata);
  }
  return result;
}

module.exports = {
  getConnection,
  closeAllConnections,
  closeConnection,
  // Unified functions
  saveItem,
  getItems,
  getItemsSince,
  getItemById,
  deleteItem,
  updateItemTags,
  // Type-specific helpers
  saveText,
  saveTagset,
  getTexts,
  getTagsets,
  // Image functions
  saveImage,
  getImages,
  getImageById,
  getImagePath,
  deleteImage,
  MAX_IMAGE_SIZE,
  // Backward-compatible (URLs)
  saveUrl,
  getSavedUrls,
  deleteUrl,
  updateUrlTags,
  // Other
  getTagsByFrecency,
  getSetting,
  setSetting,
};
