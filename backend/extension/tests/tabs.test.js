import { describe, it, before, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetMocks, setMockTabs, setMockTabGroups, simulateTabUpdated, getStorageData } from './helpers/mocks.js';
import { openDatabase, closeDatabase, queryItems, getItemTags, addItem, getOrCreateTag, tagItem } from '../datastore.js';
import {
  isTabSyncEnabled,
  setTabSyncEnabled,
  importAllTabs,
  getTabStats,
  activateListeners,
  deactivateListeners,
  initTabSync,
} from '../tabs.js';

describe('tabs', () => {
  before(async () => {
    await resetMocks();
    await openDatabase();
  });

  afterEach(async () => {
    deactivateListeners();

    // Clear stores between tests
    const db = (await import('../datastore.js')).getRawDb();
    const storeNames = ['items', 'tags', 'item_tags', 'extension_settings'];
    for (const name of storeNames) {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).clear();
      await new Promise(r => { tx.oncomplete = r; });
    }

    // Reset storage and tab mocks without touching IndexedDB
    const storage = getStorageData();
    for (const key of Object.keys(storage)) delete storage[key];
    chrome.tabs.onUpdated._listeners.length = 0;
    setMockTabs([]);
    setMockTabGroups({});
  });

  after(() => {
    closeDatabase();
  });

  // ==================== Config ====================

  describe('config', () => {
    it('should default to disabled', async () => {
      const enabled = await isTabSyncEnabled();
      assert.equal(enabled, false);
    });

    it('should save and read enabled state', async () => {
      await setTabSyncEnabled(true);
      assert.equal(await isTabSyncEnabled(), true);

      await setTabSyncEnabled(false);
      assert.equal(await isTabSyncEnabled(), false);
    });
  });

  // ==================== Import ====================

  describe('importAllTabs', () => {
    it('should import tabs with correct count', async () => {
      setMockTabs([
        { id: 1, url: 'https://example.com', title: 'Example', windowId: 1, index: 0, groupId: -1 },
        { id: 2, url: 'https://test.org', title: 'Test', windowId: 1, index: 1, groupId: -1 },
      ]);

      const result = await importAllTabs();
      assert.equal(result.imported, 2);
      assert.equal(result.skipped, 0);
    });

    it('should skip internal URLs', async () => {
      setMockTabs([
        { id: 1, url: 'https://example.com', title: 'Example', groupId: -1 },
        { id: 2, url: 'about:blank', title: 'Blank', groupId: -1 },
        { id: 3, url: 'chrome://settings', title: 'Settings', groupId: -1 },
        { id: 4, url: 'moz-extension://abc/page.html', title: 'Ext', groupId: -1 },
        { id: 5, url: 'data:text/html,hello', title: 'Data', groupId: -1 },
        { id: 6, url: 'javascript:void(0)', title: 'JS', groupId: -1 },
      ]);

      const result = await importAllTabs();
      assert.equal(result.imported, 1);
      assert.equal(result.skipped, 5);
    });

    it('should deduplicate URLs already in Peek but still tag them', async () => {
      await addItem('url', { content: 'https://example.com' });

      setMockTabs([
        { id: 1, url: 'https://example.com', title: 'Example', groupId: -1 },
        { id: 2, url: 'https://new-site.org', title: 'New', groupId: -1 },
      ]);

      const result = await importAllTabs();
      assert.equal(result.imported, 1);
      assert.equal(result.skipped, 1);

      // The existing item should now have the from:tab tag
      const items = await queryItems({ type: 'url' });
      const existingItem = items.data.find(i => i.content === 'https://example.com');
      const tags = await getItemTags(existingItem.id);
      const tagNames = tags.data.map(t => t.name);
      assert.ok(tagNames.includes('from:tab'));
    });

    it('should add items with syncSource tab and from:tab tag', async () => {
      setMockTabs([
        { id: 1, url: 'https://tagged.com', title: 'Tagged', groupId: -1 },
      ]);

      await importAllTabs();

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 1);
      assert.equal(items.data[0].syncSource, 'tab');
      assert.equal(items.data[0].content, 'https://tagged.com');

      const tags = await getItemTags(items.data[0].id);
      assert.equal(tags.success, true);
      const tagNames = tags.data.map(t => t.name).sort();
      assert.ok(tagNames.includes('from:tab'));
    });

    it('should tag ungrouped tabs with group:unfiled', async () => {
      setMockTabs([
        { id: 1, url: 'https://ungrouped.com', title: 'Ungrouped', groupId: -1 },
      ]);

      await importAllTabs();

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 1);

      const tags = await getItemTags(items.data[0].id);
      const tagNames = tags.data.map(t => t.name);
      assert.ok(tagNames.includes('group:unfiled'));
    });

    it('should tag grouped tabs with group:<name>', async () => {
      setMockTabGroups({
        5: { id: 5, title: 'Work', color: 'blue' },
      });

      setMockTabs([
        { id: 1, url: 'https://grouped.com', title: 'Grouped', groupId: 5 },
      ]);

      await importAllTabs();

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 1);

      const tags = await getItemTags(items.data[0].id);
      const tagNames = tags.data.map(t => t.name);
      assert.ok(tagNames.includes('group:Work'));
      assert.ok(tagNames.includes('from:tab'));
    });

    it('should use group:unnamed for groups without a title', async () => {
      setMockTabGroups({
        7: { id: 7, title: '', color: 'red' },
      });

      setMockTabs([
        { id: 1, url: 'https://unnamed-group.com', title: 'Tab', groupId: 7 },
      ]);

      await importAllTabs();

      const items = await queryItems({ type: 'url' });
      const tags = await getItemTags(items.data[0].id);
      const tagNames = tags.data.map(t => t.name);
      assert.ok(tagNames.includes('group:unnamed'));
    });

    it('should capture tab metadata', async () => {
      setMockTabs([
        {
          id: 42,
          url: 'https://meta.com',
          title: 'Meta',
          windowId: 1,
          index: 3,
          pinned: true,
          active: false,
          status: 'complete',
          incognito: false,
          favIconUrl: 'https://meta.com/favicon.ico',
          groupId: -1,
        },
      ]);

      await importAllTabs();

      const items = await queryItems({ type: 'url' });
      const meta = JSON.parse(items.data[0].metadata);
      assert.equal(meta.tabId, 42);
      assert.equal(meta.title, 'Meta');
      assert.equal(meta.windowId, 1);
      assert.equal(meta.index, 3);
      assert.equal(meta.pinned, true);
      assert.equal(meta.active, false);
      assert.equal(meta.favIconUrl, 'https://meta.com/favicon.ico');
    });
  });

  // ==================== Stats ====================

  describe('getTabStats', () => {
    it('should return correct counts', async () => {
      setMockTabs([
        { id: 1, url: 'https://example.com', groupId: -1 },
        { id: 2, url: 'about:blank', groupId: -1 },
      ]);

      // Add an item and tag it with from:tab (simulating a real import)
      const itemResult = await addItem('url', { content: 'https://imported.com', syncSource: 'tab' });
      const tagResult = await getOrCreateTag('from:tab');
      await tagItem(itemResult.data.id, tagResult.data.tag.id);

      const stats = await getTabStats();
      assert.equal(stats.openTabs, 1); // about:blank filtered
      assert.equal(stats.imported, 1);
      assert.equal(stats.synced, 0);
    });
  });

  // ==================== Listener ====================

  describe('activateListeners / deactivateListeners', () => {
    it('should register the onUpdated callback', () => {
      assert.equal(chrome.tabs.onUpdated._listeners.length, 0);
      activateListeners();
      assert.equal(chrome.tabs.onUpdated._listeners.length, 1);
    });

    it('should not double-register', () => {
      activateListeners();
      activateListeners();
      assert.equal(chrome.tabs.onUpdated._listeners.length, 1);
    });

    it('should remove the callback on deactivate', () => {
      activateListeners();
      assert.equal(chrome.tabs.onUpdated._listeners.length, 1);
      deactivateListeners();
      assert.equal(chrome.tabs.onUpdated._listeners.length, 0);
    });
  });

  describe('onUpdated handler', () => {
    it('should add a tab when status is complete', async () => {
      activateListeners();

      simulateTabUpdated(1, { status: 'complete' }, {
        id: 1,
        url: 'https://live.example.com',
        title: 'Live Tab',
        groupId: -1,
      });

      // Give the async handler time to complete
      await new Promise(r => setTimeout(r, 100));

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 1);
      assert.equal(items.data[0].content, 'https://live.example.com');
      assert.equal(items.data[0].syncSource, 'tab');
    });

    it('should skip when status is not complete', async () => {
      activateListeners();

      simulateTabUpdated(1, { status: 'loading' }, {
        id: 1,
        url: 'https://loading.example.com',
        title: 'Loading',
        groupId: -1,
      });

      await new Promise(r => setTimeout(r, 100));

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 0);
    });

    it('should skip internal URLs on update', async () => {
      activateListeners();

      simulateTabUpdated(1, { status: 'complete' }, {
        id: 1,
        url: 'about:blank',
        title: 'Blank',
        groupId: -1,
      });

      await new Promise(r => setTimeout(r, 100));

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 0);
    });

    it('should skip duplicate on update', async () => {
      await addItem('url', { content: 'https://dup.example.com' });

      activateListeners();

      simulateTabUpdated(1, { status: 'complete' }, {
        id: 1,
        url: 'https://dup.example.com',
        title: 'Dup',
        groupId: -1,
      });

      await new Promise(r => setTimeout(r, 100));

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 1);
    });
  });

  // ==================== initTabSync ====================

  describe('initTabSync', () => {
    it('should activate listeners when enabled', async () => {
      await setTabSyncEnabled(true);
      await initTabSync();
      assert.equal(chrome.tabs.onUpdated._listeners.length, 1);
    });

    it('should not activate listeners when disabled', async () => {
      await setTabSyncEnabled(false);
      await initTabSync();
      assert.equal(chrome.tabs.onUpdated._listeners.length, 0);
    });
  });
});
