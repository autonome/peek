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
  const start = Date.now();
  for (const migration of migrations) {
    if (migration.check && await migration.check()) {
      continue;
    }

    try {
      await migration.run();
    } catch (e) {
      console.error(`[migrations] ${migration.name}: failed`, e);
    }
  }
  console.log(`[migrations] total: ${Date.now() - start}ms`);
};

export default { runMigrations };
