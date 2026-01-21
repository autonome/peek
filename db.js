const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || "./data";

// Connection pool - one connection per user
const connections = new Map();

function getConnection(userId) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (connections.has(userId)) {
    return connections.get(userId);
  }

  // Create user's data directory
  const userDir = path.join(DATA_DIR, userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const dbPath = path.join(userDir, "peek.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  initializeSchema(db);
  connections.set(userId, db);

  return db;
}

function initializeSchema(db) {
  // Check if we need to migrate from old schema
  const hasOldSchema = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='urls'"
  ).get();

  if (hasOldSchema) {
    migrateFromOldSchema(db);
  }

  // items table (unified: urls, texts, tagsets, images)
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('url', 'text', 'tagset', 'image')),
      content TEXT,
      metadata TEXT,
      sync_id TEXT DEFAULT '',
      sync_source TEXT DEFAULT '',
      synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
    CREATE INDEX IF NOT EXISTS idx_items_content ON items(content);
    CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);
  `);

  // Migration: add metadata column and update CHECK constraint if needed
  migrateToImageSupport(db);

  // Migration: add sync columns if needed (creates idx_items_sync_id)
  migrateSyncColumns(db);

  // Migration: remove existing duplicates (can remove after deployed)
  migrateRemoveDuplicates(db);

  // tags table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      frequency INTEGER NOT NULL DEFAULT 0,
      last_used TEXT NOT NULL,
      frecency_score REAL NOT NULL DEFAULT 0.0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
    CREATE INDEX IF NOT EXISTS idx_tags_frecency ON tags(frecency_score DESC);
  `);

  // item_tags junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS item_tags (
      item_id TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (item_id, tag_id),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
  `);

  // settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Enable foreign keys
  db.pragma("foreign_keys = ON");
}

function migrateFromOldSchema(db) {
  console.log("Migrating database from old schema...");

  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('url', 'text', 'tagset')),
      content TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);

  db.exec(`
    INSERT INTO items (id, type, content, created_at, updated_at, deleted_at)
    SELECT id, 'url', url, created_at, updated_at, deleted_at FROM urls;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS item_tags (
      item_id TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (item_id, tag_id),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
  `);

  const hasUrlTags = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='url_tags'"
  ).get();

  if (hasUrlTags) {
    db.exec(`
      INSERT INTO item_tags (item_id, tag_id, created_at)
      SELECT url_id, tag_id, created_at FROM url_tags;
    `);
    db.exec("DROP TABLE url_tags;");
  }

  db.exec("DROP TABLE urls;");

  console.log("Migration complete.");
}

function migrateToImageSupport(db) {
  // Check if metadata column exists
  const tableInfo = db.prepare("PRAGMA table_info(items)").all();
  const hasMetadata = tableInfo.some((col) => col.name === "metadata");

  if (!hasMetadata) {
    console.log("Adding metadata column to items table...");
    db.exec("ALTER TABLE items ADD COLUMN metadata TEXT");
  }

  // Check if 'image' type is allowed in CHECK constraint
  // SQLite doesn't allow modifying CHECK constraints, so we need to recreate the table
  const sqlMaster = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'"
  ).get();

  if (sqlMaster && !sqlMaster.sql.includes("'image'")) {
    console.log("Updating items table to support image type...");

    db.exec(`
      CREATE TABLE items_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('url', 'text', 'tagset', 'image')),
        content TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      INSERT INTO items_new (id, type, content, metadata, created_at, updated_at, deleted_at)
      SELECT id, type, content, metadata, created_at, updated_at, deleted_at FROM items;

      DROP TABLE items;
      ALTER TABLE items_new RENAME TO items;

      CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
      CREATE INDEX IF NOT EXISTS idx_items_content ON items(content);
      CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);
    `);

    console.log("Image support migration complete.");
  }
}

function migrateSyncColumns(db) {
  // Check if sync columns exist
  const tableInfo = db.prepare("PRAGMA table_info(items)").all();
  const hasSyncId = tableInfo.some((col) => col.name === "sync_id");

  if (!hasSyncId) {
    console.log("Adding sync columns to items table...");
    try {
      db.exec("ALTER TABLE items ADD COLUMN sync_id TEXT DEFAULT ''");
      db.exec("ALTER TABLE items ADD COLUMN sync_source TEXT DEFAULT ''");
      db.exec("ALTER TABLE items ADD COLUMN synced_at TEXT");
      console.log("Sync columns migration complete.");
    } catch (error) {
      console.log("Sync columns migration:", error.message);
    }
  }

  // Always ensure index exists (safe to run after columns exist)
  db.exec("CREATE INDEX IF NOT EXISTS idx_items_sync_id ON items(sync_id)");
}

function migrateRemoveDuplicates(db) {
  // Find and soft-delete duplicate items (same type+content, keeping oldest)
  // This is a one-time cleanup that can be removed after running on all DBs

  const duplicates = db.prepare(`
    SELECT id, type, content, created_at
    FROM items
    WHERE deleted_at IS NULL
      AND content IS NOT NULL
      AND type != 'tagset'
    ORDER BY type, content, created_at ASC
  `).all();

  const seen = new Map(); // key: "type|content" -> oldest id
  const toDelete = [];

  for (const item of duplicates) {
    const key = `${item.type}|${item.content}`;
    if (seen.has(key)) {
      // This is a duplicate - mark for deletion
      toDelete.push(item.id);
    } else {
      // First occurrence - keep it
      seen.set(key, item.id);
    }
  }

  if (toDelete.length > 0) {
    const timestamp = new Date().toISOString();
    const deleteStmt = db.prepare(
      "UPDATE items SET deleted_at = ? WHERE id = ?"
    );

    for (const id of toDelete) {
      deleteStmt.run(timestamp, id);
    }

    console.log(`Cleaned up ${toDelete.length} duplicate items`);
  }
}

function generateUUID() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function calculateFrecency(frequency, lastUsed) {
  const lastUsedDate = new Date(lastUsed);
  const daysSinceUse = (Date.now() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24);
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
      UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ?
      WHERE id = ?
    `).run(newFrequency, timestamp, frecencyScore, timestamp, existing.id);
    return existing.id;
  } else {
    const frecencyScore = calculateFrecency(1, timestamp);
    const result = conn.prepare(`
      INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at)
      VALUES (?, 1, ?, ?, ?, ?)
    `).run(name, timestamp, frecencyScore, timestamp, timestamp);
    return result.lastInsertRowid;
  }
}

// Unified save function for all item types
function saveItem(userId, type, content, tags = [], metadata = null, syncId = null) {
  const conn = getConnection(userId);
  const timestamp = now();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  let itemId;

  // FIRST: Check for existing item by sync_id (if provided)
  if (syncId) {
    const existingBySyncId = conn.prepare(
      "SELECT id FROM items WHERE sync_id = ? AND deleted_at IS NULL"
    ).get(syncId);

    if (existingBySyncId) {
      itemId = existingBySyncId.id;
      // Update existing item
      if (metadataJson) {
        conn.prepare("UPDATE items SET updated_at = ?, metadata = ? WHERE id = ?")
          .run(timestamp, metadataJson, itemId);
      } else {
        conn.prepare("UPDATE items SET updated_at = ? WHERE id = ?")
          .run(timestamp, itemId);
      }
      conn.prepare("DELETE FROM item_tags WHERE item_id = ?").run(itemId);
    }
  }

  // SECOND: Content-based deduplication (existing logic)
  if (!itemId && type !== "tagset" && content) {
    const existing = conn.prepare(
      "SELECT id FROM items WHERE type = ? AND content = ? AND deleted_at IS NULL"
    ).get(type, content);

    if (existing) {
      itemId = existing.id;
      // Update metadata if provided, otherwise keep existing
      if (metadataJson) {
        conn.prepare("UPDATE items SET updated_at = ?, metadata = ? WHERE id = ?").run(timestamp, metadataJson, itemId);
      } else {
        conn.prepare("UPDATE items SET updated_at = ? WHERE id = ?").run(timestamp, itemId);
      }
      conn.prepare("DELETE FROM item_tags WHERE item_id = ?").run(itemId);
      // Also update sync_id if we're matching by content but have a new syncId
      if (syncId) {
        conn.prepare("UPDATE items SET sync_id = ? WHERE id = ?").run(syncId, itemId);
      }
    }
  }

  // THIRD: Create new item with sync_id stored
  if (!itemId) {
    itemId = generateUUID();
    conn.prepare(`
      INSERT INTO items (id, type, content, metadata, sync_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(itemId, type, content, metadataJson, syncId || '', timestamp, timestamp);
  }

  for (const tagName of tags) {
    const tagId = getOrCreateTagWithConn(conn, tagName, timestamp);
    conn.prepare(`
      INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at)
      VALUES (?, ?, ?)
    `).run(itemId, tagId, timestamp);
  }

  return itemId;
}

function saveUrl(userId, url, tags = [], metadata = null) {
  return saveItem(userId, "url", url, tags, metadata);
}

function saveText(userId, content, tags = [], metadata = null) {
  return saveItem(userId, "text", content, tags, metadata);
}

function saveTagset(userId, tags = [], metadata = null) {
  return saveItem(userId, "tagset", null, tags, metadata);
}

function getItems(userId, type = null) {
  const conn = getConnection(userId);

  let query = `
    SELECT id, type, content, metadata, created_at, updated_at
    FROM items
    WHERE deleted_at IS NULL
  `;
  const params = [];

  if (type) {
    query += " AND type = ?";
    params.push(type);
  }

  query += " ORDER BY created_at DESC";

  const items = conn.prepare(query).all(...params);

  const getTagsStmt = conn.prepare(`
    SELECT t.name
    FROM tags t
    JOIN item_tags it ON t.id = it.tag_id
    WHERE it.item_id = ?
  `);

  return items.map((row) => {
    const result = {
      id: row.id,
      type: row.type,
      content: row.content,
      created_at: row.created_at,
      updated_at: row.updated_at,
      tags: getTagsStmt.all(row.id).map((t) => t.name),
    };
    if (row.metadata) {
      result.metadata = JSON.parse(row.metadata);
    }
    return result;
  });
}

function getSavedUrls(userId) {
  return getItems(userId, "url").map((item) => {
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

function getTexts(userId) {
  return getItems(userId, "text").map((item) => {
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

function getTagsets(userId) {
  return getItems(userId, "tagset").map((item) => {
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

function getTagsByFrecency(userId) {
  const conn = getConnection(userId);

  return conn.prepare(`
    SELECT name, frequency, last_used, frecency_score
    FROM tags
    ORDER BY frecency_score DESC
  `).all();
}

function deleteItem(userId, id) {
  const conn = getConnection(userId);
  conn.prepare("DELETE FROM items WHERE id = ?").run(id);
}

function deleteUrl(userId, id) {
  return deleteItem(userId, id);
}

function updateItemTags(userId, id, tags) {
  const conn = getConnection(userId);
  const timestamp = now();

  conn.prepare("DELETE FROM item_tags WHERE item_id = ?").run(id);

  for (const tagName of tags) {
    const tagId = getOrCreateTagWithConn(conn, tagName, timestamp);
    conn.prepare(`
      INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at)
      VALUES (?, ?, ?)
    `).run(id, tagId, timestamp);
  }

  conn.prepare("UPDATE items SET updated_at = ? WHERE id = ?").run(timestamp, id);
}

function updateUrlTags(userId, id, tags) {
  return updateItemTags(userId, id, tags);
}

function getSetting(userId, key) {
  const conn = getConnection(userId);
  const row = conn.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setSetting(userId, key, value) {
  const conn = getConnection(userId);
  conn.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

function closeAllConnections() {
  for (const [userId, conn] of connections) {
    conn.close();
  }
  connections.clear();
}

function closeConnection(userId) {
  if (connections.has(userId)) {
    connections.get(userId).close();
    connections.delete(userId);
  }
}

// === Image functions ===

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

function getUserImagesDir(userId) {
  const userDir = path.join(DATA_DIR, userId);
  return path.join(userDir, "images");
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

function saveImage(userId, filename, buffer, mimeType, tags = []) {
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`Image exceeds maximum size of ${MAX_IMAGE_SIZE / 1024 / 1024} MB`);
  }

  if (!mimeType.startsWith("image/")) {
    throw new Error("Invalid MIME type: must be an image");
  }

  const conn = getConnection(userId);
  const timestamp = now();

  // Compute hash for deduplication
  const hash = hashBuffer(buffer);
  const ext = getExtensionFromMime(mimeType);
  const imageFilename = `${hash}.${ext}`;

  // Ensure images directory exists
  const imagesDir = getUserImagesDir(userId);
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const imagePath = path.join(imagesDir, imageFilename);

  // Write file only if it doesn't exist (deduplication)
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
    INSERT INTO items (id, type, content, metadata, created_at, updated_at)
    VALUES (?, 'image', ?, ?, ?, ?)
  `).run(itemId, filename, metadata, timestamp, timestamp);

  // Add tags
  for (const tagName of tags) {
    const tagId = getOrCreateTagWithConn(conn, tagName, timestamp);
    conn.prepare(`
      INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at)
      VALUES (?, ?, ?)
    `).run(itemId, tagId, timestamp);
  }

  return itemId;
}

function getImages(userId) {
  const conn = getConnection(userId);

  const items = conn.prepare(`
    SELECT id, content, metadata, created_at, updated_at
    FROM items
    WHERE type = 'image' AND deleted_at IS NULL
    ORDER BY created_at DESC
  `).all();

  const getTagsStmt = conn.prepare(`
    SELECT t.name
    FROM tags t
    JOIN item_tags it ON t.id = it.tag_id
    WHERE it.item_id = ?
  `);

  return items.map((row) => {
    const metadata = row.metadata ? JSON.parse(row.metadata) : {};
    return {
      id: row.id,
      filename: row.content,
      mime: metadata.mime,
      size: metadata.size,
      created_at: row.created_at,
      updated_at: row.updated_at,
      tags: getTagsStmt.all(row.id).map((t) => t.name),
    };
  });
}

function getImageById(userId, itemId) {
  const conn = getConnection(userId);

  const row = conn.prepare(`
    SELECT id, content, metadata, created_at, updated_at
    FROM items
    WHERE id = ? AND type = 'image' AND deleted_at IS NULL
  `).get(itemId);

  if (!row) return null;

  const metadata = row.metadata ? JSON.parse(row.metadata) : {};
  return {
    id: row.id,
    filename: row.content,
    metadata: metadata,
  };
}

function getImagePath(userId, itemId) {
  const image = getImageById(userId, itemId);
  if (!image || !image.metadata.hash) return null;

  const imagesDir = getUserImagesDir(userId);
  return path.join(imagesDir, `${image.metadata.hash}.${image.metadata.ext}`);
}

function deleteImage(userId, itemId) {
  const conn = getConnection(userId);

  // Get image metadata before deleting
  const image = getImageById(userId, itemId);
  if (!image) return;

  const hash = image.metadata?.hash;
  const ext = image.metadata?.ext;

  // Delete the item record
  conn.prepare("DELETE FROM items WHERE id = ?").run(itemId);

  // Check if any other items reference the same file
  if (hash) {
    const othersWithSameHash = conn.prepare(`
      SELECT id FROM items
      WHERE type = 'image' AND metadata LIKE ? AND deleted_at IS NULL
    `).get(`%"hash":"${hash}"%`);

    // Only delete file if no other items reference it
    if (!othersWithSameHash) {
      const imagesDir = getUserImagesDir(userId);
      const imagePath = path.join(imagesDir, `${hash}.${ext}`);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
  }
}

/**
 * Get items modified since a given timestamp
 * Used for incremental sync - returns items where updated_at > timestamp
 */
function getItemsSince(userId, timestamp, type = null) {
  const conn = getConnection(userId);

  let query = `
    SELECT id, type, content, metadata, created_at, updated_at
    FROM items
    WHERE deleted_at IS NULL AND updated_at > ?
  `;
  const params = [timestamp];

  if (type) {
    query += " AND type = ?";
    params.push(type);
  }

  query += " ORDER BY updated_at ASC";

  const items = conn.prepare(query).all(...params);

  const getTagsStmt = conn.prepare(`
    SELECT t.name
    FROM tags t
    JOIN item_tags it ON t.id = it.tag_id
    WHERE it.item_id = ?
  `);

  return items.map((row) => {
    const result = {
      id: row.id,
      type: row.type,
      content: row.content,
      created_at: row.created_at,
      updated_at: row.updated_at,
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
function getItemById(userId, itemId) {
  const conn = getConnection(userId);

  const row = conn.prepare(`
    SELECT id, type, content, metadata, created_at, updated_at
    FROM items
    WHERE id = ? AND deleted_at IS NULL
  `).get(itemId);

  if (!row) return null;

  const getTagsStmt = conn.prepare(`
    SELECT t.name
    FROM tags t
    JOIN item_tags it ON t.id = it.tag_id
    WHERE it.item_id = ?
  `);

  const result = {
    id: row.id,
    type: row.type,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
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
