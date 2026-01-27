import { describe, it, before, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetMocks, setBookmarkTree, simulateBookmarkCreated, getStorageData } from './helpers/mocks.js';
import { openDatabase, closeDatabase, queryItems, getItemTags, addItem } from '../datastore.js';
import {
  isBookmarkSyncEnabled,
  setBookmarkSyncEnabled,
  importAllBookmarks,
  activateListener,
  deactivateListener,
  initBookmarkSync,
} from '../bookmarks.js';

describe('bookmarks', () => {
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

    // Reset storage and bookmark tree without touching IndexedDB
    const storage = getStorageData();
    for (const key of Object.keys(storage)) delete storage[key];
    chrome.bookmarks.onCreated._listeners.length = 0;
    setBookmarkTree([
      {
        id: '0',
        title: '',
        children: [
          { id: '1', title: 'Bookmarks Toolbar', children: [] },
        ],
      },
    ]);
  });

  after(() => {
    closeDatabase();
  });

  // ==================== Config ====================

  describe('config', () => {
    it('should default to disabled', async () => {
      const enabled = await isBookmarkSyncEnabled();
      assert.equal(enabled, false);
    });

    it('should save and read enabled state', async () => {
      await setBookmarkSyncEnabled(true);
      assert.equal(await isBookmarkSyncEnabled(), true);

      await setBookmarkSyncEnabled(false);
      assert.equal(await isBookmarkSyncEnabled(), false);
    });
  });

  // ==================== Import ====================

  describe('importAllBookmarks', () => {
    it('should import bookmarks with correct count', async () => {
      setBookmarkTree([
        {
          id: '0',
          title: '',
          children: [
            {
              id: '1',
              title: 'Toolbar',
              children: [
                { id: '10', title: 'Example', url: 'https://example.com' },
                { id: '11', title: 'Test', url: 'https://test.org' },
              ],
            },
          ],
        },
      ]);

      const result = await importAllBookmarks();
      assert.equal(result.imported, 2);
      assert.equal(result.skipped, 0);
    });

    it('should skip folders (no url)', async () => {
      setBookmarkTree([
        {
          id: '0',
          title: '',
          children: [
            {
              id: '1',
              title: 'Folder only',
              children: [
                { id: '2', title: 'Subfolder', children: [] },
              ],
            },
          ],
        },
      ]);

      const result = await importAllBookmarks();
      assert.equal(result.imported, 0);
      assert.equal(result.skipped, 0);
    });

    it('should deduplicate URLs already in Peek but still tag them', async () => {
      await addItem('url', { content: 'https://example.com' });

      setBookmarkTree([
        {
          id: '0',
          title: '',
          children: [
            {
              id: '1',
              title: 'Toolbar',
              children: [
                { id: '10', title: 'Example', url: 'https://example.com' },
                { id: '11', title: 'New', url: 'https://new-site.org' },
              ],
            },
          ],
        },
      ]);

      const result = await importAllBookmarks();
      assert.equal(result.imported, 1);
      assert.equal(result.skipped, 1);

      // The existing item should now have the from:bookmark tag
      const items = await queryItems({ type: 'url' });
      const existingItem = items.data.find(i => i.content === 'https://example.com');
      const tags = await getItemTags(existingItem.id);
      const tagNames = tags.data.map(t => t.name);
      assert.ok(tagNames.includes('from:bookmark'));
    });

    it('should add items with syncSource bookmark and from:bookmark tag', async () => {
      setBookmarkTree([
        {
          id: '0',
          title: '',
          children: [
            { id: '10', title: 'Tagged', url: 'https://tagged.com' },
          ],
        },
      ]);

      await importAllBookmarks();

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 1);
      assert.equal(items.data[0].syncSource, 'bookmark');
      assert.equal(items.data[0].content, 'https://tagged.com');

      const tags = await getItemTags(items.data[0].id);
      assert.equal(tags.success, true);
      assert.equal(tags.data.length, 1);
      assert.equal(tags.data[0].name, 'from:bookmark');
    });
  });

  // ==================== Listener ====================

  describe('activateListener / deactivateListener', () => {
    it('should register the onCreated callback', () => {
      assert.equal(chrome.bookmarks.onCreated._listeners.length, 0);
      activateListener();
      assert.equal(chrome.bookmarks.onCreated._listeners.length, 1);
    });

    it('should not double-register', () => {
      activateListener();
      activateListener();
      assert.equal(chrome.bookmarks.onCreated._listeners.length, 1);
    });

    it('should remove the callback on deactivate', () => {
      activateListener();
      assert.equal(chrome.bookmarks.onCreated._listeners.length, 1);
      deactivateListener();
      assert.equal(chrome.bookmarks.onCreated._listeners.length, 0);
    });
  });

  describe('onCreated handler', () => {
    it('should add a single bookmark when created', async () => {
      activateListener();

      simulateBookmarkCreated('99', {
        id: '99',
        title: 'Live Bookmark',
        url: 'https://live.example.com',
      });

      // Give the async handler time to complete
      await new Promise(r => setTimeout(r, 100));

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 1);
      assert.equal(items.data[0].content, 'https://live.example.com');
      assert.equal(items.data[0].syncSource, 'bookmark');
    });

    it('should skip duplicate on created', async () => {
      await addItem('url', { content: 'https://dup.example.com' });

      activateListener();

      simulateBookmarkCreated('100', {
        id: '100',
        title: 'Dup',
        url: 'https://dup.example.com',
      });

      await new Promise(r => setTimeout(r, 100));

      const items = await queryItems({ type: 'url' });
      assert.equal(items.data.length, 1);
    });
  });

  // ==================== initBookmarkSync ====================

  describe('initBookmarkSync', () => {
    it('should activate listener when enabled', async () => {
      await setBookmarkSyncEnabled(true);
      await initBookmarkSync();
      assert.equal(chrome.bookmarks.onCreated._listeners.length, 1);
    });

    it('should not activate listener when disabled', async () => {
      await setBookmarkSyncEnabled(false);
      await initBookmarkSync();
      assert.equal(chrome.bookmarks.onCreated._listeners.length, 0);
    });
  });
});
