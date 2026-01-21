const { Hono } = require("hono");
const { serve } = require("@hono/node-server");
const fs = require("fs");
const db = require("./db");
const users = require("./users");

const app = new Hono();

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

app.get("/", (c) => {
  return c.json({ status: "ok", message: "Webhook server running" });
});

// Receive items from iOS app
app.post("/webhook", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  console.log("=== Webhook Received ===");
  console.log("User:", userId);
  console.log("Timestamp:", new Date().toISOString());
  console.log("URLs:", body.urls?.length || 0);
  console.log("Texts:", body.texts?.length || 0);
  console.log("Tagsets:", body.tagsets?.length || 0);

  const saved = [];

  // Save URLs
  if (body.urls && Array.isArray(body.urls)) {
    for (const item of body.urls) {
      if (item.url) {
        const id = db.saveUrl(userId, item.url, item.tags || [], item.metadata || null);
        saved.push({ id, type: "url", url: item.url });
        console.log(`Saved URL: ${item.url}`);
      }
    }
  }

  // Save texts
  if (body.texts && Array.isArray(body.texts)) {
    for (const item of body.texts) {
      if (item.content) {
        const id = db.saveText(userId, item.content, item.tags || [], item.metadata || null);
        saved.push({ id, type: "text" });
        console.log(`Saved text: ${item.content.substring(0, 50)}...`);
      }
    }
  }

  // Save tagsets
  if (body.tagsets && Array.isArray(body.tagsets)) {
    for (const item of body.tagsets) {
      if (item.tags && item.tags.length > 0) {
        const id = db.saveTagset(userId, item.tags, item.metadata || null);
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
  const urls = db.getSavedUrls(userId);
  return c.json({ urls });
});

// Get tags sorted by frecency
app.get("/tags", (c) => {
  const userId = c.get("userId");
  const tags = db.getTagsByFrecency(userId);
  return c.json({ tags });
});

// Delete a URL
app.delete("/urls/:id", (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  db.deleteUrl(userId, id);
  return c.json({ deleted: true });
});

// Update tags for a URL
app.patch("/urls/:id/tags", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json();
  db.updateUrlTags(userId, id, body.tags || []);
  return c.json({ updated: true });
});

// === Texts endpoints ===

app.post("/texts", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  if (!body.content) {
    return c.json({ error: "content is required" }, 400);
  }
  const id = db.saveText(userId, body.content, body.tags || [], body.metadata || null);
  return c.json({ id, created: true });
});

app.get("/texts", (c) => {
  const userId = c.get("userId");
  const texts = db.getTexts(userId);
  return c.json({ texts });
});

app.delete("/texts/:id", (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  db.deleteItem(userId, id);
  return c.json({ deleted: true });
});

app.patch("/texts/:id/tags", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json();
  db.updateItemTags(userId, id, body.tags || []);
  return c.json({ updated: true });
});

// === Tagsets endpoints ===

app.post("/tagsets", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  if (!body.tags || !Array.isArray(body.tags) || body.tags.length === 0) {
    return c.json({ error: "tags array is required and must not be empty" }, 400);
  }
  const id = db.saveTagset(userId, body.tags, body.metadata || null);
  return c.json({ id, created: true });
});

app.get("/tagsets", (c) => {
  const userId = c.get("userId");
  const tagsets = db.getTagsets(userId);
  return c.json({ tagsets });
});

app.delete("/tagsets/:id", (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  db.deleteItem(userId, id);
  return c.json({ deleted: true });
});

app.patch("/tagsets/:id/tags", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json();
  db.updateItemTags(userId, id, body.tags || []);
  return c.json({ updated: true });
});

// === Images endpoints ===

app.post("/images", async (c) => {
  const userId = c.get("userId");
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
    const id = db.saveImage(userId, filename, buffer, mimeType, tags);
    return c.json({ id, type: "image", created: true });
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }
});

app.get("/images", (c) => {
  const userId = c.get("userId");
  const images = db.getImages(userId);
  return c.json({ images });
});

app.get("/images/:id", (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const image = db.getImageById(userId, id);
  if (!image) {
    return c.json({ error: "image not found" }, 404);
  }

  const imagePath = db.getImagePath(userId, id);
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
  const id = c.req.param("id");
  db.deleteImage(userId, id);
  return c.json({ deleted: true });
});

app.patch("/images/:id/tags", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json();
  db.updateItemTags(userId, id, body.tags || []);
  return c.json({ updated: true });
});

// === Unified items endpoints ===

app.post("/items", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const { type, content, tags = [], metadata = null, sync_id = null } = body;

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
      const id = db.saveImage(userId, body.filename, buffer, body.mime, tags);
      return c.json({ id, type, created: true });
    } catch (e) {
      return c.json({ error: e.message }, 400);
    }
  }

  const id = db.saveItem(userId, type, content || null, tags, metadata, sync_id);
  return c.json({ id, type, created: true });
});

app.get("/items", (c) => {
  const userId = c.get("userId");
  const type = c.req.query("type");
  if (type && !["url", "text", "tagset", "image"].includes(type)) {
    return c.json({ error: "type must be 'url', 'text', 'tagset', or 'image'" }, 400);
  }
  const items = db.getItems(userId, type || null);
  return c.json({ items });
});

app.delete("/items/:id", (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  db.deleteItem(userId, id);
  return c.json({ deleted: true });
});

app.patch("/items/:id/tags", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json();
  db.updateItemTags(userId, id, body.tags || []);
  return c.json({ updated: true });
});

// === Sync endpoints ===

// Get items modified since a timestamp (for incremental sync)
app.get("/items/since/:timestamp", (c) => {
  const userId = c.get("userId");
  const timestamp = c.req.param("timestamp");
  const type = c.req.query("type");

  // Validate timestamp format (ISO string)
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return c.json({ error: "Invalid timestamp format. Use ISO 8601 format." }, 400);
  }

  if (type && !["url", "text", "tagset", "image"].includes(type)) {
    return c.json({ error: "type must be 'url', 'text', 'tagset', or 'image'" }, 400);
  }

  const items = db.getItemsSince(userId, timestamp, type || null);
  return c.json({ items, since: timestamp });
});

// Get a single item by ID
app.get("/items/:id", (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const item = db.getItemById(userId, id);
  if (!item) {
    return c.json({ error: "item not found" }, 404);
  }

  return c.json({ item });
});

const port = process.env.PORT || 3000;

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

migrateFromLegacyApiKey();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
