/**
 * SQL Abstraction Layer Types
 *
 * Abstracts database operations to support multiple backends:
 * - better-sqlite3 (Node.js, current)
 * - Cloudflare Durable Objects SQLite (future)
 *
 * @typedef {Object} RunResult
 * @property {number} changes - Number of rows changed by the statement
 * @property {number} [lastInsertRowid] - Row ID of the last inserted row (if applicable)
 *
 * @typedef {Object} SqlAdapter
 * @property {function(string): void} exec - Execute raw SQL (DDL, multi-statement)
 * @property {function(string, unknown[]?): RunResult} run - Execute parameterized write
 * @property {function(string, unknown[]?): (Object|null)} get - Query single row
 * @property {function(string, unknown[]?): Object[]} all - Query all rows
 * @property {function(function(): T): T} transaction - Execute within transaction
 * @property {function(): void} close - Close connection
 *
 * @typedef {Object} SqlAdapterFactory
 * @property {function(string, {readonly?: boolean}?): SqlAdapter} open - Open database connection
 * @property {function(SqlAdapter): void} init - Platform-specific initialization
 */

// Export empty object - types are defined via JSDoc above
module.exports = {};
