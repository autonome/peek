/**
 * Integration tests for Desktop (Electron) datastore
 * Tests the unified data model with url, text, tagset, image types
 * and sync columns (syncId, syncSource, syncedAt)
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test with a temporary database
const TEST_DB_PATH = path.join(__dirname, 'test-peek.db');

// Import will be done after build
let datastore: typeof import('./datastore.js');

describe('Desktop Datastore Tests', () => {
  before(async () => {
    // Clean up any existing test db
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    // Dynamic import of the compiled module
    datastore = await import('./datastore.js');
    datastore.initDatabase(TEST_DB_PATH);
  });

  after(() => {
    datastore.closeDatabase();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    // Clean up WAL files
    const walPath = TEST_DB_PATH + '-wal';
    const shmPath = TEST_DB_PATH + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  });

  describe('Item Type Constants', () => {
    it('should support url, text, tagset, image types in schema', () => {
      const db = datastore.getDb();
      // Query the check constraint from the schema
      const result = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'"
      ).get() as { sql: string };

      assert.ok(result.sql.includes("'url'"), 'Schema should include url type');
      assert.ok(result.sql.includes("'text'"), 'Schema should include text type');
      assert.ok(result.sql.includes("'tagset'"), 'Schema should include tagset type');
      assert.ok(result.sql.includes("'image'"), 'Schema should include image type');
    });
  });

  describe('Sync Columns Schema', () => {
    it('should have syncId column', () => {
      const db = datastore.getDb();
      const columns = db.prepare("PRAGMA table_info(items)").all() as { name: string }[];
      const columnNames = columns.map((col) => col.name);

      assert.ok(columnNames.includes('syncId'), 'Should have syncId column');
    });

    it('should have syncSource column', () => {
      const db = datastore.getDb();
      const columns = db.prepare("PRAGMA table_info(items)").all() as { name: string }[];
      const columnNames = columns.map((col) => col.name);

      assert.ok(columnNames.includes('syncSource'), 'Should have syncSource column');
    });

    it('should have syncedAt column', () => {
      const db = datastore.getDb();
      const columns = db.prepare("PRAGMA table_info(items)").all() as { name: string }[];
      const columnNames = columns.map((col) => col.name);

      assert.ok(columnNames.includes('syncedAt'), 'Should have syncedAt column');
    });

    it('should have syncId index', () => {
      const db = datastore.getDb();
      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='items'"
      ).all() as { name: string }[];
      const indexNames = indexes.map((idx) => idx.name);

      assert.ok(indexNames.includes('idx_items_syncId'), 'Should have idx_items_syncId index');
    });
  });

  describe('addItem with url type', () => {
    it('should save a url item', () => {
      const result = datastore.addItem('url', { content: 'https://example.com' });
      assert.ok(result.id, 'Should return an id');
      assert.ok(result.id.startsWith('item_'), 'ID should have item_ prefix');
    });

    it('should retrieve url item with correct type', () => {
      const { id } = datastore.addItem('url', { content: 'https://test.com' });
      const item = datastore.getItem(id);

      assert.ok(item, 'Should find the item');
      assert.strictEqual(item!.type, 'url');
      assert.strictEqual(item!.content, 'https://test.com');
    });
  });

  describe('addItem with text type', () => {
    it('should save a text item', () => {
      const result = datastore.addItem('text', { content: 'My note content' });
      assert.ok(result.id, 'Should return an id');
    });

    it('should retrieve text item with correct type', () => {
      const { id } = datastore.addItem('text', { content: 'Another note' });
      const item = datastore.getItem(id);

      assert.ok(item, 'Should find the item');
      assert.strictEqual(item!.type, 'text');
      assert.strictEqual(item!.content, 'Another note');
    });
  });

  describe('addItem with tagset type', () => {
    it('should save a tagset item', () => {
      const result = datastore.addItem('tagset', {});
      assert.ok(result.id, 'Should return an id');
    });

    it('should retrieve tagset item with correct type', () => {
      const { id } = datastore.addItem('tagset', {});
      const item = datastore.getItem(id);

      assert.ok(item, 'Should find the item');
      assert.strictEqual(item!.type, 'tagset');
    });
  });

  describe('addItem with image type', () => {
    it('should save an image item', () => {
      const result = datastore.addItem('image', { mimeType: 'image/png' });
      assert.ok(result.id, 'Should return an id');
    });

    it('should retrieve image item with correct type', () => {
      const { id } = datastore.addItem('image', { mimeType: 'image/jpeg' });
      const item = datastore.getItem(id);

      assert.ok(item, 'Should find the item');
      assert.strictEqual(item!.type, 'image');
    });
  });

  describe('queryItems by type', () => {
    beforeEach(() => {
      // Clean items for each test
      const db = datastore.getDb();
      db.exec('DELETE FROM item_tags');
      db.exec('DELETE FROM items');
    });

    it('should filter items by url type', () => {
      datastore.addItem('url', { content: 'https://example1.com' });
      datastore.addItem('url', { content: 'https://example2.com' });
      datastore.addItem('text', { content: 'Some text' });

      const urls = datastore.queryItems({ type: 'url' });
      assert.strictEqual(urls.length, 2);
      assert.ok(urls.every((item) => item.type === 'url'));
    });

    it('should filter items by text type', () => {
      datastore.addItem('url', { content: 'https://example.com' });
      datastore.addItem('text', { content: 'Note 1' });
      datastore.addItem('text', { content: 'Note 2' });

      const texts = datastore.queryItems({ type: 'text' });
      assert.strictEqual(texts.length, 2);
      assert.ok(texts.every((item) => item.type === 'text'));
    });

    it('should return all item types when no filter', () => {
      datastore.addItem('url', { content: 'https://example.com' });
      datastore.addItem('text', { content: 'Note' });
      datastore.addItem('tagset', {});
      datastore.addItem('image', { mimeType: 'image/png' });

      const items = datastore.queryItems({});
      assert.strictEqual(items.length, 4);

      const types = items.map((item) => item.type).sort();
      assert.deepStrictEqual(types, ['image', 'tagset', 'text', 'url']);
    });
  });

  describe('Sync options', () => {
    it('should save item with syncId and syncSource', () => {
      const { id } = datastore.addItem('url', {
        content: 'https://synced.com',
        syncId: 'remote-123',
        syncSource: 'server',
      });

      const item = datastore.getItem(id);
      assert.ok(item);
      assert.strictEqual(item!.syncId, 'remote-123');
      assert.strictEqual(item!.syncSource, 'server');
    });

    it('should update item with sync options', () => {
      const { id } = datastore.addItem('text', { content: 'Original' });

      datastore.updateItem(id, {
        syncId: 'sync-456',
        syncSource: 'mobile',
      });

      const item = datastore.getItem(id);
      assert.ok(item);
      assert.strictEqual(item!.syncId, 'sync-456');
      assert.strictEqual(item!.syncSource, 'mobile');
    });
  });

  describe('Item tagging', () => {
    it('should tag an item', () => {
      const { id: itemId } = datastore.addItem('url', { content: 'https://tagged.com' });
      const { tag } = datastore.getOrCreateTag('test-tag');

      const { link, alreadyExists } = datastore.tagItem(itemId, tag.id);
      assert.ok(link.id);
      assert.strictEqual(alreadyExists, false);
    });

    it('should retrieve item tags', () => {
      const { id: itemId } = datastore.addItem('text', { content: 'Tagged note' });
      const { tag: tag1 } = datastore.getOrCreateTag('tag-one');
      const { tag: tag2 } = datastore.getOrCreateTag('tag-two');

      datastore.tagItem(itemId, tag1.id);
      datastore.tagItem(itemId, tag2.id);

      const tags = datastore.getItemTags(itemId);
      assert.strictEqual(tags.length, 2);

      const tagNames = tags.map((t) => t.name).sort();
      assert.deepStrictEqual(tagNames, ['tag-one', 'tag-two']);
    });
  });

  describe('Item deletion', () => {
    it('should soft delete an item', () => {
      const { id } = datastore.addItem('url', { content: 'https://delete-me.com' });
      assert.ok(datastore.getItem(id));

      const deleted = datastore.deleteItem(id);
      assert.strictEqual(deleted, true);

      // Soft deleted - should not be found by default
      assert.strictEqual(datastore.getItem(id), null);
    });

    it('should hard delete an item', () => {
      const { id } = datastore.addItem('text', { content: 'Hard delete me' });
      const { tag } = datastore.getOrCreateTag('delete-tag');
      datastore.tagItem(id, tag.id);

      const deleted = datastore.hardDeleteItem(id);
      assert.strictEqual(deleted, true);

      // Check tags are also gone
      const db = datastore.getDb();
      const tagLinks = db.prepare('SELECT * FROM item_tags WHERE itemId = ?').all(id);
      assert.strictEqual(tagLinks.length, 0);
    });
  });
});
