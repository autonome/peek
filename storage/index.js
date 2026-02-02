/**
 * Storage Adapter Factory
 *
 * Selects and configures the appropriate storage adapter based on environment.
 * Supports filesystem (default), with R2/S3 support planned for future.
 */

const { FilesystemAdapter } = require("./filesystem-adapter");

/**
 * @typedef {import('./types').StorageAdapter} StorageAdapter
 * @typedef {import('./types').StorageConfig} StorageConfig
 */

const STORAGE_TYPE = process.env.STORAGE_TYPE || "filesystem";

/**
 * Create a storage adapter based on configuration.
 *
 * @param {StorageConfig} config - Storage configuration
 * @returns {StorageAdapter}
 */
function createStorageAdapter(config) {
  switch (config.type) {
    case "filesystem":
      if (!config.basePath) {
        throw new Error("basePath required for filesystem storage");
      }
      return new FilesystemAdapter(config.basePath);

    case "r2":
      // TODO: Implement R2 adapter
      throw new Error("R2 storage adapter not yet implemented");

    case "s3":
      // TODO: Implement S3 adapter
      throw new Error("S3 storage adapter not yet implemented");

    default:
      throw new Error(`Unknown storage type: ${config.type}`);
  }
}

/**
 * Get storage type from environment.
 *
 * @returns {'filesystem' | 'r2' | 's3'}
 */
function getStorageType() {
  return STORAGE_TYPE;
}

module.exports = { createStorageAdapter, getStorageType, FilesystemAdapter };
