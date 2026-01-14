/**
 * Migration: Core/Feature localStorage -> Datastore
 *
 * One-time migration to move core settings and feature configurations
 * from localStorage to the datastore extension_settings table.
 * This enables syncing across backends (Electron, Tauri).
 *
 * Run this from core background context (peek://app/background.html)
 */

const api = window.app;

// UUID -> namespace mapping for core and features
const NAMESPACE_MAP = {
  '8aadaae5-2594-4968-aba0-707f0d371cfb': 'core',     // Core settings
  'cee1225d-40ac-41e5-a34c-e2edba69d599': 'cmd',      // Cmd feature
  '30c25027-d367-4595-b37f-9db3de853c37': 'scripts'   // Scripts feature
};

// Keys to migrate for each namespace
const KEYS_TO_MIGRATE = {
  'core': ['prefs', 'items'],
  'cmd': ['prefs'],
  'scripts': ['prefs', 'items']
};

const MIGRATION_KEY = 'migration:localstorage-to-datastore:v1';

// Cache the completion status to avoid repeated datastore calls
let migrationComplete = null;

/**
 * Check if migration has already been completed (async, uses datastore)
 */
export const isMigrationComplete = async () => {
  if (migrationComplete !== null) return migrationComplete;
  const result = await api.datastore.getRow('migrations', MIGRATION_KEY);
  migrationComplete = result.success && result.data?.status === 'complete';
  return migrationComplete;
};

/**
 * Mark migration as complete (async, uses datastore)
 */
const markMigrationComplete = async () => {
  await api.datastore.setRow('migrations', MIGRATION_KEY, {
    status: 'complete',
    completedAt: Date.now()
  });
  migrationComplete = true;
};

/**
 * Migrate a single key from localStorage to datastore
 * @param {string} oldId - Old UUID-based ID
 * @param {string} namespace - New namespace (core, cmd, scripts)
 * @param {string} key - The key to migrate (prefs, items)
 */
const migrateKey = async (oldId, namespace, key) => {
  const storageKey = `${oldId}+${key}`;
  const storedData = localStorage.getItem(storageKey);

  if (!storedData) {
    console.log(`[migration] No localStorage data for ${storageKey}`);
    return { migrated: false, reason: 'no data' };
  }

  try {
    const value = JSON.parse(storedData);
    console.log(`[migration] Found ${storageKey}, migrating to ${namespace}:${key}`);

    const rowId = `${namespace}:${key}`;
    const result = await api.datastore.setRow('extension_settings', rowId, {
      extensionId: namespace,
      key,
      value: JSON.stringify(value),
      updatedAt: Date.now()
    });

    if (!result.success) {
      console.error(`[migration] Failed to migrate ${storageKey}:`, result.error);
      return { migrated: false, reason: 'write error', error: result.error };
    }

    console.log(`[migration] Migrated ${storageKey} -> ${namespace}:${key}`);
    return { migrated: true };
  } catch (e) {
    console.error(`[migration] Failed to parse ${storageKey}:`, e);
    return { migrated: false, reason: 'parse error', error: e.message };
  }
};

/**
 * Run the migration for all core and feature settings
 */
export const runMigration = async () => {
  if (await isMigrationComplete()) {
    console.log('[migration] localStorage->datastore migration already complete');
    return { skipped: true };
  }

  console.log('[migration] Starting localStorage->datastore migration...');

  const results = {};

  for (const [oldId, namespace] of Object.entries(NAMESPACE_MAP)) {
    results[namespace] = {};
    const keys = KEYS_TO_MIGRATE[namespace] || [];

    for (const key of keys) {
      results[namespace][key] = await migrateKey(oldId, namespace, key);
    }
  }

  await markMigrationComplete();
  console.log('[migration] localStorage->datastore migration complete:', results);

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
