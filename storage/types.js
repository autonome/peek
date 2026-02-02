/**
 * Storage Abstraction Layer Types
 *
 * Abstracts blob/file storage to support multiple backends:
 * - Filesystem (Node.js, current)
 * - Cloudflare R2 (future)
 * - S3-compatible (future)
 *
 * @typedef {Object} StorageAdapter
 * @property {function(string, Buffer, Record<string, string>?): Promise<void>} put - Store data at key
 * @property {function(string): Promise<Buffer|null>} get - Retrieve data by key
 * @property {function(string): Promise<void>} delete - Delete data by key
 * @property {function(string): Promise<boolean>} exists - Check if key exists
 * @property {function(string?): Promise<string[]>} list - List keys with optional prefix
 *
 * @typedef {Object} StorageConfig
 * @property {'filesystem' | 'r2' | 's3'} type - Storage backend type
 * @property {string} [basePath] - Base path for filesystem storage
 * @property {string} [bucket] - Bucket name for R2/S3
 * @property {string} [region] - Region for S3
 * @property {string} [accessKeyId] - Access key ID for S3
 * @property {string} [secretAccessKey] - Secret access key for S3
 * @property {string} [endpoint] - Custom endpoint for S3-compatible storage
 */

// Export empty object - types are defined via JSDoc above
module.exports = {};
