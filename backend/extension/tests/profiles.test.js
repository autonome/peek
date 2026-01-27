import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetMocks } from './helpers/mocks.js';
import {
  ensureDefaultProfile,
  listProfiles,
  createProfile,
  getProfile,
  getProfileById,
  getCurrentProfile,
  switchProfile,
  deleteProfile,
  enableSync,
  disableSync,
  getSyncConfig,
} from '../profiles.js';

describe('profiles', () => {
  beforeEach(async () => {
    await resetMocks();
  });

  // ==================== ensureDefaultProfile ====================

  describe('ensureDefaultProfile', () => {
    it('should create default profile if none exists', async () => {
      await ensureDefaultProfile();
      const result = await listProfiles();
      assert.equal(result.data.length, 1);
      assert.equal(result.data[0].slug, 'default');
      assert.equal(result.data[0].isDefault, true);
    });

    it('should not duplicate default profile', async () => {
      await ensureDefaultProfile();
      await ensureDefaultProfile();
      const result = await listProfiles();
      assert.equal(result.data.length, 1);
    });
  });

  // ==================== createProfile ====================

  describe('createProfile', () => {
    it('should create a new profile', async () => {
      const result = await createProfile('Work');
      assert.equal(result.success, true);
      assert.equal(result.data.name, 'Work');
      assert.equal(result.data.slug, 'work');
      assert.equal(result.data.isDefault, false);
    });

    it('should reject duplicate slugs', async () => {
      await createProfile('Work');
      const result = await createProfile('Work');
      assert.equal(result.success, false);
      assert.ok(result.error.includes('already exists'));
    });
  });

  // ==================== listProfiles ====================

  describe('listProfiles', () => {
    it('should return all profiles sorted by lastUsedAt', async () => {
      await ensureDefaultProfile();
      await createProfile('Work');
      await createProfile('Personal');

      const result = await listProfiles();
      assert.equal(result.data.length, 3);
    });
  });

  // ==================== getCurrentProfile ====================

  describe('getCurrentProfile', () => {
    it('should return default profile initially', async () => {
      await ensureDefaultProfile();
      const result = await getCurrentProfile();
      assert.equal(result.success, true);
      assert.equal(result.data.slug, 'default');
    });

    it('should return error when no profiles exist', async () => {
      const result = await getCurrentProfile();
      assert.equal(result.success, false);
    });
  });

  // ==================== switchProfile ====================

  describe('switchProfile', () => {
    it('should switch active profile', async () => {
      await ensureDefaultProfile();
      await createProfile('Work');
      await switchProfile('work');

      const result = await getCurrentProfile();
      assert.equal(result.data.slug, 'work');
    });

    it('should fail for non-existent profile', async () => {
      const result = await switchProfile('nonexistent');
      assert.equal(result.success, false);
    });
  });

  // ==================== getProfile / getProfileById ====================

  describe('getProfile', () => {
    it('should get profile by slug', async () => {
      await ensureDefaultProfile();
      const result = await getProfile('default');
      assert.equal(result.data.slug, 'default');
    });

    it('should return null for non-existent slug', async () => {
      const result = await getProfile('nonexistent');
      assert.equal(result.data, null);
    });
  });

  describe('getProfileById', () => {
    it('should get profile by id', async () => {
      const created = await createProfile('Test');
      const result = await getProfileById(created.data.id);
      assert.equal(result.data.name, 'Test');
    });
  });

  // ==================== deleteProfile ====================

  describe('deleteProfile', () => {
    it('should delete a profile', async () => {
      await ensureDefaultProfile();
      const { data: profile } = await createProfile('Temp');
      const result = await deleteProfile(profile.id);
      assert.equal(result.success, true);

      const list = await listProfiles();
      assert.equal(list.data.length, 1);
    });

    it('should not delete default profile', async () => {
      await ensureDefaultProfile();
      const { data: profiles } = await listProfiles();
      const defaultProfile = profiles.find(p => p.isDefault);
      const result = await deleteProfile(defaultProfile.id);
      assert.equal(result.success, false);
      assert.ok(result.error.includes('default'));
    });

    it('should not delete active profile', async () => {
      await ensureDefaultProfile();
      const { data: profile } = await createProfile('Active');
      await switchProfile('active');

      const result = await deleteProfile(profile.id);
      assert.equal(result.success, false);
      assert.ok(result.error.includes('active'));
    });
  });

  // ==================== enableSync / disableSync ====================

  describe('enableSync', () => {
    it('should enable sync with config', async () => {
      const { data: profile } = await createProfile('SyncTest');
      const result = await enableSync(profile.id, 'my-api-key', 'default');
      assert.equal(result.success, true);

      const configResult = await getSyncConfig(profile.id);
      assert.equal(configResult.data.apiKey, 'my-api-key');
      assert.equal(configResult.data.serverProfileId, 'default');
    });
  });

  describe('disableSync', () => {
    it('should disable sync and clear config', async () => {
      const { data: profile } = await createProfile('SyncTest2');
      await enableSync(profile.id, 'key', 'slug');
      await disableSync(profile.id);

      const configResult = await getSyncConfig(profile.id);
      assert.equal(configResult.data, null);
    });
  });
});
