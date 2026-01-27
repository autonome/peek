/**
 * API Integration Tests
 *
 * Setup: Copy .env.example to .env and fill in your API keys
 *
 * Run against local server:
 *   npm run test:api:local
 *
 * Run against production:
 *   npm run test:api:prod
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");

// Determine environment from command line args
const args = process.argv.slice(2);
const isLocal = args.includes("--local");
const isProd = args.includes("--prod");

let BASE_URL, API_KEY;

if (isLocal) {
  BASE_URL = "http://localhost:3000";
  API_KEY = process.env.PEEK_LOCAL_KEY;
} else if (isProd) {
  BASE_URL = process.env.PEEK_PROD_URL;
  if (!BASE_URL) {
    console.error("ERROR: PEEK_PROD_URL environment variable is required for prod mode");
    process.exit(1);
  }
  API_KEY = process.env.PEEK_PROD_KEY;
} else {
  // Fallback to legacy env vars for backwards compatibility
  BASE_URL = process.env.BASE_URL || "http://localhost:3000";
  API_KEY = process.env.API_KEY;
}

if (!API_KEY) {
  console.error("ERROR: API key not found");
  console.error("Setup: Copy .env.example to .env and fill in your keys");
  console.error("  npm run test:api:local  (uses PEEK_LOCAL_KEY)");
  console.error("  npm run test:api:prod   (uses PEEK_PROD_KEY)");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

async function api(method, path, body = null) {
  const opts = { method, headers };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

// Track created items for cleanup
const createdItems = [];

describe("API Integration Tests", () => {
  describe("Health Check", () => {
    test("GET / returns ok without auth", async () => {
      const res = await fetch(`${BASE_URL}/`);
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.status, "ok");
    });
  });

  describe("Authentication", () => {
    test("returns 401 without auth header", async () => {
      const res = await fetch(`${BASE_URL}/urls`);
      assert.strictEqual(res.status, 401);
    });

    test("returns 401 with invalid key", async () => {
      const res = await fetch(`${BASE_URL}/urls`, {
        headers: { Authorization: "Bearer invalid-key" },
      });
      assert.strictEqual(res.status, 401);
    });

    test("returns 200 with valid key", async () => {
      const { status } = await api("GET", "/urls");
      assert.strictEqual(status, 200);
    });
  });

  describe("URLs (legacy endpoints)", () => {
    let urlId;

    test("POST /webhook saves URLs", async () => {
      const { status, data } = await api("POST", "/webhook", {
        urls: [{ url: "https://test-api-url.example.com", tags: ["test", "api"] }],
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.received, true);
      assert.strictEqual(data.saved_count, 1);
    });

    test("GET /urls returns saved URLs", async () => {
      const { status, data } = await api("GET", "/urls");
      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.urls));
      const found = data.urls.find((u) => u.url === "https://test-api-url.example.com");
      assert.ok(found, "Should find the saved URL");
      assert.deepStrictEqual(found.tags, ["test", "api"]);
      urlId = found.id;
    });

    test("PATCH /urls/:id/tags updates tags", async () => {
      const { status, data } = await api("PATCH", `/urls/${urlId}/tags`, {
        tags: ["updated", "tags"],
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.updated, true);
    });

    test("DELETE /urls/:id deletes URL", async () => {
      const { status, data } = await api("DELETE", `/urls/${urlId}`);
      assert.strictEqual(status, 200);
      assert.strictEqual(data.deleted, true);
    });
  });

  describe("Texts", () => {
    let textId;

    test("POST /texts creates text", async () => {
      const { status, data } = await api("POST", "/texts", {
        content: "Test note from API tests",
        tags: ["note", "test"],
      });
      assert.strictEqual(status, 200);
      assert.ok(data.id);
      assert.strictEqual(data.created, true);
      textId = data.id;
      createdItems.push({ type: "text", id: textId });
    });

    test("POST /texts requires content", async () => {
      const { status, data } = await api("POST", "/texts", { tags: ["test"] });
      assert.strictEqual(status, 400);
      assert.ok(data.error);
    });

    test("GET /texts returns texts", async () => {
      const { status, data } = await api("GET", "/texts");
      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.texts));
      const found = data.texts.find((t) => t.id === textId);
      assert.ok(found, "Should find created text");
      assert.strictEqual(found.content, "Test note from API tests");
    });

    test("PATCH /texts/:id/tags updates tags", async () => {
      const { status, data } = await api("PATCH", `/texts/${textId}/tags`, {
        tags: ["updated"],
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.updated, true);
    });

    test("DELETE /texts/:id deletes text", async () => {
      const { status, data } = await api("DELETE", `/texts/${textId}`);
      assert.strictEqual(status, 200);
      assert.strictEqual(data.deleted, true);
      createdItems.pop(); // Remove from cleanup list
    });
  });

  describe("Tagsets", () => {
    let tagsetId;

    test("POST /tagsets creates tagset", async () => {
      const { status, data } = await api("POST", "/tagsets", {
        tags: ["pushups", "10"],
      });
      assert.strictEqual(status, 200);
      assert.ok(data.id);
      assert.strictEqual(data.created, true);
      tagsetId = data.id;
      createdItems.push({ type: "tagset", id: tagsetId });
    });

    test("POST /tagsets requires tags", async () => {
      const { status, data } = await api("POST", "/tagsets", {});
      assert.strictEqual(status, 400);
      assert.ok(data.error);
    });

    test("GET /tagsets returns tagsets", async () => {
      const { status, data } = await api("GET", "/tagsets");
      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.tagsets));
      const found = data.tagsets.find((t) => t.id === tagsetId);
      assert.ok(found, "Should find created tagset");
      assert.deepStrictEqual(found.tags, ["pushups", "10"]);
    });

    test("PATCH /tagsets/:id/tags updates tags", async () => {
      const { status, data } = await api("PATCH", `/tagsets/${tagsetId}/tags`, {
        tags: ["squats", "15"],
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.updated, true);
    });

    test("DELETE /tagsets/:id deletes tagset", async () => {
      const { status, data } = await api("DELETE", `/tagsets/${tagsetId}`);
      assert.strictEqual(status, 200);
      assert.strictEqual(data.deleted, true);
      createdItems.pop();
    });
  });

  describe("Unified Items API", () => {
    let urlItemId, textItemId, tagsetItemId;

    test("POST /items creates URL item", async () => {
      const { status, data } = await api("POST", "/items", {
        type: "url",
        content: "https://unified-test.example.com",
        tags: ["unified", "url"],
      });
      assert.strictEqual(status, 200);
      assert.ok(data.id);
      assert.strictEqual(data.type, "url");
      urlItemId = data.id;
      createdItems.push({ type: "item", id: urlItemId });
    });

    test("POST /items creates text item", async () => {
      const { status, data } = await api("POST", "/items", {
        type: "text",
        content: "Unified text content",
        tags: ["unified", "text"],
      });
      assert.strictEqual(status, 200);
      assert.ok(data.id);
      assert.strictEqual(data.type, "text");
      textItemId = data.id;
      createdItems.push({ type: "item", id: textItemId });
    });

    test("POST /items creates tagset item", async () => {
      const { status, data } = await api("POST", "/items", {
        type: "tagset",
        tags: ["unified", "tagset"],
      });
      assert.strictEqual(status, 200);
      assert.ok(data.id);
      assert.strictEqual(data.type, "tagset");
      tagsetItemId = data.id;
      createdItems.push({ type: "item", id: tagsetItemId });
    });

    test("POST /items validates type", async () => {
      const { status, data } = await api("POST", "/items", {
        type: "invalid",
        content: "test",
      });
      assert.strictEqual(status, 400);
      assert.ok(data.error);
    });

    test("GET /items returns all items", async () => {
      const { status, data } = await api("GET", "/items");
      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.items));
      assert.ok(data.items.length >= 3);
    });

    test("GET /items?type=url filters by type", async () => {
      const { status, data } = await api("GET", "/items?type=url");
      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.items));
      assert.ok(data.items.every((i) => i.type === "url"));
    });

    test("GET /items?type=text filters by type", async () => {
      const { status, data } = await api("GET", "/items?type=text");
      assert.strictEqual(status, 200);
      assert.ok(data.items.every((i) => i.type === "text"));
    });

    test("GET /items?type=tagset filters by type", async () => {
      const { status, data } = await api("GET", "/items?type=tagset");
      assert.strictEqual(status, 200);
      assert.ok(data.items.every((i) => i.type === "tagset"));
    });

    test("PATCH /items/:id/tags updates tags", async () => {
      const { status, data } = await api("PATCH", `/items/${urlItemId}/tags`, {
        tags: ["modified"],
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.updated, true);
    });

    test("DELETE /items/:id deletes item", async () => {
      // Clean up all created items
      for (const item of [urlItemId, textItemId, tagsetItemId]) {
        const { status, data } = await api("DELETE", `/items/${item}`);
        assert.strictEqual(status, 200);
        assert.strictEqual(data.deleted, true);
      }
      // Clear from cleanup list
      createdItems.splice(-3);
    });
  });

  describe("Tags", () => {
    test("GET /tags returns tags sorted by frecency", async () => {
      const { status, data } = await api("GET", "/tags");
      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.tags));
      // Tags should have frecency_score
      if (data.tags.length > 0) {
        assert.ok("frecency_score" in data.tags[0]);
        assert.ok("frequency" in data.tags[0]);
      }
    });
  });

  describe("Images", () => {
    // 1x1 PNG image as base64
    const testPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    let imageId;

    test("POST /images with JSON base64 creates image", async () => {
      const { status, data } = await api("POST", "/images", {
        content: testPngBase64,
        filename: "test-api.png",
        mime: "image/png",
        tags: ["test", "api"],
      });
      assert.strictEqual(status, 200);
      assert.ok(data.id);
      assert.strictEqual(data.type, "image");
      assert.strictEqual(data.created, true);
      imageId = data.id;
      createdItems.push({ type: "image", id: imageId });
    });

    test("POST /images validates mime type", async () => {
      const { status, data } = await api("POST", "/images", {
        content: testPngBase64,
        filename: "test.txt",
        mime: "text/plain",
        tags: [],
      });
      assert.strictEqual(status, 400);
      assert.ok(data.error);
    });

    test("POST /images requires filename", async () => {
      const { status, data } = await api("POST", "/images", {
        content: testPngBase64,
        mime: "image/png",
      });
      assert.strictEqual(status, 400);
      assert.ok(data.error);
    });

    test("GET /images returns images", async () => {
      const { status, data } = await api("GET", "/images");
      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.images));
      const found = data.images.find((i) => i.id === imageId);
      assert.ok(found, "Should find created image");
      assert.strictEqual(found.filename, "test-api.png");
      assert.strictEqual(found.mime, "image/png");
      assert.ok(found.size > 0);
    });

    test("GET /images/:id returns image binary", async () => {
      const res = await fetch(`${BASE_URL}/images/${imageId}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("Content-Type"), "image/png");
      const buffer = await res.arrayBuffer();
      assert.ok(buffer.byteLength > 0);
    });

    test("GET /images/:id returns 404 for non-existent", async () => {
      const res = await fetch(`${BASE_URL}/images/non-existent-id`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      assert.strictEqual(res.status, 404);
    });

    test("PATCH /images/:id/tags updates tags", async () => {
      const { status, data } = await api("PATCH", `/images/${imageId}/tags`, {
        tags: ["updated", "image"],
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.updated, true);
    });

    test("GET /items?type=image filters images", async () => {
      const { status, data } = await api("GET", "/items?type=image");
      assert.strictEqual(status, 200);
      assert.ok(data.items.every((i) => i.type === "image"));
      const found = data.items.find((i) => i.id === imageId);
      assert.ok(found, "Should find image in items");
      assert.ok(found.metadata);
      assert.strictEqual(found.metadata.mime, "image/png");
    });

    test("POST /items with type=image works", async () => {
      const { status, data } = await api("POST", "/items", {
        type: "image",
        content: testPngBase64,
        filename: "unified-image.png",
        mime: "image/png",
        tags: ["unified"],
      });
      assert.strictEqual(status, 200);
      assert.ok(data.id);
      assert.strictEqual(data.type, "image");
      createdItems.push({ type: "image", id: data.id });
    });

    test("DELETE /images/:id deletes image", async () => {
      const { status, data } = await api("DELETE", `/images/${imageId}`);
      assert.strictEqual(status, 200);
      assert.strictEqual(data.deleted, true);
      createdItems.shift(); // Remove first image from cleanup
    });
  });

  // Cleanup any remaining items
  after(async () => {
    for (const item of createdItems) {
      try {
        await api("DELETE", `/items/${item.id}`);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });
});

console.log(`\nRunning API tests against: ${BASE_URL}\n`);
