/**
 * Database Backup Module
 *
 * Handles daily compressed backups of the SQLite database.
 * Backup directory is configured in Core Settings (backupDir preference).
 * Uses SQLite's VACUUM INTO for consistent copies without locking.
 *
 * Backup Strategy:
 * - Triggered on app startup if >24h since last backup
 * - Creates zip archive containing database copy and manifest
 * - Automatic cleanup of old backups beyond retention count
 * - Disabled by default (backupDir must be configured in settings)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import archiver from 'archiver';
import { app } from 'electron';
import { getDb } from './datastore.js';
import { DEBUG } from './config.js';
import type { BackupConfig, BackupResult } from '../types/index.js';

// ==================== Constants ====================

const BACKUP_SETTINGS_KEY = 'backup';
const CORE_SETTINGS_KEY = 'core';
const DEFAULT_RETENTION_COUNT = 7;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ==================== Helpers ====================

/**
 * Expand tilde (~) in file paths to user's home directory.
 * Node.js fs operations don't expand ~ automatically.
 */
function expandTilde(filepath: string): string {
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  if (filepath === '~') {
    return os.homedir();
  }
  return filepath;
}

// ==================== Settings Storage ====================

/**
 * Get the backup directory from core settings (prefs.backupDir)
 * Returns empty string if not configured
 */
function getBackupDirFromCoreSettings(): string {
  const db = getDb();
  try {
    const row = db.prepare(
      'SELECT value FROM extension_settings WHERE extensionId = ? AND key = ?'
    ).get(CORE_SETTINGS_KEY, 'prefs') as { value: string } | undefined;

    if (!row?.value) return '';

    const prefs = JSON.parse(row.value);
    const backupDir = prefs?.backupDir || '';
    return expandTilde(backupDir);
  } catch {
    return '';
  }
}

/**
 * Get backup configuration
 * - backupDir comes from core settings (user preference)
 * - lastBackupTime and retentionCount stored in backup settings
 */
export function getBackupConfig(): BackupConfig {
  const db = getDb();
  const backupDir = getBackupDirFromCoreSettings();

  const getKey = (key: string): string | null => {
    const row = db.prepare(
      'SELECT value FROM extension_settings WHERE extensionId = ? AND key = ?'
    ).get(BACKUP_SETTINGS_KEY, key) as { value: string } | undefined;
    if (!row?.value) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  };

  return {
    enabled: !!backupDir, // Enabled only if backupDir is configured
    backupDir,
    retentionCount: parseInt(getKey('retentionCount') || String(DEFAULT_RETENTION_COUNT), 10) || DEFAULT_RETENTION_COUNT,
    lastBackupTime: parseInt(getKey('lastBackupTime') || '0', 10) || 0,
  };
}

/**
 * Save backup configuration to settings
 * Note: backupDir is NOT saved here - it's stored in core settings
 */
export function setBackupConfig(config: Partial<BackupConfig>): void {
  const db = getDb();
  const timestamp = Date.now();

  const setKey = (key: string, value: string | number | boolean): void => {
    const jsonValue = JSON.stringify(value);
    db.prepare(`
      INSERT OR REPLACE INTO extension_settings (id, extensionId, key, value, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(`${BACKUP_SETTINGS_KEY}_${key}`, BACKUP_SETTINGS_KEY, key, jsonValue, timestamp);
  };

  // Note: enabled and backupDir are derived from core settings, not stored here
  if (config.retentionCount !== undefined) setKey('retentionCount', config.retentionCount);
  if (config.lastBackupTime !== undefined) setKey('lastBackupTime', config.lastBackupTime);
}

// ==================== Backup Operations ====================

/**
 * Get the current profile name from userData path
 */
function getProfileName(): string {
  const userDataPath = app.getPath('userData');
  return path.basename(userDataPath);
}

/**
 * Get the database path for the current profile
 */
function getDatabasePath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'datastore.sqlite');
}

/**
 * Generate a backup filename with timestamp
 */
function generateBackupFilename(): string {
  const profile = getProfileName();
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '-')
    .slice(0, 19);
  return `peek-backup-${profile}-${timestamp}.zip`;
}

/**
 * Get table row counts for manifest
 */
function getTableCounts(): Record<string, number> {
  const db = getDb();
  const tables = [
    'addresses', 'visits', 'content', 'tags', 'address_tags',
    'blobs', 'scripts_data', 'feeds', 'extensions', 'extension_settings',
    'migrations', 'items', 'item_tags'
  ];

  const counts: Record<string, number> = {};
  for (const table of tables) {
    try {
      const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      counts[table] = result.count;
    } catch {
      // Table might not exist
      counts[table] = 0;
    }
  }
  return counts;
}

/**
 * Create a manifest file with backup metadata
 */
function createManifest(): string {
  const manifest = {
    version: app.getVersion(),
    timestamp: new Date().toISOString(),
    profile: getProfileName(),
    platform: process.platform,
    tables: getTableCounts(),
  };
  return JSON.stringify(manifest, null, 2);
}

/**
 * Create a backup of the database
 */
export async function createBackup(): Promise<BackupResult> {
  const config = getBackupConfig();
  const backupDir = config.backupDir;

  if (!backupDir) {
    return {
      success: false,
      error: 'Backup directory not configured. Set backupDir in Settings > Core.'
    };
  }

  DEBUG && console.log('[backup] Creating backup...');

  try {
    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
      DEBUG && console.log('[backup] Created backup directory:', backupDir);
    }

    // Create temp directory for the backup files
    const tempDir = path.join(app.getPath('temp'), `peek-backup-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const dbPath = getDatabasePath();
    const tempDbPath = path.join(tempDir, 'datastore.sqlite');
    const manifestPath = path.join(tempDir, 'manifest.json');

    // Use VACUUM INTO for a consistent copy
    DEBUG && console.log('[backup] Creating database copy with VACUUM INTO...');
    const db = getDb();
    db.exec(`VACUUM INTO '${tempDbPath}'`);

    // Write manifest
    const manifest = createManifest();
    fs.writeFileSync(manifestPath, manifest, 'utf-8');
    DEBUG && console.log('[backup] Created manifest');

    // Create zip archive
    const backupFilename = generateBackupFilename();
    const backupPath = path.join(backupDir, backupFilename);

    DEBUG && console.log('[backup] Creating zip archive:', backupPath);

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      output.on('close', () => {
        DEBUG && console.log('[backup] Archive created:', archive.pointer(), 'bytes');
        resolve();
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);
      archive.file(tempDbPath, { name: 'datastore.sqlite' });
      archive.file(manifestPath, { name: 'manifest.json' });
      archive.finalize();
    });

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Update last backup time
    setBackupConfig({ lastBackupTime: Date.now() });

    // Clean old backups
    cleanOldBackups();

    DEBUG && console.log('[backup] Backup complete:', backupPath);

    return { success: true, path: backupPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[backup] Backup failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Clean up old backups beyond retention count
 */
export function cleanOldBackups(): void {
  const config = getBackupConfig();
  const backupDir = config.backupDir;
  const retentionCount = config.retentionCount;
  const profile = getProfileName();

  if (!fs.existsSync(backupDir)) {
    return;
  }

  try {
    // List backup files for this profile
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(`peek-backup-${profile}-`) && f.endsWith('.zip'))
      .map(f => ({
        name: f,
        path: path.join(backupDir, f),
        stat: fs.statSync(path.join(backupDir, f)),
      }))
      .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime()); // Newest first

    // Delete files beyond retention count
    if (files.length > retentionCount) {
      const toDelete = files.slice(retentionCount);
      DEBUG && console.log(`[backup] Cleaning ${toDelete.length} old backup(s)`);

      for (const file of toDelete) {
        fs.unlinkSync(file.path);
        DEBUG && console.log('[backup] Deleted:', file.name);
      }
    }
  } catch (error) {
    console.error('[backup] Failed to clean old backups:', error);
  }
}

/**
 * Check if daily backup is needed and run it
 */
export async function checkAndRunDailyBackup(): Promise<void> {
  const config = getBackupConfig();

  if (!config.enabled || !config.backupDir) {
    DEBUG && console.log('[backup] Backups disabled (no backup directory configured in Settings > Core > backupDir)');
    return;
  }

  const now = Date.now();
  const timeSinceLastBackup = now - config.lastBackupTime;

  if (timeSinceLastBackup < BACKUP_INTERVAL_MS) {
    const hoursRemaining = Math.round((BACKUP_INTERVAL_MS - timeSinceLastBackup) / (60 * 60 * 1000));
    DEBUG && console.log(`[backup] Last backup was ${Math.round(timeSinceLastBackup / (60 * 60 * 1000))}h ago, next in ${hoursRemaining}h`);
    return;
  }

  DEBUG && console.log('[backup] Daily backup needed, running...');

  try {
    const result = await createBackup();
    if (result.success) {
      DEBUG && console.log('[backup] Daily backup completed:', result.path);
    } else {
      console.error('[backup] Daily backup failed:', result.error);
    }
  } catch (error) {
    // Don't block app startup if backup fails
    console.error('[backup] Daily backup error:', error);
  }
}

/**
 * List existing backups
 */
export function listBackups(): Array<{
  name: string;
  path: string;
  size: number;
  date: Date;
}> {
  const config = getBackupConfig();
  const backupDir = config.backupDir;
  const profile = getProfileName();

  if (!backupDir || !fs.existsSync(backupDir)) {
    return [];
  }

  try {
    return fs.readdirSync(backupDir)
      .filter(f => f.startsWith(`peek-backup-${profile}-`) && f.endsWith('.zip'))
      .map(f => {
        const filePath = path.join(backupDir, f);
        const stat = fs.statSync(filePath);
        return {
          name: f,
          path: filePath,
          size: stat.size,
          date: stat.mtime,
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime()); // Newest first
  } catch (error) {
    console.error('[backup] Failed to list backups:', error);
    return [];
  }
}
