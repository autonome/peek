import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetMocks } from './helpers/mocks.js';
import { initialize, close, data, sync, getConfig, setConfig } from '../engine.js';
import { ensureDefaultProfile, getCurrentProfile, enableSync } from '../profiles.js';

// Helper to build a mock Response
function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Peek-Datastore-Version': '1',
      'X-Peek-Protocol-Version': '1',
      ...headers,
    },
  });
}

describe('sync', () => {
  let mockFetchHandler;

  beforeEach(async () => {
    await resetMocks();
    await initialize();
    await ensureDefaultProfile();

    // Configure sync for default profile
    const profile = (await getCurrentProfile()).data;
    await enableSync(profile.id, 'test-api-key', 'default');
    await setConfig({ serverUrl: 'https://test-server.example.com', autoSync: false });

    // Install custom fetch on the SyncEngine instance
    mockFetchHandler = null;
    sync._fetch = async (...args) => {
      if (mockFetchHandler) return mockFetchHandler(...args);
      return jsonResponse({ items: [] });
    };
  });

  afterEach(async () => {
    await close();
  });

  // ==================== Config ====================

  describe('getConfig', () => {
    it('should return configured sync settings', async () => {
      const config = await getConfig();
      assert.equal(config.serverUrl, 'https://test-server.example.com');
      assert.equal(config.apiKey, 'test-api-key');
      assert.equal(config.autoSync, false);
    });
  });

  describe('setConfig', () => {
    it('should persist server URL', async () => {
      await setConfig({ serverUrl: 'https://new-server.com' });
      const config = await getConfig();
      assert.equal(config.serverUrl, 'https://new-server.com');
    });

    it('should persist autoSync setting', async () => {
      await setConfig({ autoSync: true });
      const config = await getConfig();
      assert.equal(config.autoSync, true);
    });
  });

  // ==================== Pull ====================

  describe('pullFromServer', () => {
    it('should insert new items from server', async () => {
      const serverItem = {
        id: 'server-1',
        type: 'text',
        content: 'From server',
        tags: [],
        metadata: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z').getTime(),
        updatedAt: new Date('2024-01-01T00:00:00.000Z').getTime(),
      };

      mockFetchHandler = async () => jsonResponse({ items: [serverItem] });

      const result = await sync.pullFromServer();
      assert.equal(result.pulled, 1);

      // Verify item was created locally
      const items = await data.queryItems();
      assert.equal(items.length, 1);
      assert.equal(items[0].content, 'From server');
      assert.equal(items[0].syncId, 'server-1');
      assert.equal(items[0].syncSource, 'server');
    });

    it('should update local when server is newer', async () => {
      // Add local item synced from server
      const { id: localId } = await data.addItem('text', {
        content: 'Old content',
        syncId: 'server-2',
        syncSource: 'server',
      });

      // Make server item newer
      const futureTime = Date.now() + 100000;
      const serverItem = {
        id: 'server-2',
        type: 'text',
        content: 'Updated content',
        tags: [],
        metadata: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z').getTime(),
        updatedAt: futureTime,
      };

      mockFetchHandler = async () => jsonResponse({ items: [serverItem] });

      const result = await sync.pullFromServer();
      assert.equal(result.pulled, 1);

      const item = await data.getItem(localId);
      assert.equal(item.content, 'Updated content');
    });

    it('should skip when local is newer (conflict)', async () => {
      // Add local item that's been modified recently
      const { id: localId } = await data.addItem('text', {
        content: 'Local content',
        syncId: 'server-3',
        syncSource: 'server',
      });

      // Server item has old timestamp
      const serverItem = {
        id: 'server-3',
        type: 'text',
        content: 'Server old content',
        tags: [],
        metadata: null,
        createdAt: new Date('2020-01-01T00:00:00.000Z').getTime(),
        updatedAt: new Date('2020-01-01T00:00:00.000Z').getTime(),
      };

      mockFetchHandler = async () => jsonResponse({ items: [serverItem] });

      const result = await sync.pullFromServer();
      assert.equal(result.conflicts, 1);

      // Local content should be unchanged
      const item = await data.getItem(localId);
      assert.equal(item.content, 'Local content');
    });

    it('should handle empty response', async () => {
      mockFetchHandler = async () => jsonResponse({ items: [] });

      const result = await sync.pullFromServer();
      assert.equal(result.pulled, 0);
    });
  });

  // ==================== Push ====================

  describe('pushToServer', () => {
    it('should push unsynced items', async () => {
      await data.addItem('text', { content: 'To push' });

      const pushedItems = [];
      mockFetchHandler = async (url, opts) => {
        if (opts && opts.method === 'POST') {
          const body = JSON.parse(opts.body);
          pushedItems.push(body);
          return jsonResponse({ id: 'server-new-1', created: true });
        }
        return jsonResponse({ items: [] });
      };

      const result = await sync.pushToServer();
      assert.equal(result.pushed, 1);
      assert.equal(pushedItems[0].content, 'To push');
      assert.equal(pushedItems[0].type, 'text');
    });

    it('should not push server-synced items', async () => {
      // Item from server (syncSource set)
      await data.addItem('text', {
        content: 'From server',
        syncId: 'server-x',
        syncSource: 'server',
      });

      let pushCount = 0;
      mockFetchHandler = async (url, opts) => {
        if (opts && opts.method === 'POST') {
          pushCount++;
          return jsonResponse({ id: 'server-x', created: false });
        }
        return jsonResponse({ items: [] });
      };

      await sync.pushToServer();
      assert.equal(pushCount, 0);
    });

    it('should send version headers', async () => {
      await data.addItem('text', { content: 'Header test' });

      let capturedHeaders = {};
      mockFetchHandler = async (url, opts) => {
        capturedHeaders = opts.headers;
        return jsonResponse({ id: 'server-h', created: true });
      };

      await sync.pushToServer();
      assert.equal(capturedHeaders['X-Peek-Client'], 'sync-engine');
      assert.equal(capturedHeaders['X-Peek-Datastore-Version'], '1');
      assert.equal(capturedHeaders['X-Peek-Protocol-Version'], '1');
    });
  });

  // ==================== syncAll ====================

  describe('syncAll', () => {
    it('should pull then push and update lastSyncTime', async () => {
      await data.addItem('text', { content: 'Local item' });

      const serverItem = {
        id: 'server-sync-1',
        type: 'url',
        content: 'https://synced.com',
        tags: [],
        metadata: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z').getTime(),
        updatedAt: new Date('2024-01-01T00:00:00.000Z').getTime(),
      };

      let requestLog = [];
      mockFetchHandler = async (url, opts) => {
        requestLog.push({ url, method: opts?.method || 'GET' });
        if (opts && opts.method === 'POST') {
          return jsonResponse({ id: 'pushed-1', created: true });
        }
        return jsonResponse({ items: [serverItem] });
      };

      const result = await sync.syncAll();
      assert.equal(result.pulled, 1);
      assert.equal(result.pushed, 1);
      assert.ok(result.lastSyncTime > 0);

      // Verify pull happened before push (GET before POST)
      const getIdx = requestLog.findIndex(r => r.method === 'GET');
      const postIdx = requestLog.findIndex(r => r.method === 'POST');
      assert.ok(getIdx < postIdx);
    });
  });

  // ==================== Status ====================

  describe('getSyncStatus', () => {
    it('should report configured status', async () => {
      const status = await sync.getSyncStatus();
      assert.equal(status.configured, true);
    });

    it('should count pending items', async () => {
      await data.addItem('text', { content: 'pending' });
      await data.addItem('text', { content: 'pending too' });

      const status = await sync.getSyncStatus();
      assert.equal(status.pendingCount, 2);
    });
  });

  // ==================== Server-Change Detection ====================

  describe('resetSyncStateIfServerChanged', () => {
    it('should reset sync markers when server URL changes', async () => {
      // Add an item synced from server
      await data.addItem('text', {
        content: 'Synced item',
        syncId: 'server-sc-1',
        syncSource: 'server',
      });

      // Save current server config
      await sync.saveSyncServerConfig('https://test-server.example.com');

      // Verify the saved config
      const savedUrl = await data.getSetting('sync_lastSyncServerUrl');
      assert.equal(JSON.parse(savedUrl), 'https://test-server.example.com');

      // Change server URL and detect the change
      await setConfig({ serverUrl: 'https://new-server.example.com' });
      const changed = await sync.resetSyncStateIfServerChanged('https://new-server.example.com');
      assert.equal(changed, true);

      // Verify sync markers were reset
      const items = await data.queryItems();
      const syncedItem = items.find(i => i.content === 'Synced item');
      assert.equal(syncedItem.syncSource, '');
      assert.equal(syncedItem.syncedAt, 0);
      assert.equal(syncedItem.syncId, '');
    });

    it('should not reset when server URL is unchanged', async () => {
      await data.addItem('text', {
        content: 'Stable item',
        syncId: 'server-sc-2',
        syncSource: 'server',
      });

      // Save config with same URL
      await sync.saveSyncServerConfig('https://test-server.example.com');

      // Check with same URL
      const changed = await sync.resetSyncStateIfServerChanged('https://test-server.example.com');
      assert.equal(changed, false);

      // Verify sync markers are intact
      const items = await data.queryItems();
      const item = items.find(i => i.content === 'Stable item');
      assert.equal(item.syncSource, 'server');
      assert.equal(item.syncId, 'server-sc-2');
    });

    it('should not reset on first run (no stored config)', async () => {
      // Add server-synced items without any stored config (simulates upgrade)
      await data.addItem('text', {
        content: 'Legacy item',
        syncId: 'server-legacy-1',
        syncSource: 'server',
      });

      // No stored config yet — unified engine does NOT reset on first run
      const changed = await sync.resetSyncStateIfServerChanged('https://test-server.example.com');
      assert.equal(changed, false);

      // Sync markers should be intact
      const items = await data.queryItems();
      const item = items.find(i => i.content === 'Legacy item');
      assert.equal(item.syncSource, 'server');
      assert.equal(item.syncId, 'server-legacy-1');
    });
  });
});
