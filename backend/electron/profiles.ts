/**
 * Profile Management Module
 *
 * Manages user profiles on the desktop client. Each profile has:
 * - Isolated data storage (separate datastore.sqlite)
 * - Optional per-profile sync configuration
 * - Separate Chromium session data (on desktop)
 *
 * Profile metadata is stored in profiles.db in the userData directory.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export interface Profile {
  id: string;                   // UUID
  name: string;                 // User-visible name (e.g., "Work")
  folder: string;               // Filesystem-safe folder name (e.g., "work")

  // Sync configuration (optional)
  syncEnabled: boolean;
  apiKey: string | null;        // Server user API key
  serverProfileId: string | null;  // Which server profile UUID to sync to
  lastSyncAt: number | null;    // Unix ms

  createdAt: number;            // Unix ms
  lastUsedAt: number;           // Unix ms
  isDefault: boolean;           // Cannot be deleted
}

export interface SyncConfig {
  apiKey: string;
  serverProfileId: string;
}

let profilesDb: Database.Database | null = null;
let userDataPath: string | null = null;

/**
 * Initialize the profiles database
 * @param dataPath - Base userData directory
 * @param filename - Database filename (default: 'profiles.db', dev: '.dev-profiles.db')
 */
export function initProfilesDb(dataPath: string, filename: string = 'profiles.db'): Database.Database {
  userDataPath = dataPath;
  const profilesDbPath = path.join(dataPath, filename);

  profilesDb = new Database(profilesDbPath);
  profilesDb.pragma('journal_mode = WAL');

  // Create profiles table
  profilesDb.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,

      sync_enabled INTEGER DEFAULT 0,
      api_key TEXT,
      server_profile_slug TEXT,
      last_sync_at INTEGER,

      created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL,
      is_default INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS active_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      profile_slug TEXT NOT NULL
    );
  `);

  return profilesDb;
}

/**
 * Get the profiles database (must be initialized first)
 */
function getProfilesDb(): Database.Database {
  if (!profilesDb) {
    throw new Error('Profiles database not initialized. Call initProfilesDb first.');
  }
  return profilesDb;
}

/**
 * Convert database row to Profile object
 */
function rowToProfile(row: any): Profile {
  return {
    id: row.id,
    name: row.name,
    folder: row.slug,
    syncEnabled: row.sync_enabled === 1,
    apiKey: row.api_key || null,
    serverProfileId: row.server_profile_slug || null,
    lastSyncAt: row.last_sync_at || null,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    isDefault: row.is_default === 1,
  };
}

/**
 * List all profiles
 */
export function listProfiles(): Profile[] {
  const db = getProfilesDb();
  const rows = db.prepare(`
    SELECT * FROM profiles
    ORDER BY last_used_at DESC
  `).all();

  return rows.map(rowToProfile);
}

/**
 * Create a new profile
 */
export function createProfile(name: string): Profile {
  const db = getProfilesDb();

  // Generate folder name from name (lowercase, replace spaces with hyphens, remove special chars)
  const folder = name.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  // Check if folder already exists
  const existing = db.prepare('SELECT id FROM profiles WHERE slug = ?').get(folder);
  if (existing) {
    throw new Error(`Profile with folder '${folder}' already exists`);
  }

  const id = crypto.randomUUID();
  const timestamp = Date.now();

  db.prepare(`
    INSERT INTO profiles (id, name, slug, sync_enabled, created_at, last_used_at, is_default)
    VALUES (?, ?, ?, 0, ?, ?, 0)
  `).run(id, name, folder, timestamp, timestamp);

  // Create profile directory
  if (userDataPath) {
    const profileDir = path.join(userDataPath, folder);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
  }

  return getProfileByFolder(folder)!;
}

/**
 * Get a specific profile by folder name
 */
export function getProfileByFolder(folder: string): Profile | null {
  const db = getProfilesDb();
  const row = db.prepare('SELECT * FROM profiles WHERE slug = ?').get(folder);
  return row ? rowToProfile(row) : null;
}

/**
 * Get a specific profile by ID
 */
export function getProfileById(id: string): Profile | null {
  const db = getProfilesDb();
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  return row ? rowToProfile(row) : null;
}

/**
 * Update a profile
 */
export function updateProfile(id: string, updates: Partial<Profile>): void {
  const db = getProfilesDb();

  const allowedUpdates: Array<keyof Profile> = ['name', 'lastUsedAt'];
  const setClauses: string[] = [];
  const values: any[] = [];

  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      const dbKey = key === 'lastUsedAt' ? 'last_used_at' : key;
      setClauses.push(`${dbKey} = ?`);
      values.push(updates[key]);
    }
  }

  if (setClauses.length === 0) {
    return;
  }

  values.push(id);

  db.prepare(`
    UPDATE profiles SET ${setClauses.join(', ')} WHERE id = ?
  `).run(...values);
}

/**
 * Delete a profile (cannot delete default or active profile)
 */
export function deleteProfile(id: string): void {
  const db = getProfilesDb();

  const profile = getProfileById(id);
  if (!profile) {
    throw new Error('Profile not found');
  }

  if (profile.isDefault) {
    throw new Error('Cannot delete default profile');
  }

  const activeProfile = getActiveProfile();
  if (activeProfile.id === id) {
    throw new Error('Cannot delete active profile');
  }

  db.prepare('DELETE FROM profiles WHERE id = ?').run(id);

  // Note: Profile directory is NOT deleted - data is preserved
  // User can manually delete the directory if desired
}

/**
 * Get the active profile
 */
export function getActiveProfile(): Profile {
  const db = getProfilesDb();

  // Try to get from active_profile table
  const activeRow = db.prepare('SELECT profile_slug FROM active_profile WHERE id = 1').get() as { profile_slug: string } | undefined;

  if (activeRow) {
    const profile = getProfileByFolder(activeRow.profile_slug);
    if (profile) {
      return profile;
    }
  }

  // Fallback to default profile
  const defaultProfile = db.prepare('SELECT * FROM profiles WHERE is_default = 1').get();
  if (defaultProfile) {
    return rowToProfile(defaultProfile);
  }

  // Last resort: return any profile
  const anyProfile = db.prepare('SELECT * FROM profiles LIMIT 1').get();
  if (anyProfile) {
    return rowToProfile(anyProfile);
  }

  throw new Error('No profiles found. Call ensureDefaultProfile first.');
}

/**
 * Set the active profile (persists across app restarts)
 */
export function setActiveProfile(folder: string): void {
  const db = getProfilesDb();

  const profile = getProfileByFolder(folder);
  if (!profile) {
    throw new Error(`Profile '${folder}' not found`);
  }

  // Update active profile
  db.prepare(`
    INSERT OR REPLACE INTO active_profile (id, profile_slug)
    VALUES (1, ?)
  `).run(folder);

  // Update last_used_at
  updateProfile(profile.id, { lastUsedAt: Date.now() });
}

/**
 * Ensure the default profile exists
 */
export function ensureDefaultProfile(): void {
  const db = getProfilesDb();

  const existing = db.prepare('SELECT id FROM profiles WHERE slug = ?').get('default');
  if (existing) {
    return;
  }

  const id = crypto.randomUUID();
  const timestamp = Date.now();

  db.prepare(`
    INSERT INTO profiles (id, name, slug, sync_enabled, created_at, last_used_at, is_default)
    VALUES (?, 'Default', 'default', 0, ?, ?, 1)
  `).run(id, timestamp, timestamp);

  // Create profile directory
  if (userDataPath) {
    const profileDir = path.join(userDataPath, 'default');
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
  }
}

/**
 * Migrate existing profile directories to profiles.db
 * Detects 'default' and 'dev' directories and creates profile records if they don't exist
 */
export function migrateExistingProfiles(): void {
  if (!userDataPath) {
    throw new Error('userDataPath not set. Call initProfilesDb first.');
  }

  const db = getProfilesDb();
  const timestamp = Date.now();

  // Check for 'default' directory
  const defaultDir = path.join(userDataPath, 'default');
  if (fs.existsSync(defaultDir)) {
    const existing = db.prepare('SELECT id FROM profiles WHERE slug = ?').get('default');
    if (!existing) {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO profiles (id, name, slug, sync_enabled, created_at, last_used_at, is_default)
        VALUES (?, 'Default', 'default', 0, ?, ?, 1)
      `).run(id, timestamp, timestamp);
      console.log('[profiles] Migrated existing default profile directory');
    }
  }

  // Check for 'dev' directory
  const devDir = path.join(userDataPath, 'dev');
  if (fs.existsSync(devDir)) {
    const existing = db.prepare('SELECT id FROM profiles WHERE slug = ?').get('dev');
    if (!existing) {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO profiles (id, name, slug, sync_enabled, created_at, last_used_at, is_default)
        VALUES (?, 'Development', 'dev', 0, ?, ?, 0)
      `).run(id, timestamp, timestamp);
      console.log('[profiles] Migrated existing dev profile directory');
    }
  }

  // Ensure at least default profile exists
  ensureDefaultProfile();
}

// ==================== Sync Configuration ====================

/**
 * Enable sync for a profile
 */
export function enableSync(profileId: string, apiKey: string, serverProfileId: string): void {
  const db = getProfilesDb();

  const profile = getProfileById(profileId);
  if (!profile) {
    throw new Error('Profile not found');
  }

  db.prepare(`
    UPDATE profiles
    SET sync_enabled = 1, api_key = ?, server_profile_slug = ?
    WHERE id = ?
  `).run(apiKey, serverProfileId, profileId);
}

/**
 * Disable sync for a profile
 */
export function disableSync(profileId: string): void {
  const db = getProfilesDb();

  db.prepare(`
    UPDATE profiles
    SET sync_enabled = 0, api_key = NULL, server_profile_slug = NULL, last_sync_at = NULL
    WHERE id = ?
  `).run(profileId);
}

/**
 * Get sync configuration for a profile
 */
export function getSyncConfig(profileId: string): SyncConfig | null {
  const profile = getProfileById(profileId);
  if (!profile || !profile.syncEnabled || !profile.apiKey || !profile.serverProfileId) {
    return null;
  }

  return {
    apiKey: profile.apiKey,
    serverProfileId: profile.serverProfileId,
  };
}

/**
 * Update last sync time for a profile
 */
export function updateLastSyncTime(profileId: string, timestamp: number): void {
  const db = getProfilesDb();

  db.prepare(`
    UPDATE profiles SET last_sync_at = ? WHERE id = ?
  `).run(timestamp, profileId);
}

/**
 * Close the profiles database
 */
export function closeProfilesDb(): void {
  if (profilesDb) {
    profilesDb.close();
    profilesDb = null;
  }
}
