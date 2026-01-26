const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || "./data";
const SYSTEM_DB_PATH = path.join(DATA_DIR, "system.db");

let systemDb = null;

function getSystemDb() {
  if (!systemDb) {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    systemDb = new Database(SYSTEM_DB_PATH);
    systemDb.pragma("journal_mode = WAL");

    // Initialize users table
    systemDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        api_key_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_hash ON users(api_key_hash);
    `);

    // Initialize profiles table
    systemDb.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT NOT NULL,
        UNIQUE(user_id, slug),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);
    `);
  }
  return systemDb;
}

function hashApiKey(apiKey) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function generateApiKey() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Create a new user and return their API key.
 * The raw API key is only returned once - it's not stored.
 */
function createUser(userId) {
  const db = getSystemDb();

  // Check if user already exists
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (existing) {
    throw new Error(`User '${userId}' already exists`);
  }

  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);
  const timestamp = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, api_key_hash, created_at)
    VALUES (?, ?, ?)
  `).run(userId, apiKeyHash, timestamp);

  // Return the raw key - this is the only time it's available
  return { userId, apiKey };
}

/**
 * Create a user with an existing API key (for migration).
 * Use this to migrate existing users without changing their key.
 */
function createUserWithKey(userId, existingKey) {
  const db = getSystemDb();

  const existingUser = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (existingUser) {
    throw new Error(`User '${userId}' already exists`);
  }

  const apiKeyHash = hashApiKey(existingKey);
  const timestamp = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, api_key_hash, created_at)
    VALUES (?, ?, ?)
  `).run(userId, apiKeyHash, timestamp);

  return { userId };
}

/**
 * Look up user ID from API key.
 * Returns null if not found.
 */
function getUserIdFromApiKey(apiKey) {
  if (!apiKey) return null;

  const db = getSystemDb();
  const apiKeyHash = hashApiKey(apiKey);

  const row = db.prepare("SELECT id FROM users WHERE api_key_hash = ?").get(apiKeyHash);
  return row ? row.id : null;
}

/**
 * Delete a user by ID.
 */
function deleteUser(userId) {
  const db = getSystemDb();
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

/**
 * List all user IDs (not their keys).
 */
function listUsers() {
  const db = getSystemDb();
  return db.prepare("SELECT id, created_at FROM users ORDER BY created_at").all();
}

/**
 * Regenerate API key for existing user.
 * Returns new API key (only time it's available).
 */
function regenerateApiKey(userId) {
  const db = getSystemDb();

  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!existing) {
    throw new Error(`User '${userId}' does not exist`);
  }

  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  db.prepare("UPDATE users SET api_key_hash = ? WHERE id = ?").run(apiKeyHash, userId);

  return { userId, apiKey };
}

/**
 * Close system database connection.
 */
function closeSystemDb() {
  if (systemDb) {
    systemDb.close();
    systemDb = null;
  }
}

// ==================== Profile Management ====================

/**
 * Create a new profile for a user.
 * @param {string} userId - The user ID
 * @param {string} slug - Filesystem-safe profile name (e.g., "work", "personal")
 * @param {string} name - User-visible profile name (e.g., "Work", "Personal")
 * @returns {object} Profile object with id, userId, slug, name
 */
function createProfile(userId, slug, name) {
  const db = getSystemDb();

  // Check if user exists
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) {
    throw new Error(`User '${userId}' does not exist`);
  }

  // Check if profile already exists
  const existing = db.prepare(
    "SELECT id FROM profiles WHERE user_id = ? AND slug = ?"
  ).get(userId, slug);
  if (existing) {
    throw new Error(`Profile '${slug}' already exists for user '${userId}'`);
  }

  const profileId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  db.prepare(`
    INSERT INTO profiles (id, user_id, slug, name, created_at, last_used_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(profileId, userId, slug, name, timestamp, timestamp);

  return { id: profileId, userId, slug, name, created_at: timestamp, last_used_at: timestamp };
}

/**
 * List all profiles for a user.
 * @param {string} userId - The user ID
 * @returns {Array} Array of profile objects
 */
function listProfiles(userId) {
  const db = getSystemDb();
  return db.prepare(`
    SELECT id, user_id, slug, name, created_at, last_used_at
    FROM profiles
    WHERE user_id = ?
    ORDER BY last_used_at DESC
  `).all(userId);
}

/**
 * Get a specific profile by user ID and slug.
 * @param {string} userId - The user ID
 * @param {string} slug - Profile slug
 * @returns {object|null} Profile object or null if not found
 */
function getProfile(userId, slug) {
  const db = getSystemDb();
  return db.prepare(`
    SELECT id, user_id, slug, name, created_at, last_used_at
    FROM profiles
    WHERE user_id = ? AND slug = ?
  `).get(userId, slug);
}

/**
 * Update last_used_at timestamp for a profile.
 * @param {string} userId - The user ID
 * @param {string} slug - Profile slug
 */
function updateProfileLastUsed(userId, slug) {
  const db = getSystemDb();
  const timestamp = new Date().toISOString();
  db.prepare(`
    UPDATE profiles SET last_used_at = ? WHERE user_id = ? AND slug = ?
  `).run(timestamp, userId, slug);
}

/**
 * Get a profile by its UUID.
 * @param {string} userId - The user ID
 * @param {string} profileId - Profile UUID
 * @returns {object|null} Profile object or null if not found
 */
function getProfileById(userId, profileId) {
  const db = getSystemDb();
  return db.prepare(`
    SELECT id, user_id, slug, name, created_at, last_used_at
    FROM profiles
    WHERE user_id = ? AND id = ?
  `).get(userId, profileId);
}

/**
 * Resolve a profile identifier to a folder slug.
 * Handles both UUIDs (new clients) and slugs (backwards compatibility).
 *
 * Priority:
 * 1. If profileIdentifier is a UUID and found in profiles table → use its slug
 * 2. If fallbackSlug provided → use it (client knows expected folder)
 * 3. Use profileIdentifier as-is (backwards compatible or new profile)
 *
 * @param {string} userId - The user ID
 * @param {string} profileIdentifier - Either a UUID or a slug
 * @returns {string} The slug to use for folder paths
 */
function resolveProfileSlug(userId, profileIdentifier) {
  // If it looks like a UUID (36 chars with dashes), try to look it up
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidPattern.test(profileIdentifier)) {
    // Look up by UUID
    const profile = getProfileById(userId, profileIdentifier);
    if (profile) {
      return profile.slug;
    }

    // UUID not found - use as-is (truly new profile)
  }

  // Not a UUID or not found - use as-is (backwards compatible)
  return profileIdentifier;
}

/**
 * Delete a profile by profile ID.
 * @param {string} userId - The user ID (for verification)
 * @param {string} profileId - The profile ID to delete
 */
function deleteProfile(userId, profileId) {
  const db = getSystemDb();

  // Verify profile belongs to user
  const profile = db.prepare(
    "SELECT id, slug FROM profiles WHERE id = ? AND user_id = ?"
  ).get(profileId, userId);

  if (!profile) {
    throw new Error(`Profile '${profileId}' not found for user '${userId}'`);
  }

  // Delete profile record
  db.prepare("DELETE FROM profiles WHERE id = ?").run(profileId);

  // Note: Profile data directory is NOT deleted here - data is preserved
  // Client should handle profile data cleanup if desired
}

module.exports = {
  createUser,
  createUserWithKey,
  getUserIdFromApiKey,
  deleteUser,
  listUsers,
  regenerateApiKey,
  closeSystemDb,
  // Profile management
  createProfile,
  listProfiles,
  getProfile,
  getProfileById,
  resolveProfileSlug,
  updateProfileLastUsed,
  deleteProfile,
  // Exposed for testing
  hashApiKey,
  getSystemDb,
};
