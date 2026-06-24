const { sqlFactory } = require("./sql");
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

    systemDb = sqlFactory.open(SYSTEM_DB_PATH);
    sqlFactory.init(systemDb);

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
  const existing = db.get("SELECT id FROM users WHERE id = ?", [userId]);
  if (existing) {
    throw new Error(`User '${userId}' already exists`);
  }

  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);
  const timestamp = new Date().toISOString();

  db.run(
    "INSERT INTO users (id, api_key_hash, created_at) VALUES (?, ?, ?)",
    [userId, apiKeyHash, timestamp]
  );

  // Return the raw key - this is the only time it's available
  return { userId, apiKey };
}

/**
 * Create a user with an existing API key (for migration).
 * Use this to migrate existing users without changing their key.
 */
function createUserWithKey(userId, existingKey) {
  const db = getSystemDb();

  const existingUser = db.get("SELECT id FROM users WHERE id = ?", [userId]);
  if (existingUser) {
    throw new Error(`User '${userId}' already exists`);
  }

  const apiKeyHash = hashApiKey(existingKey);
  const timestamp = new Date().toISOString();

  db.run(
    "INSERT INTO users (id, api_key_hash, created_at) VALUES (?, ?, ?)",
    [userId, apiKeyHash, timestamp]
  );

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

  const row = db.get("SELECT id FROM users WHERE api_key_hash = ?", [apiKeyHash]);
  return row ? row.id : null;
}

/**
 * Delete a user by ID.
 */
function deleteUser(userId) {
  const db = getSystemDb();
  db.run("DELETE FROM users WHERE id = ?", [userId]);
}

/**
 * List all user IDs (not their keys).
 */
function listUsers() {
  const db = getSystemDb();
  return db.all("SELECT id, created_at FROM users ORDER BY created_at");
}

/**
 * Regenerate API key for existing user.
 * Returns new API key (only time it's available).
 */
function regenerateApiKey(userId) {
  const db = getSystemDb();

  const existing = db.get("SELECT id FROM users WHERE id = ?", [userId]);
  if (!existing) {
    throw new Error(`User '${userId}' does not exist`);
  }

  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  db.run("UPDATE users SET api_key_hash = ? WHERE id = ?", [apiKeyHash, userId]);

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
 * @param {string} name - User-visible profile name (e.g., "Work", "Personal")
 * @returns {object} Profile object with id, userId, slug, name
 */
function createProfile(userId, name) {
  const db = getSystemDb();

  // Check if user exists
  const user = db.get("SELECT id FROM users WHERE id = ?", [userId]);
  if (!user) {
    throw new Error(`User '${userId}' does not exist`);
  }

  // Derive slug from name for backward compat (stored in DB but not used for folders)
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Check if profile already exists
  const existing = db.get(
    "SELECT id FROM profiles WHERE user_id = ? AND slug = ?",
    [userId, slug]
  );
  if (existing) {
    throw new Error(`Profile '${slug}' already exists for user '${userId}'`);
  }

  const profileId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  db.run(
    "INSERT INTO profiles (id, user_id, slug, name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
    [profileId, userId, slug, name, timestamp, timestamp]
  );

  return { id: profileId, userId, slug, name, created_at: timestamp, last_used_at: timestamp };
}

/**
 * Create a profile using a caller-supplied UUID as the primary key.
 *
 * Unlike createProfile (which mints a fresh crypto.randomUUID()), this inserts
 * the profiles row with the PASSED-IN `id`. Used by resolveProfileId so that an
 * unknown-but-valid profile UUID gets its OWN isolated bucket instead of
 * silently collapsing onto the "default" profile (the cross-profile data-leak
 * bug this replaces).
 *
 * Idempotent: if a profile with `id` already exists for the user, it is
 * returned unchanged. The slug is derived to be unique (suffixed with a short
 * slice of the id) so it never collides with an existing profile's slug and
 * trips the UNIQUE(user_id, slug) constraint.
 *
 * @param {string} userId - The user ID
 * @param {string} id - The profile UUID to use as the primary key
 * @param {string} name - User-visible profile name
 * @returns {object} Profile object with id, userId, slug, name
 */
function createProfileWithId(userId, id, name) {
  const db = getSystemDb();

  // Check if user exists
  const user = db.get("SELECT id FROM users WHERE id = ?", [userId]);
  if (!user) {
    throw new Error(`User '${userId}' does not exist`);
  }

  // Idempotent: if this exact profile id already exists, return it.
  const existingById = getProfileById(userId, id);
  if (existingById) {
    return existingById;
  }

  // Derive a base slug from the name, then guarantee uniqueness by appending a
  // short slice of the id. This avoids tripping UNIQUE(user_id, slug) when an
  // unrelated profile already owns the name-derived slug (e.g. two "Imported"
  // profiles from different unknown UUIDs).
  const baseSlug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const idSuffix = id.replace(/-/g, "").slice(0, 8);
  let slug = baseSlug ? `${baseSlug}-${idSuffix}` : idSuffix;

  // Extremely defensive: if even the suffixed slug somehow exists for a
  // different profile id, widen the suffix until unique.
  let attempt = 8;
  while (
    db.get("SELECT id FROM profiles WHERE user_id = ? AND slug = ?", [userId, slug]) &&
    attempt < 32
  ) {
    attempt += 4;
    const wider = id.replace(/-/g, "").slice(0, attempt);
    slug = baseSlug ? `${baseSlug}-${wider}` : wider;
  }

  const timestamp = new Date().toISOString();

  db.run(
    "INSERT INTO profiles (id, user_id, slug, name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, userId, slug, name, timestamp, timestamp]
  );

  return { id, userId, slug, name, created_at: timestamp, last_used_at: timestamp };
}

/**
 * List all profiles for a user.
 * @param {string} userId - The user ID
 * @returns {Array} Array of profile objects
 */
function listProfiles(userId) {
  const db = getSystemDb();
  return db.all(
    "SELECT id, user_id, slug, name, created_at, last_used_at FROM profiles WHERE user_id = ? ORDER BY last_used_at DESC",
    [userId]
  );
}

/**
 * Get a specific profile by user ID and slug.
 * @param {string} userId - The user ID
 * @param {string} slug - Profile slug
 * @returns {object|null} Profile object or null if not found
 */
function getProfile(userId, slug) {
  const db = getSystemDb();
  return db.get(
    "SELECT id, user_id, slug, name, created_at, last_used_at FROM profiles WHERE user_id = ? AND slug = ?",
    [userId, slug]
  );
}

/**
 * Update last_used_at timestamp for a profile.
 * @param {string} userId - The user ID
 * @param {string} slug - Profile slug
 */
function updateProfileLastUsed(userId, slug) {
  const db = getSystemDb();
  const timestamp = new Date().toISOString();
  db.run(
    "UPDATE profiles SET last_used_at = ? WHERE user_id = ? AND slug = ?",
    [timestamp, userId, slug]
  );
}

/**
 * Get a profile by its UUID.
 * @param {string} userId - The user ID
 * @param {string} profileId - Profile UUID
 * @returns {object|null} Profile object or null if not found
 */
function getProfileById(userId, profileId) {
  const db = getSystemDb();
  return db.get(
    "SELECT id, user_id, slug, name, created_at, last_used_at FROM profiles WHERE user_id = ? AND id = ?",
    [userId, profileId]
  );
}

/**
 * Resolve a profile identifier to a UUID for folder paths.
 * The UUID becomes the folder name on disk.
 *
 * Handles both UUIDs (new clients) and slugs (legacy backwards compatibility).
 *
 * @param {string} userId - The user ID
 * @param {string} profileIdentifier - Either a UUID or a legacy slug
 * @returns {string} The UUID to use for folder paths
 */
function resolveProfileId(userId, profileIdentifier) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidPattern.test(profileIdentifier)) {
    // Look up by UUID
    const profile = getProfileById(userId, profileIdentifier);
    if (profile) {
      return profile.id;
    }

    // UUID is well-formed but unknown to this server. DO NOT fall back to the
    // "default" profile — that silent fallback collapsed every unseen profile
    // onto a single bucket and caused cross-profile data contamination
    // (read/write leakage between distinct profiles). Instead, give this UUID
    // its OWN isolated bucket so its data stays separate.
    console.warn(
      `[profiles] UUID ${profileIdentifier} not registered for user ${userId}; ` +
        `creating an isolated profile for it. (This replaces the old silent ` +
        `fall-back-to-default behavior, which was a cross-profile data-leak bug.)`
    );
    const created = createProfileWithId(userId, profileIdentifier, "Imported");
    return created.id;
  }

  // Not a UUID - legacy slug (e.g. "default", "work")
  // Look up profile by slug, return its UUID
  const profile = getProfile(userId, profileIdentifier);
  if (profile) {
    return profile.id;
  }

  // Legacy slug "default" — preserve historical behavior: this is THE shared
  // default bucket, and asking for "default" is the only way to land in it.
  if (profileIdentifier === "default") {
    const newDefault = createProfile(userId, "Default");
    return newDefault.id;
  }

  // Unknown non-"default" legacy slug. DO NOT collapse onto default (same
  // data-leak as the UUID path). Create a distinct profile keyed on this slug
  // so the identifier gets its own isolated bucket. createProfile derives the
  // slug from the name; since the name IS the slug here, the resulting profile
  // is stably re-resolvable by the same slug on subsequent requests.
  const existingBySlug = getProfile(userId, profileIdentifier);
  if (existingBySlug) {
    return existingBySlug.id;
  }
  console.warn(
    `[profiles] Legacy slug '${profileIdentifier}' not registered for user ${userId}; ` +
      `creating an isolated profile for it. (This replaces the old silent ` +
      `fall-back-to-default behavior, which was a cross-profile data-leak bug.)`
  );
  const createdFromSlug = createProfile(userId, profileIdentifier);
  return createdFromSlug.id;
}

/**
 * Delete a profile by profile ID.
 * @param {string} userId - The user ID (for verification)
 * @param {string} profileId - The profile ID to delete
 */
function deleteProfile(userId, profileId) {
  const db = getSystemDb();

  // Verify profile belongs to user
  const profile = db.get(
    "SELECT id, slug FROM profiles WHERE id = ? AND user_id = ?",
    [profileId, userId]
  );

  if (!profile) {
    throw new Error(`Profile '${profileId}' not found for user '${userId}'`);
  }

  // Delete profile record
  db.run("DELETE FROM profiles WHERE id = ?", [profileId]);

  // Note: Profile data directory is NOT deleted here - data is preserved
  // Client should handle profile data cleanup if desired
}

/**
 * Migrate profile folders from slug-based to UUID-based naming.
 * For each user's profiles, renames DATA_DIR/{userId}/profiles/{slug} to
 * DATA_DIR/{userId}/profiles/{uuid}.
 *
 * Safe to call multiple times (idempotent).
 */
function migrateProfileFoldersToUuid() {
  if (!fs.existsSync(DATA_DIR)) {
    return;
  }

  const userDirs = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name !== 'system.db')
    .map(dirent => dirent.name);

  for (const userId of userDirs) {
    const profilesDir = path.join(DATA_DIR, userId, "profiles");
    if (!fs.existsSync(profilesDir)) {
      continue;
    }

    const db = getSystemDb();
    const profiles = db.all(
      "SELECT id, slug FROM profiles WHERE user_id = ?",
      [userId]
    );

    // Handle orphan "default" folder (exists but no profile record)
    const defaultFolder = path.join(profilesDir, "default");
    if (fs.existsSync(defaultFolder)) {
      const hasDefaultRecord = profiles.some(p => p.slug === "default");
      if (!hasDefaultRecord) {
        try {
          const newProfile = createProfile(userId, "Default");
          profiles.push({ id: newProfile.id, slug: "default" });
          console.log(`[migration] Created default profile record for user ${userId}`);
        } catch (e) {
          console.log(`[migration] Could not create default profile for ${userId}: ${e.message}`);
        }
      }
    }

    for (const profile of profiles) {
      const oldFolder = path.join(profilesDir, profile.slug);
      const newFolder = path.join(profilesDir, profile.id);

      if (fs.existsSync(oldFolder) && !fs.existsSync(newFolder)) {
        try {
          fs.renameSync(oldFolder, newFolder);
          console.log(`[migration] Renamed ${userId}/profiles/${profile.slug} → ${profile.id}`);
        } catch (e) {
          console.error(`[migration] Failed to rename ${userId}/profiles/${profile.slug}: ${e.message}`);
        }
      }
    }
  }
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
  createProfileWithId,
  listProfiles,
  getProfile,
  getProfileById,
  resolveProfileId,
  updateProfileLastUsed,
  deleteProfile,
  migrateProfileFoldersToUuid,
  // Exposed for testing
  hashApiKey,
  getSystemDb,
};
