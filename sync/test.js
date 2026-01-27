/**
 * Comprehensive tests for the Unified Sync Engine.
 *
 * Covers all data + sync behavior against the memory adapter.
 * Run: node --test sync/test.js
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createEngine } from './index.js';
import { createMemoryAdapter } from './adapters/memory.js';
import { calculateFrecency } from './frecency.js';
import { DATASTORE_VERSION, PROTOCOL_VERSION } from './version.js';

// ==================== Helpers ====================

function createTestEngine() {
  const adapter = createMemoryAdapter();
  const { data } = createEngine(adapter);
  return { adapter, data };
}

function createSyncTestEngine(serverItems = [], pushResponses = []) {
  const adapter = createMemoryAdapter();
  let syncConfig = {
    serverUrl: 'http://test-server.local',
    apiKey: 'test-api-key',
    serverProfileId: 'test-profile',
    lastSyncTime: 0,
  };

  let pushIndex = 0;

  // Mock fetch
  const mockFetch = async (url, options) => {
    const method = options?.method || 'GET';

    if (method === 'GET') {
      // Pull response
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['X-Peek-Datastore-Version', String(DATASTORE_VERSION)],
          ['X-Peek-Protocol-Version', String(PROTOCOL_VERSION)],
        ]),
        text: async () => '',
        json: async () => ({ items: serverItems }),
      };
    }

    if (method === 'POST') {
      // Push response
      const body = JSON.parse(options.body);
      const response = pushResponses[pushIndex] || {
        id: `server-${body.sync_id}`,
        created: true,
      };
      pushIndex++;
      return {
        ok: true,
        status: 200,
        headers: new Map([
          ['X-Peek-Datastore-Version', String(DATASTORE_VERSION)],
          ['X-Peek-Protocol-Version', String(PROTOCOL_VERSION)],
        ]),
        text: async () => '',
        json: async () => response,
      };
    }

    return { ok: false, status: 404, text: async () => 'Not found' };
  };

  // Mock headers.get
  mockFetch._patchHeaders = true;

  const { data, sync } = createEngine(adapter, {
    getConfig: () => syncConfig,
    setConfig: (updates) => {
      syncConfig = { ...syncConfig, ...updates };
    },
    fetch: mockFetch,
  });

  return { adapter, data, sync, getConfig: () => syncConfig };
}

// Small delay to ensure different timestamps
function tick() {
  return new Promise(resolve => setTimeout(resolve, 2));
}

// ==================== Version Tests ====================

describe('Version Constants', () => {
  it('should export version constants', () => {
    assert.strictEqual(typeof DATASTORE_VERSION, 'number');
    assert.strictEqual(typeof PROTOCOL_VERSION, 'number');
    assert.strictEqual(DATASTORE_VERSION, 1);
    assert.strictEqual(PROTOCOL_VERSION, 1);
  });
});

// ==================== Frecency Tests ====================

describe('Frecency', () => {
  it('should calculate positive score for recent usage', () => {
    const score = calculateFrecency(1, Date.now());
    assert.ok(score > 0, 'score should be positive');
    assert.strictEqual(score, 10); // frequency(1) * 10 * decayFactor(~1.0)
  });

  it('should calculate higher score for higher frequency', () => {
    const now = Date.now();
    const score1 = calculateFrecency(1, now);
    const score3 = calculateFrecency(3, now);
    assert.ok(score3 > score1);
  });

  it('should decay score over time', () => {
    const now = Date.now();
    const recent = calculateFrecency(5, now);
    const weekAgo = calculateFrecency(5, now - 7 * 24 * 60 * 60 * 1000);
    assert.ok(recent > weekAgo, 'recent should score higher than week-old');
  });
});

// ==================== Data Engine: Item CRUD ====================

describe('DataEngine: Items', () => {
  let adapter, data;

  beforeEach(async () => {
    ({ adapter, data } = createTestEngine());
    await adapter.open();
  });

  it('should add an item and return id', async () => {
    const { id } = await data.addItem('url', { content: 'https://example.com' });
    assert.ok(id, 'should return an id');
    assert.match(id, /^[0-9a-f-]{36}$/, 'id should be a UUID');
  });

  it('should get an item by id', async () => {
    const { id } = await data.addItem('url', { content: 'https://example.com' });
    const item = await data.getItem(id);
    assert.ok(item);
    assert.strictEqual(item.type, 'url');
    assert.strictEqual(item.content, 'https://example.com');
    assert.strictEqual(item.deletedAt, 0);
  });

  it('should return null for non-existent item', async () => {
    const item = await data.getItem('non-existent');
    assert.strictEqual(item, null);
  });

  it('should update an item', async () => {
    const { id } = await data.addItem('text', { content: 'original' });
    await data.updateItem(id, { content: 'updated' });
    const item = await data.getItem(id);
    assert.strictEqual(item.content, 'updated');
  });

  it('should soft-delete an item', async () => {
    const { id } = await data.addItem('url', { content: 'https://example.com' });
    await data.deleteItem(id);
    const item = await data.getItem(id);
    assert.strictEqual(item, null, 'soft-deleted item should not be returned');
  });

  it('should hard-delete an item', async () => {
    const { id } = await data.addItem('url', { content: 'https://example.com' });
    await data.hardDeleteItem(id);
    const item = await data.getItem(id);
    assert.strictEqual(item, null);
  });

  it('should query all items', async () => {
    await data.addItem('url', { content: 'https://example.com' });
    await data.addItem('text', { content: 'A note' });
    await data.addItem('tagset', {});

    const items = await data.queryItems();
    assert.strictEqual(items.length, 3);
  });

  it('should filter items by type', async () => {
    await data.addItem('url', { content: 'https://example.com' });
    await data.addItem('text', { content: 'A note' });
    await data.addItem('tagset', {});

    const urls = await data.queryItems({ type: 'url' });
    assert.strictEqual(urls.length, 1);
    assert.strictEqual(urls[0].type, 'url');
  });

  it('should exclude soft-deleted items by default', async () => {
    const { id } = await data.addItem('url', { content: 'https://example.com' });
    await data.addItem('text', { content: 'A note' });
    await data.deleteItem(id);

    const items = await data.queryItems();
    assert.strictEqual(items.length, 1);
  });

  it('should include deleted items when requested', async () => {
    const { id } = await data.addItem('url', { content: 'https://example.com' });
    await data.addItem('text', { content: 'A note' });
    await data.deleteItem(id);

    const items = await data.queryItems({ includeDeleted: true });
    assert.strictEqual(items.length, 2);
  });

  it('should store metadata as JSON string', async () => {
    const { id } = await data.addItem('url', {
      content: 'https://example.com',
      metadata: JSON.stringify({ title: 'Example' }),
    });
    const item = await data.getItem(id);
    assert.strictEqual(item.metadata, '{"title":"Example"}');
  });

  it('should handle null content for tagsets', async () => {
    const { id } = await data.addItem('tagset', {});
    const item = await data.getItem(id);
    assert.strictEqual(item.content, null);
  });

  it('should set sync fields on creation', async () => {
    const { id } = await data.addItem('url', {
      content: 'https://example.com',
      syncId: 'server-123',
      syncSource: 'server',
    });
    const item = await data.getItem(id);
    assert.strictEqual(item.syncId, 'server-123');
    assert.strictEqual(item.syncSource, 'server');
  });
});

// ==================== Data Engine: Tags ====================

describe('DataEngine: Tags', () => {
  let adapter, data;

  beforeEach(async () => {
    ({ adapter, data } = createTestEngine());
    await adapter.open();
  });

  it('should create a new tag', async () => {
    const { tag, created } = await data.getOrCreateTag('test');
    assert.ok(tag.id);
    assert.strictEqual(tag.name, 'test');
    assert.strictEqual(tag.frequency, 1);
    assert.strictEqual(created, true);
  });

  it('should return existing tag and increment frequency', async () => {
    const { tag: first } = await data.getOrCreateTag('test');
    const { tag: second, created } = await data.getOrCreateTag('test');
    assert.strictEqual(second.id, first.id);
    assert.strictEqual(second.frequency, 2);
    assert.strictEqual(created, false);
  });

  it('should be case-insensitive for tag lookup', async () => {
    await data.getOrCreateTag('Test');
    const { tag, created } = await data.getOrCreateTag('test');
    assert.strictEqual(created, false);
    assert.strictEqual(tag.name, 'Test'); // preserves original casing
  });

  it('should trim tag names', async () => {
    const { tag } = await data.getOrCreateTag('  spaced  ');
    assert.strictEqual(tag.name, 'spaced');
  });

  it('should tag an item', async () => {
    const { id } = await data.addItem('url', { content: 'https://example.com' });
    const { tag } = await data.getOrCreateTag('web');
    await data.tagItem(id, tag.id);

    const tags = await data.getItemTags(id);
    assert.strictEqual(tags.length, 1);
    assert.strictEqual(tags[0].name, 'web');
  });

  it('should untag an item', async () => {
    const { id } = await data.addItem('url', { content: 'https://example.com' });
    const { tag } = await data.getOrCreateTag('web');
    await data.tagItem(id, tag.id);
    await data.untagItem(id, tag.id);

    const tags = await data.getItemTags(id);
    assert.strictEqual(tags.length, 0);
  });

  it('should get tags sorted by frecency', async () => {
    // Create tags with different frequencies
    await data.getOrCreateTag('rare');
    await data.getOrCreateTag('common');
    await data.getOrCreateTag('common');
    await data.getOrCreateTag('common');

    const tags = await data.getTagsByFrecency();
    assert.strictEqual(tags[0].name, 'common');
    assert.strictEqual(tags[1].name, 'rare');
    assert.ok(tags[0].frecencyScore > tags[1].frecencyScore);
  });

  it('should return empty array when no tags', async () => {
    const tags = await data.getTagsByFrecency();
    assert.deepStrictEqual(tags, []);
  });

  it('should track tag frequency through saveItem', async () => {
    await data.saveItem('url', 'https://example1.com', ['common']);
    await data.saveItem('url', 'https://example2.com', ['common']);
    await data.saveItem('url', 'https://example3.com', ['common']);
    await data.saveItem('url', 'https://example4.com', ['rare']);

    const tags = await data.getTagsByFrecency();
    const common = tags.find(t => t.name === 'common');
    const rare = tags.find(t => t.name === 'rare');
    assert.strictEqual(common.frequency, 3);
    assert.strictEqual(rare.frequency, 1);
  });
});

// ==================== Data Engine: saveItem ====================

describe('DataEngine: saveItem', () => {
  let adapter, data;

  beforeEach(async () => {
    ({ adapter, data } = createTestEngine());
    await adapter.open();
  });

  // --- URL saves ---

  it('should save a URL without tags', async () => {
    const { id } = await data.saveItem('url', 'https://example.com');
    assert.ok(id);
    assert.match(id, /^[0-9a-f-]{36}$/);
  });

  it('should save a URL with tags', async () => {
    const { id } = await data.saveItem('url', 'https://example.com', [
      'test',
      'demo',
    ]);
    const tags = await data.getItemTags(id);
    assert.strictEqual(tags.length, 2);
    const names = tags.map(t => t.name).sort();
    assert.deepStrictEqual(names, ['demo', 'test']);
  });

  it('should create separate items for same URL content (no content dedup)', async () => {
    const { id: id1 } = await data.saveItem('url', 'https://example.com', [
      'tag1',
    ]);
    const { id: id2 } = await data.saveItem('url', 'https://example.com', [
      'tag2',
    ]);
    assert.notStrictEqual(id1, id2, 'should create separate items without syncId');

    const items = await data.queryItems({ type: 'url' });
    assert.strictEqual(items.length, 2);
  });

  it('should save multiple different URLs', async () => {
    await data.saveItem('url', 'https://example1.com');
    await data.saveItem('url', 'https://example2.com');
    await data.saveItem('url', 'https://example3.com');
    const items = await data.queryItems({ type: 'url' });
    assert.strictEqual(items.length, 3);
  });

  // --- Text saves ---

  it('should save text with tags', async () => {
    const { id } = await data.saveItem('text', 'My note', ['personal', 'todo']);
    const item = await data.getItem(id);
    assert.strictEqual(item.content, 'My note');
    const tags = await data.getItemTags(id);
    assert.strictEqual(tags.length, 2);
  });

  it('should create separate items for same text content (no content dedup)', async () => {
    const { id: id1 } = await data.saveItem('text', 'Same content', ['tag1']);
    const { id: id2 } = await data.saveItem('text', 'Same content', ['tag2']);
    assert.notStrictEqual(id1, id2);

    const items = await data.queryItems({ type: 'text' });
    assert.strictEqual(items.length, 2);
  });

  // --- Tagset saves ---

  it('should save a tagset', async () => {
    const { id } = await data.saveItem('tagset', null, ['pushups', '10']);
    assert.ok(id);
    assert.match(id, /^[0-9a-f-]{36}$/);
  });

  it('should create separate items for tagsets with same tags (no content dedup)', async () => {
    const { id: id1 } = await data.saveItem('tagset', null, ['pushups', '10']);
    const { id: id2 } = await data.saveItem('tagset', null, ['pushups', '10']);
    assert.notStrictEqual(id1, id2);

    const items = await data.queryItems({ type: 'tagset' });
    assert.strictEqual(items.length, 2);
  });

  it('should not deduplicate tagsets with different tags', async () => {
    const { id: id1 } = await data.saveItem('tagset', null, ['pushups', '10']);
    const { id: id2 } = await data.saveItem('tagset', null, ['pushups', '20']);
    assert.notStrictEqual(id1, id2);
  });

  it('should retrieve tagset with its tags', async () => {
    const { id } = await data.saveItem('tagset', null, [
      'exercise',
      'pushups',
      '20',
    ]);
    const tags = await data.getItemTags(id);
    const names = tags.map(t => t.name).sort();
    assert.deepStrictEqual(names, ['20', 'exercise', 'pushups']);
  });

  // --- Metadata ---

  it('should save item with metadata', async () => {
    const { id } = await data.saveItem(
      'url',
      'https://example.com',
      [],
      { title: 'Example' }
    );
    const item = await data.getItem(id);
    assert.strictEqual(item.metadata, '{"title":"Example"}');
  });

  // --- created flag ---

  it('should report created=true for new items', async () => {
    const { created } = await data.saveItem('url', 'https://example.com');
    assert.strictEqual(created, true);
  });

  it('should report created=true for same content without syncId', async () => {
    await data.saveItem('url', 'https://example.com');
    const { created } = await data.saveItem('url', 'https://example.com');
    assert.strictEqual(created, true);
  });
});

// ==================== Data Engine: syncId Dedup ====================

describe('DataEngine: syncId Deduplication', () => {
  let adapter, data;

  beforeEach(async () => {
    ({ adapter, data } = createTestEngine());
    await adapter.open();
  });

  it('should deduplicate by sync_id', async () => {
    const syncId = 'client-item-abc123';
    const { id: id1 } = await data.saveItem(
      'url', 'https://example.com', ['tag1'], null, syncId
    );
    const { id: id2 } = await data.saveItem(
      'url', 'https://example.com', ['tag2'], null, syncId
    );

    assert.strictEqual(id1, id2, 'should return same id for same sync_id');

    const items = await data.queryItems();
    assert.strictEqual(items.length, 1);

    const tags = await data.getItemTags(id1);
    assert.strictEqual(tags.length, 1);
    assert.strictEqual(tags[0].name, 'tag2');
  });

  it('should deduplicate by sync_id even with different content', async () => {
    const syncId = 'client-item-xyz789';
    const { id: id1 } = await data.saveItem(
      'url', 'https://old-url.com', [], null, syncId
    );
    const { id: id2 } = await data.saveItem(
      'url', 'https://new-url.com', [], null, syncId
    );

    assert.strictEqual(id1, id2);
    const items = await data.queryItems();
    assert.strictEqual(items.length, 1);
    // Content should be updated
    assert.strictEqual(items[0].content, 'https://new-url.com');
  });

  it('should create separate items when no sync_id (no content dedup)', async () => {
    const { id: id1 } = await data.saveItem('url', 'https://example.com', ['tag1']);
    const { id: id2 } = await data.saveItem('url', 'https://example.com', ['tag2']);
    assert.notStrictEqual(id1, id2);
  });

  it('should create new items for different sync_ids', async () => {
    const { id: id1 } = await data.saveItem(
      'url', 'https://first.com', [], null, 'sync-1'
    );
    const { id: id2 } = await data.saveItem(
      'url', 'https://second.com', [], null, 'sync-2'
    );

    assert.notStrictEqual(id1, id2);
    const items = await data.queryItems();
    assert.strictEqual(items.length, 2);
  });

  it('should not use content dedup in sync path', async () => {
    const { id: id1 } = await data.saveItem(
      'url', 'https://example.com', [], null, 'device-a-id'
    );
    const { id: id2 } = await data.saveItem(
      'url', 'https://example.com', [], null, 'device-b-id'
    );

    assert.notStrictEqual(id1, id2);
    const items = await data.queryItems();
    assert.strictEqual(items.length, 2);
  });

  it('should not match deleted items by sync_id', async () => {
    const { id: id1 } = await data.saveItem(
      'url', 'https://example.com', [], null, 'deleted-sync-id'
    );
    // Server deleteItem does hard delete in test.js
    await data.hardDeleteItem(id1);

    const { id: id2 } = await data.saveItem(
      'url', 'https://example.com', [], null, 'deleted-sync-id'
    );
    assert.notStrictEqual(id1, id2);
  });

  it('should match when device re-pushes with server ID as sync_id', async () => {
    const { id: id1 } = await data.saveItem(
      'url', 'https://shared.com', ['v1'], null, 'device-local-id'
    );

    // Device re-pushes with the server-assigned ID (id1)
    const { id: id2 } = await data.saveItem(
      'url', 'https://shared.com/updated', ['v2'], null, id1
    );

    assert.strictEqual(id1, id2);
    const items = await data.queryItems();
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].content, 'https://shared.com/updated');
  });
});


// ==================== Data Engine: Settings ====================

describe('DataEngine: Settings', () => {
  let adapter, data;

  beforeEach(async () => {
    ({ adapter, data } = createTestEngine());
    await adapter.open();
  });

  it('should save and retrieve a setting', async () => {
    await data.setSetting('test_key', 'test_value');
    const value = await data.getSetting('test_key');
    assert.strictEqual(value, 'test_value');
  });

  it('should return null for non-existent setting', async () => {
    const value = await data.getSetting('non_existent');
    assert.strictEqual(value, null);
  });

  it('should update existing setting', async () => {
    await data.setSetting('key', 'value1');
    await data.setSetting('key', 'value2');
    const value = await data.getSetting('key');
    assert.strictEqual(value, 'value2');
  });
});

// ==================== Data Engine: Stats ====================

describe('DataEngine: Stats', () => {
  let adapter, data;

  beforeEach(async () => {
    ({ adapter, data } = createTestEngine());
    await adapter.open();
  });

  it('should return correct stats', async () => {
    await data.saveItem('url', 'https://example.com');
    await data.saveItem('text', 'A note');
    await data.saveItem('tagset', null, ['tag1', 'tag2']);

    const stats = await data.getStats();
    assert.strictEqual(stats.totalItems, 3);
    assert.strictEqual(stats.deletedItems, 0);
    assert.strictEqual(stats.totalTags, 2);
    assert.strictEqual(stats.itemsByType.url, 1);
    assert.strictEqual(stats.itemsByType.text, 1);
    assert.strictEqual(stats.itemsByType.tagset, 1);
    assert.strictEqual(stats.itemsByType.image, 0);
  });

  it('should count deleted items separately', async () => {
    const { id } = await data.saveItem('url', 'https://example.com');
    await data.saveItem('text', 'A note');
    await data.deleteItem(id);

    const stats = await data.getStats();
    assert.strictEqual(stats.totalItems, 1);
    assert.strictEqual(stats.deletedItems, 1);
  });
});

// ==================== Sync Engine: Pull ====================

describe('SyncEngine: Pull', () => {
  it('should pull new items from server', async () => {
    const serverItems = [
      {
        id: 'server-1',
        type: 'url',
        content: 'https://from-server.com',
        tags: ['imported'],
        metadata: null,
        created_at: new Date(1000).toISOString(),
        updated_at: new Date(2000).toISOString(),
      },
    ];
    const { adapter, data, sync } = createSyncTestEngine(serverItems);
    await adapter.open();

    const result = await sync.pullFromServer();
    assert.strictEqual(result.pulled, 1);
    assert.strictEqual(result.conflicts, 0);

    const items = await data.queryItems();
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].content, 'https://from-server.com');
    assert.strictEqual(items[0].syncId, 'server-1');
    assert.strictEqual(items[0].syncSource, 'server');

    const tags = await data.getItemTags(items[0].id);
    assert.strictEqual(tags.length, 1);
    assert.strictEqual(tags[0].name, 'imported');
  });

  it('should update local item when server is newer', async () => {
    const serverItems = [
      {
        id: 'server-1',
        type: 'url',
        content: 'https://updated.com',
        tags: ['new-tag'],
        metadata: null,
        created_at: new Date(1000).toISOString(),
        updated_at: new Date(Date.now() + 10000).toISOString(), // future = newer
      },
    ];
    const { adapter, data, sync } = createSyncTestEngine(serverItems);
    await adapter.open();

    // Insert local item with same syncId
    await adapter.insertItem({
      id: 'local-1',
      type: 'url',
      content: 'https://old.com',
      metadata: null,
      syncId: 'server-1',
      syncSource: 'server',
      syncedAt: 1000,
      createdAt: 1000,
      updatedAt: 2000,
      deletedAt: 0,
    });

    const result = await sync.pullFromServer();
    assert.strictEqual(result.pulled, 1);

    const item = await data.getItem('local-1');
    assert.strictEqual(item.content, 'https://updated.com');
  });

  it('should report conflict when local is newer', async () => {
    const serverItems = [
      {
        id: 'server-1',
        type: 'url',
        content: 'https://server-old.com',
        tags: [],
        metadata: null,
        created_at: new Date(1000).toISOString(),
        updated_at: new Date(1000).toISOString(), // very old
      },
    ];
    const { adapter, data, sync } = createSyncTestEngine(serverItems);
    await adapter.open();

    // Local item is newer
    await adapter.insertItem({
      id: 'local-1',
      type: 'url',
      content: 'https://local-new.com',
      metadata: null,
      syncId: 'server-1',
      syncSource: 'server',
      syncedAt: 500,
      createdAt: 500,
      updatedAt: Date.now() + 5000, // much newer
      deletedAt: 0,
    });

    const result = await sync.pullFromServer();
    assert.strictEqual(result.conflicts, 1);
    assert.strictEqual(result.pulled, 0);

    // Local content should be unchanged
    const item = await data.getItem('local-1');
    assert.strictEqual(item.content, 'https://local-new.com');
  });

  it('should return zeros when not configured', async () => {
    const { adapter, sync } = createSyncTestEngine();
    await adapter.open();

    // Override config to remove server URL
    sync.getConfig = () => ({ serverUrl: '', apiKey: '', lastSyncTime: 0 });

    const result = await sync.pullFromServer();
    assert.strictEqual(result.pulled, 0);
    assert.strictEqual(result.conflicts, 0);
  });

  it('should pull multiple items', async () => {
    const serverItems = [
      {
        id: 'server-1', type: 'url', content: 'https://first.com',
        tags: [], metadata: null,
        created_at: new Date(1000).toISOString(),
        updated_at: new Date(2000).toISOString(),
      },
      {
        id: 'server-2', type: 'text', content: 'Server note',
        tags: ['note'], metadata: null,
        created_at: new Date(1000).toISOString(),
        updated_at: new Date(2000).toISOString(),
      },
    ];
    const { adapter, data, sync } = createSyncTestEngine(serverItems);
    await adapter.open();

    const result = await sync.pullFromServer();
    assert.strictEqual(result.pulled, 2);

    const items = await data.queryItems();
    assert.strictEqual(items.length, 2);
  });
});

// ==================== Sync Engine: Push ====================

describe('SyncEngine: Push', () => {
  it('should push unsynced items to server', async () => {
    const { adapter, data, sync } = createSyncTestEngine();
    await adapter.open();

    await data.saveItem('url', 'https://local.com', ['local-tag']);

    const result = await sync.pushToServer();
    assert.strictEqual(result.pushed, 1);
    assert.strictEqual(result.failed, 0);

    // Item should now have sync info
    const items = await data.queryItems();
    assert.strictEqual(items[0].syncSource, 'server');
    assert.ok(items[0].syncedAt > 0);
  });

  it('should not push server-sourced items', async () => {
    const { adapter, data, sync } = createSyncTestEngine();
    await adapter.open();

    // Insert an item that came from server
    await adapter.insertItem({
      id: 'from-server',
      type: 'url',
      content: 'https://server.com',
      metadata: null,
      syncId: 'server-id',
      syncSource: 'server',
      syncedAt: Date.now(),
      createdAt: 1000,
      updatedAt: 1000,
      deletedAt: 0,
    });

    const result = await sync.pushToServer();
    assert.strictEqual(result.pushed, 0);
  });

  it('should return zeros when not configured', async () => {
    const { adapter, sync } = createSyncTestEngine();
    await adapter.open();
    sync.getConfig = () => ({ serverUrl: '', apiKey: '', lastSyncTime: 0 });

    const result = await sync.pushToServer();
    assert.strictEqual(result.pushed, 0);
    assert.strictEqual(result.failed, 0);
  });
});

// ==================== Sync Engine: syncAll ====================

describe('SyncEngine: syncAll', () => {
  it('should perform full pull + push cycle', async () => {
    const serverItems = [
      {
        id: 'server-1', type: 'url', content: 'https://from-server.com',
        tags: [], metadata: null,
        created_at: new Date(1000).toISOString(),
        updated_at: new Date(2000).toISOString(),
      },
    ];
    const { adapter, data, sync, getConfig } = createSyncTestEngine(serverItems);
    await adapter.open();

    // Add a local item to push
    await data.saveItem('text', 'Local note');

    const result = await sync.syncAll();
    assert.strictEqual(result.pulled, 1);
    assert.strictEqual(result.pushed, 1);
    assert.ok(result.lastSyncTime > 0);

    // Config should be updated
    assert.ok(getConfig().lastSyncTime > 0);
  });

  it('should save sync server config after sync', async () => {
    const { adapter, data, sync } = createSyncTestEngine();
    await adapter.open();

    await sync.syncAll();

    const storedUrl = await data.getSetting('sync_lastSyncServerUrl');
    assert.strictEqual(JSON.parse(storedUrl), 'http://test-server.local');
  });

  it('should return zeros when no server configured', async () => {
    const { adapter, sync } = createSyncTestEngine();
    await adapter.open();
    sync.getConfig = () => ({
      serverUrl: '',
      apiKey: '',
      lastSyncTime: 0,
    });

    const result = await sync.syncAll();
    assert.strictEqual(result.pulled, 0);
    assert.strictEqual(result.pushed, 0);
    assert.strictEqual(result.lastSyncTime, 0);
  });
});

// ==================== Sync Engine: Status ====================

describe('SyncEngine: Status', () => {
  it('should report sync status', async () => {
    const { adapter, data, sync } = createSyncTestEngine();
    await adapter.open();

    await data.saveItem('url', 'https://local.com');

    const status = await sync.getSyncStatus();
    assert.strictEqual(status.configured, true);
    assert.strictEqual(status.pendingCount, 1);
  });

  it('should report unconfigured when no server URL', async () => {
    const { adapter, sync } = createSyncTestEngine();
    await adapter.open();
    sync.getConfig = () => ({
      serverUrl: '',
      apiKey: '',
      lastSyncTime: 0,
    });

    const status = await sync.getSyncStatus();
    assert.strictEqual(status.configured, false);
  });
});

// ==================== Sync Engine: Server Change Detection ====================

describe('SyncEngine: Server Change Detection', () => {
  it('should reset sync state when server URL changes', async () => {
    const { adapter, data, sync } = createSyncTestEngine();
    await adapter.open();

    // Save server config from previous sync
    await data.setSetting('sync_lastSyncServerUrl', JSON.stringify('http://old-server.local'));
    await data.setSetting('sync_lastSyncProfileId', JSON.stringify('test-profile'));

    // Add a server-sourced item
    await adapter.insertItem({
      id: 'synced-item',
      type: 'url',
      content: 'https://synced.com',
      metadata: null,
      syncId: 'remote-id',
      syncSource: 'server',
      syncedAt: 1000,
      createdAt: 1000,
      updatedAt: 1000,
      deletedAt: 0,
    });

    // Server URL changed (current config says test-server.local, stored says old-server.local)
    const reset = await sync.resetSyncStateIfServerChanged('http://test-server.local');
    assert.strictEqual(reset, true);

    // Item sync markers should be cleared
    const item = await data.getItem('synced-item');
    assert.strictEqual(item.syncSource, '');
    assert.strictEqual(item.syncedAt, 0);
    assert.strictEqual(item.syncId, '');
  });

  it('should not reset when server URL is the same', async () => {
    const { adapter, data, sync } = createSyncTestEngine();
    await adapter.open();

    await data.setSetting('sync_lastSyncServerUrl', JSON.stringify('http://test-server.local'));
    await data.setSetting('sync_lastSyncProfileId', JSON.stringify('test-profile'));

    const reset = await sync.resetSyncStateIfServerChanged('http://test-server.local');
    assert.strictEqual(reset, false);
  });

  it('should reset when items synced to unknown server', async () => {
    const { adapter, data, sync } = createSyncTestEngine();
    await adapter.open();

    // No stored server config, but items exist with syncSource='server'
    await adapter.insertItem({
      id: 'orphan',
      type: 'url',
      content: 'https://orphan.com',
      metadata: null,
      syncId: 'old-server-id',
      syncSource: 'server',
      syncedAt: 1000,
      createdAt: 1000,
      updatedAt: 1000,
      deletedAt: 0,
    });

    const reset = await sync.resetSyncStateIfServerChanged('http://test-server.local');
    assert.strictEqual(reset, true);

    const item = await data.getItem('orphan');
    assert.strictEqual(item.syncSource, '');
  });
});

// ==================== Memory Adapter: Edge Cases ====================

describe('Memory Adapter', () => {
  it('should support open/close cycle', async () => {
    const adapter = createMemoryAdapter();
    await adapter.open();

    await adapter.insertItem({
      id: 'test', type: 'url', content: 'https://test.com',
      metadata: null, syncId: '', syncSource: '', syncedAt: 0,
      createdAt: 1000, updatedAt: 1000, deletedAt: 0,
    });

    assert.ok(await adapter.getItem('test'));

    await adapter.close();
    await adapter.open();

    // Data should be cleared after close+open
    assert.strictEqual(await adapter.getItem('test'), null);
  });

  it('should not duplicate item-tag links', async () => {
    const adapter = createMemoryAdapter();
    await adapter.open();

    await adapter.tagItem('item-1', 'tag-1');
    await adapter.tagItem('item-1', 'tag-1'); // duplicate

    // Should have inserted a tag to check
    await adapter.insertTag({
      id: 'tag-1', name: 'test', frequency: 1, lastUsedAt: 1000,
      frecencyScore: 10, createdAt: 1000, updatedAt: 1000,
    });

    const tags = await adapter.getItemTags('item-1');
    assert.strictEqual(tags.length, 1);
  });

  it('should find item by sync_id field', async () => {
    const adapter = createMemoryAdapter();
    await adapter.open();

    await adapter.insertItem({
      id: 'local-id', type: 'url', content: 'https://test.com',
      metadata: null, syncId: 'remote-id', syncSource: 'server', syncedAt: 1000,
      createdAt: 1000, updatedAt: 1000, deletedAt: 0,
    });

    // Should find by syncId field
    const bySync = await adapter.findItemBySyncId('remote-id');
    assert.ok(bySync);
    assert.strictEqual(bySync.id, 'local-id');

    // Should find by direct ID
    const byId = await adapter.findItemBySyncId('local-id');
    assert.ok(byId);
    assert.strictEqual(byId.id, 'local-id');
  });

  it('should not find deleted items by sync_id', async () => {
    const adapter = createMemoryAdapter();
    await adapter.open();

    await adapter.insertItem({
      id: 'del', type: 'url', content: 'https://deleted.com',
      metadata: null, syncId: 'del-sync', syncSource: '', syncedAt: 0,
      createdAt: 1000, updatedAt: 1000, deletedAt: 2000,
    });

    const result = await adapter.findItemBySyncId('del-sync');
    assert.strictEqual(result, null);
  });
});

// ==================== Integration: Full Workflow ====================

describe('Integration: Full Workflow', () => {
  it('should handle save → tag → query → sync lifecycle', async () => {
    const serverItems = [];
    const { adapter, data, sync } = createSyncTestEngine(serverItems);
    await adapter.open();

    // Save items
    const { id: url1 } = await data.saveItem('url', 'https://example.com', ['web']);
    const { id: url2 } = await data.saveItem('url', 'https://other.com', ['web', 'dev']);
    const { id: ts1 } = await data.saveItem('tagset', null, ['pushups', '10']);

    // Verify queries
    const allItems = await data.queryItems();
    assert.strictEqual(allItems.length, 3);

    const urls = await data.queryItems({ type: 'url' });
    assert.strictEqual(urls.length, 2);

    // Verify tags
    const tags = await data.getTagsByFrecency();
    assert.ok(tags.length >= 2);
    // 'web' used twice should be highest
    assert.strictEqual(tags[0].name, 'web');

    // Stats
    const stats = await data.getStats();
    assert.strictEqual(stats.totalItems, 3);
    assert.strictEqual(stats.itemsByType.url, 2);
    assert.strictEqual(stats.itemsByType.tagset, 1);

    // Sync push
    const pushResult = await sync.pushToServer();
    assert.strictEqual(pushResult.pushed, 3);

    // Verify all items are now synced
    const status = await sync.getSyncStatus();
    assert.strictEqual(status.pendingCount, 0);
  });
});

// ==================== better-sqlite3 Adapter ====================

// Only run if better-sqlite3 is available (skip gracefully in environments without it)
let Database;
let betterSqliteWorks = false;
try {
  Database = (await import('better-sqlite3')).default;
  // Test that the native module actually loads (may fail if compiled for Electron)
  const testDb = new Database(':memory:');
  testDb.close();
  betterSqliteWorks = true;
} catch {
  Database = null;
}

if (betterSqliteWorks) {
  const { createBetterSqliteAdapter } = await import('./adapters/better-sqlite3.js');

  describe('BetterSqlite3 Adapter', () => {
    let db, adapter;

    beforeEach(() => {
      db = new Database(':memory:');
      adapter = createBetterSqliteAdapter(db);
    });

    it('should open and create schema', async () => {
      await adapter.open();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map(t => t.name);
      assert.ok(tableNames.includes('items'));
      assert.ok(tableNames.includes('tags'));
      assert.ok(tableNames.includes('item_tags'));
      assert.ok(tableNames.includes('settings'));
    });

    it('should insert and get an item', async () => {
      await adapter.open();
      const item = {
        id: 'test-1', type: 'url', content: 'https://example.com',
        metadata: null, syncId: '', syncSource: '', syncedAt: 0,
        createdAt: 1000, updatedAt: 1000, deletedAt: 0,
      };
      await adapter.insertItem(item);
      const retrieved = await adapter.getItem('test-1');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.content, 'https://example.com');
    });

    it('should not return soft-deleted items', async () => {
      await adapter.open();
      await adapter.insertItem({
        id: 'del-1', type: 'url', content: 'https://deleted.com',
        metadata: null, syncId: '', syncSource: '', syncedAt: 0,
        createdAt: 1000, updatedAt: 1000, deletedAt: 2000,
      });
      const item = await adapter.getItem('del-1');
      assert.strictEqual(item, null);
    });

    it('should update item fields', async () => {
      await adapter.open();
      await adapter.insertItem({
        id: 'upd-1', type: 'text', content: 'original',
        metadata: null, syncId: '', syncSource: '', syncedAt: 0,
        createdAt: 1000, updatedAt: 1000, deletedAt: 0,
      });
      await adapter.updateItem('upd-1', { content: 'updated', updatedAt: 2000 });
      const item = await adapter.getItem('upd-1');
      assert.strictEqual(item.content, 'updated');
      assert.strictEqual(item.updatedAt, 2000);
    });

    it('should soft-delete an item', async () => {
      await adapter.open();
      await adapter.insertItem({
        id: 'sd-1', type: 'url', content: 'https://test.com',
        metadata: null, syncId: '', syncSource: '', syncedAt: 0,
        createdAt: 1000, updatedAt: 1000, deletedAt: 0,
      });
      await adapter.deleteItem('sd-1');
      assert.strictEqual(await adapter.getItem('sd-1'), null);
    });

    it('should hard-delete an item and its tags', async () => {
      await adapter.open();
      await adapter.insertItem({
        id: 'hd-1', type: 'url', content: 'https://test.com',
        metadata: null, syncId: '', syncSource: '', syncedAt: 0,
        createdAt: 1000, updatedAt: 1000, deletedAt: 0,
      });
      await adapter.insertTag({
        id: 'tag-1', name: 'test', frequency: 1, lastUsedAt: 1000,
        frecencyScore: 10, createdAt: 1000, updatedAt: 1000,
      });
      await adapter.tagItem('hd-1', 'tag-1');
      await adapter.hardDeleteItem('hd-1');

      // Item gone
      const items = await adapter.getItems({ includeDeleted: true });
      assert.strictEqual(items.length, 0);
      // Tag links gone
      const tags = await adapter.getItemTags('hd-1');
      assert.strictEqual(tags.length, 0);
    });

    it('should manage tags', async () => {
      await adapter.open();
      await adapter.insertTag({
        id: 'tag-a', name: 'Alpha', frequency: 1, lastUsedAt: 1000,
        frecencyScore: 10, createdAt: 1000, updatedAt: 1000,
      });
      const byName = await adapter.getTagByName('alpha');
      assert.ok(byName);
      assert.strictEqual(byName.name, 'Alpha');

      await adapter.updateTag('tag-a', { frequency: 5, updatedAt: 2000 });
      const updated = await adapter.getTag('tag-a');
      assert.strictEqual(updated.frequency, 5);
    });

    it('should manage item-tag associations', async () => {
      await adapter.open();
      await adapter.insertItem({
        id: 'it-1', type: 'url', content: 'https://test.com',
        metadata: null, syncId: '', syncSource: '', syncedAt: 0,
        createdAt: 1000, updatedAt: 1000, deletedAt: 0,
      });
      await adapter.insertTag({
        id: 'tag-b', name: 'Beta', frequency: 1, lastUsedAt: 1000,
        frecencyScore: 10, createdAt: 1000, updatedAt: 1000,
      });

      await adapter.tagItem('it-1', 'tag-b');
      let tags = await adapter.getItemTags('it-1');
      assert.strictEqual(tags.length, 1);
      assert.strictEqual(tags[0].name, 'Beta');

      // Duplicate tagItem should be ignored
      await adapter.tagItem('it-1', 'tag-b');
      tags = await adapter.getItemTags('it-1');
      assert.strictEqual(tags.length, 1);

      await adapter.untagItem('it-1', 'tag-b');
      tags = await adapter.getItemTags('it-1');
      assert.strictEqual(tags.length, 0);
    });

    it('should clear all tags for an item', async () => {
      await adapter.open();
      await adapter.insertItem({
        id: 'ct-1', type: 'url', content: 'https://test.com',
        metadata: null, syncId: '', syncSource: '', syncedAt: 0,
        createdAt: 1000, updatedAt: 1000, deletedAt: 0,
      });
      await adapter.insertTag({
        id: 'tag-c1', name: 'C1', frequency: 1, lastUsedAt: 1000,
        frecencyScore: 10, createdAt: 1000, updatedAt: 1000,
      });
      await adapter.insertTag({
        id: 'tag-c2', name: 'C2', frequency: 1, lastUsedAt: 1000,
        frecencyScore: 10, createdAt: 1000, updatedAt: 1000,
      });
      await adapter.tagItem('ct-1', 'tag-c1');
      await adapter.tagItem('ct-1', 'tag-c2');
      await adapter.clearItemTags('ct-1');
      const tags = await adapter.getItemTags('ct-1');
      assert.strictEqual(tags.length, 0);
    });

    it('should manage settings', async () => {
      await adapter.open();
      assert.strictEqual(await adapter.getSetting('missing'), null);
      await adapter.setSetting('key1', 'value1');
      assert.strictEqual(await adapter.getSetting('key1'), 'value1');
      await adapter.setSetting('key1', 'value2');
      assert.strictEqual(await adapter.getSetting('key1'), 'value2');
    });

    it('should find items by syncId', async () => {
      await adapter.open();
      await adapter.insertItem({
        id: 'local-1', type: 'url', content: 'https://test.com',
        metadata: null, syncId: 'remote-1', syncSource: 'server', syncedAt: 1000,
        createdAt: 1000, updatedAt: 1000, deletedAt: 0,
      });

      // By syncId field
      const bySync = await adapter.findItemBySyncId('remote-1');
      assert.ok(bySync);
      assert.strictEqual(bySync.id, 'local-1');

      // By direct ID
      const byId = await adapter.findItemBySyncId('local-1');
      assert.ok(byId);
      assert.strictEqual(byId.id, 'local-1');

      // Not found
      const missing = await adapter.findItemBySyncId('nonexistent');
      assert.strictEqual(missing, null);
    });

    it('should not find deleted items by syncId', async () => {
      await adapter.open();
      await adapter.insertItem({
        id: 'del-sync', type: 'url', content: 'https://deleted.com',
        metadata: null, syncId: 'del-remote', syncSource: '', syncedAt: 0,
        createdAt: 1000, updatedAt: 1000, deletedAt: 2000,
      });
      assert.strictEqual(await adapter.findItemBySyncId('del-remote'), null);
      assert.strictEqual(await adapter.findItemBySyncId('del-sync'), null);
    });

    it('should filter items by type and since', async () => {
      await adapter.open();
      await adapter.insertItem({
        id: 'f-1', type: 'url', content: 'https://a.com',
        metadata: null, syncId: '', syncSource: '', syncedAt: 0,
        createdAt: 1000, updatedAt: 1000, deletedAt: 0,
      });
      await adapter.insertItem({
        id: 'f-2', type: 'text', content: 'note',
        metadata: null, syncId: '', syncSource: '', syncedAt: 0,
        createdAt: 2000, updatedAt: 2000, deletedAt: 0,
      });
      await adapter.insertItem({
        id: 'f-3', type: 'url', content: 'https://b.com',
        metadata: null, syncId: '', syncSource: '', syncedAt: 0,
        createdAt: 3000, updatedAt: 3000, deletedAt: 0,
      });

      const urls = await adapter.getItems({ type: 'url' });
      assert.strictEqual(urls.length, 2);

      const since = await adapter.getItems({ since: 1500 });
      assert.strictEqual(since.length, 2);
    });

    it('should work with DataEngine for full workflow', async () => {
      await adapter.open();
      const { createEngine } = await import('./index.js');
      const { data } = createEngine(adapter);

      const { id } = await data.saveItem('url', 'https://example.com', ['test']);
      assert.ok(id);

      const item = await data.getItem(id);
      assert.strictEqual(item.content, 'https://example.com');

      const tags = await data.getItemTags(id);
      assert.strictEqual(tags.length, 1);
      assert.strictEqual(tags[0].name, 'test');
    });
  });
}
