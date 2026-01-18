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

module.exports = {
  createUser,
  createUserWithKey,
  getUserIdFromApiKey,
  deleteUser,
  listUsers,
  regenerateApiKey,
  closeSystemDb,
  // Exposed for testing
  hashApiKey,
  getSystemDb,
};
