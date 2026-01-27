/**
 * better-sqlite3 Storage Adapter
 *
 * Implements the StorageAdapter interface using a better-sqlite3 Database instance.
 * Works with the canonical camelCase schema.
 *
 * Usage:
 *   import Database from 'better-sqlite3';
 *   import { createBetterSqliteAdapter } from './adapters/better-sqlite3.js';
 *
 *   const db = new Database(':memory:');
 *   const adapter = createBetterSqliteAdapter(db);
 *   await adapter.open();
 */

/**
 * Create a better-sqlite3 adapter wrapping an existing Database instance.
 * The caller owns the database lifecycle (opening, closing the file).
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {import('./interface.js').StorageAdapter}
 */
export function createBetterSqliteAdapter(db) {
  let stmts = {};

  function ensureSchema() {
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

      CREATE TABLE IF NOT EXISTS item_tags (
        itemId TEXT NOT NULL,
        tagId TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        PRIMARY KEY (itemId, tagId)
      );
      CREATE INDEX IF NOT EXISTS idx_item_tags_itemId ON item_tags(itemId);
      CREATE INDEX IF NOT EXISTS idx_item_tags_tagId ON item_tags(tagId);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Add missing columns to tags if they exist from a prior schema
    const tagCols = db.prepare('PRAGMA table_info(tags)').all();
    const tagColNames = new Set(tagCols.map(c => c.name));
    if (!tagColNames.has('frequency')) {
      db.exec('ALTER TABLE tags ADD COLUMN frequency INTEGER DEFAULT 1');
    }
    if (!tagColNames.has('lastUsedAt')) {
      db.exec('ALTER TABLE tags ADD COLUMN lastUsedAt INTEGER DEFAULT 0');
    }
    if (!tagColNames.has('frecencyScore')) {
      db.exec('ALTER TABLE tags ADD COLUMN frecencyScore REAL DEFAULT 0.0');
    }
    if (!tagColNames.has('updatedAt')) {
      db.exec('ALTER TABLE tags ADD COLUMN updatedAt INTEGER DEFAULT 0');
    }
  }

  function prepareStatements() {
    stmts = {
      getItem: db.prepare('SELECT * FROM items WHERE id = ? AND deletedAt = 0'),
      getItemIncludeDeleted: db.prepare('SELECT * FROM items WHERE id = ?'),
      insertItem: db.prepare(`
        INSERT INTO items (id, type, content, metadata, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt)
        VALUES (@id, @type, @content, @metadata, @syncId, @syncSource, @syncedAt, @createdAt, @updatedAt, @deletedAt)
      `),
      deleteItemSoft: db.prepare('UPDATE items SET deletedAt = @deletedAt, updatedAt = @updatedAt WHERE id = @id AND deletedAt = 0'),
      hardDeleteItem: db.prepare('DELETE FROM items WHERE id = ?'),
      hardDeleteItemTags: db.prepare('DELETE FROM item_tags WHERE itemId = ?'),

      getTagById: db.prepare('SELECT * FROM tags WHERE id = ?'),
      getTagByName: db.prepare('SELECT * FROM tags WHERE LOWER(name) = LOWER(?)'),
      insertTag: db.prepare(`
        INSERT INTO tags (id, name, frequency, lastUsedAt, frecencyScore, createdAt, updatedAt)
        VALUES (@id, @name, @frequency, @lastUsedAt, @frecencyScore, @createdAt, @updatedAt)
      `),

      getItemTags: db.prepare(`
        SELECT t.* FROM tags t
        JOIN item_tags it ON t.id = it.tagId
        WHERE it.itemId = ?
      `),
      getItemsByTag: db.prepare(`
        SELECT i.* FROM items i
        JOIN item_tags it ON i.id = it.itemId
        WHERE it.tagId = ? AND i.deletedAt = 0
      `),
      tagItem: db.prepare('INSERT OR IGNORE INTO item_tags (itemId, tagId, createdAt) VALUES (?, ?, ?)'),
      untagItem: db.prepare('DELETE FROM item_tags WHERE itemId = ? AND tagId = ?'),
      clearItemTags: db.prepare('DELETE FROM item_tags WHERE itemId = ?'),

      getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
      setSetting: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),

      findBySyncId: db.prepare('SELECT * FROM items WHERE id = ? AND deletedAt = 0'),
      findBySyncIdField: db.prepare('SELECT * FROM items WHERE syncId = ? AND deletedAt = 0'),

      getAllTags: db.prepare('SELECT * FROM tags'),
    };
  }

  return {
    // ==================== Lifecycle ====================

    async open() {
      ensureSchema();
      prepareStatements();
    },

    async close() {
      // Caller owns the db — we just clear prepared statements
      stmts = {};
    },

    // ==================== Items ====================

    async getItem(id) {
      return stmts.getItem.get(id) || null;
    },

    async getItems(filter = {}) {
      let sql = 'SELECT * FROM items WHERE 1=1';
      const params = [];

      if (!filter.includeDeleted) {
        sql += ' AND deletedAt = 0';
      }
      if (filter.type) {
        sql += ' AND type = ?';
        params.push(filter.type);
      }
      if (filter.since) {
        sql += ' AND updatedAt > ?';
        params.push(filter.since);
      }

      sql += ' ORDER BY createdAt DESC';
      return db.prepare(sql).all(...params);
    },

    async insertItem(item) {
      stmts.insertItem.run(item);
    },

    async updateItem(id, fields) {
      const sets = [];
      const values = [];
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          sets.push(`${key} = ?`);
          values.push(value);
        }
      }
      if (sets.length === 0) return;
      values.push(id);
      db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    },

    async deleteItem(id) {
      const timestamp = Date.now();
      stmts.deleteItemSoft.run({ id, deletedAt: timestamp, updatedAt: timestamp });
    },

    async hardDeleteItem(id) {
      stmts.hardDeleteItemTags.run(id);
      stmts.hardDeleteItem.run(id);
    },

    // ==================== Tags ====================

    async getTag(id) {
      return stmts.getTagById.get(id) || null;
    },

    async getTagByName(name) {
      return stmts.getTagByName.get(name) || null;
    },

    async insertTag(tag) {
      stmts.insertTag.run(tag);
    },

    async updateTag(id, fields) {
      const sets = [];
      const values = [];
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          sets.push(`${key} = ?`);
          values.push(value);
        }
      }
      if (sets.length === 0) return;
      values.push(id);
      db.prepare(`UPDATE tags SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    },

    // ==================== Item-Tags ====================

    async getItemTags(itemId) {
      return stmts.getItemTags.all(itemId);
    },

    async getItemsByTag(tagId) {
      return stmts.getItemsByTag.all(tagId);
    },

    async tagItem(itemId, tagId) {
      stmts.tagItem.run(itemId, tagId, Date.now());
    },

    async untagItem(itemId, tagId) {
      stmts.untagItem.run(itemId, tagId);
    },

    async clearItemTags(itemId) {
      stmts.clearItemTags.run(itemId);
    },

    // ==================== Settings ====================

    async getSetting(key) {
      const row = stmts.getSetting.get(key);
      return row ? row.value : null;
    },

    async setSetting(key, value) {
      stmts.setSetting.run(key, value);
    },

    // ==================== Query Helpers ====================

    async findItemBySyncId(syncId) {
      // Check by direct ID first
      const byId = stmts.findBySyncId.get(syncId);
      if (byId) return byId;

      // Check by syncId field
      const bySyncField = stmts.findBySyncIdField.get(syncId);
      return bySyncField || null;
    },

    async getAllTags() {
      return stmts.getAllTags.all();
    },
  };
}
