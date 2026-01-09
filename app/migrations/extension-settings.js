/**
 * Migration: Extension Settings localStorage -> Datastore
 *
 * One-time migration to move extension settings from localStorage
 * to the datastore extension_settings table for cross-origin access.
 *
 * Run this from core background context (peek://app/background.html)
 */

const api = window.app;

// Extension ID mapping: old UUID -> new shortname
const EXTENSION_ID_MAP = {
  'ef3bd271-d408-421f-9338-47b615571e43': 'peeks',
  '434108f3-18a6-437a-b507-2f998f693bb2': 'slides',
  '82de735f-a4b7-4fe6-a458-ec29939ae00d': 'groups'
};

const MIGRATION_KEY = 'migration:extension-settings:v1';

/**
 * Check if migration has already been completed
 */
export const isMigrationComplete = () => {
  return localStorage.getItem(MIGRATION_KEY) === 'complete';
};

/**
 * Mark migration as complete
 */
const markMigrationComplete = () => {
  localStorage.setItem(MIGRATION_KEY, 'complete');
};

/**
 * Migrate settings for a single extension
 * @param {string} oldId - Old UUID-based extension ID
 * @param {string} newId - New shortname-based extension ID
 */
const migrateExtension = async (oldId, newId) => {
  console.log(`[migration] Migrating ${oldId} -> ${newId}`);

  const storageKey = oldId;
  const storedData = localStorage.getItem(storageKey);

  if (!storedData) {
    console.log(`[migration] No localStorage data for ${oldId}`);
    return { migrated: false, reason: 'no data' };
  }

  try {
    const settings = JSON.parse(storedData);
    console.log(`[migration] Found settings for ${oldId}:`, Object.keys(settings));

    // Write each key to extension_settings table via IPC
    // Note: We can't use api.settings here because we're in core context, not extension context
    // So we use a direct datastore call

    for (const [key, value] of Object.entries(settings)) {
      const rowId = `${newId}:${key}`;
      const result = await api.datastore.setRow('extension_settings', rowId, {
        extensionId: newId,
        key,
        value: JSON.stringify(value),
        updatedAt: Date.now()
      });

      if (!result.success) {
        console.error(`[migration] Failed to migrate ${oldId}.${key}:`, result.error);
      } else {
        console.log(`[migration] Migrated ${oldId}.${key} to ${newId}`);
      }
    }

    return { migrated: true, keys: Object.keys(settings) };
  } catch (e) {
    console.error(`[migration] Failed to parse settings for ${oldId}:`, e);
    return { migrated: false, reason: 'parse error', error: e.message };
  }
};

/**
 * Run the migration for all extensions
 */
export const runMigration = async () => {
  if (isMigrationComplete()) {
    console.log('[migration] Extension settings migration already complete');
    return { skipped: true };
  }

  console.log('[migration] Starting extension settings migration...');

  const results = {};

  for (const [oldId, newId] of Object.entries(EXTENSION_ID_MAP)) {
    results[newId] = await migrateExtension(oldId, newId);
  }

  markMigrationComplete();
  console.log('[migration] Extension settings migration complete:', results);

  return { completed: true, results };
};

/**
 * Reset migration (for testing)
 */
export const resetMigration = () => {
  localStorage.removeItem(MIGRATION_KEY);
  console.log('[migration] Migration reset');
};

export default {
  isMigrationComplete,
  runMigration,
  resetMigration
};
