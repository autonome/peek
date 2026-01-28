const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const db = require("./db");
const users = require("./users");

// Configuration
const DATA_DIR = process.env.DATA_DIR || "./data";
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const DEFAULT_RETENTION = 7;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get the backup directory for a user
 */
function getUserBackupDir(userId) {
  return path.join(BACKUP_DIR, userId);
}

/**
 * Get the last backup timestamp for a user
 */
function getLastBackupTime(userId) {
  const value = db.getSetting(userId, "lastBackupTime");
  return value ? parseInt(value, 10) : null;
}

/**
 * Set the last backup timestamp for a user
 */
function setLastBackupTime(userId, timestamp) {
  db.setSetting(userId, "lastBackupTime", timestamp.toString());
}

/**
 * Generate a backup filename
 */
function generateBackupFilename(userId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `peek-backup-${userId}-${timestamp}.zip`;
}

/**
 * Get table counts for manifest metadata
 */
function getTableCounts(conn) {
  const counts = {};

  const itemTypes = conn.prepare(`
    SELECT type, COUNT(*) as count
    FROM items
    WHERE CAST(deletedAt AS INTEGER) = 0
    GROUP BY type
  `).all();

  for (const row of itemTypes) {
    counts[row.type + "s"] = row.count;
  }

  const tagCount = conn.prepare("SELECT COUNT(*) as count FROM tags").get();
  counts.tags = tagCount.count;

  return counts;
}

/**
 * Create a backup for a single user
 */
async function createBackup(userId) {
  console.log(`Creating backup for user: ${userId}`);

  // Check if database exists BEFORE calling getConnection (which would create it)
  const userDir = path.join(DATA_DIR, userId);
  const dbPath = path.join(userDir, "peek.db");

  if (!fs.existsSync(dbPath)) {
    console.log(`No database found for user ${userId}, skipping backup`);
    return { success: false, error: "No database found" };
  }

  // Ensure backup directory exists
  const userBackupDir = getUserBackupDir(userId);
  if (!fs.existsSync(userBackupDir)) {
    fs.mkdirSync(userBackupDir, { recursive: true });
  }

  // Get database connection
  const conn = db.getConnection(userId);

  const backupFilename = generateBackupFilename(userId);
  const backupPath = path.join(userBackupDir, backupFilename);
  const tempDbPath = path.join(userBackupDir, `temp-${userId}.db`);

  try {
    // Use VACUUM INTO for consistent snapshot (non-blocking)
    conn.exec(`VACUUM INTO '${tempDbPath}'`);

    // Get table counts for manifest
    const tableCounts = getTableCounts(conn);

    // Create manifest
    const manifest = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      userId: userId,
      tableCounts: tableCounts,
      backupType: "daily-snapshot"
    };

    // Create ZIP archive
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(backupPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", resolve);
      archive.on("error", reject);

      archive.pipe(output);
      archive.file(tempDbPath, { name: "peek.db" });
      archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
      archive.finalize();
    });

    // Clean up temp file
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }

    // Update last backup time
    const now = Date.now();
    setLastBackupTime(userId, now);

    // Clean old backups
    await cleanOldBackups(userId);

    const stats = fs.statSync(backupPath);
    console.log(`Backup created: ${backupFilename} (${(stats.size / 1024).toFixed(1)} KB)`);

    return {
      success: true,
      filename: backupFilename,
      path: backupPath,
      size: stats.size,
      timestamp: new Date().toISOString(),
      tableCounts: tableCounts
    };
  } catch (error) {
    console.error(`Backup failed for user ${userId}:`, error.message);

    // Clean up temp file on error
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }

    return { success: false, error: error.message };
  }
}

/**
 * Create backups for all users
 */
async function createAllBackups() {
  const allUsers = users.listUsers();
  const results = [];

  for (const user of allUsers) {
    const result = await createBackup(user.id);
    results.push({ userId: user.id, ...result });
  }

  return results;
}

/**
 * Clean old backups beyond retention limit
 */
async function cleanOldBackups(userId, retention = DEFAULT_RETENTION) {
  const userBackupDir = getUserBackupDir(userId);

  if (!fs.existsSync(userBackupDir)) {
    return { deleted: 0 };
  }

  // List backup files sorted by modification time (newest first)
  const files = fs.readdirSync(userBackupDir)
    .filter(f => f.startsWith("peek-backup-") && f.endsWith(".zip"))
    .map(f => ({
      name: f,
      path: path.join(userBackupDir, f),
      mtime: fs.statSync(path.join(userBackupDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.mtime - a.mtime);

  // Delete files beyond retention
  const toDelete = files.slice(retention);

  for (const file of toDelete) {
    fs.unlinkSync(file.path);
    console.log(`Deleted old backup: ${file.name}`);
  }

  return { deleted: toDelete.length };
}

/**
 * List backups for a user
 */
function listBackups(userId) {
  const userBackupDir = getUserBackupDir(userId);

  if (!fs.existsSync(userBackupDir)) {
    return [];
  }

  const files = fs.readdirSync(userBackupDir)
    .filter(f => f.startsWith("peek-backup-") && f.endsWith(".zip"))
    .map(f => {
      const filePath = path.join(userBackupDir, f);
      const stats = fs.statSync(filePath);
      return {
        filename: f,
        size: stats.size,
        created_at: stats.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return files;
}

/**
 * Check if a user needs a backup (>24h since last backup)
 */
function needsBackup(userId) {
  const lastBackup = getLastBackupTime(userId);
  if (!lastBackup) return true;

  const elapsed = Date.now() - lastBackup;
  return elapsed >= BACKUP_INTERVAL_MS;
}

/**
 * Run daily backups for all users who need them
 */
async function checkAndRunDailyBackups() {
  console.log("Checking for users needing backup...");

  const allUsers = users.listUsers();
  let backupCount = 0;

  for (const user of allUsers) {
    if (needsBackup(user.id)) {
      console.log(`User ${user.id} needs backup (>24h since last backup)`);
      await createBackup(user.id);
      backupCount++;
    }
  }

  if (backupCount === 0) {
    console.log("No users need backup at this time");
  } else {
    console.log(`Completed ${backupCount} backup(s)`);
  }

  return { backupCount };
}

module.exports = {
  createBackup,
  createAllBackups,
  cleanOldBackups,
  listBackups,
  needsBackup,
  checkAndRunDailyBackups,
  getLastBackupTime,
  setLastBackupTime,
  // Exposed for testing
  BACKUP_DIR,
  DEFAULT_RETENTION,
  BACKUP_INTERVAL_MS
};
