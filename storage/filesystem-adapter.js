/**
 * Filesystem Storage Adapter
 *
 * Implements StorageAdapter interface for local filesystem storage.
 * Used for development and self-hosted deployments.
 *
 * Provides both sync and async methods - sync for filesystem (local),
 * async interface ready for cloud storage backends.
 */

const fs = require("fs");
const path = require("path");

/**
 * @typedef {import('./types').StorageAdapter} StorageAdapter
 */

/**
 * @implements {StorageAdapter}
 */
class FilesystemAdapter {
  /**
   * @param {string} basePath - Base directory for all storage operations
   */
  constructor(basePath) {
    /** @private */
    this.basePath = basePath;
  }

  /**
   * Store data at the specified key (sync version).
   * Creates parent directories if they don't exist.
   * Implements file-level deduplication by skipping writes if file exists.
   *
   * @param {string} key - Storage key (relative path)
   * @param {Buffer} data - Data to store
   * @param {Record<string, string>} [metadata] - Optional metadata (ignored for filesystem)
   */
  putSync(key, data, metadata) {
    const fullPath = path.join(this.basePath, key);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Skip write if file already exists (content-addressable dedup)
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, data);
    }
  }

  /**
   * Store data at the specified key (async version).
   * @param {string} key - Storage key (relative path)
   * @param {Buffer} data - Data to store
   * @param {Record<string, string>} [metadata] - Optional metadata (ignored for filesystem)
   */
  async put(key, data, metadata) {
    this.putSync(key, data, metadata);
  }

  /**
   * Retrieve data by key (sync version).
   *
   * @param {string} key - Storage key
   * @returns {Buffer|null} Data or null if not found
   */
  getSync(key) {
    const fullPath = path.join(this.basePath, key);
    return fs.existsSync(fullPath) ? fs.readFileSync(fullPath) : null;
  }

  /**
   * Retrieve data by key (async version).
   *
   * @param {string} key - Storage key
   * @returns {Promise<Buffer|null>} Data or null if not found
   */
  async get(key) {
    return this.getSync(key);
  }

  /**
   * Delete data by key (sync version).
   *
   * @param {string} key - Storage key
   */
  deleteSync(key) {
    const fullPath = path.join(this.basePath, key);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  /**
   * Delete data by key (async version).
   *
   * @param {string} key - Storage key
   */
  async delete(key) {
    this.deleteSync(key);
  }

  /**
   * Check if key exists (sync version).
   *
   * @param {string} key - Storage key
   * @returns {boolean}
   */
  existsSync(key) {
    return fs.existsSync(path.join(this.basePath, key));
  }

  /**
   * Check if key exists (async version).
   *
   * @param {string} key - Storage key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    return this.existsSync(key);
  }

  /**
   * List all keys with optional prefix (sync version).
   * Recursively walks directory structure.
   *
   * @param {string} [prefix] - Optional prefix to filter keys
   * @returns {string[]} Array of keys
   */
  listSync(prefix) {
    const searchPath = prefix
      ? path.join(this.basePath, prefix)
      : this.basePath;

    if (!fs.existsSync(searchPath)) {
      return [];
    }

    const results = [];
    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          // Convert back to key format (relative to basePath)
          const key = path.relative(this.basePath, fullPath);
          results.push(key);
        }
      }
    };

    const stat = fs.statSync(searchPath);
    if (stat.isDirectory()) {
      walk(searchPath);
    } else {
      // prefix points to a file
      results.push(path.relative(this.basePath, searchPath));
    }

    return results;
  }

  /**
   * List all keys with optional prefix (async version).
   *
   * @param {string} [prefix] - Optional prefix to filter keys
   * @returns {Promise<string[]>} Array of keys
   */
  async list(prefix) {
    return this.listSync(prefix);
  }
}

module.exports = { FilesystemAdapter };
