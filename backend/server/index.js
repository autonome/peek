const { Hono } = require("hono");
const { serve } = require("@hono/node-server");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const users = require("./users");
const backup = require("./backup");
const { DATASTORE_VERSION, PROTOCOL_VERSION } = require("./version");

const app = new Hono();

// Version headers middleware - add version info to all responses
app.use("*", async (c, next) => {
  await next();
  c.header("X-Peek-Datastore-Version", String(DATASTORE_VERSION));
  c.header("X-Peek-Protocol-Version", String(PROTOCOL_VERSION));
});

// Auth middleware - looks up user by API key
app.use("*", async (c, next) => {
  // Health check is public
  if (c.req.path === "/") {
    return next();
  }

  const auth = c.req.header("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const apiKey = auth.slice(7); // Remove "Bearer " prefix
  const userId = users.getUserIdFromApiKey(apiKey);

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("userId", userId);
  return next();
});

// Version check middleware for sync endpoints
// Rejects requests with mismatched version headers (HTTP 409)
// Allows requests with no version headers (backward compat during rollout)
app.use("/items/*", async (c, next) => {
  return checkVersionHeaders(c, next);
});
app.use("/items", async (c, next) => {
  return checkVersionHeaders(c, next);
});

function checkVersionHeaders(c, next) {
  const clientDS = c.req.header("X-Peek-Datastore-Version");
  const clientProto = c.req.header("X-Peek-Protocol-Version");

  // If client sends no version headers, allow (backward compat)
  if (!clientDS && !clientProto) {
    return next();
  }

  const clientDSNum = parseInt(clientDS, 10) || 0;
  const clientProtoNum = parseInt(clientProto, 10) || 0;

  // Check datastore version mismatch
  if (clientDSNum > 0 && clientDSNum !== DATASTORE_VERSION) {
    return c.json({
      error: "Version mismatch",
      message: `Datastore version mismatch: client=${clientDSNum}, server=${DATASTORE_VERSION}. Please update your app.`,
      type: "datastore_version_mismatch",
      client_version: clientDSNum,
      server_version: DATASTORE_VERSION,
    }, 409);
  }

  // Check protocol version mismatch
  if (clientProtoNum > 0 && clientProtoNum !== PROTOCOL_VERSION) {
    return c.json({
      error: "Version mismatch",
      message: `Protocol version mismatch: client=${clientProtoNum}, server=${PROTOCOL_VERSION}. Please update your app.`,
      type: "protocol_version_mismatch",
      client_version: clientProtoNum,
      server_version: PROTOCOL_VERSION,
    }, 409);
  }

  return next();
}

app.get("/", (c) => {
  return c.json({
    status: "ok",
    message: "Webhook server running",
    datastore_version: DATASTORE_VERSION,
    protocol_version: PROTOCOL_VERSION,
  });
});

// Receive items from iOS app
app.post("/webhook", async (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const body = await c.req.json();

  console.log("=== Webhook Received ===");
  console.log("User:", userId);
  console.log("Profile:", profileId);
  console.log("Timestamp:", new Date().toISOString());
  console.log("URLs:", body.urls?.length || 0);
  console.log("Texts:", body.texts?.length || 0);
  console.log("Tagsets:", body.tagsets?.length || 0);

  const saved = [];

  // Save URLs
  if (body.urls && Array.isArray(body.urls)) {
    for (const item of body.urls) {
      if (item.url) {
        const id = db.saveUrl(userId, item.url, item.tags || [], item.metadata || null, profileId);
        saved.push({ id, type: "url", url: item.url });
        console.log(`Saved URL: ${item.url}`);
      }
    }
  }

  // Save texts
  if (body.texts && Array.isArray(body.texts)) {
    for (const item of body.texts) {
      if (item.content) {
        const id = db.saveText(userId, item.content, item.tags || [], item.metadata || null, profileId);
        saved.push({ id, type: "text" });
        console.log(`Saved text: ${item.content.substring(0, 50)}...`);
      }
    }
  }

  // Save tagsets
  if (body.tagsets && Array.isArray(body.tagsets)) {
    for (const item of body.tagsets) {
      if (item.tags && item.tags.length > 0) {
        const id = db.saveTagset(userId, item.tags, item.metadata || null, profileId);
        saved.push({ id, type: "tagset" });
        console.log(`Saved tagset: ${item.tags.join(", ")}`);
      }
    }
  }

  console.log("========================");

  return c.json({ received: true, saved_count: saved.length });
});

// Get all saved URLs
app.get("/urls", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const urls = db.getSavedUrls(userId, profileId);
  return c.json({ urls });
});

// Get tags sorted by frecency
app.get("/tags", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const tags = db.getTagsByFrecency(userId, profileId);
  return c.json({ tags });
});

// Delete a URL
app.delete("/urls/:id", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const id = c.req.param("id");
  db.deleteUrl(userId, id, profileId);
  return c.json({ deleted: true });
});

// Update tags for a URL
app.patch("/urls/:id/tags", async (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const id = c.req.param("id");
  const body = await c.req.json();
  db.updateUrlTags(userId, id, body.tags || [], profileId);
  return c.json({ updated: true });
});

// === Texts endpoints ===

app.post("/texts", async (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const body = await c.req.json();
  if (!body.content) {
    return c.json({ error: "content is required" }, 400);
  }
  const id = db.saveText(userId, body.content, body.tags || [], body.metadata || null, profileId);
  return c.json({ id, created: true });
});

app.get("/texts", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const texts = db.getTexts(userId, profileId);
  return c.json({ texts });
});

app.delete("/texts/:id", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const id = c.req.param("id");
  db.deleteItem(userId, id, profileId);
  return c.json({ deleted: true });
});

app.patch("/texts/:id/tags", async (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const id = c.req.param("id");
  const body = await c.req.json();
  db.updateItemTags(userId, id, body.tags || [], profileId);
  return c.json({ updated: true });
});

// === Tagsets endpoints ===

app.post("/tagsets", async (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const body = await c.req.json();
  if (!body.tags || !Array.isArray(body.tags) || body.tags.length === 0) {
    return c.json({ error: "tags array is required and must not be empty" }, 400);
  }
  const id = db.saveTagset(userId, body.tags, body.metadata || null, profileId);
  return c.json({ id, created: true });
});

app.get("/tagsets", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const tagsets = db.getTagsets(userId, profileId);
  return c.json({ tagsets });
});

app.delete("/tagsets/:id", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const id = c.req.param("id");
  db.deleteItem(userId, id, profileId);
  return c.json({ deleted: true });
});

app.patch("/tagsets/:id/tags", async (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const id = c.req.param("id");
  const body = await c.req.json();
  db.updateItemTags(userId, id, body.tags || [], profileId);
  return c.json({ updated: true });
});

// === Images endpoints ===

app.post("/images", async (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const contentType = c.req.header("Content-Type") || "";

  let filename, buffer, mimeType, tags = [];

  if (contentType.includes("multipart/form-data")) {
    // Handle multipart upload
    const formData = await c.req.formData();
    const file = formData.get("file");
    const tagsField = formData.get("tags");

    if (!file || !(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }

    filename = file.name;
    mimeType = file.type;
    buffer = Buffer.from(await file.arrayBuffer());

    if (tagsField) {
      try {
        tags = JSON.parse(tagsField);
      } catch {
        tags = [];
      }
    }
  } else {
    // Handle JSON with base64 content
    const body = await c.req.json();
    if (!body.content) {
      return c.json({ error: "content (base64 image data) is required" }, 400);
    }
    if (!body.filename) {
      return c.json({ error: "filename is required" }, 400);
    }
    if (!body.mime) {
      return c.json({ error: "mime type is required" }, 400);
    }

    filename = body.filename;
    mimeType = body.mime;
    buffer = Buffer.from(body.content, "base64");
    tags = body.tags || [];
  }

  if (!mimeType.startsWith("image/")) {
    return c.json({ error: "file must be an image" }, 400);
  }

  if (buffer.length > db.MAX_IMAGE_SIZE) {
    return c.json({ error: `image exceeds maximum size of ${db.MAX_IMAGE_SIZE / 1024 / 1024} MB` }, 400);
  }

  try {
    const id = db.saveImage(userId, filename, buffer, mimeType, tags, profileId);
    return c.json({ id, type: "image", created: true });
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }
});

app.get("/images", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const images = db.getImages(userId, profileId);
  return c.json({ images });
});

app.get("/images/:id", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const id = c.req.param("id");

  const image = db.getImageById(userId, id, profileId);
  if (!image) {
    return c.json({ error: "image not found" }, 404);
  }

  const imagePath = db.getImagePath(userId, id, profileId);
  if (!imagePath || !fs.existsSync(imagePath)) {
    return c.json({ error: "image file not found" }, 404);
  }

  const fileBuffer = fs.readFileSync(imagePath);
  return new Response(fileBuffer, {
    headers: {
      "Content-Type": image.metadata.mime,
      "Content-Length": fileBuffer.length.toString(),
      "Content-Disposition": `inline; filename="${image.filename}"`,
    },
  });
});

app.delete("/images/:id", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const id = c.req.param("id");
  db.deleteImage(userId, id, profileId);
  return c.json({ deleted: true });
});

app.patch("/images/:id/tags", async (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const id = c.req.param("id");
  const body = await c.req.json();
  db.updateItemTags(userId, id, body.tags || [], profileId);
  return c.json({ updated: true });
});

// === Unified items endpoints ===

app.post("/items", async (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const body = await c.req.json();
  const { type, content, tags = [], metadata = null, sync_id = null, deleted_at } = body;

  if (deleted_at) console.log(`[sync] Received tombstone push: sync_id=${sync_id} deleted_at=${deleted_at}`);

  // Sync logging for e2e test verification
  console.log("=== Sync Item Received ===");
  console.log("User:", userId);
  console.log("Profile:", profileId);
  console.log("Timestamp:", new Date().toISOString());
  console.log("Type:", type);
  console.log("sync_id:", sync_id || "(none)");
  console.log("Content preview:", content?.substring(0, 100) || "(null)");
  console.log("Tags:", tags.join(", ") || "(none)");
  console.log("==========================");

  if (!type || !["url", "text", "tagset", "image"].includes(type)) {
    return c.json({ error: "type must be 'url', 'text', 'tagset', or 'image'" }, 400);
  }

  if (type === "url" && !content) {
    return c.json({ error: "content (URL) is required for type 'url'" }, 400);
  }

  if (type === "text" && !content) {
    return c.json({ error: "content is required for type 'text'" }, 400);
  }

  if (type === "tagset" && (!tags || tags.length === 0)) {
    return c.json({ error: "tags are required for type 'tagset'" }, 400);
  }

  if (type === "image") {
    // For images via unified endpoint, require base64 content
    if (!content) {
      return c.json({ error: "content (base64 image data) is required for type 'image'" }, 400);
    }
    if (!body.filename) {
      return c.json({ error: "filename is required for type 'image'" }, 400);
    }
    if (!body.mime) {
      return c.json({ error: "mime type is required for type 'image'" }, 400);
    }

    const buffer = Buffer.from(content, "base64");
    if (buffer.length > db.MAX_IMAGE_SIZE) {
      return c.json({ error: `image exceeds maximum size of ${db.MAX_IMAGE_SIZE / 1024 / 1024} MB` }, 400);
    }

    try {
      const id = db.saveImage(userId, body.filename, buffer, body.mime, tags, profileId);
      return c.json({ id, type, created: true });
    } catch (e) {
      return c.json({ error: e.message }, 400);
    }
  }

  const id = db.saveItem(userId, type, content || null, tags, metadata, sync_id, profileId, deleted_at);
  return c.json({ id, type, created: true });
});

app.get("/items", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const type = c.req.query("type");
  const includeDeleted = c.req.query("includeDeleted") === "true";
  if (type && !["url", "text", "tagset", "image"].includes(type)) {
    return c.json({ error: "type must be 'url', 'text', 'tagset', or 'image'" }, 400);
  }
  const items = db.getItems(userId, type || null, profileId, includeDeleted);
  return c.json({ items });
});

app.delete("/items/:id", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const id = c.req.param("id");
  db.deleteItem(userId, id, profileId);
  return c.json({ deleted: true });
});

app.patch("/items/:id/tags", async (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const id = c.req.param("id");
  const body = await c.req.json();
  db.updateItemTags(userId, id, body.tags || [], profileId);
  return c.json({ updated: true });
});

// === Sync endpoints ===

// Get items modified since a timestamp (for incremental sync)
app.get("/items/since/:timestamp", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const rawTimestamp = c.req.param("timestamp");
  const type = c.req.query("type");

  // Accept ISO 8601 string or Unix ms integer, convert to Unix ms for DB query
  let unixMs;
  if (/^\d+$/.test(rawTimestamp)) {
    unixMs = parseInt(rawTimestamp, 10);
  } else {
    const date = new Date(rawTimestamp);
    if (isNaN(date.getTime())) {
      return c.json({ error: "Invalid timestamp format. Use ISO 8601 or Unix ms." }, 400);
    }
    unixMs = date.getTime();
  }

  if (type && !["url", "text", "tagset", "image"].includes(type)) {
    return c.json({ error: "type must be 'url', 'text', 'tagset', or 'image'" }, 400);
  }

  const items = db.getItemsSince(userId, unixMs, type || null, profileId);
  return c.json({ items, since: rawTimestamp });
});

// Get a single item by ID
app.get("/items/:id", (c) => {
  const userId = c.get("userId");
  const profileId = users.resolveProfileId(userId, c.req.query("profile") || "default");
  const id = c.req.param("id");

  const item = db.getItemById(userId, id, profileId);
  if (!item) {
    return c.json({ error: "item not found" }, 404);
  }

  return c.json({ item });
});

// === Backup endpoints ===

// GET /backups - List backups for authenticated user
app.get("/backups", (c) => {
  const userId = c.get("userId");
  const backups = backup.listBackups(userId);
  return c.json({ backups });
});

// POST /backups - Trigger manual backup for authenticated user
app.post("/backups", async (c) => {
  const userId = c.get("userId");
  const result = await backup.createBackup(userId);
  return c.json(result);
});

// === Profile endpoints ===

// GET /profiles - List profiles for authenticated user
app.get("/profiles", (c) => {
  const userId = c.get("userId");
  const profiles = users.listProfiles(userId);
  return c.json({ profiles });
});

// POST /profiles - Create a new profile for authenticated user
app.post("/profiles", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  if (!body.name) {
    return c.json({ error: "name is required" }, 400);
  }

  try {
    const profile = users.createProfile(userId, body.name);
    return c.json({ profile, created: true });
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }
});

// GET /profiles/:id - Get a specific profile by UUID
app.get("/profiles/:id", (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const profile = users.getProfileById(userId, id);
  if (!profile) {
    return c.json({ error: "profile not found" }, 404);
  }

  return c.json({ profile });
});

// DELETE /profiles/:profileId - Delete a profile
app.delete("/profiles/:profileId", (c) => {
  const userId = c.get("userId");
  const profileId = c.req.param("profileId");

  try {
    users.deleteProfile(userId, profileId);
    return c.json({ deleted: true });
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }
});

const port = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || "./data";

// Migrate legacy API_KEY env var to multi-user system
function migrateFromLegacyApiKey() {
  const legacyKey = process.env.API_KEY;
  if (!legacyKey) return;

  const existingUsers = users.listUsers();
  if (existingUsers.length > 0) return;

  try {
    users.createUserWithKey("default", legacyKey);
    console.log("Migrated legacy API_KEY to user 'default'");
  } catch (e) {
    console.log("Legacy migration skipped:", e.message);
  }
}

// Migrate existing user data to profiles structure
function migrateUserDataToProfiles() {
  // DRY RUN MODE: Set MIGRATION_DRY_RUN=true to test without moving data
  const DRY_RUN = process.env.MIGRATION_DRY_RUN === 'true';

  if (DRY_RUN) {
    console.log('[migration] ========================================');
    console.log('[migration] DRY RUN MODE - No data will be moved');
    console.log('[migration] ========================================');
  }

  if (!fs.existsSync(DATA_DIR)) {
    return; // No data directory, nothing to migrate
  }

  const userDirs = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name !== 'system.db')
    .map(dirent => dirent.name);

  let migratedCount = 0;
  let skippedCount = 0;
  let dryRunCount = 0;

  for (const userId of userDirs) {
    const oldDbPath = path.join(DATA_DIR, userId, "peek.db");
    const newDbPath = path.join(DATA_DIR, userId, "profiles", "default", "datastore.sqlite");
    const backupPath = `${oldDbPath}.pre-migration-backup`;

    // Skip if old DB doesn't exist or new DB already exists
    if (!fs.existsSync(oldDbPath)) {
      continue;
    }

    if (fs.existsSync(newDbPath)) {
      skippedCount++;
      continue;
    }

    // DRY RUN: Just report what would be migrated
    if (DRY_RUN) {
      console.log(`[migration] [DRY RUN] Would migrate ${userId}:`);
      console.log(`[migration]   From: ${oldDbPath}`);
      console.log(`[migration]   To:   ${newDbPath}`);

      const oldImagesDir = path.join(DATA_DIR, userId, "images");
      if (fs.existsSync(oldImagesDir)) {
        const newImagesDir = path.join(DATA_DIR, userId, "profiles", "default", "images");
        console.log(`[migration]   Images: ${oldImagesDir} -> ${newImagesDir}`);
      }

      dryRunCount++;
      continue;
    }

    try {
      // SAFETY: Create pre-migration backup
      if (!fs.existsSync(backupPath)) {
        console.log(`[migration] Creating pre-migration backup for ${userId}`);
        fs.copyFileSync(oldDbPath, backupPath);
        console.log(`[migration] Backup created: ${backupPath}`);
      }

      // Create profile directory
      const profileDir = path.dirname(newDbPath);
      if (!fs.existsSync(profileDir)) {
        fs.mkdirSync(profileDir, { recursive: true });
      }

      // Move database file
      fs.renameSync(oldDbPath, newDbPath);
      console.log(`[migration] Migrated ${userId} data to profiles/default/datastore.sqlite`);

      // Verify the move succeeded
      if (!fs.existsSync(newDbPath)) {
        throw new Error('Migration verification failed: new DB not found after move');
      }

      // Create profile record
      const existingProfile = users.getProfile(userId, "default");
      if (!existingProfile) {
        users.createProfile(userId, "Default");
        console.log(`[migration] Created default profile for user ${userId}`);
      }

      // Move images directory if it exists
      const oldImagesDir = path.join(DATA_DIR, userId, "images");
      const newImagesDir = path.join(DATA_DIR, userId, "profiles", "default", "images");
      if (fs.existsSync(oldImagesDir) && !fs.existsSync(newImagesDir)) {
        // Backup images directory too
        const imagesBackupDir = `${oldImagesDir}.pre-migration-backup`;
        if (!fs.existsSync(imagesBackupDir)) {
          console.log(`[migration] Backing up images directory for ${userId}`);
          // Copy entire directory recursively
          fs.cpSync(oldImagesDir, imagesBackupDir, { recursive: true });
        }

        fs.renameSync(oldImagesDir, newImagesDir);
        console.log(`[migration] Migrated ${userId} images to profiles/default/images`);
      }

      console.log(`[migration] ✓ Migration successful for ${userId}`);
      console.log(`[migration] Backup available at: ${backupPath}`);
      console.log(`[migration] (Backup can be manually deleted after verifying data integrity)`);

      migratedCount++;
    } catch (error) {
      console.error(`[migration] ✗ Failed to migrate ${userId}:`, error.message);

      // SAFETY: Attempt rollback if backup exists
      if (fs.existsSync(backupPath) && !fs.existsSync(oldDbPath)) {
        console.error(`[migration] Attempting rollback for ${userId}...`);
        try {
          fs.copyFileSync(backupPath, oldDbPath);
          console.log(`[migration] ✓ Rollback successful for ${userId}`);
        } catch (rollbackError) {
          console.error(`[migration] ✗ CRITICAL: Rollback failed for ${userId}:`, rollbackError.message);
          console.error(`[migration] Manual recovery required. Backup at: ${backupPath}`);
        }
      }
    }
  }

  if (DRY_RUN) {
    console.log('[migration] ========================================');
    console.log(`[migration] DRY RUN COMPLETE: ${dryRunCount} user(s) would be migrated`);
    console.log(`[migration] ${skippedCount} user(s) already migrated`);
    console.log('[migration] ========================================');
  } else if (migratedCount > 0) {
    console.log(`[migration] Migration complete: ${migratedCount} user(s) migrated, ${skippedCount} already migrated`);
  } else if (skippedCount > 0) {
    console.log(`[migration] All users already migrated (${skippedCount} found)`);
  }
}

// One-time deduplication of all users' items
function deduplicateAllUsers() {
  const allUsers = users.listUsers();
  for (const user of allUsers) {
    const profiles = users.listProfiles(user.id);
    for (const profile of profiles) {
      const flag = db.getSetting(user.id, "dedup_cleanup_v1", profile.id);
      if (flag) continue;

      console.log(`[dedup] Running dedup for user=${user.id} profile=${profile.id}`);
      try {
        db.deduplicateItems(user.id, profile.id);
        db.setSetting(user.id, "dedup_cleanup_v1", "1", profile.id);
        console.log(`[dedup] Completed for user=${user.id} profile=${profile.id}`);
      } catch (err) {
        console.error(`[dedup] Failed for user=${user.id} profile=${profile.id}:`, err.message);
      }
    }
  }
}

migrateFromLegacyApiKey();
migrateUserDataToProfiles();
users.migrateProfileFoldersToUuid();
deduplicateAllUsers();

// Force backup of all users on every deploy/restart (before serving requests)
backup.createAllBackups().then(() => {
  console.log("Pre-deploy backup complete");
}).catch((err) => {
  console.error("Pre-deploy backup failed:", err);
});

// Set up hourly backup check (runs if >24h since last backup)
setInterval(() => backup.checkAndRunDailyBackups(), 60 * 60 * 1000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
