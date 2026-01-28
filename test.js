const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

// Use test directory for all databases
const TEST_DATA_DIR = path.join(__dirname, "test-data");
process.env.DATA_DIR = TEST_DATA_DIR;

const TEST_USER_ID = "testuser";

// Clean up test directory before tests
function cleanTestDir() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
}

cleanTestDir();

describe("Database Tests", () => {
  let db;

  beforeEach(() => {
    // Fresh db module for each test
    delete require.cache[require.resolve("./db")];
    cleanTestDir();
    db = require("./db");
  });

  after(() => {
    if (db && db.closeAllConnections) {
      db.closeAllConnections();
    }
    cleanTestDir();
  });

  describe("saveUrl", () => {
    it("should save a URL without tags", () => {
      const id = db.saveUrl(TEST_USER_ID, "https://example.com");
      assert.ok(id, "should return an id");
      assert.match(id, /^[0-9a-f-]{36}$/, "id should be a UUID");
    });

    it("should save a URL with tags", () => {
      const id = db.saveUrl(TEST_USER_ID, "https://example.com", ["test", "demo"]);
      assert.ok(id);

      const urls = db.getSavedUrls(TEST_USER_ID);
      assert.strictEqual(urls.length, 1);
      assert.strictEqual(urls[0].url, "https://example.com");
      assert.deepStrictEqual(urls[0].tags.sort(), ["demo", "test"]);
    });

    it("should update existing URL instead of duplicating", () => {
      const id1 = db.saveUrl(TEST_USER_ID, "https://example.com", ["tag1"]);
      const id2 = db.saveUrl(TEST_USER_ID, "https://example.com", ["tag2"]);

      // Should reuse same ID
      assert.strictEqual(id1, id2);

      const urls = db.getSavedUrls(TEST_USER_ID);
      assert.strictEqual(urls.length, 1);
      // Tags should be replaced
      assert.deepStrictEqual(urls[0].tags, ["tag2"]);
    });

    it("should save multiple different URLs", () => {
      db.saveUrl(TEST_USER_ID, "https://example1.com");
      db.saveUrl(TEST_USER_ID, "https://example2.com");
      db.saveUrl(TEST_USER_ID, "https://example3.com");

      const urls = db.getSavedUrls(TEST_USER_ID);
      assert.strictEqual(urls.length, 3);
    });
  });

  describe("getSavedUrls", () => {
    it("should return empty array when no URLs", () => {
      const urls = db.getSavedUrls(TEST_USER_ID);
      assert.deepStrictEqual(urls, []);
    });

    it("should return all saved URLs", () => {
      db.saveUrl(TEST_USER_ID, "https://first.com");
      db.saveUrl(TEST_USER_ID, "https://second.com");
      db.saveUrl(TEST_USER_ID, "https://third.com");

      const urls = db.getSavedUrls(TEST_USER_ID);
      assert.strictEqual(urls.length, 3);
      const urlStrings = urls.map((u) => u.url).sort();
      assert.deepStrictEqual(urlStrings, [
        "https://first.com",
        "https://second.com",
        "https://third.com",
      ]);
    });

    it("should include saved_at timestamp", () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");
      const urls = db.getSavedUrls(TEST_USER_ID);

      assert.ok(urls[0].saved_at);
      // Should be ISO format
      assert.ok(new Date(urls[0].saved_at).toISOString());
    });
  });

  describe("deleteUrl", () => {
    it("should delete a URL by id", () => {
      const id = db.saveUrl(TEST_USER_ID, "https://example.com");
      assert.strictEqual(db.getSavedUrls(TEST_USER_ID).length, 1);

      db.deleteUrl(TEST_USER_ID, id);
      assert.strictEqual(db.getSavedUrls(TEST_USER_ID).length, 0);
    });

    it("should cascade delete url_tags associations", () => {
      const id = db.saveUrl(TEST_USER_ID, "https://example.com", ["tag1", "tag2"]);
      db.deleteUrl(TEST_USER_ID, id);

      // URL should be gone
      assert.strictEqual(db.getSavedUrls(TEST_USER_ID).length, 0);

      // Tags should still exist (not deleted with URL)
      const tags = db.getTagsByFrecency(TEST_USER_ID);
      assert.strictEqual(tags.length, 2);
    });

    it("should not error when deleting non-existent id", () => {
      assert.doesNotThrow(() => {
        db.deleteUrl(TEST_USER_ID, "non-existent-id");
      });
    });
  });

  describe("updateUrlTags", () => {
    it("should update tags for existing URL", () => {
      const id = db.saveUrl(TEST_USER_ID, "https://example.com", ["old-tag"]);
      db.updateUrlTags(TEST_USER_ID, id, ["new-tag1", "new-tag2"]);

      const urls = db.getSavedUrls(TEST_USER_ID);
      assert.deepStrictEqual(urls[0].tags.sort(), ["new-tag1", "new-tag2"]);
    });

    it("should clear tags when given empty array", () => {
      const id = db.saveUrl(TEST_USER_ID, "https://example.com", ["tag1", "tag2"]);
      db.updateUrlTags(TEST_USER_ID, id, []);

      const urls = db.getSavedUrls(TEST_USER_ID);
      assert.deepStrictEqual(urls[0].tags, []);
    });
  });

  describe("Tags and Frecency", () => {
    it("should track tag frequency", () => {
      db.saveUrl(TEST_USER_ID, "https://example1.com", ["common"]);
      db.saveUrl(TEST_USER_ID, "https://example2.com", ["common"]);
      db.saveUrl(TEST_USER_ID, "https://example3.com", ["common"]);
      db.saveUrl(TEST_USER_ID, "https://example4.com", ["rare"]);

      const tags = db.getTagsByFrecency(TEST_USER_ID);
      const common = tags.find((t) => t.name === "common");
      const rare = tags.find((t) => t.name === "rare");

      assert.strictEqual(common.frequency, 3);
      assert.strictEqual(rare.frequency, 1);
    });

    it("should sort tags by frecency score descending", () => {
      db.saveUrl(TEST_USER_ID, "https://example1.com", ["rare"]);
      db.saveUrl(TEST_USER_ID, "https://example2.com", ["common"]);
      db.saveUrl(TEST_USER_ID, "https://example3.com", ["common"]);
      db.saveUrl(TEST_USER_ID, "https://example4.com", ["common"]);

      const tags = db.getTagsByFrecency(TEST_USER_ID);
      assert.strictEqual(tags[0].name, "common");
      assert.strictEqual(tags[1].name, "rare");
    });

    it("should have positive frecency score", () => {
      db.saveUrl(TEST_USER_ID, "https://example.com", ["test"]);
      const tags = db.getTagsByFrecency(TEST_USER_ID);

      assert.ok(tags[0].frecencyScore > 0);
    });

    it("should return empty array when no tags", () => {
      const tags = db.getTagsByFrecency(TEST_USER_ID);
      assert.deepStrictEqual(tags, []);
    });
  });

  describe("Settings", () => {
    it("should save and retrieve settings", () => {
      db.setSetting(TEST_USER_ID, "test_key", "test_value");
      const value = db.getSetting(TEST_USER_ID, "test_key");
      assert.strictEqual(value, "test_value");
    });

    it("should return null for non-existent setting", () => {
      const value = db.getSetting(TEST_USER_ID, "non_existent");
      assert.strictEqual(value, null);
    });

    it("should update existing setting", () => {
      db.setSetting(TEST_USER_ID, "key", "value1");
      db.setSetting(TEST_USER_ID, "key", "value2");

      const value = db.getSetting(TEST_USER_ID, "key");
      assert.strictEqual(value, "value2");
    });
  });

  describe("saveText", () => {
    it("should save a text without tags", () => {
      const id = db.saveText(TEST_USER_ID, "My note content");
      assert.ok(id, "should return an id");
      assert.match(id, /^[0-9a-f-]{36}$/, "id should be a UUID");
    });

    it("should save a text with tags", () => {
      const id = db.saveText(TEST_USER_ID, "My note", ["personal", "todo"]);
      assert.ok(id);

      const texts = db.getTexts(TEST_USER_ID);
      assert.strictEqual(texts.length, 1);
      assert.strictEqual(texts[0].content, "My note");
      assert.deepStrictEqual(texts[0].tags.sort(), ["personal", "todo"]);
    });

    it("should update existing text with same content", () => {
      const id1 = db.saveText(TEST_USER_ID, "Same content", ["tag1"]);
      const id2 = db.saveText(TEST_USER_ID, "Same content", ["tag2"]);

      assert.strictEqual(id1, id2);
      const texts = db.getTexts(TEST_USER_ID);
      assert.strictEqual(texts.length, 1);
      assert.deepStrictEqual(texts[0].tags, ["tag2"]);
    });
  });

  describe("saveTagset", () => {
    it("should save a tagset", () => {
      const id = db.saveTagset(TEST_USER_ID, ["pushups", "10"]);
      assert.ok(id, "should return an id");
      assert.match(id, /^[0-9a-f-]{36}$/, "id should be a UUID");
    });

    it("should deduplicate tagsets with same tags", () => {
      const id1 = db.saveTagset(TEST_USER_ID, ["pushups", "10"]);
      const id2 = db.saveTagset(TEST_USER_ID, ["pushups", "10"]);

      // Tagsets with identical tag sets are deduplicated
      assert.strictEqual(id1, id2);

      const tagsets = db.getTagsets(TEST_USER_ID);
      assert.strictEqual(tagsets.length, 1);
    });

    it("should retrieve tagsets with their tags", () => {
      db.saveTagset(TEST_USER_ID, ["exercise", "pushups", "20"]);

      const tagsets = db.getTagsets(TEST_USER_ID);
      assert.strictEqual(tagsets.length, 1);
      assert.deepStrictEqual(tagsets[0].tags.sort(), ["20", "exercise", "pushups"]);
    });
  });

  describe("getItems (unified)", () => {
    it("should return all items when no type filter", () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");
      db.saveText(TEST_USER_ID, "A note");
      db.saveTagset(TEST_USER_ID, ["tag1", "tag2"]);

      const items = db.getItems(TEST_USER_ID);
      assert.strictEqual(items.length, 3);
    });

    it("should filter items by type", () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");
      db.saveText(TEST_USER_ID, "A note");
      db.saveTagset(TEST_USER_ID, ["tag1"]);

      const urls = db.getItems(TEST_USER_ID, "url");
      assert.strictEqual(urls.length, 1);
      assert.strictEqual(urls[0].type, "url");

      const texts = db.getItems(TEST_USER_ID, "text");
      assert.strictEqual(texts.length, 1);
      assert.strictEqual(texts[0].type, "text");

      const tagsets = db.getItems(TEST_USER_ID, "tagset");
      assert.strictEqual(tagsets.length, 1);
      assert.strictEqual(tagsets[0].type, "tagset");
    });
  });

  describe("deleteItem", () => {
    it("should soft-delete any item type", () => {
      const urlId = db.saveUrl(TEST_USER_ID, "https://example.com");
      const textId = db.saveText(TEST_USER_ID, "Note");
      const tagsetId = db.saveTagset(TEST_USER_ID, ["tag"]);

      assert.strictEqual(db.getItems(TEST_USER_ID).length, 3);

      db.deleteItem(TEST_USER_ID, urlId);
      assert.strictEqual(db.getItems(TEST_USER_ID).length, 2);

      db.deleteItem(TEST_USER_ID, textId);
      assert.strictEqual(db.getItems(TEST_USER_ID).length, 1);

      db.deleteItem(TEST_USER_ID, tagsetId);
      assert.strictEqual(db.getItems(TEST_USER_ID).length, 0);
    });

    it("should retain soft-deleted items in database with includeDeleted", () => {
      const urlId = db.saveUrl(TEST_USER_ID, "https://example.com");
      db.deleteItem(TEST_USER_ID, urlId);

      // Default query excludes deleted items
      assert.strictEqual(db.getItems(TEST_USER_ID).length, 0);

      // includeDeleted should show them
      const allItems = db.getItems(TEST_USER_ID, null, "default", true);
      assert.strictEqual(allItems.length, 1);
      assert.ok(allItems[0].deleted_at > 0, "deleted_at should be set");
    });
  });

  describe("updateItemTags", () => {
    it("should update tags for any item type", () => {
      const textId = db.saveText(TEST_USER_ID, "Note", ["old"]);
      db.updateItemTags(TEST_USER_ID, textId, ["new1", "new2"]);

      const texts = db.getTexts(TEST_USER_ID);
      assert.deepStrictEqual(texts[0].tags.sort(), ["new1", "new2"]);
    });
  });

  describe("Multi-user isolation", () => {
    it("should isolate data between users", () => {
      const user1 = "user1";
      const user2 = "user2";

      db.saveUrl(user1, "https://user1.com", ["user1-tag"]);
      db.saveUrl(user2, "https://user2.com", ["user2-tag"]);

      const urls1 = db.getSavedUrls(user1);
      const urls2 = db.getSavedUrls(user2);

      assert.strictEqual(urls1.length, 1);
      assert.strictEqual(urls1[0].url, "https://user1.com");

      assert.strictEqual(urls2.length, 1);
      assert.strictEqual(urls2[0].url, "https://user2.com");
    });
  });

  describe("saveImage", () => {
    // Create a simple 1x1 PNG image buffer for testing
    const testPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
      0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    it("should save an image and return id", () => {
      const id = db.saveImage(TEST_USER_ID, "test.png", testPngBuffer, "image/png");
      assert.ok(id, "should return an id");
      assert.match(id, /^[0-9a-f-]{36}$/, "id should be a UUID");
    });

    it("should save an image with tags", () => {
      const id = db.saveImage(TEST_USER_ID, "photo.png", testPngBuffer, "image/png", ["photo", "test"]);
      assert.ok(id);

      const images = db.getImages(TEST_USER_ID);
      assert.strictEqual(images.length, 1);
      assert.strictEqual(images[0].filename, "photo.png");
      assert.deepStrictEqual(images[0].tags.sort(), ["photo", "test"]);
    });

    it("should store file on disk", () => {
      db.saveImage(TEST_USER_ID, "disk.png", testPngBuffer, "image/png");
      const imagesDir = path.join(TEST_DATA_DIR, TEST_USER_ID, "profiles", "default", "images");
      const files = fs.readdirSync(imagesDir);
      assert.strictEqual(files.length, 1);
      assert.ok(files[0].endsWith(".png"));
    });

    it("should deduplicate identical images", () => {
      const id1 = db.saveImage(TEST_USER_ID, "first.png", testPngBuffer, "image/png");
      const id2 = db.saveImage(TEST_USER_ID, "second.png", testPngBuffer, "image/png");

      // Should create two different item records
      assert.notStrictEqual(id1, id2);

      // But only one file on disk
      const imagesDir = path.join(TEST_DATA_DIR, TEST_USER_ID, "profiles", "default", "images");
      const files = fs.readdirSync(imagesDir);
      assert.strictEqual(files.length, 1);
    });

    it("should reject non-image MIME types", () => {
      assert.throws(
        () => db.saveImage(TEST_USER_ID, "file.txt", Buffer.from("text"), "text/plain"),
        /must be an image/
      );
    });

    it("should reject images over size limit", () => {
      const largeBuffer = Buffer.alloc(db.MAX_IMAGE_SIZE + 1);
      assert.throws(
        () => db.saveImage(TEST_USER_ID, "large.png", largeBuffer, "image/png"),
        /exceeds maximum size/
      );
    });

    it("should store metadata correctly", () => {
      db.saveImage(TEST_USER_ID, "meta.png", testPngBuffer, "image/png");
      const images = db.getImages(TEST_USER_ID);

      assert.strictEqual(images[0].mime, "image/png");
      assert.strictEqual(images[0].size, testPngBuffer.length);
    });
  });

  describe("getImages", () => {
    const testPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
      0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    it("should return empty array when no images", () => {
      const images = db.getImages(TEST_USER_ID);
      assert.deepStrictEqual(images, []);
    });

    it("should return all images with metadata", () => {
      db.saveImage(TEST_USER_ID, "img1.png", testPngBuffer, "image/png", ["tag1"]);
      db.saveImage(TEST_USER_ID, "img2.png", Buffer.from(testPngBuffer), "image/png", ["tag2"]);

      const images = db.getImages(TEST_USER_ID);
      assert.strictEqual(images.length, 2);
      assert.ok(images[0].id);
      assert.ok(images[0].filename);
      assert.ok(images[0].mime);
      assert.ok(images[0].size);
      assert.ok(images[0].created_at);
      assert.ok(Array.isArray(images[0].tags));
    });
  });

  describe("getImageById", () => {
    const testPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
      0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    it("should return image by id", () => {
      const id = db.saveImage(TEST_USER_ID, "find.png", testPngBuffer, "image/png");
      const image = db.getImageById(TEST_USER_ID, id);

      assert.ok(image);
      assert.strictEqual(image.id, id);
      assert.strictEqual(image.filename, "find.png");
      assert.ok(image.metadata.hash);
    });

    it("should return null for non-existent id", () => {
      const image = db.getImageById(TEST_USER_ID, "non-existent");
      assert.strictEqual(image, null);
    });
  });

  describe("getImagePath", () => {
    const testPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
      0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    it("should return valid file path", () => {
      const id = db.saveImage(TEST_USER_ID, "path.png", testPngBuffer, "image/png");
      const imagePath = db.getImagePath(TEST_USER_ID, id);

      assert.ok(imagePath);
      assert.ok(fs.existsSync(imagePath));
    });

    it("should return null for non-existent id", () => {
      const imagePath = db.getImagePath(TEST_USER_ID, "non-existent");
      assert.strictEqual(imagePath, null);
    });
  });

  describe("deleteImage", () => {
    const testPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
      0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    it("should soft-delete image record", () => {
      const id = db.saveImage(TEST_USER_ID, "del.png", testPngBuffer, "image/png");
      assert.strictEqual(db.getImages(TEST_USER_ID).length, 1);

      db.deleteImage(TEST_USER_ID, id);
      // Image should not appear in default query (soft-deleted)
      assert.strictEqual(db.getImages(TEST_USER_ID).length, 0);
    });

    it("should keep file on disk after soft-delete (tombstone for sync)", () => {
      const id = db.saveImage(TEST_USER_ID, "single.png", testPngBuffer, "image/png");
      const imagePath = db.getImagePath(TEST_USER_ID, id);
      assert.ok(fs.existsSync(imagePath));

      db.deleteImage(TEST_USER_ID, id);
      // File stays on disk — soft-delete preserves the row and file
      assert.ok(fs.existsSync(imagePath), "file should remain after soft-delete");
    });

    it("should retain soft-deleted image in database", () => {
      const id = db.saveImage(TEST_USER_ID, "retained.png", testPngBuffer, "image/png");
      db.deleteImage(TEST_USER_ID, id);

      // Should still exist with includeDeleted
      const allItems = db.getItems(TEST_USER_ID, "image", "default", true);
      assert.strictEqual(allItems.length, 1);
      assert.ok(allItems[0].deleted_at > 0, "deleted_at should be set");
    });
  });

  describe("getItems with images", () => {
    const testPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
      0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    it("should include images in getItems", () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");
      db.saveText(TEST_USER_ID, "Note");
      db.saveImage(TEST_USER_ID, "pic.png", testPngBuffer, "image/png");

      const items = db.getItems(TEST_USER_ID);
      assert.strictEqual(items.length, 3);

      const imageItem = items.find((i) => i.type === "image");
      assert.ok(imageItem);
      assert.ok(imageItem.metadata);
      assert.strictEqual(imageItem.metadata.mime, "image/png");
    });

    it("should filter by image type", () => {
      db.saveUrl(TEST_USER_ID, "https://example.com");
      db.saveImage(TEST_USER_ID, "pic.png", testPngBuffer, "image/png");

      const images = db.getItems(TEST_USER_ID, "image");
      assert.strictEqual(images.length, 1);
      assert.strictEqual(images[0].type, "image");
    });
  });

  describe("Unified Item Types", () => {
    it("should support url, text, tagset, image types", () => {
      const urlId = db.saveUrl(TEST_USER_ID, "https://example.com");
      const textId = db.saveText(TEST_USER_ID, "My note");
      const tagsetId = db.saveTagset(TEST_USER_ID, ["tag1", "tag2"]);

      const items = db.getItems(TEST_USER_ID);
      const types = items.map((i) => i.type).sort();
      assert.deepStrictEqual(types, ["tagset", "text", "url"]);
    });

    it("should save items with correct type values", () => {
      const urlId = db.saveItem(TEST_USER_ID, "url", "https://test.com", ["web"]);
      const textId = db.saveItem(TEST_USER_ID, "text", "Note content", ["note"]);
      const tagsetId = db.saveItem(TEST_USER_ID, "tagset", null, ["exercise", "20"]);

      const items = db.getItems(TEST_USER_ID);
      const urlItem = items.find((i) => i.id === urlId);
      const textItem = items.find((i) => i.id === textId);
      const tagsetItem = items.find((i) => i.id === tagsetId);

      assert.strictEqual(urlItem.type, "url");
      assert.strictEqual(textItem.type, "text");
      assert.strictEqual(tagsetItem.type, "tagset");
    });
  });

  describe("Sync Columns Schema", () => {
    it("should have sync columns in schema", () => {
      const conn = db.getConnection(TEST_USER_ID);
      const tableInfo = conn.prepare("PRAGMA table_info(items)").all();
      const columnNames = tableInfo.map((col) => col.name);

      assert.ok(columnNames.includes("syncId"), "should have syncId column");
      assert.ok(columnNames.includes("syncSource"), "should have syncSource column");
      assert.ok(columnNames.includes("syncedAt"), "should have syncedAt column");
    });

    it("should have sync_id index", () => {
      const conn = db.getConnection(TEST_USER_ID);
      const indexes = conn.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='items'").all();
      const indexNames = indexes.map((idx) => idx.name);

      assert.ok(indexNames.includes("idx_items_syncId"), "should have idx_items_syncId index");
    });
  });

  describe("Snake-case Migration", () => {
    it("should migrate snake_case item_tags columns to camelCase", () => {
      // Simulate a legacy database with snake_case columns
      const Database = require("better-sqlite3");
      const legacyDir = path.join(TEST_DATA_DIR, "legacy-user", "profiles", "default");
      fs.mkdirSync(legacyDir, { recursive: true });
      const legacyDb = new Database(path.join(legacyDir, "datastore.sqlite"));
      legacyDb.pragma("journal_mode = WAL");

      // Create legacy schema with snake_case columns
      legacyDb.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          content TEXT,
          metadata TEXT,
          sync_id TEXT DEFAULT '',
          sync_source TEXT DEFAULT '',
          synced_at INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          deleted_at INTEGER DEFAULT 0
        );
        CREATE TABLE tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          frequency INTEGER DEFAULT 1,
          last_used_at INTEGER NOT NULL,
          frecency_score REAL DEFAULT 0.0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE item_tags (
          item_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (item_id, tag_id)
        );
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      `);

      // Insert a legacy item
      legacyDb.prepare(`
        INSERT INTO items (id, type, content, sync_id, sync_source, synced_at, created_at, updated_at, deleted_at)
        VALUES ('legacy-1', 'url', 'https://example.com', '', '', 0, 1000, 1000, 0)
      `).run();
      legacyDb.close();

      // Now open via db module — initializeSchema should migrate columns
      delete require.cache[require.resolve("./db")];
      const freshDb = require("./db");
      const conn = freshDb.getConnection("legacy-user");

      // Verify columns were renamed
      const itemCols = conn.prepare("PRAGMA table_info(items)").all().map(c => c.name);
      assert.ok(itemCols.includes("syncId"), "items.sync_id should be renamed to syncId");
      assert.ok(itemCols.includes("createdAt"), "items.created_at should be renamed to createdAt");
      assert.ok(itemCols.includes("deletedAt"), "items.deleted_at should be renamed to deletedAt");
      assert.ok(!itemCols.includes("sync_id"), "items should not have snake_case sync_id");

      const tagCols = conn.prepare("PRAGMA table_info(tags)").all().map(c => c.name);
      assert.ok(tagCols.includes("lastUsedAt"), "tags.last_used_at should be renamed to lastUsedAt");
      assert.ok(tagCols.includes("frecencyScore"), "tags.frecency_score should be renamed to frecencyScore");

      const itCols = conn.prepare("PRAGMA table_info(item_tags)").all().map(c => c.name);
      assert.ok(itCols.includes("itemId"), "item_tags.item_id should be renamed to itemId");
      assert.ok(itCols.includes("tagId"), "item_tags.tag_id should be renamed to tagId");

      // Verify the legacy data is still accessible
      const items = freshDb.getItems("legacy-user");
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].content, "https://example.com");

      freshDb.closeAllConnections();
    });
  });

  describe("Table Rebuild Fallback", () => {
    it("should rebuild tables when ALTER TABLE RENAME COLUMN fails", () => {
      // Create a legacy DB with a VIEW that blocks ALTER TABLE RENAME COLUMN
      const Database = require("better-sqlite3");
      const rbDir = path.join(TEST_DATA_DIR, "rebuild-user", "profiles", "default");
      fs.mkdirSync(rbDir, { recursive: true });
      const rbDb = new Database(path.join(rbDir, "datastore.sqlite"));
      rbDb.pragma("journal_mode = WAL");

      rbDb.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          content TEXT,
          metadata TEXT,
          sync_id TEXT DEFAULT '',
          sync_source TEXT DEFAULT '',
          synced_at INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          deleted_at INTEGER DEFAULT 0
        );
        CREATE TABLE tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          frequency INTEGER DEFAULT 1,
          last_used_at INTEGER NOT NULL,
          frecency_score REAL DEFAULT 0.0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE item_tags (
          item_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (item_id, tag_id)
        );
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      `);

      // Add a VIEW referencing snake_case columns — this blocks ALTER TABLE RENAME COLUMN
      rbDb.exec(`
        CREATE VIEW tags_view AS SELECT last_used_at, frecency_score FROM tags;
        CREATE VIEW items_view AS SELECT created_at, deleted_at FROM items;
        CREATE VIEW item_tags_view AS SELECT item_id, tag_id FROM item_tags;
      `);

      // Insert test data
      rbDb.prepare(`
        INSERT INTO items (id, type, content, created_at, updated_at, deleted_at)
        VALUES ('rb-1', 'url', 'https://example.com', 1000, 1000, 0)
      `).run();
      rbDb.prepare(`
        INSERT INTO tags (id, name, frequency, last_used_at, frecency_score, created_at, updated_at)
        VALUES ('tag-1', 'test', 1, 1000, 10.0, 1000, 1000)
      `).run();
      rbDb.prepare(`
        INSERT INTO item_tags (item_id, tag_id, created_at) VALUES ('rb-1', 'tag-1', 1000)
      `).run();
      rbDb.close();

      // Open via db module — ALTER RENAME will fail, rebuild should kick in
      delete require.cache[require.resolve("./db")];
      const freshDb = require("./db");
      const conn = freshDb.getConnection("rebuild-user");

      // Verify all columns are camelCase after rebuild
      const itemCols = new Set(conn.prepare("PRAGMA table_info(items)").all().map(c => c.name));
      assert.ok(itemCols.has("createdAt"), "items should have createdAt");
      assert.ok(itemCols.has("deletedAt"), "items should have deletedAt");
      assert.ok(itemCols.has("syncId"), "items should have syncId");

      const tagCols = new Set(conn.prepare("PRAGMA table_info(tags)").all().map(c => c.name));
      assert.ok(tagCols.has("lastUsedAt"), "tags should have lastUsedAt");
      assert.ok(tagCols.has("frecencyScore"), "tags should have frecencyScore");

      const itCols = new Set(conn.prepare("PRAGMA table_info(item_tags)").all().map(c => c.name));
      assert.ok(itCols.has("itemId"), "item_tags should have itemId");
      assert.ok(itCols.has("tagId"), "item_tags should have tagId");

      // Verify data survived the rebuild
      const items = freshDb.getItems("rebuild-user");
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].content, "https://example.com");

      const tags = freshDb.getTagsByFrecency("rebuild-user");
      assert.strictEqual(tags.length, 1);
      assert.strictEqual(tags[0].name, "test");

      // Verify new items can be saved
      const newId = freshDb.saveUrl("rebuild-user", "https://new.com", ["newtag"]);
      assert.ok(newId);
      assert.strictEqual(freshDb.getItems("rebuild-user").length, 2);

      freshDb.closeAllConnections();
    });
  });

  describe("TEXT Timestamp Migration", () => {
    it("should convert ISO string and stringified number timestamps to integers", () => {
      const Database = require("better-sqlite3");
      const tsDir = path.join(TEST_DATA_DIR, "ts-user", "profiles", "default");
      fs.mkdirSync(tsDir, { recursive: true });
      const tsDb = new Database(path.join(tsDir, "datastore.sqlite"));
      tsDb.pragma("journal_mode = WAL");

      // Create schema with TEXT affinity columns (simulates production)
      tsDb.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          content TEXT,
          metadata TEXT,
          syncId TEXT DEFAULT '',
          syncSource TEXT DEFAULT '',
          syncedAt TEXT DEFAULT '0',
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          deletedAt TEXT DEFAULT '0'
        );
        CREATE TABLE tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          frequency INTEGER DEFAULT 1,
          lastUsedAt TEXT NOT NULL,
          frecencyScore REAL DEFAULT 0.0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        CREATE TABLE item_tags (
          itemId TEXT NOT NULL,
          tagId TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          PRIMARY KEY (itemId, tagId)
        );
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      `);

      // Insert items with TEXT timestamps (ISO strings and stringified numbers)
      tsDb.prepare(`
        INSERT INTO items (id, type, content, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt)
        VALUES ('iso-1', 'text', 'hello', '', '', '0', '2026-01-27T21:12:47.876Z', '2026-01-27T21:12:47.876Z', '0')
      `).run();
      tsDb.prepare(`
        INSERT INTO items (id, type, content, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt)
        VALUES ('num-1', 'url', 'https://example.com', '', '', '0', '1769559596558.0', '1769559596558.0', '1769509253170')
      `).run();
      tsDb.prepare(`
        INSERT INTO tags (id, name, frequency, lastUsedAt, frecencyScore, createdAt, updatedAt)
        VALUES ('tag-1', 'test', 1, '2026-01-27T12:00:00.000Z', 10.0, '2026-01-27T12:00:00.000Z', '2026-01-27T12:00:00.000Z')
      `).run();
      tsDb.prepare(`
        INSERT INTO item_tags (itemId, tagId, createdAt) VALUES ('iso-1', 'tag-1', '2026-01-27T12:00:00.000Z')
      `).run();
      tsDb.close();

      // Open via db module — initializeSchema should migrate timestamps
      delete require.cache[require.resolve("./db")];
      const freshDb = require("./db");
      const conn = freshDb.getConnection("ts-user");

      // DB values are numeric (ISO converted to Unix ms, float strings to integers)
      // but may remain TEXT type due to column TEXT affinity from legacy schema.
      // The toTimestamp() safety net in response code ensures API returns integers.
      const row1 = conn.prepare("SELECT CAST(createdAt AS INTEGER) as v FROM items WHERE id = 'iso-1'").get();
      assert.ok(row1.v > 1700000000000, `ISO timestamp should be Unix ms, got ${row1.v}`);

      const row2 = conn.prepare("SELECT CAST(createdAt AS INTEGER) as v, CAST(deletedAt AS INTEGER) as dv FROM items WHERE id = 'num-1'").get();
      assert.strictEqual(row2.v, 1769559596558, `Should preserve value: ${row2.v}`);
      assert.strictEqual(row2.dv, 1769509253170);

      // Verify API response returns JavaScript numbers (the critical fix for clients)
      const items = freshDb.getItems("ts-user", null, "default", true);
      assert.strictEqual(items.length, 2);
      for (const item of items) {
        assert.strictEqual(typeof item.created_at, "number", `created_at should be number, got ${typeof item.created_at}: ${item.created_at}`);
        assert.strictEqual(typeof item.updated_at, "number", `updated_at should be number, got ${typeof item.updated_at}: ${item.updated_at}`);
        assert.strictEqual(typeof item.deleted_at, "number", `deleted_at should be number, got ${typeof item.deleted_at}: ${item.deleted_at}`);
      }

      // Verify getItemsSince works correctly with TEXT-affinity timestamps
      const sinceItems = freshDb.getItemsSince("ts-user", 0, null, "default");
      assert.strictEqual(sinceItems.length, 2, `getItemsSince(0) should return all items`);
      for (const item of sinceItems) {
        assert.strictEqual(typeof item.created_at, "number");
        assert.strictEqual(typeof item.updated_at, "number");
      }

      freshDb.closeAllConnections();
    });
  });

  describe("Production State: snake_case + TEXT timestamps", () => {
    it("should handle legacy DB with snake_case columns AND TEXT timestamps end-to-end", () => {
      // This is the actual production state that caused the crash:
      // snake_case columns with TEXT-affinity timestamps
      const Database = require("better-sqlite3");
      const prodDir = path.join(TEST_DATA_DIR, "prod-user", "profiles", "default");
      fs.mkdirSync(prodDir, { recursive: true });
      const prodDb = new Database(path.join(prodDir, "datastore.sqlite"));
      prodDb.pragma("journal_mode = WAL");

      // Create legacy schema: snake_case columns with TEXT affinity
      prodDb.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          content TEXT,
          metadata TEXT,
          sync_id TEXT DEFAULT '',
          sync_source TEXT DEFAULT '',
          synced_at TEXT DEFAULT '0',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT DEFAULT '0'
        );
        CREATE TABLE tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          frequency INTEGER DEFAULT 1,
          last_used_at TEXT NOT NULL,
          frecency_score REAL DEFAULT 0.0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE item_tags (
          item_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (item_id, tag_id)
        );
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      `);

      // Insert production-like data with TEXT timestamps
      prodDb.prepare(`
        INSERT INTO items (id, type, content, sync_id, sync_source, synced_at, created_at, updated_at, deleted_at)
        VALUES ('prod-1', 'url', 'https://example.com', '', '', '0', '2026-01-27T21:12:47.876Z', '2026-01-27T21:12:47.876Z', '0')
      `).run();
      prodDb.prepare(`
        INSERT INTO items (id, type, content, sync_id, sync_source, synced_at, created_at, updated_at, deleted_at)
        VALUES ('prod-2', 'text', 'A note', '', '', '0', '1769559596558.0', '1769559596558.0', '0')
      `).run();
      prodDb.prepare(`
        INSERT INTO tags (id, name, frequency, last_used_at, frecency_score, created_at, updated_at)
        VALUES ('tag-1', 'test', 1, '2026-01-27T12:00:00.000Z', 10.0, '2026-01-27T12:00:00.000Z', '2026-01-27T12:00:00.000Z')
      `).run();
      prodDb.prepare(`
        INSERT INTO item_tags (item_id, tag_id, created_at) VALUES ('prod-1', 'tag-1', '2026-01-27T12:00:00.000Z')
      `).run();
      prodDb.close();

      // Open via db module — must not crash
      delete require.cache[require.resolve("./db")];
      const freshDb = require("./db");
      const conn = freshDb.getConnection("prod-user");

      // Verify columns were renamed to camelCase
      const itemCols = new Set(conn.prepare("PRAGMA table_info(items)").all().map(c => c.name));
      assert.ok(itemCols.has("syncId"), "sync_id should be renamed to syncId");
      assert.ok(itemCols.has("createdAt"), "created_at should be renamed to createdAt");
      assert.ok(itemCols.has("deletedAt"), "deleted_at should be renamed to deletedAt");

      const tagCols = new Set(conn.prepare("PRAGMA table_info(tags)").all().map(c => c.name));
      assert.ok(tagCols.has("lastUsedAt"), "last_used_at should be renamed to lastUsedAt");
      assert.ok(tagCols.has("frecencyScore"), "frecency_score should be renamed to frecencyScore");

      const itCols = new Set(conn.prepare("PRAGMA table_info(item_tags)").all().map(c => c.name));
      assert.ok(itCols.has("itemId"), "item_id should be renamed to itemId");
      assert.ok(itCols.has("tagId"), "tag_id should be renamed to tagId");

      // Verify getItems works (exercises runtime queries)
      const items = freshDb.getItems("prod-user");
      assert.strictEqual(items.length, 2);
      for (const item of items) {
        assert.strictEqual(typeof item.created_at, "number", `created_at should be number`);
        assert.strictEqual(typeof item.updated_at, "number", `updated_at should be number`);
        assert.strictEqual(typeof item.deleted_at, "number", `deleted_at should be number`);
        assert.ok(item.created_at > 0, `created_at should be positive`);
      }

      // Verify getItemsSince works (exercises CAST query)
      const sinceItems = freshDb.getItemsSince("prod-user", 0);
      assert.strictEqual(sinceItems.length, 2);

      // Verify getTagsByFrecency works
      const tags = freshDb.getTagsByFrecency("prod-user");
      assert.strictEqual(tags.length, 1);
      assert.strictEqual(tags[0].name, "test");

      // Verify saving new items works on the migrated DB
      const newId = freshDb.saveUrl("prod-user", "https://new.com", ["newtag"]);
      assert.ok(newId);
      const allItems = freshDb.getItems("prod-user");
      assert.strictEqual(allItems.length, 3);

      // Verify deleteItem works
      freshDb.deleteItem("prod-user", "prod-1");
      assert.strictEqual(freshDb.getItems("prod-user").length, 2);

      freshDb.closeAllConnections();
    });
  });

  describe("sync_id Deduplication", () => {
    it("should deduplicate by sync_id and return same server id", () => {
      // Simulate same item pushed twice with same sync_id
      const clientSyncId = "client-item-abc123";
      const id1 = db.saveItem(TEST_USER_ID, "url", "https://example.com", ["tag1"], null, clientSyncId);
      const id2 = db.saveItem(TEST_USER_ID, "url", "https://example.com", ["tag2"], null, clientSyncId);

      // Should return same server ID
      assert.strictEqual(id1, id2, "should return same id for same sync_id");

      // Should only have one item
      const items = db.getItems(TEST_USER_ID);
      assert.strictEqual(items.length, 1);
      // Tags should be replaced
      assert.deepStrictEqual(items[0].tags, ["tag2"]);
    });

    it("should deduplicate by sync_id even with different content", () => {
      // Client updates content before syncing again
      const clientSyncId = "client-item-xyz789";
      const id1 = db.saveItem(TEST_USER_ID, "url", "https://old-url.com", [], null, clientSyncId);
      const id2 = db.saveItem(TEST_USER_ID, "url", "https://new-url.com", [], null, clientSyncId);

      // Should return same server ID (sync_id match takes priority)
      assert.strictEqual(id1, id2, "should return same id for same sync_id even with different content");

      // Should only have one item
      const items = db.getItems(TEST_USER_ID);
      assert.strictEqual(items.length, 1);
    });

    it("should still use content-based dedup when no sync_id provided", () => {
      // Backwards compatibility: no sync_id uses content-based dedup
      const id1 = db.saveItem(TEST_USER_ID, "url", "https://example.com", ["tag1"]);
      const id2 = db.saveItem(TEST_USER_ID, "url", "https://example.com", ["tag2"]);

      // Should return same server ID (content match)
      assert.strictEqual(id1, id2);

      // Should only have one item
      const items = db.getItems(TEST_USER_ID);
      assert.strictEqual(items.length, 1);
    });

    it("should create new item when sync_id and content are both new", () => {
      const id1 = db.saveItem(TEST_USER_ID, "url", "https://first.com", [], null, "sync-1");
      const id2 = db.saveItem(TEST_USER_ID, "url", "https://second.com", [], null, "sync-2");

      // Should create different items
      assert.notStrictEqual(id1, id2);

      const items = db.getItems(TEST_USER_ID);
      assert.strictEqual(items.length, 2);
    });

    it("should not use content dedup when sync_id is provided", () => {
      // Sync path: two different sync_ids with same content are separate items
      const id1 = db.saveItem(TEST_USER_ID, "url", "https://example.com", [], null, "device-a-id");
      const id2 = db.saveItem(TEST_USER_ID, "url", "https://example.com", [], null, "device-b-id");

      // Different sync_ids → different server items (no content-based fallback in sync path)
      assert.notStrictEqual(id1, id2);

      const items = db.getItems(TEST_USER_ID);
      assert.strictEqual(items.length, 2);
    });

    it("should match deleted items by sync_id and undelete them", () => {
      // Create and delete an item
      const id1 = db.saveItem(TEST_USER_ID, "url", "https://example.com", [], null, "deleted-sync-id");
      db.deleteItem(TEST_USER_ID, id1);

      // Push new content with same sync_id — should match and undelete
      const id2 = db.saveItem(TEST_USER_ID, "url", "https://example.com", [], null, "deleted-sync-id");

      // Should match the existing (deleted) item and undelete it
      assert.strictEqual(id1, id2, "should match deleted item by sync_id");

      // Item should be undeleted
      const items = db.getItems(TEST_USER_ID);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].id, id1);
    });

    it("should accept tombstone push via sync_id with deleted_at", () => {
      // Create an item
      const id = db.saveItem(TEST_USER_ID, "url", "https://example.com", [], null, "tomb-sync-id");
      assert.strictEqual(db.getItems(TEST_USER_ID).length, 1);

      // Push tombstone with deleted_at
      const deletedAt = Date.now();
      const id2 = db.saveItem(TEST_USER_ID, "url", "https://example.com", [], null, "tomb-sync-id", "default", deletedAt);
      assert.strictEqual(id, id2, "should match by sync_id");

      // Item should be soft-deleted
      assert.strictEqual(db.getItems(TEST_USER_ID).length, 0);
      const allItems = db.getItems(TEST_USER_ID, null, "default", true);
      assert.strictEqual(allItems.length, 1);
      assert.ok(allItems[0].deleted_at > 0);
    });

    it("should match when device re-pushes with server ID as sync_id", () => {
      // Device pushes first time with local ID
      const id1 = db.saveItem(TEST_USER_ID, "url", "https://shared.com", ["v1"], null, "device-local-id");

      // Device stores server id (id1) as sync_id, re-pushes with it after local edit
      const id2 = db.saveItem(TEST_USER_ID, "url", "https://shared.com/updated", ["v2"], null, id1);

      // Should match by server ID and return same item
      assert.strictEqual(id1, id2);

      const items = db.getItems(TEST_USER_ID);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].content, "https://shared.com/updated");
    });
  });
});

describe("Users Module Tests", () => {
  let users;

  beforeEach(() => {
    delete require.cache[require.resolve("./users")];
    cleanTestDir();
    users = require("./users");
  });

  after(() => {
    if (users && users.closeSystemDb) {
      users.closeSystemDb();
    }
  });

  describe("createUser", () => {
    it("should create a user and return API key", () => {
      const result = users.createUser("alice");

      assert.strictEqual(result.userId, "alice");
      assert.ok(result.apiKey, "should return an API key");
      assert.strictEqual(result.apiKey.length, 64, "API key should be 64 hex chars");
    });

    it("should reject duplicate user IDs", () => {
      users.createUser("bob");

      assert.throws(
        () => users.createUser("bob"),
        /already exists/
      );
    });
  });

  describe("createUserWithKey", () => {
    it("should create user with existing key", () => {
      const existingKey = "my-existing-api-key-from-env";
      const result = users.createUserWithKey("migrated", existingKey);

      assert.strictEqual(result.userId, "migrated");
      assert.ok(!result.apiKey, "should not return key");

      // Key should work for auth
      const foundUserId = users.getUserIdFromApiKey(existingKey);
      assert.strictEqual(foundUserId, "migrated");
    });

    it("should reject duplicate user IDs", () => {
      users.createUserWithKey("existing", "key1");

      assert.throws(
        () => users.createUserWithKey("existing", "key2"),
        /already exists/
      );
    });
  });

  describe("getUserIdFromApiKey", () => {
    it("should return userId for valid API key", () => {
      const { userId, apiKey } = users.createUser("charlie");
      const foundUserId = users.getUserIdFromApiKey(apiKey);

      assert.strictEqual(foundUserId, userId);
    });

    it("should return null for invalid API key", () => {
      const result = users.getUserIdFromApiKey("invalid-key");
      assert.strictEqual(result, null);
    });

    it("should return null for empty API key", () => {
      assert.strictEqual(users.getUserIdFromApiKey(""), null);
      assert.strictEqual(users.getUserIdFromApiKey(null), null);
      assert.strictEqual(users.getUserIdFromApiKey(undefined), null);
    });
  });

  describe("listUsers", () => {
    it("should list all users", () => {
      users.createUser("user1");
      users.createUser("user2");

      const list = users.listUsers();
      assert.strictEqual(list.length, 2);
      assert.ok(list.find((u) => u.id === "user1"));
      assert.ok(list.find((u) => u.id === "user2"));
    });

    it("should not expose API keys", () => {
      users.createUser("secure");
      const list = users.listUsers();

      assert.ok(!list[0].apiKey);
      assert.ok(!list[0].api_key);
      assert.ok(!list[0].api_key_hash);
    });
  });

  describe("deleteUser", () => {
    it("should delete a user", () => {
      const { apiKey } = users.createUser("toDelete");
      assert.ok(users.getUserIdFromApiKey(apiKey));

      users.deleteUser("toDelete");
      assert.strictEqual(users.getUserIdFromApiKey(apiKey), null);
    });
  });

  describe("regenerateApiKey", () => {
    it("should generate new API key for existing user", () => {
      const { apiKey: oldKey } = users.createUser("regen");
      const { apiKey: newKey } = users.regenerateApiKey("regen");

      assert.notStrictEqual(oldKey, newKey);
      assert.strictEqual(users.getUserIdFromApiKey(oldKey), null);
      assert.strictEqual(users.getUserIdFromApiKey(newKey), "regen");
    });

    it("should reject non-existent user", () => {
      assert.throws(
        () => users.regenerateApiKey("nonexistent"),
        /does not exist/
      );
    });
  });

  describe("hashApiKey", () => {
    it("should produce consistent hashes", () => {
      const hash1 = users.hashApiKey("test-key");
      const hash2 = users.hashApiKey("test-key");

      assert.strictEqual(hash1, hash2);
    });

    it("should produce different hashes for different keys", () => {
      const hash1 = users.hashApiKey("key1");
      const hash2 = users.hashApiKey("key2");

      assert.notStrictEqual(hash1, hash2);
    });
  });
});

describe("API Tests", () => {
  let app;
  let db;
  let users;
  let TEST_API_KEY;
  const TEST_USER = "apitest";

  beforeEach(() => {
    // Clean up
    delete require.cache[require.resolve("./db")];
    delete require.cache[require.resolve("./users")];
    cleanTestDir();

    db = require("./db");
    users = require("./users");

    // Create test user
    const result = users.createUser(TEST_USER);
    TEST_API_KEY = result.apiKey;

    // Create fresh Hono app with auth
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

    // Routes
    app.get("/", (c) => c.json({ status: "ok" }));

    app.post("/webhook", async (c) => {
      const userId = c.get("userId");
      const body = await c.req.json();
      const saved = [];
      if (body.urls && Array.isArray(body.urls)) {
        for (const item of body.urls) {
          if (item.url) {
            const id = db.saveUrl(userId, item.url, item.tags || []);
            saved.push({ id, url: item.url });
          }
        }
      }
      return c.json({ received: true, saved_count: saved.length });
    });

    app.get("/urls", (c) => c.json({ urls: db.getSavedUrls(c.get("userId")) }));
    app.get("/tags", (c) => c.json({ tags: db.getTagsByFrecency(c.get("userId")) }));
    app.delete("/urls/:id", (c) => {
      db.deleteUrl(c.get("userId"), c.req.param("id"));
      return c.json({ deleted: true });
    });
    app.patch("/urls/:id/tags", async (c) => {
      const body = await c.req.json();
      db.updateUrlTags(c.get("userId"), c.req.param("id"), body.tags || []);
      return c.json({ updated: true });
    });

    // Texts endpoints
    app.post("/texts", async (c) => {
      const userId = c.get("userId");
      const body = await c.req.json();
      if (!body.content) {
        return c.json({ error: "content is required" }, 400);
      }
      const id = db.saveText(userId, body.content, body.tags || []);
      return c.json({ id, created: true });
    });
    app.get("/texts", (c) => c.json({ texts: db.getTexts(c.get("userId")) }));
    app.delete("/texts/:id", (c) => {
      db.deleteItem(c.get("userId"), c.req.param("id"));
      return c.json({ deleted: true });
    });

    // Tagsets endpoints
    app.post("/tagsets", async (c) => {
      const userId = c.get("userId");
      const body = await c.req.json();
      if (!body.tags || !Array.isArray(body.tags) || body.tags.length === 0) {
        return c.json({ error: "tags array is required" }, 400);
      }
      const id = db.saveTagset(userId, body.tags);
      return c.json({ id, created: true });
    });
    app.get("/tagsets", (c) => c.json({ tagsets: db.getTagsets(c.get("userId")) }));
    app.delete("/tagsets/:id", (c) => {
      db.deleteItem(c.get("userId"), c.req.param("id"));
      return c.json({ deleted: true });
    });

    // Unified items endpoints
    app.post("/items", async (c) => {
      const userId = c.get("userId");
      const body = await c.req.json();
      const { type, content, tags = [] } = body;
      if (!type || !["url", "text", "tagset"].includes(type)) {
        return c.json({ error: "invalid type" }, 400);
      }
      const id = db.saveItem(userId, type, content || null, tags);
      return c.json({ id, type, created: true });
    });
    app.get("/items", (c) => {
      const type = c.req.query("type");
      const items = db.getItems(c.get("userId"), type || null);
      return c.json({ items });
    });
    app.delete("/items/:id", (c) => {
      db.deleteItem(c.get("userId"), c.req.param("id"));
      return c.json({ deleted: true });
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

  describe("Auth", () => {
    it("should allow health check without auth", async () => {
      const res = await app.request("/");
      assert.strictEqual(res.status, 200);
    });

    it("should reject requests without auth", async () => {
      const res = await app.request("/urls");
      assert.strictEqual(res.status, 401);
    });

    it("should reject requests with wrong key", async () => {
      const res = await app.request("/urls", {
        headers: { Authorization: "Bearer wrong-key" },
      });
      assert.strictEqual(res.status, 401);
    });

    it("should accept requests with valid auth", async () => {
      const res = await app.request("/urls", { headers: authHeaders() });
      assert.strictEqual(res.status, 200);
    });
  });

  describe("GET /", () => {
    it("should return ok status", async () => {
      const res = await app.request("/");
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.status, "ok");
    });
  });

  describe("POST /webhook", () => {
    it("should save URLs from webhook payload", async () => {
      const res = await app.request("/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          urls: [
            { url: "https://example1.com", tags: ["tag1"] },
            { url: "https://example2.com", tags: ["tag2"] },
          ],
        }),
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.received, true);
      assert.strictEqual(json.saved_count, 2);

      // Verify saved
      const urls = db.getSavedUrls(TEST_USER);
      assert.strictEqual(urls.length, 2);
    });

    it("should handle empty urls array", async () => {
      const res = await app.request("/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ urls: [] }),
      });

      const json = await res.json();
      assert.strictEqual(json.saved_count, 0);
    });

    it("should handle missing urls field", async () => {
      const res = await app.request("/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      });

      const json = await res.json();
      assert.strictEqual(json.saved_count, 0);
    });

    it("should skip items without url field", async () => {
      const res = await app.request("/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          urls: [
            { url: "https://valid.com" },
            { tags: ["no-url"] },
            { url: "https://also-valid.com" },
          ],
        }),
      });

      const json = await res.json();
      assert.strictEqual(json.saved_count, 2);
    });
  });

  describe("GET /urls", () => {
    it("should return saved URLs", async () => {
      db.saveUrl(TEST_USER, "https://example.com", ["tag1"]);

      const res = await app.request("/urls", { headers: authHeaders() });
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.urls.length, 1);
      assert.strictEqual(json.urls[0].url, "https://example.com");
      assert.deepStrictEqual(json.urls[0].tags, ["tag1"]);
    });

    it("should return empty array when no URLs", async () => {
      const res = await app.request("/urls", { headers: authHeaders() });
      const json = await res.json();

      assert.deepStrictEqual(json.urls, []);
    });
  });

  describe("GET /tags", () => {
    it("should return tags sorted by frecency", async () => {
      db.saveUrl(TEST_USER, "https://example1.com", ["common"]);
      db.saveUrl(TEST_USER, "https://example2.com", ["common"]);
      db.saveUrl(TEST_USER, "https://example3.com", ["rare"]);

      const res = await app.request("/tags", { headers: authHeaders() });
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.tags[0].name, "common");
    });
  });

  describe("DELETE /urls/:id", () => {
    it("should delete a URL", async () => {
      const id = db.saveUrl(TEST_USER, "https://example.com");

      const res = await app.request(`/urls/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.deleted, true);
      assert.strictEqual(db.getSavedUrls(TEST_USER).length, 0);
    });
  });

  describe("PATCH /urls/:id/tags", () => {
    it("should update tags for a URL", async () => {
      const id = db.saveUrl(TEST_USER, "https://example.com", ["old"]);

      const res = await app.request(`/urls/${id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ tags: ["new1", "new2"] }),
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.updated, true);

      const urls = db.getSavedUrls(TEST_USER);
      assert.deepStrictEqual(urls[0].tags.sort(), ["new1", "new2"]);
    });
  });

  describe("POST /texts", () => {
    it("should create a text with tags", async () => {
      const res = await app.request("/texts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ content: "My note", tags: ["personal"] }),
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.created, true);
      assert.ok(json.id);

      const texts = db.getTexts(TEST_USER);
      assert.strictEqual(texts.length, 1);
      assert.strictEqual(texts[0].content, "My note");
    });

    it("should reject request without content", async () => {
      const res = await app.request("/texts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ tags: ["tag"] }),
      });

      assert.strictEqual(res.status, 400);
    });
  });

  describe("GET /texts", () => {
    it("should return all texts", async () => {
      db.saveText(TEST_USER, "Note 1", ["tag1"]);
      db.saveText(TEST_USER, "Note 2", ["tag2"]);

      const res = await app.request("/texts", { headers: authHeaders() });
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.texts.length, 2);
    });
  });

  describe("DELETE /texts/:id", () => {
    it("should delete a text", async () => {
      const id = db.saveText(TEST_USER, "Note to delete");

      const res = await app.request(`/texts/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(db.getTexts(TEST_USER).length, 0);
    });
  });

  describe("POST /tagsets", () => {
    it("should create a tagset", async () => {
      const res = await app.request("/tagsets", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ tags: ["pushups", "10"] }),
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.created, true);
      assert.ok(json.id);

      const tagsets = db.getTagsets(TEST_USER);
      assert.strictEqual(tagsets.length, 1);
      assert.deepStrictEqual(tagsets[0].tags.sort(), ["10", "pushups"]);
    });

    it("should reject request without tags", async () => {
      const res = await app.request("/tagsets", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 400);
    });

    it("should reject request with empty tags array", async () => {
      const res = await app.request("/tagsets", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ tags: [] }),
      });

      assert.strictEqual(res.status, 400);
    });
  });

  describe("GET /tagsets", () => {
    it("should return all tagsets", async () => {
      db.saveTagset(TEST_USER, ["workout", "day1"]);
      db.saveTagset(TEST_USER, ["workout", "day2"]);

      const res = await app.request("/tagsets", { headers: authHeaders() });
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.tagsets.length, 2);
    });
  });

  describe("POST /items (unified)", () => {
    it("should create a URL item", async () => {
      const res = await app.request("/items", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ type: "url", content: "https://example.com", tags: ["web"] }),
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.type, "url");
      assert.strictEqual(json.created, true);
    });

    it("should create a text item", async () => {
      const res = await app.request("/items", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ type: "text", content: "A note", tags: ["note"] }),
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.type, "text");
    });

    it("should create a tagset item", async () => {
      const res = await app.request("/items", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ type: "tagset", tags: ["exercise", "50"] }),
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.type, "tagset");
    });

    it("should reject invalid type", async () => {
      const res = await app.request("/items", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ type: "invalid", content: "test" }),
      });

      assert.strictEqual(res.status, 400);
    });
  });

  describe("GET /items (unified)", () => {
    it("should return all items", async () => {
      db.saveUrl(TEST_USER, "https://example.com");
      db.saveText(TEST_USER, "Note");
      db.saveTagset(TEST_USER, ["tag"]);

      const res = await app.request("/items", { headers: authHeaders() });
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.items.length, 3);
    });

    it("should filter by type", async () => {
      db.saveUrl(TEST_USER, "https://example.com");
      db.saveText(TEST_USER, "Note");
      db.saveTagset(TEST_USER, ["tag"]);

      const res = await app.request("/items?type=text", { headers: authHeaders() });
      const json = await res.json();

      assert.strictEqual(json.items.length, 1);
      assert.strictEqual(json.items[0].type, "text");
    });
  });

  describe("DELETE /items/:id (unified)", () => {
    it("should delete any item type", async () => {
      const id = db.saveText(TEST_USER, "To delete");

      const res = await app.request(`/items/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(db.getItems(TEST_USER).length, 0);
    });
  });

  describe("Multi-user API isolation", () => {
    it("should isolate data between users via API", async () => {
      // Create second user
      const { apiKey: user2Key } = users.createUser("user2");

      // Save URL as test user
      await app.request("/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          urls: [{ url: "https://testuser.com" }],
        }),
      });

      // Save URL as user2
      await app.request("/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user2Key}` },
        body: JSON.stringify({
          urls: [{ url: "https://user2.com" }],
        }),
      });

      // Check test user only sees their URL
      const res1 = await app.request("/urls", { headers: authHeaders() });
      const json1 = await res1.json();
      assert.strictEqual(json1.urls.length, 1);
      assert.strictEqual(json1.urls[0].url, "https://testuser.com");

      // Check user2 only sees their URL
      const res2 = await app.request("/urls", { headers: { Authorization: `Bearer ${user2Key}` } });
      const json2 = await res2.json();
      assert.strictEqual(json2.urls.length, 1);
      assert.strictEqual(json2.urls[0].url, "https://user2.com");
    });
  });
});
