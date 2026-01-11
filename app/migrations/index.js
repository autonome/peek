/**
 * Migrations Index
 *
 * Run all pending migrations on app startup.
 * Migrations are run in order and only once.
 */

import extensionSettingsMigration from './extension-settings.js';
import localstorageToDatastoreMigration from './localstorage-to-datastore.js';

const migrations = [
  {
    name: 'extension-settings-v1',
    run: extensionSettingsMigration.runMigration,
    check: extensionSettingsMigration.isMigrationComplete
  },
  {
    name: 'localstorage-to-datastore-v1',
    run: localstorageToDatastoreMigration.runMigration,
    check: localstorageToDatastoreMigration.isMigrationComplete
  }
];

/**
 * Run all pending migrations
 */
export const runMigrations = async () => {
  console.log('[migrations] Checking for pending migrations...');

  for (const migration of migrations) {
    if (migration.check && migration.check()) {
      console.log(`[migrations] ${migration.name}: already complete`);
      continue;
    }

    console.log(`[migrations] ${migration.name}: running...`);
    try {
      const result = await migration.run();
      console.log(`[migrations] ${migration.name}: complete`, result);
    } catch (e) {
      console.error(`[migrations] ${migration.name}: failed`, e);
    }
  }

  console.log('[migrations] All migrations checked');
};

export default { runMigrations };
