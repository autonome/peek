// Database module for direct SQLite access
// Replaces TinyBase with better-sqlite3

import Database from 'better-sqlite3';
import { createTableStatements, tableNames } from './schema-sql.js';

let db = null;

/**
 * Initialize the SQLite database
 * @param {string} dbPath - Path to the database file
 * @returns {Database} The database instance
 */
export const initDatabase = (dbPath) => {
  console.log('main', 'initializing database at:', dbPath);

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Create tables and indexes
  db.exec(createTableStatements);

  // Migrate from TinyBase if needed
  migrateTinyBaseData();

  console.log('main', 'database initialized successfully');
  return db;
};

/**
 * One-time migration from TinyBase internal format to direct tables
 */
const migrateTinyBaseData = () => {
  // Check if tinybase table exists
  const tinybaseExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='tinybase'
  `).get();

  if (!tinybaseExists) {
    return; // No TinyBase data to migrate
  }

  // Check if we already migrated (addresses table has data)
  const existingData = db.prepare('SELECT COUNT(*) as count FROM addresses').get();
  if (existingData.count > 0) {
    console.log('main', 'TinyBase data already migrated, skipping');
    return;
  }

  console.log('main', 'Migrating TinyBase data to direct tables...');

  try {
    // Read TinyBase data (stored as JSON in a single row)
    const tinybaseRow = db.prepare('SELECT * FROM tinybase').get();
    if (!tinybaseRow) {
      console.log('main', 'No TinyBase data found');
      return;
    }

    // TinyBase stores data in the second column as JSON array [tables, values]
    const rawData = Object.values(tinybaseRow)[1];
    if (!rawData) {
      console.log('main', 'TinyBase data is empty');
      return;
    }

    const [tables] = JSON.parse(rawData);
    if (!tables) {
      console.log('main', 'No tables in TinyBase data');
      return;
    }

    // Migrate each table
    const tablesToMigrate = ['addresses', 'visits', 'tags', 'address_tags', 'extension_settings', 'extensions', 'content', 'blobs', 'scripts_data', 'feeds'];

    for (const tableName of tablesToMigrate) {
      const tableData = tables[tableName];
      if (!tableData || typeof tableData !== 'object') continue;

      const entries = Object.entries(tableData);
      if (entries.length === 0) continue;

      console.log('main', `  Migrating ${entries.length} rows from ${tableName}`);

      for (const [id, row] of entries) {
        try {
          const fullRow = { id, ...row };
          const columns = Object.keys(fullRow);
          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map(col => fullRow[col]);

          db.prepare(`INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);
        } catch (err) {
          console.error('main', `  Error migrating row ${id} in ${tableName}:`, err.message);
        }
      }
    }

    // Drop the tinybase table after successful migration
    db.exec('DROP TABLE IF EXISTS tinybase');
    console.log('main', 'TinyBase migration complete, removed tinybase table');

  } catch (error) {
    console.error('main', 'TinyBase migration failed:', error.message);
  }
};

/**
 * Get the database instance
 * @returns {Database|null}
 */
export const getDb = () => db;

/**
 * Close the database connection
 */
export const closeDatabase = () => {
  if (db) {
    db.close();
    db = null;
    console.log('main', 'database closed');
  }
};

// Helper functions

/**
 * Generate a unique ID with optional prefix
 * @param {string} prefix - Prefix for the ID
 * @returns {string}
 */
export const generateId = (prefix = 'id') => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get current timestamp in milliseconds
 * @returns {number}
 */
export const now = () => Date.now();

/**
 * Parse a URL into components
 * @param {string} uri - The URL to parse
 * @returns {{protocol: string, domain: string, path: string}}
 */
export const parseUrl = (uri) => {
  try {
    const url = new URL(uri);
    return {
      protocol: url.protocol.replace(':', ''),
      domain: url.hostname,
      path: url.pathname + url.search + url.hash
    };
  } catch (e) {
    return {
      protocol: 'unknown',
      domain: uri,
      path: ''
    };
  }
};

/**
 * Normalize a URL for consistent storage
 * @param {string} uri - The URL to normalize
 * @returns {string}
 */
export const normalizeUrl = (uri) => {
  if (!uri) return uri;

  try {
    const url = new URL(uri);

    // Remove trailing slash from path (except for root)
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }

    // Remove default ports
    if ((url.protocol === 'http:' && url.port === '80') ||
        (url.protocol === 'https:' && url.port === '443')) {
      url.port = '';
    }

    // Sort query parameters for consistency
    if (url.search) {
      const params = new URLSearchParams(url.search);
      const sortedParams = new URLSearchParams([...params.entries()].sort());
      url.search = sortedParams.toString();
    }

    return url.toString();
  } catch (e) {
    return uri;
  }
};

/**
 * Check if a table name is valid
 * @param {string} tableName - The table name to validate
 * @returns {boolean}
 */
export const isValidTable = (tableName) => {
  return tableNames.includes(tableName);
};

/**
 * Get all rows from a table as an object keyed by ID
 * @param {string} tableName - The table name
 * @returns {Object}
 */
export const getTableAsObject = (tableName) => {
  if (!isValidTable(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
  const result = {};
  for (const row of rows) {
    result[row.id] = row;
  }
  return result;
};

/**
 * Get a single row by ID
 * @param {string} tableName - The table name
 * @param {string} id - The row ID
 * @returns {Object|undefined}
 */
export const getRow = (tableName, id) => {
  if (!isValidTable(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  return db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
};

/**
 * Insert or replace a row
 * @param {string} tableName - The table name
 * @param {string} id - The row ID
 * @param {Object} data - The row data
 */
export const setRow = (tableName, id, data) => {
  if (!isValidTable(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  const row = { id, ...data };
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(col => row[col]);

  const sql = `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
  db.prepare(sql).run(...values);
};

/**
 * Delete a row by ID
 * @param {string} tableName - The table name
 * @param {string} id - The row ID
 */
export const deleteRow = (tableName, id) => {
  if (!isValidTable(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id);
};

export { tableNames };
