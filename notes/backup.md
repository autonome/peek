# Database Backup System

## Overview

Daily compressed backups of the SQLite database with manual controls in Settings > Diagnostic.

## Configuration

Backups are disabled by default. To enable:

1. Open Settings > Core
2. Set `backupDir` to your desired backup location (e.g., `~/sync/peek-backups`)
3. Backups will run automatically on app startup (daily)

## Behavior

- **Trigger**: On app startup, if >24 hours since last backup
- **Format**: ZIP archive containing `datastore.sqlite` and `manifest.json`
- **Filename**: `peek-backup-{profile}-{YYYY-MM-DD-HHmmss}.zip`
- **Retention**: Keeps 7 most recent backups (configurable)
- **Method**: Uses SQLite's `VACUUM INTO` for consistent copies without locking

## Architecture

### Files

- `backend/electron/backup.ts` - Core backup logic
- `app/config.js` - `backupDir` preference in core settings schema
- `app/diagnostic.html` - Manual backup UI

### IPC Handlers

- `backup-get-config` - Get current backup configuration
- `backup-set-config` - Update backup settings (retentionCount, lastBackupTime)
- `backup-create` - Trigger manual backup
- `backup-list` - List existing backups

### Settings Storage

- `backupDir` is stored in core settings (`extension_settings` table, extensionId=`core`, key=`prefs`)
- `lastBackupTime` and `retentionCount` stored separately (extensionId=`backup`)

## Manual Controls

Available in Settings > Diagnostic > Backup Tools:

- **Backup Now** - Create immediate backup
- **List Backups** - Show existing backups with sizes and dates
- **Open Backup Folder** - Open backup directory in Finder

## Archive Contents

```
peek-backup-default-2026-01-19-143022.zip
├── datastore.sqlite     # VACUUM'd copy of database
└── manifest.json        # Metadata: version, timestamp, profile, table row counts
```
