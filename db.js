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

/**
 * Rename snake_case columns to camelCase if the old names exist.
 * SQLite 3.25+ supports ALTER TABLE RENAME COLUMN.
 */
function migrateColumns(db, table, renames) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  for (const [oldName, newName] of Object.entries(renames)) {
    if (cols.includes(oldName) && !cols.includes(newName)) {
      try {
        db.exec(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`);
      } catch (error) {
        console.error(`[schema] Failed to rename ${table}.${oldName} → ${newName}: ${error.message}`);
      }
    }
  }
}

/**
 * Convert TEXT timestamp values to INTEGER (Unix ms).
 * Production databases from older schema versions stored timestamps as TEXT
 * (ISO 8601 strings or stringified numbers). SQLite preserved TEXT affinity
 * after column rename, so values like "2026-01-27T21:12:47.876Z" and
 * "1769559596439.0" need conversion to proper integers for comparisons
 * and client compatibility (Rust/serde expects integers).
 *
 * Handles both camelCase and snake_case column names — safe to call before
 * or after migrateColumns renames them.
 */
function migrateTimestamps(db, table, columns) {
  const actualCols = new Set(
    db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
  );
  for (const col of columns) {
    // If the camelCase column doesn't exist yet, try the snake_case equivalent
    let actualCol = col;
    if (!actualCols.has(col)) {
      const snakeCase = col.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);
      if (actualCols.has(snakeCase)) {
        actualCol = snakeCase;
      } else {
        // Column doesn't exist in either form — skip
        continue;
      }
    }
    // Convert ISO 8601 strings (contain 'T') to Unix ms
    db.exec(`
      UPDATE ${table}
      SET ${actualCol} = CAST(strftime('%s', ${actualCol}) AS INTEGER) * 1000
      WHERE typeof(${actualCol}) = 'text' AND ${actualCol} LIKE '%T%'
    `);
    // Convert stringified numbers ("1769559596439.0") to integers
    db.exec(`
      UPDATE ${table}
      SET ${actualCol} = CAST(CAST(${actualCol} AS REAL) AS INTEGER)
      WHERE typeof(${actualCol}) = 'text' AND ${actualCol} NOT LIKE '%T%'
    `);
  }
}

/**
 * Validate that all required camelCase columns exist after migration.
 * Fails fast with a clear error instead of letting the server boot with
 * a broken schema that crashes on the first query.
 */
function validateSchema(db) {
  const required = {
    items: ["id", "type", "syncId", "syncSource", "syncedAt", "createdAt", "updatedAt", "deletedAt"],
    tags: ["id", "name", "frequency", "lastUsedAt", "frecencyScore", "createdAt", "updatedAt"],
    item_tags: ["itemId", "tagId", "createdAt"],
  };
  const missing = [];
  for (const [table, cols] of Object.entries(required)) {
    const actual = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
    for (const col of cols) {
      if (!actual.has(col)) {
        missing.push(`${table}.${col}`);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `[schema] Required columns missing after migration: ${missing.join(", ")}. ` +
      `Column renames may have failed. Check server logs for '[schema] Failed to rename' errors.`
    );
  }
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
  `);

  // --- Migrate existing tables ---
  // Production databases may have snake_case columns from older schema versions.
  // CREATE TABLE IF NOT EXISTS skips when the table exists, so we must handle
  // both adding missing columns AND renaming snake_case → camelCase.
  migrateColumns(db, "items", {
    "sync_id": "syncId",
    "sync_source": "syncSource",
    "synced_at": "syncedAt",
    "created_at": "createdAt",
    "updated_at": "updatedAt",
    "deleted_at": "deletedAt",
  });

  // Add columns that may not exist in any form.
  // Check both camelCase AND snake_case to avoid creating duplicates if rename failed.
  const itemColSet = new Set(db.prepare("PRAGMA table_info(items)").all().map(c => c.name));
  if (!itemColSet.has("syncId") && !itemColSet.has("sync_id")) {
    db.exec("ALTER TABLE items ADD COLUMN syncId TEXT DEFAULT ''");
  }
  if (!itemColSet.has("syncSource") && !itemColSet.has("sync_source")) {
    db.exec("ALTER TABLE items ADD COLUMN syncSource TEXT DEFAULT ''");
  }
  if (!itemColSet.has("syncedAt") && !itemColSet.has("synced_at")) {
    db.exec("ALTER TABLE items ADD COLUMN syncedAt INTEGER DEFAULT 0");
  }
  if (!itemColSet.has("deletedAt") && !itemColSet.has("deleted_at")) {
    db.exec("ALTER TABLE items ADD COLUMN deletedAt INTEGER DEFAULT 0");
  }

  // Convert any TEXT timestamps to INTEGER (Unix ms)
  migrateTimestamps(db, "items", ["createdAt", "updatedAt", "syncedAt", "deletedAt"]);

  // Create indexes only if referenced columns exist (rename may have failed)
  const itemColsPost = new Set(db.prepare("PRAGMA table_info(items)").all().map(c => c.name));
  if (itemColsPost.has("syncId")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_items_syncId ON items(syncId)");
  }
  if (itemColsPost.has("deletedAt")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_items_deletedAt ON items(deletedAt)");
  }

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
  `);

  migrateColumns(db, "tags", {
    "last_used_at": "lastUsedAt",
    "frecency_score": "frecencyScore",
    "created_at": "createdAt",
    "updated_at": "updatedAt",
  });

  migrateTimestamps(db, "tags", ["lastUsedAt", "createdAt", "updatedAt"]);

  db.exec("CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)");
  const tagColsPost = new Set(db.prepare("PRAGMA table_info(tags)").all().map(c => c.name));
  if (tagColsPost.has("frecencyScore")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_tags_frecency ON tags(frecencyScore DESC)");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS item_tags (
      itemId TEXT NOT NULL,
      tagId TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      PRIMARY KEY (itemId, tagId)
    );
  `);

  migrateColumns(db, "item_tags", {
    "item_id": "itemId",
    "tag_id": "tagId",
    "created_at": "createdAt",
  });

  migrateTimestamps(db, "item_tags", ["createdAt"]);

  const itColsPost = new Set(db.prepare("PRAGMA table_info(item_tags)").all().map(c => c.name));
  if (itColsPost.has("itemId")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_item_tags_itemId ON item_tags(itemId)");
  }
  if (itColsPost.has("tagId")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_item_tags_tagId ON item_tags(tagId)");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Fail fast if migration left the schema incomplete
  validateSchema(db);

  // Write datastore version after schema init
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    "datastore_version",
    String(DATASTORE_VERSION)
  );
}

/**
 * Coerce a value to integer timestamp (Unix ms). Safety net for legacy TEXT values
 * that survived the migration (e.g., if migrateTimestamps hasn't run yet for a DB).
 */
function toTimestamp(val) {
  if (typeof val === 'number') return Math.trunc(val);
  if (typeof val === 'string') {
    if (val.includes('T')) return new Date(val).getTime() || 0;
    return Math.trunc(Number(val)) || 0;
  }
  return 0;
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
function saveItem(userId, type, content, tags = [], metadata = null, syncId = null, profileId = "default", deletedAt = null) {
  const conn = getConnection(userId, profileId);
  const timestamp = now();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  let itemId;

  if (syncId) {
    // Sync path: match by syncId only. No content-based fallback — syncId is canonical.

    // Check if syncId matches a server item by its own ID (client sends server ID on re-push)
    const existingById = conn.prepare(
      "SELECT id, deletedAt FROM items WHERE id = ?"
    ).get(syncId);

    if (existingById) {
      itemId = existingById.id;
    }

    // Check syncId column (client's local ID from first push)
    if (!itemId) {
      const existingBySyncId = conn.prepare(
        "SELECT id, deletedAt FROM items WHERE syncId = ?"
      ).get(syncId);

      if (existingBySyncId) {
        itemId = existingBySyncId.id;
      }
    }

    // Update matched item with full content from client
    if (itemId) {
      if (deletedAt) {
        // Push a tombstone
        conn.prepare(
          "UPDATE items SET deletedAt = ?, updatedAt = ? WHERE id = ?"
        ).run(deletedAt, timestamp, itemId);
      } else {
        // Push live content and ensure item is not deleted (undelete case)
        conn.prepare(
          "UPDATE items SET type = ?, content = ?, metadata = COALESCE(?, metadata), deletedAt = 0, updatedAt = ? WHERE id = ?"
        ).run(type, content, metadataJson, timestamp, itemId);
        conn.prepare("DELETE FROM item_tags WHERE itemId = ?").run(itemId);
      }
    }
  }

  // Non-sync path: content-based dedup (when no syncId provided)
  if (!syncId && !itemId) {
    if (content) {
      const existing = conn.prepare(
        "SELECT id FROM items WHERE type = ? AND content = ? AND CAST(deletedAt AS INTEGER) = 0"
      ).get(type, content);
      if (existing) {
        itemId = existing.id;
        conn.prepare("UPDATE items SET metadata = COALESCE(?, metadata), updatedAt = ? WHERE id = ?")
          .run(metadataJson, timestamp, itemId);
        conn.prepare("DELETE FROM item_tags WHERE itemId = ?").run(itemId);
      }
    } else if (type === 'tagset' && tags.length > 0) {
      const sortedNewTags = [...tags].sort().join('\0');
      const existingTagsets = conn.prepare(
        "SELECT id FROM items WHERE type = 'tagset' AND CAST(deletedAt AS INTEGER) = 0"
      ).all();
      for (const ts of existingTagsets) {
        const existingTags = conn.prepare(
          "SELECT t.name FROM tags t JOIN item_tags it ON t.id = it.tagId WHERE it.itemId = ?"
        ).all(ts.id).map(t => t.name).sort().join('\0');
        if (existingTags === sortedNewTags) {
          itemId = ts.id;
          conn.prepare("UPDATE items SET metadata = COALESCE(?, metadata), updatedAt = ? WHERE id = ?")
            .run(metadataJson, timestamp, itemId);
          conn.prepare("DELETE FROM item_tags WHERE itemId = ?").run(itemId);
          break;
        }
      }
    }
  }

  // Create new item if no match found
  if (!itemId) {
    itemId = generateUUID();
    conn.prepare(`
      INSERT INTO items (id, type, content, metadata, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt)
      VALUES (?, ?, ?, ?, ?, '', 0, ?, ?, ?)
    `).run(itemId, type, content, metadataJson, syncId || '', timestamp, timestamp, deletedAt || 0);
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

function getItems(userId, type = null, profileId = "default", includeDeleted = false) {
  const conn = getConnection(userId, profileId);

  let query = `
    SELECT id, type, content, metadata, createdAt, updatedAt, deletedAt
    FROM items
    WHERE 1=1
  `;
  const params = [];

  if (!includeDeleted) {
    query += " AND CAST(deletedAt AS INTEGER) = 0";
  }

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
      created_at: toTimestamp(row.createdAt),
      updated_at: toTimestamp(row.updatedAt),
      deleted_at: toTimestamp(row.deletedAt),
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
  const timestamp = now();
  conn.prepare(
    "UPDATE items SET deletedAt = ?, updatedAt = ? WHERE id = ? AND CAST(deletedAt AS INTEGER) = 0"
  ).run(timestamp, timestamp, id);
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
    WHERE type = 'image' AND CAST(deletedAt AS INTEGER) = 0
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
      created_at: toTimestamp(row.createdAt),
      updated_at: toTimestamp(row.updatedAt),
      tags: getTagsStmt.all(row.id).map((t) => t.name),
    };
  });
}

function getImageById(userId, itemId, profileId = "default") {
  const conn = getConnection(userId, profileId);

  const row = conn.prepare(`
    SELECT id, content, metadata, createdAt, updatedAt
    FROM items
    WHERE id = ? AND type = 'image' AND CAST(deletedAt AS INTEGER) = 0
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

  // Soft-delete the item record (same as deleteItem)
  const timestamp = now();
  conn.prepare(
    "UPDATE items SET deletedAt = ?, updatedAt = ? WHERE id = ? AND CAST(deletedAt AS INTEGER) = 0"
  ).run(timestamp, timestamp, itemId);
}

/**
 * Get items modified since a given timestamp
 * Used for incremental sync - returns items where updatedAt > timestamp
 */
function getItemsSince(userId, timestamp, type = null, profileId = "default") {
  const conn = getConnection(userId, profileId);

  // CAST handles TEXT-affinity columns from legacy schemas where timestamps
  // are stored as strings (ISO 8601 or stringified numbers)
  let query = `
    SELECT id, type, content, metadata, createdAt, updatedAt, deletedAt
    FROM items
    WHERE CAST(updatedAt AS INTEGER) > ?
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
      created_at: toTimestamp(row.createdAt),
      updated_at: toTimestamp(row.updatedAt),
      deleted_at: toTimestamp(row.deletedAt),
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
    WHERE id = ? AND CAST(deletedAt AS INTEGER) = 0
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
    created_at: toTimestamp(row.createdAt),
    updated_at: toTimestamp(row.updatedAt),
    tags: getTagsStmt.all(row.id).map((t) => t.name),
  };
  if (row.metadata) {
    result.metadata = JSON.parse(row.metadata);
  }
  return result;
}

/**
 * One-time deduplication of items for a user/profile.
 * Removes duplicate url/text items (same type+content) and duplicate tagsets (same sorted tag names).
 * Keeps the item with the most recent updatedAt; prefers items with a syncId.
 * Hard-deletes the rest from items and item_tags.
 */
function deduplicateItems(userId, profileId = "default") {
  const conn = getConnection(userId, profileId);
  let totalRemoved = 0;

  // --- Deduplicate url/text items by (type, content) ---
  const dupGroups = conn.prepare(`
    SELECT type, content, COUNT(*) as cnt
    FROM items
    WHERE CAST(deletedAt AS INTEGER) = 0 AND type IN ('url', 'text') AND content IS NOT NULL AND content != ''
    GROUP BY type, content
    HAVING cnt > 1
  `).all();

  for (const group of dupGroups) {
    const items = conn.prepare(`
      SELECT id, syncId, updatedAt
      FROM items
      WHERE type = ? AND content = ? AND CAST(deletedAt AS INTEGER) = 0
      ORDER BY
        CASE WHEN syncId IS NOT NULL AND syncId != '' THEN 0 ELSE 1 END,
        updatedAt DESC
    `).all(group.type, group.content);

    // Keep first (best), delete the rest
    for (let i = 1; i < items.length; i++) {
      conn.prepare("DELETE FROM item_tags WHERE itemId = ?").run(items[i].id);
      conn.prepare("DELETE FROM items WHERE id = ?").run(items[i].id);
      totalRemoved++;
    }
  }

  // --- Deduplicate tagsets by sorted tag names ---
  const tagsets = conn.prepare(`
    SELECT id, syncId, updatedAt
    FROM items
    WHERE type = 'tagset' AND CAST(deletedAt AS INTEGER) = 0
  `).all();

  const getTagNamesStmt = conn.prepare(`
    SELECT t.name FROM tags t
    JOIN item_tags it ON t.id = it.tagId
    WHERE it.itemId = ?
    ORDER BY t.name
  `);

  // Group tagsets by their sorted tag string
  const tagsetGroups = new Map();
  for (const ts of tagsets) {
    const tagNames = getTagNamesStmt.all(ts.id).map(t => t.name).join('\0');
    if (!tagsetGroups.has(tagNames)) {
      tagsetGroups.set(tagNames, []);
    }
    tagsetGroups.get(tagNames).push(ts);
  }

  for (const [, items] of tagsetGroups) {
    if (items.length <= 1) continue;

    // Sort: prefer syncId, then newest updatedAt
    items.sort((a, b) => {
      const aHasSync = a.syncId && a.syncId !== '' ? 0 : 1;
      const bHasSync = b.syncId && b.syncId !== '' ? 0 : 1;
      if (aHasSync !== bHasSync) return aHasSync - bHasSync;
      return b.updatedAt - a.updatedAt;
    });

    // Keep first, delete rest
    for (let i = 1; i < items.length; i++) {
      conn.prepare("DELETE FROM item_tags WHERE itemId = ?").run(items[i].id);
      conn.prepare("DELETE FROM items WHERE id = ?").run(items[i].id);
      totalRemoved++;
    }
  }

  if (totalRemoved > 0) {
    console.log(`[dedup] Removed ${totalRemoved} duplicate items for user=${userId} profile=${profileId}`);
  }

  return totalRemoved;
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
  deduplicateItems,
};
