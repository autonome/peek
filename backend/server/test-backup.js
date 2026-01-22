const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

// Use test directory for all databases
const TEST_DATA_DIR = path.join(__dirname, "test-data-backup");
process.env.DATA_DIR = TEST_DATA_DIR;

const TEST_USER_ID = "backuptest";

// Clean up test directory
function cleanTestDir() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
}

cleanTestDir();

describe("Backup Module Tests", () => {
  let db;
  let users;
  let backup;

  beforeEach(() => {
    // Fresh modules for each test
    delete require.cache[require.resolve("./db")];
    delete require.cache[require.resolve("./users")];
    delete require.cache[require.resolve("./backup")];
    cleanTestDir();
    db = require("./db");
    users = require("./users");
    backup = require("./backup");
  });

  after(() => {
    if (db && db.closeAllConnections) {
      db.closeAllConnections();
    }
    if (users && users.closeSystemDb) {
      users.closeSystemDb();
    }
    cleanTestDir();
  });

  describe("createBackup", () => {
    it("should create a backup zip file for a user", async () => {
      // Create some test data
      db.saveUrl(TEST_USER_ID, "https://example.com", ["test"]);
      db.saveText(TEST_USER_ID, "Test note", ["note"]);

      const result = await backup.createBackup(TEST_USER_ID);

      assert.strictEqual(result.success, true);
      assert.ok(result.filename, "should have filename");
      assert.ok(result.path, "should have path");
      assert.ok(result.size > 0, "should have size");
      assert.ok(result.timestamp, "should have timestamp");
      assert.ok(result.tableCounts, "should have table counts");

      // Verify file exists
      assert.ok(fs.existsSync(result.path), "backup file should exist");
    });

    it("should include table counts in result", async () => {
      db.saveUrl(TEST_USER_ID, "https://example1.com");
      db.saveUrl(TEST_USER_ID, "https://example2.com");
      db.saveText(TEST_USER_ID, "Note");

      const result = await backup.createBackup(TEST_USER_ID);

      assert.strictEqual(result.tableCounts.urls, 2);
      assert.strictEqual(result.tableCounts.texts, 1);
    });

    it("should return error for non-existent user database", async () => {
      const result = await backup.createBackup("nonexistent");

      assert.strictEqual(result.success, false);
      assert.ok(result.error, "should have error message");
    });

    it("should update lastBackupTime setting", async () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");
      const beforeBackup = Date.now();

      await backup.createBackup(TEST_USER_ID);

      const lastBackupTime = backup.getLastBackupTime(TEST_USER_ID);
      assert.ok(lastBackupTime >= beforeBackup, "lastBackupTime should be set");
    });
  });

  describe("listBackups", () => {
    it("should return empty array when no backups", () => {
      const backups = backup.listBackups(TEST_USER_ID);
      assert.deepStrictEqual(backups, []);
    });

    it("should list backups for a user", async () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");
      await backup.createBackup(TEST_USER_ID);
      await backup.createBackup(TEST_USER_ID);

      const backups = backup.listBackups(TEST_USER_ID);

      assert.strictEqual(backups.length, 2);
      assert.ok(backups[0].filename, "should have filename");
      assert.ok(backups[0].size, "should have size");
      assert.ok(backups[0].created_at, "should have created_at");
    });

    it("should return backups sorted by date descending", async () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");
      await backup.createBackup(TEST_USER_ID);
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      await backup.createBackup(TEST_USER_ID);

      const backups = backup.listBackups(TEST_USER_ID);

      // First backup should be more recent
      const date1 = new Date(backups[0].created_at);
      const date2 = new Date(backups[1].created_at);
      assert.ok(date1 >= date2, "backups should be sorted newest first");
    });
  });

  describe("cleanOldBackups", () => {
    it("should keep only retention count of backups", async () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");

      // Create more backups than retention
      for (let i = 0; i < 5; i++) {
        await backup.createBackup(TEST_USER_ID);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Clean with retention of 2
      const result = await backup.cleanOldBackups(TEST_USER_ID, 2);

      assert.strictEqual(result.deleted, 3);

      const remaining = backup.listBackups(TEST_USER_ID);
      assert.strictEqual(remaining.length, 2);
    });

    it("should not delete anything when under retention", async () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");
      await backup.createBackup(TEST_USER_ID);

      const result = await backup.cleanOldBackups(TEST_USER_ID, 7);

      assert.strictEqual(result.deleted, 0);
    });
  });

  describe("needsBackup", () => {
    it("should return true when no backup exists", () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");
      assert.strictEqual(backup.needsBackup(TEST_USER_ID), true);
    });

    it("should return false immediately after backup", async () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");
      await backup.createBackup(TEST_USER_ID);

      assert.strictEqual(backup.needsBackup(TEST_USER_ID), false);
    });
  });

  describe("getLastBackupTime / setLastBackupTime", () => {
    it("should return null when no backup time set", () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");
      const time = backup.getLastBackupTime(TEST_USER_ID);
      assert.strictEqual(time, null);
    });

    it("should store and retrieve backup time", () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");
      const now = Date.now();
      backup.setLastBackupTime(TEST_USER_ID, now);

      const retrieved = backup.getLastBackupTime(TEST_USER_ID);
      assert.strictEqual(retrieved, now);
    });
  });

  describe("createAllBackups", () => {
    it("should create backups for all users", async () => {
      // Create two users with data
      users.createUser("user1");
      users.createUser("user2");
      db.saveUrl("user1", "https://user1.com");
      db.saveUrl("user2", "https://user2.com");

      const results = await backup.createAllBackups();

      assert.strictEqual(results.length, 2);
      assert.ok(results.every(r => r.success), "all backups should succeed");
    });
  });

  describe("checkAndRunDailyBackups", () => {
    it("should run backups for users needing them", async () => {
      users.createUser("needsbackup");
      db.saveUrl("needsbackup", "https://example.com");

      const result = await backup.checkAndRunDailyBackups();

      assert.strictEqual(result.backupCount, 1);

      // Should have created a backup
      const backups = backup.listBackups("needsbackup");
      assert.strictEqual(backups.length, 1);
    });

    it("should skip users who do not need backup", async () => {
      users.createUser("recentbackup");
      db.saveUrl("recentbackup", "https://example.com");
      await backup.createBackup("recentbackup");

      const result = await backup.checkAndRunDailyBackups();

      assert.strictEqual(result.backupCount, 0);
    });
  });
});

describe("Backup API Tests", () => {
  let app;
  let db;
  let users;
  let backup;
  let TEST_API_KEY;
  const TEST_USER = "backupapitest";

  beforeEach(() => {
    delete require.cache[require.resolve("./db")];
    delete require.cache[require.resolve("./users")];
    delete require.cache[require.resolve("./backup")];
    cleanTestDir();

    db = require("./db");
    users = require("./users");
    backup = require("./backup");

    const result = users.createUser(TEST_USER);
    TEST_API_KEY = result.apiKey;

    const { Hono } = require("hono");
    app = new Hono();

    // Auth middleware
    app.use("*", async (c, next) => {
      if (c.req.path === "/") return next();
      const auth = c.req.header("Authorization");
      if (!auth || !auth.startsWith("Bearer ")) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const apiKey = auth.slice(7);
      const userId = users.getUserIdFromApiKey(apiKey);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      c.set("userId", userId);
      return next();
    });

    // Backup endpoints
    app.get("/backups", (c) => {
      const userId = c.get("userId");
      const backups = backup.listBackups(userId);
      return c.json({ backups });
    });

    app.post("/backups", async (c) => {
      const userId = c.get("userId");
      const result = await backup.createBackup(userId);
      return c.json(result);
    });
  });

  after(() => {
    if (db && db.closeAllConnections) {
      db.closeAllConnections();
    }
    if (users && users.closeSystemDb) {
      users.closeSystemDb();
    }
    cleanTestDir();
  });

  function authHeaders() {
    return { Authorization: `Bearer ${TEST_API_KEY}` };
  }

  describe("GET /backups", () => {
    it("should return empty array when no backups", async () => {
      const res = await app.request("/backups", { headers: authHeaders() });
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(json.backups, []);
    });

    it("should return list of backups", async () => {
      db.saveUrl(TEST_USER, "https://example.com");
      await backup.createBackup(TEST_USER);

      const res = await app.request("/backups", { headers: authHeaders() });
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.backups.length, 1);
      assert.ok(json.backups[0].filename);
    });

    it("should require auth", async () => {
      const res = await app.request("/backups");
      assert.strictEqual(res.status, 401);
    });
  });

  describe("POST /backups", () => {
    it("should create a backup", async () => {
      db.saveUrl(TEST_USER, "https://example.com");

      const res = await app.request("/backups", {
        method: "POST",
        headers: authHeaders(),
      });
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.ok(json.filename);
      assert.ok(json.size);
    });

    it("should require auth", async () => {
      const res = await app.request("/backups", { method: "POST" });
      assert.strictEqual(res.status, 401);
    });
  });
});
