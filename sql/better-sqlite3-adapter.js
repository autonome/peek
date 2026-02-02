/**
 * better-sqlite3 Adapter Implementation
 *
 * Wraps the better-sqlite3 library to conform to the SqlAdapter interface.
 * Provides statement caching for improved performance.
 */

const Database = require("better-sqlite3");

/**
 * @typedef {import('./types').SqlAdapter} SqlAdapter
 * @typedef {import('./types').SqlAdapterFactory} SqlAdapterFactory
 * @typedef {import('./types').RunResult} RunResult
 */

/**
 * @implements {SqlAdapter}
 */
class BetterSqlite3Adapter {
  /**
   * @param {import('better-sqlite3').Database} db
   */
  constructor(db) {
    /** @private */
    this.db = db;
    /** @private @type {Map<string, import('better-sqlite3').Statement>} */
    this.stmtCache = new Map();
  }

  /**
   * @param {string} sql
   */
  exec(sql) {
    this.db.exec(sql);
  }

  /**
   * @param {string} sql
   * @param {unknown[]} [params=[]]
   * @returns {RunResult}
   */
  run(sql, params = []) {
    const stmt = this.getOrPrepare(sql);
    const result = stmt.run(...params);
    return {
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid),
    };
  }

  /**
   * @template T
   * @param {string} sql
   * @param {unknown[]} [params=[]]
   * @returns {T|null}
   */
  get(sql, params = []) {
    const stmt = this.getOrPrepare(sql);
    return stmt.get(...params) ?? null;
  }

  /**
   * @template T
   * @param {string} sql
   * @param {unknown[]} [params=[]]
   * @returns {T[]}
   */
  all(sql, params = []) {
    const stmt = this.getOrPrepare(sql);
    return stmt.all(...params);
  }

  /**
   * @template T
   * @param {function(): T} fn
   * @returns {T}
   */
  transaction(fn) {
    return this.db.transaction(fn)();
  }

  close() {
    this.stmtCache.clear();
    this.db.close();
  }

  /**
   * @private
   * @param {string} sql
   * @returns {import('better-sqlite3').Statement}
   */
  getOrPrepare(sql) {
    let stmt = this.stmtCache.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.stmtCache.set(sql, stmt);
    }
    return stmt;
  }
}

/**
 * @type {SqlAdapterFactory}
 */
const factory = {
  /**
   * @param {string} path
   * @param {{ readonly?: boolean }} [options]
   * @returns {SqlAdapter}
   */
  open(path, options) {
    const dbOptions = options?.readonly ? { readonly: true } : {};
    const db = new Database(path, dbOptions);
    return new BetterSqlite3Adapter(db);
  },

  /**
   * @param {SqlAdapter} adapter
   */
  init(adapter) {
    adapter.exec("PRAGMA journal_mode = WAL");
  },
};

module.exports = { factory, BetterSqlite3Adapter };
