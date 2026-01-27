import { describe, it, before, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetMocks, setMockHistoryItems, setMockVisitsByUrl, simulateHistoryVisited, getStorageData } from './helpers/mocks.js';
import { openDatabase, closeDatabase, queryItems, getItemTags, addItem, getOrCreateTag, tagItem } from '../datastore.js';
import {
  isHistorySyncEnabled,
  setHistorySyncEnabled,
  importAllHistory,
  getHistoryStats,
  activateListener,
  deactivateListener,
  initHistorySync,
} from '../history.js';

describe('history', () => {
  before(async () => {
    await resetMocks();
    await openDatabase();
  });

  afterEach(async () => {
    deactivateListener();

    // Clear stores between tests
    const db = (await import('../datastore.js')).getRawDb();
    const storeNames = ['items', 'tags', 'item_tags', 'extension_settings'];
    for (const name of storeNames) {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).clear();
      await new Promise(r => { tx.oncomplete = r; });
    }

    // Reset storage and history mocks without touching IndexedDB
    const storage = getStorageData();
    for (const key of Object.keys(storage)) delete storage[key];
    chrome.history.onVisited._listeners.length = 0;
    setMockHistoryItems([]);
    setMockVisitsByUrl({});
  });

  after(() => {
    closeDatabase();
  });

  // ==================== Config ====================

  describe('config', () => {
    it('should default to disabled', async () => {
      const enabled = await isHistorySyncEnabled();
      assert.equal(enabled, false);
    });

    it('should save and read enabled state', async () => {
      await setHistorySyncEnabled(true);
      assert.equal(await isHistorySyncEnabled(), true);

      await setHistorySyncEnabled(false);
      assert.equal(await isHistorySyncEnabled(), false);
    });
  });

  // ==================== Import ====================

  describe('importAllHistory', () => {
    it('should import history items with correct count', async () => {
      setMockHistoryItems([
        { url: 'https://example.com', title: 'Example', lastVisitTime: 1000, visitCount: 3, typedCount: 1 },
        { url: 'https://test.org', title: 'Test', lastVisitTime: 2000, visitCount: 1, typedCount: 0 },
      ]);
      setMockVisitsByUrl({
        'https://example.com': [
          { visitId: '1', visitTime: 1000, referringVisitId: '0', transition: 'typed' },
        ],
        'https://test.org': [
          { visitId: '2', visitTime: 2000, referringVisitId: '0', transition: 'link' },
        ],
      });

      const result = await importAllHistory();
      assert.equal(result.imported, 2);
      assert.equal(result.updated, 0);
      assert.equal(result.skipped, 0);
    });

    it('should skip internal URLs', async () => {
      setMockHistoryItems([
        { url: 'https://example.com', title: 'Example', lastVisitTime: 1000, visitCount: 1, typedCount: 0 },
        { url: 'about:blank', title: 'Blank', lastVisitTime: 0, visitCount: 1, typedCount: 0 },
        { url: 'chrome://settings', title: 'Settings', lastVisitTime: 0, visitCount: 1, typedCount: 0 },
        { url: 'moz-extension://abc/page.html', title: 'Ext', lastVisitTime: 0, visitCount: 1, typedCount: 0 },
        { url: 'data:text/html,hello', title: 'Data', lastVisitTime: 0, visitCount: 1, typedCount: 0 },
        { url: 'javascript:void(0)', title: 'JS', lastVisitTime: 0, visitCount: 1, typedCount: 0 },
      ]);
      setMockVisitsByUrl({
        'https://example.com': [{ visitId: '1', visitTime: 1000, referringVisitId: '0', transition: 'typed' }],
      });

      const result = await importAllHistory();
      assert.equal(result.imported, 1);
      assert.equal(result.skipped, 5);
    });

    it('should update existing items instead of duplicating', async () => {
      // Pre-add an item with the same URL
      await addItem('url', {
        content: 'https://example.com',
        metadata: { title: 'Old Title', visitCount: 1 },
        syncSource: 'history',
      });

      setMockHistoryItems([
        { url: 'https://example.com', title: 'New Title', lastVisitTime: 5000, visitCount: 10, typedCount: 3 },
      ]);
      setMockVisitsByUrl({
        'https://example.com': [
          { visitId: '1', visitTime: 1000, referringVisitId: '0', transition: 'typed' },
          { visitId: '2', visitTime: 5000, referringVisitId: '0', transition: 'link' },
        ],
      });

      const result = await importAllHistory();
      assert.equal(result.imported, 0);
      assert.equal(result.updated, 1);
      assert.equal(result.skipped, 0);

      // Verify only one item exists (not duplicated)
      const items = await queryItems({ type: 'url' });
      const matching = items.data.filter(i => i.content === 'https://example.com');
      assert.equal(matching.length, 1);

      // Verify metadata was updated
      const meta = JSON.parse(matching[0].metadata);
      assert.equal(meta.title, 'New Title');
      assert.equal(meta.visitCount, 10);
      assert.equal(meta.typedCount, 3);
    });

    it('should add items with syncSource history and from:history tag', async () => {
      setMockHistoryItems([
        { url: 'https://tagged.com', title: 'Tagged', lastVisitTime: 1000, visitCount: 1, typedCount: 0 },
      ]);
      setMockVisitsByUrl({
        'https://tagged.com': [{ visitId: '1', visitTime: 1000, referringVisitId: '0', transition: 'link' }],
      });

      await importAllHistory();

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 1);
      assert.equal(items.data[0].syncSource, 'history');
      assert.equal(items.data[0].content, 'https://tagged.com');

      const tags = await getItemTags(items.data[0].id);
      assert.equal(tags.success, true);
      const tagNames = tags.data.map(t => t.name);
      assert.ok(tagNames.includes('from:history'));
    });

    it('should capture full visit metadata', async () => {
      setMockHistoryItems([
        { url: 'https://meta.com', title: 'Meta Page', lastVisitTime: 3000, visitCount: 5, typedCount: 2 },
      ]);
      setMockVisitsByUrl({
        'https://meta.com': [
          { visitId: '10', visitTime: 1000, referringVisitId: '0', transition: 'typed' },
          { visitId: '11', visitTime: 2000, referringVisitId: '10', transition: 'link' },
          { visitId: '12', visitTime: 3000, referringVisitId: '0', transition: 'typed' },
        ],
      });

      await importAllHistory();

      const items = await queryItems({ type: 'url' });
      const meta = JSON.parse(items.data[0].metadata);
      assert.equal(meta.title, 'Meta Page');
      assert.equal(meta.lastVisitTime, 3000);
      assert.equal(meta.visitCount, 5);
      assert.equal(meta.typedCount, 2);
      assert.equal(meta.visits.length, 3);
      assert.equal(meta.visits[0].visitId, '10');
      assert.equal(meta.visits[0].transition, 'typed');
      assert.equal(meta.visits[1].referringVisitId, '10');
    });

    it('should handle items with no visits', async () => {
      setMockHistoryItems([
        { url: 'https://no-visits.com', title: 'No Visits', lastVisitTime: 0, visitCount: 0, typedCount: 0 },
      ]);
      setMockVisitsByUrl({});

      const result = await importAllHistory();
      assert.equal(result.imported, 1);

      const items = await queryItems({ type: 'url' });
      const meta = JSON.parse(items.data[0].metadata);
      assert.deepEqual(meta.visits, []);
    });

    it('should deduplicate across re-imports', async () => {
      setMockHistoryItems([
        { url: 'https://once.com', title: 'Once', lastVisitTime: 1000, visitCount: 1, typedCount: 0 },
      ]);
      setMockVisitsByUrl({
        'https://once.com': [{ visitId: '1', visitTime: 1000, referringVisitId: '0', transition: 'link' }],
      });

      const first = await importAllHistory();
      assert.equal(first.imported, 1);

      // Re-import — should update, not duplicate
      const second = await importAllHistory();
      assert.equal(second.imported, 0);
      assert.equal(second.updated, 1);

      const items = await queryItems({ type: 'url' });
      const matching = items.data.filter(i => i.content === 'https://once.com');
      assert.equal(matching.length, 1);
    });
  });

  // ==================== Stats ====================

  describe('getHistoryStats', () => {
    it('should return correct counts excluding internal URLs', async () => {
      setMockHistoryItems([
        { url: 'https://example.com', title: 'Example', lastVisitTime: 1000, visitCount: 1, typedCount: 0 },
        { url: 'about:blank', title: 'Blank', lastVisitTime: 0, visitCount: 1, typedCount: 0 },
        { url: 'chrome://settings', title: 'Settings', lastVisitTime: 0, visitCount: 1, typedCount: 0 },
      ]);

      // Add a history-sourced item and tag it (simulating a real import)
      const itemResult = await addItem('url', { content: 'https://imported.com', syncSource: 'history' });
      const tagResult = await getOrCreateTag('from:history');
      await tagItem(itemResult.data.id, tagResult.data.tag.id);

      const stats = await getHistoryStats();
      assert.equal(stats.historyItems, 1); // internal URLs filtered
      assert.equal(stats.imported, 1);
      assert.equal(stats.synced, 0);
    });
  });

  // ==================== Listener ====================

  describe('activateListener / deactivateListener', () => {
    it('should register the onVisited callback', () => {
      assert.equal(chrome.history.onVisited._listeners.length, 0);
      activateListener();
      assert.equal(chrome.history.onVisited._listeners.length, 1);
    });

    it('should not double-register', () => {
      activateListener();
      activateListener();
      assert.equal(chrome.history.onVisited._listeners.length, 1);
    });

    it('should remove the callback on deactivate', () => {
      activateListener();
      assert.equal(chrome.history.onVisited._listeners.length, 1);
      deactivateListener();
      assert.equal(chrome.history.onVisited._listeners.length, 0);
    });
  });

  describe('onVisited handler', () => {
    it('should add a new item on visit', async () => {
      setMockVisitsByUrl({
        'https://live.example.com': [
          { visitId: '99', visitTime: 9000, referringVisitId: '0', transition: 'typed' },
        ],
      });

      activateListener();

      simulateHistoryVisited({
        url: 'https://live.example.com',
        title: 'Live Visit',
        lastVisitTime: 9000,
        visitCount: 1,
        typedCount: 1,
      });

      // Give the async handler time to complete
      await new Promise(r => setTimeout(r, 100));

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 1);
      assert.equal(items.data[0].content, 'https://live.example.com');
      assert.equal(items.data[0].syncSource, 'history');
    });

    it('should update existing item on revisit', async () => {
      // Pre-add an item
      await addItem('url', {
        content: 'https://revisit.com',
        metadata: { title: 'Original', visitCount: 1 },
        syncSource: 'history',
      });

      setMockVisitsByUrl({
        'https://revisit.com': [
          { visitId: '1', visitTime: 1000, referringVisitId: '0', transition: 'typed' },
          { visitId: '2', visitTime: 5000, referringVisitId: '0', transition: 'link' },
        ],
      });

      activateListener();

      simulateHistoryVisited({
        url: 'https://revisit.com',
        title: 'Updated Title',
        lastVisitTime: 5000,
        visitCount: 2,
        typedCount: 1,
      });

      await new Promise(r => setTimeout(r, 100));

      const items = await queryItems({ type: 'url' });
      const matching = items.data.filter(i => i.content === 'https://revisit.com');
      assert.equal(matching.length, 1);

      const meta = JSON.parse(matching[0].metadata);
      assert.equal(meta.title, 'Updated Title');
      assert.equal(meta.visitCount, 2);
    });

    it('should skip internal URLs on visit', async () => {
      activateListener();

      simulateHistoryVisited({
        url: 'about:blank',
        title: 'Blank',
        lastVisitTime: 0,
        visitCount: 1,
        typedCount: 0,
      });

      await new Promise(r => setTimeout(r, 100));

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 0);
    });

    it('should skip items with no url', async () => {
      activateListener();

      simulateHistoryVisited({
        title: 'No URL',
        lastVisitTime: 0,
        visitCount: 1,
        typedCount: 0,
      });

      await new Promise(r => setTimeout(r, 100));

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 0);
    });
  });

  // ==================== initHistorySync ====================

  describe('initHistorySync', () => {
    it('should activate listener when enabled', async () => {
      await setHistorySyncEnabled(true);
      await initHistorySync();
      assert.equal(chrome.history.onVisited._listeners.length, 1);
    });

    it('should not activate listener when disabled', async () => {
      await setHistorySyncEnabled(false);
      await initHistorySync();
      assert.equal(chrome.history.onVisited._listeners.length, 0);
    });
  });
});
