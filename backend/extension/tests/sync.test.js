import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetMocks } from './helpers/mocks.js';
import { openDatabase, closeDatabase, addItem, getItem, queryItems, getRawDb } from '../datastore.js';
import { ensureDefaultProfile, getCurrentProfile, enableSync } from '../profiles.js';
import { getSyncConfig, setSyncConfig, pullFromServer, pushToServer, syncAll, getSyncStatus } from '../sync.js';

// Save and restore original fetch
const originalFetch = globalThis.fetch;

function mockFetch(handler) {
  globalThis.fetch = handler;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

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
  beforeEach(async () => {
    await resetMocks();
    await openDatabase();
    await ensureDefaultProfile();

    // Configure sync for default profile
    const profile = (await getCurrentProfile()).data;
    await enableSync(profile.id, 'test-api-key', 'default');
    await setSyncConfig({ serverUrl: 'https://test-server.example.com', autoSync: false });
  });

  afterEach(() => {
    restoreFetch();
    closeDatabase();
  });

  // ==================== Config ====================

  describe('getSyncConfig', () => {
    it('should return configured sync settings', async () => {
      const result = await getSyncConfig();
      assert.equal(result.success, true);
      assert.equal(result.data.serverUrl, 'https://test-server.example.com');
      assert.equal(result.data.apiKey, 'test-api-key');
      assert.equal(result.data.autoSync, false);
    });
  });

  describe('setSyncConfig', () => {
    it('should persist server URL', async () => {
      await setSyncConfig({ serverUrl: 'https://new-server.com' });
      const result = await getSyncConfig();
      assert.equal(result.data.serverUrl, 'https://new-server.com');
    });

    it('should persist autoSync setting', async () => {
      await setSyncConfig({ autoSync: true });
      const result = await getSyncConfig();
      assert.equal(result.data.autoSync, true);
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
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      mockFetch(async () => jsonResponse({ items: [serverItem] }));

      const result = await pullFromServer();
      assert.equal(result.success, true);
      assert.equal(result.data.pulled, 1);

      // Verify item was created locally
      const items = (await queryItems()).data;
      assert.equal(items.length, 1);
      assert.equal(items[0].content, 'From server');
      assert.equal(items[0].syncId, 'server-1');
      assert.equal(items[0].syncSource, 'server');
    });

    it('should update local when server is newer', async () => {
      // Add local item synced from server
      const { data: { id: localId } } = await addItem('text', {
        content: 'Old content',
        syncId: 'server-2',
        syncSource: 'server',
      });

      // Make server item newer
      const futureDate = new Date(Date.now() + 100000).toISOString();
      const serverItem = {
        id: 'server-2',
        type: 'text',
        content: 'Updated content',
        tags: [],
        metadata: null,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: futureDate,
      };

      mockFetch(async () => jsonResponse({ items: [serverItem] }));

      const result = await pullFromServer();
      assert.equal(result.data.pulled, 1);

      const item = (await getItem(localId)).data;
      assert.equal(item.content, 'Updated content');
    });

    it('should skip when local is newer (conflict)', async () => {
      // Add local item that's been modified recently
      const { data: { id: localId } } = await addItem('text', {
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
        created_at: '2020-01-01T00:00:00.000Z',
        updated_at: '2020-01-01T00:00:00.000Z',
      };

      mockFetch(async () => jsonResponse({ items: [serverItem] }));

      const result = await pullFromServer();
      assert.equal(result.data.conflicts, 1);

      // Local content should be unchanged
      const item = (await getItem(localId)).data;
      assert.equal(item.content, 'Local content');
    });

    it('should handle empty response', async () => {
      mockFetch(async () => jsonResponse({ items: [] }));

      const result = await pullFromServer();
      assert.equal(result.success, true);
      assert.equal(result.data.pulled, 0);
    });
  });

  // ==================== Push ====================

  describe('pushToServer', () => {
    it('should push unsynced items', async () => {
      await addItem('text', { content: 'To push' });

      const pushedItems = [];
      mockFetch(async (url, opts) => {
        if (opts && opts.method === 'POST') {
          const body = JSON.parse(opts.body);
          pushedItems.push(body);
          return jsonResponse({ id: 'server-new-1', created: true });
        }
        return jsonResponse({ items: [] });
      });

      const result = await pushToServer();
      assert.equal(result.success, true);
      assert.equal(result.data.pushed, 1);
      assert.equal(pushedItems[0].content, 'To push');
      assert.equal(pushedItems[0].type, 'text');
    });

    it('should not push server-synced items', async () => {
      // Item from server (syncSource set)
      await addItem('text', {
        content: 'From server',
        syncId: 'server-x',
        syncSource: 'server',
      });

      let pushCount = 0;
      mockFetch(async (url, opts) => {
        if (opts && opts.method === 'POST') {
          pushCount++;
          return jsonResponse({ id: 'server-x', created: false });
        }
        return jsonResponse({ items: [] });
      });

      await pushToServer();
      assert.equal(pushCount, 0);
    });

    it('should send version headers', async () => {
      await addItem('text', { content: 'Header test' });

      let capturedHeaders = {};
      mockFetch(async (url, opts) => {
        capturedHeaders = opts.headers;
        return jsonResponse({ id: 'server-h', created: true });
      });

      await pushToServer();
      assert.equal(capturedHeaders['X-Peek-Client'], 'extension');
      assert.equal(capturedHeaders['X-Peek-Datastore-Version'], '1');
      assert.equal(capturedHeaders['X-Peek-Protocol-Version'], '1');
    });
  });

  // ==================== syncAll ====================

  describe('syncAll', () => {
    it('should pull then push and update lastSyncTime', async () => {
      await addItem('text', { content: 'Local item' });

      const serverItem = {
        id: 'server-sync-1',
        type: 'url',
        content: 'https://synced.com',
        tags: [],
        metadata: null,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      let requestLog = [];
      mockFetch(async (url, opts) => {
        requestLog.push({ url, method: opts?.method || 'GET' });
        if (opts && opts.method === 'POST') {
          return jsonResponse({ id: 'pushed-1', created: true });
        }
        return jsonResponse({ items: [serverItem] });
      });

      const result = await syncAll();
      assert.equal(result.success, true);
      assert.equal(result.data.pulled, 1);
      assert.equal(result.data.pushed, 1);
      assert.ok(result.data.lastSyncTime > 0);

      // Verify pull happened before push (GET before POST)
      const getIdx = requestLog.findIndex(r => r.method === 'GET');
      const postIdx = requestLog.findIndex(r => r.method === 'POST');
      assert.ok(getIdx < postIdx);
    });
  });

  // ==================== Status ====================

  describe('getSyncStatus', () => {
    it('should report configured status', async () => {
      const result = await getSyncStatus();
      assert.equal(result.data.configured, true);
    });

    it('should count pending items', async () => {
      await addItem('text', { content: 'pending' });
      await addItem('text', { content: 'pending too' });

      const result = await getSyncStatus();
      assert.equal(result.data.pendingCount, 2);
    });
  });
});
