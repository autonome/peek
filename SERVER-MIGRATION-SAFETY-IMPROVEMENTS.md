# Server Migration Safety Improvements

## Current Risk Assessment

The server migration function `migrateUserDataToProfiles()` uses `fs.renameSync()` which is a MOVE operation, not a copy. This poses data loss risks if something goes wrong during migration.

## Recommended Improvements (Priority Order)

### 1. HIGH PRIORITY - Add Pre-Migration Backup

Before moving any data, create a backup:

```javascript
function migrateUserDataToProfiles() {
  if (!fs.existsSync(DATA_DIR)) {
    return;
  }

  const userDirs = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name !== 'system.db')
    .map(dirent => dirent.name);

  let migratedCount = 0;

  for (const userId of userDirs) {
    const oldDbPath = path.join(DATA_DIR, userId, "peek.db");
    const newDbPath = path.join(DATA_DIR, userId, "profiles", "default", "datastore.sqlite");

    if (!fs.existsSync(oldDbPath) || fs.existsSync(newDbPath)) {
      continue;
    }

    try {
      // NEW: Create backup before migration
      const backupPath = `${oldDbPath}.pre-migration-backup`;
      if (!fs.existsSync(backupPath)) {
        console.log(`Creating pre-migration backup for ${userId}`);
        fs.copyFileSync(oldDbPath, backupPath);
      }

      // Create profile directory
      const profileDir = path.dirname(newDbPath);
      if (!fs.existsSync(profileDir)) {
        fs.mkdirSync(profileDir, { recursive: true });
      }

      // Move database file
      fs.renameSync(oldDbPath, newDbPath);
      console.log(`Migrated ${userId} data to profiles/default/datastore.sqlite`);

      // Verify the move succeeded
      if (!fs.existsSync(newDbPath)) {
        throw new Error('Migration verification failed: new DB not found');
      }

      // Create profile record
      const existingProfile = users.getProfile(userId, "default");
      if (!existingProfile) {
        users.createProfile(userId, "default", "Default");
        console.log(`Created default profile for user ${userId}`);
      }

      // Move images directory if it exists
      const oldImagesDir = path.join(DATA_DIR, userId, "images");
      const newImagesDir = path.join(DATA_DIR, userId, "profiles", "default", "images");
      if (fs.existsSync(oldImagesDir) && !fs.existsSync(newImagesDir)) {
        fs.renameSync(oldImagesDir, newImagesDir);
        console.log(`Migrated ${userId} images to profiles/default/images`);
      }

      // NEW: Migration successful, can delete backup after grace period
      console.log(`Migration successful for ${userId}. Backup kept at: ${backupPath}`);
      console.log(`(Backup can be manually deleted after verifying data integrity)`);

      migratedCount++;
    } catch (error) {
      console.error(`Failed to migrate ${userId}:`, error.message);

      // NEW: Attempt rollback if backup exists
      const backupPath = `${oldDbPath}.pre-migration-backup`;
      if (fs.existsSync(backupPath) && !fs.existsSync(oldDbPath)) {
        console.error(`Attempting rollback for ${userId}...`);
        try {
          fs.copyFileSync(backupPath, oldDbPath);
          console.log(`Rollback successful for ${userId}`);
        } catch (rollbackError) {
          console.error(`CRITICAL: Rollback failed for ${userId}:`, rollbackError.message);
          console.error(`Manual recovery required. Backup at: ${backupPath}`);
        }
      }
    }
  }

  if (migratedCount > 0) {
    console.log(`Migration complete: ${migratedCount} user(s) migrated to profiles structure`);
  }
}
```

### 2. MEDIUM PRIORITY - Add Migration Dry-Run Mode

Add an environment variable to test migration without moving data:

```javascript
const DRY_RUN = process.env.MIGRATION_DRY_RUN === 'true';

function migrateUserDataToProfiles() {
  if (DRY_RUN) {
    console.log('[DRY RUN] Migration check - no data will be moved');
  }

  // ... existing code ...

  for (const userId of userDirs) {
    // ... existing checks ...

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would migrate ${userId}: ${oldDbPath} -> ${newDbPath}`);
      continue;
    }

    try {
      // ... actual migration ...
    }
  }
}
```

Usage: `MIGRATION_DRY_RUN=true npm start`

### 3. MEDIUM PRIORITY - Add Data Integrity Verification

After migration, verify the database is valid:

```javascript
const Database = require('better-sqlite3');

function verifyDatabase(dbPath) {
  try {
    const db = new Database(dbPath, { readonly: true });

    // Run integrity check
    const result = db.pragma('integrity_check');
    db.close();

    return result[0].integrity_check === 'ok';
  } catch (error) {
    console.error(`Database verification failed: ${error.message}`);
    return false;
  }
}

// In migration function, after fs.renameSync():
if (!verifyDatabase(newDbPath)) {
  throw new Error('Database integrity check failed after migration');
}
```

### 4. LOW PRIORITY - Add Automatic Backup Cleanup

Clean up old migration backups after a grace period:

```javascript
// After migration completes successfully:
const backupPath = `${oldDbPath}.pre-migration-backup`;
const GRACE_PERIOD_DAYS = 30;

setTimeout(() => {
  if (fs.existsSync(backupPath)) {
    const stats = fs.statSync(backupPath);
    const ageMs = Date.now() - stats.mtimeMs;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays > GRACE_PERIOD_DAYS) {
      fs.unlinkSync(backupPath);
      console.log(`Cleaned up old migration backup: ${backupPath}`);
    }
  }
}, 0); // Run async, don't block startup
```

## Desktop Migration (Already Safe)

Desktop migration is non-destructive and doesn't need improvements:
- Only creates records in `profiles.db`
- Never moves or modifies data directories
- Fully idempotent
- Safe to run multiple times

## Mobile Migration (Not Implemented)

When implementing mobile profile support:
- Follow desktop pattern (non-destructive metadata only)
- OR follow improved server pattern (with backups)
- Consider iOS/Android app data backup constraints

## Deployment Strategy

To deploy server improvements safely:

1. **Add pre-migration backup first** (highest priority)
2. **Deploy to staging**, test migration with real data
3. **Run dry-run on production** to verify what would be migrated
4. **Deploy to production** during low-traffic window
5. **Monitor logs** for migration errors
6. **Keep backups** for at least 30 days

## Testing Checklist

Before deploying improved migration:

- [ ] Test migration with small database (< 1MB)
- [ ] Test migration with large database (> 100MB)
- [ ] Test migration with disk nearly full
- [ ] Test migration rollback on failure
- [ ] Test dry-run mode
- [ ] Test migration idempotency (run twice)
- [ ] Test database integrity verification
- [ ] Test backup cleanup after grace period
- [ ] Verify backup doesn't exist when old DB missing
- [ ] Verify migration skips if already migrated

## Current Status

- ✅ Desktop migration: Safe (non-destructive)
- ⚠️ Server migration: Needs improvements
- ❌ Mobile migration: Not implemented

## Immediate Action

If server is already deployed with current migration:
1. Check if any users have been migrated (`data/{userId}/profiles/default/` exists)
2. If yes, create manual backups immediately
3. Deploy improved migration code ASAP
4. Monitor for any data loss reports
