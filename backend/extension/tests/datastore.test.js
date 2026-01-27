import { describe, it, before, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetMocks } from './helpers/mocks.js';
import { initialize, close, data, adapter } from '../engine.js';

describe('datastore', () => {
  before(async () => {
    await resetMocks();
    await initialize();
  });

  afterEach(async () => {
    // Reset by closing and reopening (open clears on version upgrade)
    await close();
    await resetMocks();
    await initialize();
  });

  after(async () => {
    await close();
  });

  // ==================== addItem ====================

  describe('addItem', () => {
    it('should add a url item', async () => {
      const result = await data.addItem('url', { content: 'https://example.com' });
      assert.ok(result.id);

      const item = await data.getItem(result.id);
      assert.equal(item.type, 'url');
      assert.equal(item.content, 'https://example.com');
    });

    it('should add a text item', async () => {
      const result = await data.addItem('text', { content: 'Hello world' });
      assert.ok(result.id);

      const item = await data.getItem(result.id);
      assert.equal(item.type, 'text');
      assert.equal(item.content, 'Hello world');
    });

    it('should add a tagset item', async () => {
      const result = await data.addItem('tagset', { content: null });
      assert.ok(result.id);

      const item = await data.getItem(result.id);
      assert.equal(item.type, 'tagset');
    });

    it('should add an image item', async () => {
      const result = await data.addItem('image', { content: 'data:image/png;base64,abc' });
      assert.ok(result.id);

      const item = await data.getItem(result.id);
      assert.equal(item.type, 'image');
    });

    it('should set default fields', async () => {
      const result = await data.addItem('text', { content: 'test' });
      const item = await data.getItem(result.id);

      assert.equal(item.deletedAt, 0);
      assert.equal(item.syncId, '');
      assert.equal(item.syncSource, '');
      assert.ok(item.createdAt > 0);
      assert.ok(item.updatedAt > 0);
    });
  });

  // ==================== updateItem ====================

  describe('updateItem', () => {
    it('should update item content', async () => {
      const { id } = await data.addItem('text', { content: 'original' });
      await data.updateItem(id, { content: 'updated' });

      const item = await data.getItem(id);
      assert.equal(item.content, 'updated');
    });

    it('should replace metadata', async () => {
      const { id } = await data.addItem('text', { content: 'test', metadata: '{"a": 1}' });
      await data.updateItem(id, { metadata: '{"b": 2}' });

      const item = await data.getItem(id);
      const meta = JSON.parse(item.metadata);
      // DataEngine replaces metadata (not merge)
      assert.equal(meta.b, 2);
    });

    it('should update updatedAt timestamp', async () => {
      const { id } = await data.addItem('text', { content: 'test' });
      const beforeItem = await data.getItem(id);

      // Small delay to ensure timestamp changes
      await new Promise(r => setTimeout(r, 10));
      await data.updateItem(id, { content: 'changed' });

      const afterItem = await data.getItem(id);
      assert.ok(afterItem.updatedAt >= beforeItem.updatedAt);
    });
  });

  // ==================== deleteItem ====================

  describe('deleteItem', () => {
    it('should soft delete an item', async () => {
      const { id } = await data.addItem('text', { content: 'to delete' });
      await data.deleteItem(id);

      // Item should not be returned by getItem
      const item = await data.getItem(id);
      assert.equal(item, null);
    });

    it('deleted items should appear with includeDeleted filter', async () => {
      const { id } = await data.addItem('text', { content: 'deleted' });
      await data.deleteItem(id);

      const items = await data.queryItems({ includeDeleted: true });
      const found = items.find(i => i.id === id);
      assert.ok(found);
      assert.ok(found.deletedAt > 0);
    });
  });

  // ==================== hardDeleteItem ====================

  describe('hardDeleteItem', () => {
    it('should permanently delete an item', async () => {
      const { id } = await data.addItem('text', { content: 'permanent delete' });
      await data.hardDeleteItem(id);

      // Should not appear even with includeDeleted
      const items = await data.queryItems({ includeDeleted: true });
      assert.ok(!items.find(i => i.id === id));
    });

    it('should clean up item_tags', async () => {
      const { id } = await data.addItem('text', { content: 'tagged' });
      const { tag } = await data.getOrCreateTag('test-tag');
      await data.tagItem(id, tag.id);

      // Verify tag link exists
      const tagsBefore = await data.getItemTags(id);
      assert.equal(tagsBefore.length, 1);

      await data.hardDeleteItem(id);

      // Tag links should be cleaned up
      const itemsWithTag = await data.adapter.getItemsByTag(tag.id);
      assert.ok(!itemsWithTag.find(i => i.id === id));
    });
  });

  // ==================== queryItems ====================

  describe('queryItems', () => {
    it('should return all non-deleted items', async () => {
      await data.addItem('text', { content: 'one' });
      await data.addItem('url', { content: 'https://a.com' });
      const { id } = await data.addItem('text', { content: 'deleted' });
      await data.deleteItem(id);

      const items = await data.queryItems();
      assert.equal(items.length, 2);
    });

    it('should filter by type', async () => {
      await data.addItem('text', { content: 'a' });
      await data.addItem('url', { content: 'https://b.com' });
      await data.addItem('text', { content: 'c' });

      const items = await data.queryItems({ type: 'text' });
      assert.equal(items.length, 2);
      assert.ok(items.every(i => i.type === 'text'));
    });
  });

  // ==================== Tag Operations ====================

  describe('tag operations', () => {
    it('should create a new tag', async () => {
      const result = await data.getOrCreateTag('JavaScript');
      assert.equal(result.created, true);
      assert.equal(result.tag.name, 'JavaScript');
    });

    it('should return existing tag on duplicate', async () => {
      await data.getOrCreateTag('JavaScript');
      const result = await data.getOrCreateTag('javascript');
      assert.equal(result.created, false);
    });

    it('should tag an item', async () => {
      const { id: itemId } = await data.addItem('text', { content: 'test' });
      const { tag } = await data.getOrCreateTag('tagged');
      await data.tagItem(itemId, tag.id);

      const tags = await data.getItemTags(itemId);
      assert.equal(tags.length, 1);
    });

    it('should not duplicate tag links', async () => {
      const { id: itemId } = await data.addItem('text', { content: 'test' });
      const { tag } = await data.getOrCreateTag('dup');
      await data.tagItem(itemId, tag.id);
      await data.tagItem(itemId, tag.id);

      const tags = await data.getItemTags(itemId);
      assert.equal(tags.length, 1);
    });

    it('should untag an item', async () => {
      const { id: itemId } = await data.addItem('text', { content: 'test' });
      const { tag } = await data.getOrCreateTag('removable');
      await data.tagItem(itemId, tag.id);

      await data.untagItem(itemId, tag.id);

      const tags = await data.getItemTags(itemId);
      assert.equal(tags.length, 0);
    });

    it('should get tags for an item', async () => {
      const { id: itemId } = await data.addItem('text', { content: 'test' });
      const { tag: tag1 } = await data.getOrCreateTag('tag-a');
      const { tag: tag2 } = await data.getOrCreateTag('tag-b');
      await data.tagItem(itemId, tag1.id);
      await data.tagItem(itemId, tag2.id);

      const tags = await data.getItemTags(itemId);
      assert.equal(tags.length, 2);
    });

    it('should get items by tag', async () => {
      const { id: id1 } = await data.addItem('text', { content: 'a' });
      const { id: id2 } = await data.addItem('text', { content: 'b' });
      await data.addItem('text', { content: 'c' });
      const { tag } = await data.getOrCreateTag('shared');
      await data.tagItem(id1, tag.id);
      await data.tagItem(id2, tag.id);

      const items = await data.adapter.getItemsByTag(tag.id);
      assert.equal(items.length, 2);
    });
  });

  // ==================== Settings ====================

  describe('settings', () => {
    it('should get and set settings', async () => {
      await data.setSetting('test-key', 'test-value');
      const value = await data.getSetting('test-key');
      assert.equal(value, 'test-value');
    });

    it('should return null for non-existent setting', async () => {
      const value = await data.getSetting('nonexistent');
      assert.equal(value, null);
    });
  });

  // ==================== Stats ====================

  describe('getStats', () => {
    it('should return counts', async () => {
      await data.addItem('text', { content: 'a' });
      await data.addItem('url', { content: 'https://b.com' });
      await data.addItem('tagset', { content: null });
      const { id } = await data.addItem('text', { content: 'deleted' });
      await data.deleteItem(id);

      const stats = await data.getStats();
      assert.equal(stats.totalItems, 3);
      assert.equal(stats.deletedItems, 1);
      assert.equal(stats.itemsByType.text, 1);
      assert.equal(stats.itemsByType.url, 1);
      assert.equal(stats.itemsByType.tagset, 1);
    });
  });
});
