import { describe, it, before, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetMocks } from './helpers/mocks.js';
import {
  openDatabase,
  closeDatabase,
  addItem,
  getItem,
  updateItem,
  deleteItem,
  hardDeleteItem,
  queryItems,
  getOrCreateTag,
  tagItem,
  untagItem,
  getItemTags,
  getItemsByTag,
  getTable,
  getRow,
  setRow,
  getStats,
} from '../datastore.js';

describe('datastore', () => {
  before(async () => {
    await resetMocks();
    await openDatabase();
  });

  afterEach(async () => {
    // Clear items between tests
    const db = (await import('../datastore.js')).getRawDb();
    const storeNames = ['items', 'tags', 'item_tags', 'extension_settings'];
    for (const name of storeNames) {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).clear();
      await new Promise(r => { tx.oncomplete = r; });
    }
  });

  after(() => {
    closeDatabase();
  });

  // ==================== Open/Create ====================

  describe('openDatabase', () => {
    it('should open database successfully', async () => {
      // Already opened in before hook
      const result = await openDatabase();
      assert.equal(result.success, true);
    });
  });

  // ==================== addItem ====================

  describe('addItem', () => {
    it('should add a url item', async () => {
      const result = await addItem('url', { content: 'https://example.com' });
      assert.equal(result.success, true);
      assert.ok(result.data.id.startsWith('item_'));

      const item = (await getItem(result.data.id)).data;
      assert.equal(item.type, 'url');
      assert.equal(item.content, 'https://example.com');
    });

    it('should add a text item', async () => {
      const result = await addItem('text', { content: 'Hello world' });
      assert.equal(result.success, true);

      const item = (await getItem(result.data.id)).data;
      assert.equal(item.type, 'text');
      assert.equal(item.content, 'Hello world');
    });

    it('should add a tagset item', async () => {
      const result = await addItem('tagset', { content: null });
      assert.equal(result.success, true);

      const item = (await getItem(result.data.id)).data;
      assert.equal(item.type, 'tagset');
    });

    it('should add an image item', async () => {
      const result = await addItem('image', { content: 'data:image/png;base64,abc', mimeType: 'image/png' });
      assert.equal(result.success, true);

      const item = (await getItem(result.data.id)).data;
      assert.equal(item.type, 'image');
      assert.equal(item.mimeType, 'image/png');
    });

    it('should set default fields', async () => {
      const result = await addItem('text', { content: 'test' });
      const item = (await getItem(result.data.id)).data;

      assert.equal(item.deletedAt, 0);
      assert.equal(item.starred, 0);
      assert.equal(item.archived, 0);
      assert.equal(item.syncId, '');
      assert.equal(item.syncSource, '');
      assert.ok(item.createdAt > 0);
      assert.ok(item.updatedAt > 0);
    });

    it('should accept starred and archived options', async () => {
      const result = await addItem('text', { content: 'starred', starred: 1, archived: 1 });
      const item = (await getItem(result.data.id)).data;

      assert.equal(item.starred, 1);
      assert.equal(item.archived, 1);
    });
  });

  // ==================== updateItem ====================

  describe('updateItem', () => {
    it('should update item content', async () => {
      const { data: { id } } = await addItem('text', { content: 'original' });
      await updateItem(id, { content: 'updated' });

      const item = (await getItem(id)).data;
      assert.equal(item.content, 'updated');
    });

    it('should merge metadata', async () => {
      const { data: { id } } = await addItem('text', { content: 'test', metadata: '{"a": 1}' });
      await updateItem(id, { metadata: '{"b": 2}' });

      const item = (await getItem(id)).data;
      const meta = JSON.parse(item.metadata);
      assert.equal(meta.a, 1);
      assert.equal(meta.b, 2);
    });

    it('should update starred', async () => {
      const { data: { id } } = await addItem('text', { content: 'test' });
      await updateItem(id, { starred: 1 });

      const item = (await getItem(id)).data;
      assert.equal(item.starred, 1);
    });

    it('should update updatedAt timestamp', async () => {
      const { data: { id } } = await addItem('text', { content: 'test' });
      const before = (await getItem(id)).data.updatedAt;

      // Small delay to ensure timestamp changes
      await new Promise(r => setTimeout(r, 10));
      await updateItem(id, { content: 'changed' });

      const after = (await getItem(id)).data.updatedAt;
      assert.ok(after >= before);
    });

    it('should return false for non-existent item', async () => {
      const result = await updateItem('nonexistent', { content: 'x' });
      assert.equal(result.data, false);
    });

    it('should not update deleted items', async () => {
      const { data: { id } } = await addItem('text', { content: 'test' });
      await deleteItem(id);

      const result = await updateItem(id, { content: 'updated' });
      assert.equal(result.data, false);
    });
  });

  // ==================== deleteItem ====================

  describe('deleteItem', () => {
    it('should soft delete an item', async () => {
      const { data: { id } } = await addItem('text', { content: 'to delete' });
      const result = await deleteItem(id);
      assert.equal(result.data, true);

      // Item should not be returned by getItem
      const item = (await getItem(id)).data;
      assert.equal(item, null);
    });

    it('should return false for already deleted item', async () => {
      const { data: { id } } = await addItem('text', { content: 'test' });
      await deleteItem(id);

      const result = await deleteItem(id);
      assert.equal(result.data, false);
    });

    it('deleted items should appear with includeDeleted filter', async () => {
      const { data: { id } } = await addItem('text', { content: 'deleted' });
      await deleteItem(id);

      const result = await queryItems({ includeDeleted: true });
      const found = result.data.find(i => i.id === id);
      assert.ok(found);
      assert.ok(found.deletedAt > 0);
    });
  });

  // ==================== hardDeleteItem ====================

  describe('hardDeleteItem', () => {
    it('should permanently delete an item', async () => {
      const { data: { id } } = await addItem('text', { content: 'permanent delete' });
      const result = await hardDeleteItem(id);
      assert.equal(result.data, true);

      // Should not appear even with includeDeleted
      const items = (await queryItems({ includeDeleted: true })).data;
      assert.ok(!items.find(i => i.id === id));
    });

    it('should clean up item_tags', async () => {
      const { data: { id } } = await addItem('text', { content: 'tagged' });
      const tagResult = await getOrCreateTag('test-tag');
      await tagItem(id, tagResult.data.tag.id);

      // Verify tag link exists
      const tagsBefore = (await getItemTags(id)).data;
      assert.equal(tagsBefore.length, 1);

      await hardDeleteItem(id);

      // Tag links should be cleaned up (item_tags for this item removed)
      // Note: since the item is deleted, getItemTags would return empty
      // We verify by checking getItemsByTag doesn't include the deleted item
      const itemsWithTag = (await getItemsByTag(tagResult.data.tag.id)).data;
      assert.ok(!itemsWithTag.find(i => i.id === id));
    });
  });

  // ==================== queryItems ====================

  describe('queryItems', () => {
    it('should return all non-deleted items', async () => {
      await addItem('text', { content: 'one' });
      await addItem('url', { content: 'https://a.com' });
      const { data: { id } } = await addItem('text', { content: 'deleted' });
      await deleteItem(id);

      const result = await queryItems();
      assert.equal(result.data.length, 2);
    });

    it('should filter by type', async () => {
      await addItem('text', { content: 'a' });
      await addItem('url', { content: 'https://b.com' });
      await addItem('text', { content: 'c' });

      const result = await queryItems({ type: 'text' });
      assert.equal(result.data.length, 2);
      assert.ok(result.data.every(i => i.type === 'text'));
    });

    it('should filter by starred', async () => {
      await addItem('text', { content: 'not starred' });
      await addItem('text', { content: 'starred', starred: 1 });

      const result = await queryItems({ starred: 1 });
      assert.equal(result.data.length, 1);
      assert.equal(result.data[0].starred, 1);
    });

    it('should filter by archived', async () => {
      await addItem('text', { content: 'active' });
      await addItem('text', { content: 'archived', archived: 1 });

      const result = await queryItems({ archived: 0 });
      assert.equal(result.data.length, 1);
      assert.equal(result.data[0].archived, 0);
    });

    it('should sort by createdAt by default (descending)', async () => {
      await addItem('text', { content: 'first' });
      await new Promise(r => setTimeout(r, 10));
      await addItem('text', { content: 'second' });

      const result = await queryItems();
      assert.equal(result.data[0].content, 'second');
      assert.equal(result.data[1].content, 'first');
    });

    it('should sort by updatedAt when specified', async () => {
      const { data: { id: firstId } } = await addItem('text', { content: 'first' });
      await new Promise(r => setTimeout(r, 10));
      await addItem('text', { content: 'second' });
      await new Promise(r => setTimeout(r, 10));
      await updateItem(firstId, { content: 'first updated' });

      const result = await queryItems({ sortBy: 'updated' });
      assert.equal(result.data[0].id, firstId);
    });

    it('should respect limit', async () => {
      await addItem('text', { content: 'a' });
      await addItem('text', { content: 'b' });
      await addItem('text', { content: 'c' });

      const result = await queryItems({ limit: 2 });
      assert.equal(result.data.length, 2);
    });
  });

  // ==================== Tag Operations ====================

  describe('tag operations', () => {
    it('should create a new tag', async () => {
      const result = await getOrCreateTag('JavaScript');
      assert.equal(result.data.created, true);
      assert.equal(result.data.tag.name, 'JavaScript');
      assert.equal(result.data.tag.slug, 'javascript');
    });

    it('should return existing tag on duplicate', async () => {
      await getOrCreateTag('JavaScript');
      const result = await getOrCreateTag('javascript');
      assert.equal(result.data.created, false);
    });

    it('should tag an item', async () => {
      const { data: { id: itemId } } = await addItem('text', { content: 'test' });
      const { data: { tag } } = await getOrCreateTag('tagged');
      const result = await tagItem(itemId, tag.id);

      assert.equal(result.data.alreadyExists, false);
      assert.ok(result.data.link.id);
    });

    it('should not duplicate tag links', async () => {
      const { data: { id: itemId } } = await addItem('text', { content: 'test' });
      const { data: { tag } } = await getOrCreateTag('dup');
      await tagItem(itemId, tag.id);
      const result = await tagItem(itemId, tag.id);

      assert.equal(result.data.alreadyExists, true);
    });

    it('should untag an item', async () => {
      const { data: { id: itemId } } = await addItem('text', { content: 'test' });
      const { data: { tag } } = await getOrCreateTag('removable');
      await tagItem(itemId, tag.id);

      const result = await untagItem(itemId, tag.id);
      assert.equal(result.data, true);

      const tags = (await getItemTags(itemId)).data;
      assert.equal(tags.length, 0);
    });

    it('should get tags for an item', async () => {
      const { data: { id: itemId } } = await addItem('text', { content: 'test' });
      const { data: { tag: tag1 } } = await getOrCreateTag('tag-a');
      const { data: { tag: tag2 } } = await getOrCreateTag('tag-b');
      await tagItem(itemId, tag1.id);
      await tagItem(itemId, tag2.id);

      const result = await getItemTags(itemId);
      assert.equal(result.data.length, 2);
    });

    it('should get items by tag', async () => {
      const { data: { id: id1 } } = await addItem('text', { content: 'a' });
      const { data: { id: id2 } } = await addItem('text', { content: 'b' });
      await addItem('text', { content: 'c' });
      const { data: { tag } } = await getOrCreateTag('shared');
      await tagItem(id1, tag.id);
      await tagItem(id2, tag.id);

      const result = await getItemsByTag(tag.id);
      assert.equal(result.data.length, 2);
    });
  });

  // ==================== Generic Table Operations ====================

  describe('generic table operations', () => {
    it('should get all rows from a table', async () => {
      await addItem('text', { content: 'one' });
      await addItem('text', { content: 'two' });

      const result = await getTable('items');
      assert.equal(result.success, true);
      assert.equal(Object.keys(result.data).length, 2);
    });

    it('should get a single row', async () => {
      const { data: { id } } = await addItem('text', { content: 'findme' });
      const result = await getRow('items', id);
      assert.equal(result.success, true);
      assert.equal(result.data.content, 'findme');
    });

    it('should set a row', async () => {
      await setRow('extension_settings', 'test-1', {
        extensionId: 'test',
        key: 'theme',
        value: 'dark',
        updatedAt: Date.now(),
      });

      const result = await getRow('extension_settings', 'test-1');
      assert.equal(result.data.value, 'dark');
    });

    it('should reject invalid table names', async () => {
      const result = await getTable('nonexistent');
      assert.equal(result.success, false);
    });
  });

  // ==================== Stats ====================

  describe('getStats', () => {
    it('should return counts', async () => {
      await addItem('text', { content: 'a' });
      await addItem('url', { content: 'https://b.com' });
      await addItem('tagset', { content: null });
      const { data: { id } } = await addItem('text', { content: 'deleted' });
      await deleteItem(id);

      const result = await getStats();
      assert.equal(result.success, true);
      assert.equal(result.data.totalItems, 3);
      assert.equal(result.data.deletedItems, 1);
      assert.equal(result.data.itemsByType.text, 1);
      assert.equal(result.data.itemsByType.url, 1);
      assert.equal(result.data.itemsByType.tagset, 1);
    });
  });
});
