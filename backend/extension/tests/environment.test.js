import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetMocks } from './helpers/mocks.js';
import { openDatabase, getRawDb } from '../datastore.js';
import { getDeviceId, getEnvironment, _resetCache } from '../environment.js';

describe('environment', () => {
  before(async () => {
    await resetMocks();
    await openDatabase();
  });

  afterEach(async () => {
    _resetCache();
    // Clear extension_settings between tests
    const db = getRawDb();
    const tx = db.transaction('extension_settings', 'readwrite');
    tx.objectStore('extension_settings').clear();
    await new Promise(r => { tx.oncomplete = r; });
  });

  // ==================== getDeviceId ====================

  describe('getDeviceId', () => {
    it('should generate an ID starting with extension-', async () => {
      const id = await getDeviceId();
      assert.ok(id.startsWith('extension-'), `Expected ID to start with "extension-", got: ${id}`);
    });

    it('should return the same ID on second call', async () => {
      const id1 = await getDeviceId();
      const id2 = await getDeviceId();
      assert.equal(id1, id2);
    });

    it('should persist across cache resets', async () => {
      const id1 = await getDeviceId();
      _resetCache();
      const id2 = await getDeviceId();
      assert.equal(id1, id2);
    });
  });

  // ==================== getEnvironment ====================

  describe('getEnvironment', () => {
    it('should return object with all expected fields', async () => {
      const env = await getEnvironment();

      assert.ok(env.deviceId, 'should have deviceId');
      assert.ok(env.deviceId.startsWith('extension-'));
      assert.equal(typeof env.browser, 'string');
      assert.equal(typeof env.platform, 'string');
      assert.equal(env.extensionVersion, '1.0.0');
      assert.equal(typeof env.lastSeen, 'number');
      // API-sourced fields
      assert.equal(env.os, 'mac');
      assert.equal(env.arch, 'arm64');
    });

    it('should detect browser from navigator.userAgent', async () => {
      const env = await getEnvironment();
      // Mock UA is Chrome on macOS
      assert.equal(env.browser, 'Chrome');
      assert.equal(env.platform, 'macOS');
      assert.ok(env.browserVersion);
    });
  });
});
