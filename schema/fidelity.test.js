#!/usr/bin/env node
/**
 * Schema Fidelity Tests
 *
 * Verifies that all backend schema implementations match the canonical schema.
 * Run with: node schema/fidelity.test.js
 *           yarn schema:test
 *
 * These tests:
 * 1. Parse CREATE TABLE statements from each backend
 * 2. Compare against required sync columns from schema/v1.json
 * 3. Verify timestamp columns use INTEGER (not TEXT)
 * 4. Verify id columns use TEXT (not INTEGER)
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { test, describe, before } from 'node:test';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load canonical schema
const schema = JSON.parse(readFileSync(join(__dirname, 'v1.json'), 'utf-8'));
const REQUIRED_SYNC_COLUMNS = schema.validation.required_sync_columns;

/**
 * Parse CREATE TABLE statements and extract column info
 */
function parseCreateTable(sql, tableName) {
  // Find the CREATE TABLE statement for this table
  const regex = new RegExp(
    `CREATE TABLE(?:\\s+IF NOT EXISTS)?\\s+${tableName}\\s*\\(([^;]+)\\)`,
    'i'
  );
  const match = sql.match(regex);
  if (!match) return null;

  const columnsStr = match[1];
  const columns = {};

  // Split by comma, but be careful about CHECK constraints that contain commas
  const lines = [];
  let depth = 0;
  let current = '';
  for (const char of columnsStr) {
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      lines.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) lines.push(current.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip constraints (PRIMARY KEY, FOREIGN KEY, etc.)
    if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)/i.test(trimmed)) continue;

    // Parse column: name TYPE [constraints]
    const colMatch = trimmed.match(/^(\w+)\s+(\w+)/);
    if (colMatch) {
      const [, colName, colType] = colMatch;
      columns[colName] = {
        name: colName,
        type: colType.toUpperCase(),
        definition: trimmed,
      };
    }
  }

  return columns;
}

/**
 * Read schema from Electron datastore.ts
 */
function getElectronSchema() {
  const path = join(__dirname, '../backend/electron/datastore.ts');
  return readFileSync(path, 'utf-8');
}

/**
 * Read schema from Server db.js
 */
function getServerSchema() {
  const path = join(__dirname, '../backend/server/db.js');
  return readFileSync(path, 'utf-8');
}

// ==================== Tests ====================

describe('Schema Fidelity Tests', () => {
  let electronSql;
  let serverSql;

  before(() => {
    electronSql = getElectronSchema();
    serverSql = getServerSchema();
  });

  describe('Electron Backend', () => {
    for (const [tableName, requiredCols] of Object.entries(REQUIRED_SYNC_COLUMNS)) {
      test(`${tableName} has all required sync columns`, () => {
        const columns = parseCreateTable(electronSql, tableName);
        assert.ok(columns, `Table ${tableName} not found in Electron schema`);

        const missing = requiredCols.filter(col => !columns[col]);
        assert.deepStrictEqual(missing, [], `Missing columns in Electron ${tableName}: ${missing.join(', ')}`);
      });
    }

    test('items.createdAt is INTEGER', () => {
      const columns = parseCreateTable(electronSql, 'items');
      assert.ok(columns, 'Table items not found');
      assert.ok(columns.createdAt, 'Column createdAt not found');
      assert.strictEqual(columns.createdAt.type, 'INTEGER', 'createdAt should be INTEGER');
    });

    test('items.id is TEXT', () => {
      const columns = parseCreateTable(electronSql, 'items');
      assert.ok(columns, 'Table items not found');
      assert.ok(columns.id, 'Column id not found');
      assert.strictEqual(columns.id.type, 'TEXT', 'id should be TEXT');
    });

    test('tags.id is TEXT (not INTEGER)', () => {
      const columns = parseCreateTable(electronSql, 'tags');
      assert.ok(columns, 'Table tags not found');
      assert.ok(columns.id, 'Column id not found');
      assert.strictEqual(columns.id.type, 'TEXT', 'tags.id should be TEXT (not INTEGER AUTOINCREMENT)');
    });

    test('item_tags.tagId is TEXT', () => {
      const columns = parseCreateTable(electronSql, 'item_tags');
      assert.ok(columns, 'Table item_tags not found');
      assert.ok(columns.tagId, 'Column tagId not found');
      assert.strictEqual(columns.tagId.type, 'TEXT', 'tagId should be TEXT');
    });
  });

  describe('Server Backend', () => {
    for (const [tableName, requiredCols] of Object.entries(REQUIRED_SYNC_COLUMNS)) {
      test(`${tableName} has all required sync columns`, () => {
        const columns = parseCreateTable(serverSql, tableName);
        assert.ok(columns, `Table ${tableName} not found in Server schema`);

        const missing = requiredCols.filter(col => !columns[col]);
        assert.deepStrictEqual(missing, [], `Missing columns in Server ${tableName}: ${missing.join(', ')}`);
      });
    }

    test('items.createdAt is INTEGER', () => {
      const columns = parseCreateTable(serverSql, 'items');
      assert.ok(columns, 'Table items not found');
      assert.ok(columns.createdAt, 'Column createdAt not found');
      assert.strictEqual(columns.createdAt.type, 'INTEGER', 'createdAt should be INTEGER');
    });

    test('tags.id is TEXT', () => {
      const columns = parseCreateTable(serverSql, 'tags');
      assert.ok(columns, 'Table tags not found');
      assert.ok(columns.id, 'Column id not found');
      assert.strictEqual(columns.id.type, 'TEXT', 'tags.id should be TEXT');
    });
  });

  describe('Generated Schema Consistency', () => {
    test('sqlite-sync.sql matches canonical schema', () => {
      const generatedSql = readFileSync(join(__dirname, 'generated/sqlite-sync.sql'), 'utf-8');

      for (const [tableName, requiredCols] of Object.entries(REQUIRED_SYNC_COLUMNS)) {
        const columns = parseCreateTable(generatedSql, tableName);
        assert.ok(columns, `Table ${tableName} not found in generated SQL`);

        const missing = requiredCols.filter(col => !columns[col]);
        assert.deepStrictEqual(missing, [], `Missing columns in generated ${tableName}: ${missing.join(', ')}`);
      }
    });

    test('generated types.ts exports REQUIRED_SYNC_COLUMNS', () => {
      const typesTs = readFileSync(join(__dirname, 'generated/types.ts'), 'utf-8');
      assert.ok(typesTs.includes('REQUIRED_SYNC_COLUMNS'), 'types.ts should export REQUIRED_SYNC_COLUMNS');
    });

    test('generated validate.js has validateSyncSchema function', () => {
      const validateJs = readFileSync(join(__dirname, 'generated/validate.js'), 'utf-8');
      assert.ok(validateJs.includes('validateSyncSchema'), 'validate.js should export validateSyncSchema');
      assert.ok(validateJs.includes('assertValidSyncSchema'), 'validate.js should export assertValidSyncSchema');
    });
  });

  describe('Cross-Backend Consistency', () => {
    test('Electron and Server have matching required columns', () => {
      for (const [tableName, requiredCols] of Object.entries(REQUIRED_SYNC_COLUMNS)) {
        const electronCols = parseCreateTable(electronSql, tableName);
        const serverCols = parseCreateTable(serverSql, tableName);

        assert.ok(electronCols, `Table ${tableName} not found in Electron`);
        assert.ok(serverCols, `Table ${tableName} not found in Server`);

        for (const col of requiredCols) {
          assert.ok(electronCols[col], `Electron ${tableName}.${col} missing`);
          assert.ok(serverCols[col], `Server ${tableName}.${col} missing`);
        }
      }
    });

    test('Timestamp columns use same type', () => {
      const timestampCols = ['createdAt', 'updatedAt', 'deletedAt', 'syncedAt'];

      for (const col of timestampCols) {
        const electronCols = parseCreateTable(electronSql, 'items');
        const serverCols = parseCreateTable(serverSql, 'items');

        if (electronCols[col] && serverCols[col]) {
          assert.strictEqual(
            electronCols[col].type,
            serverCols[col].type,
            `items.${col} type mismatch: Electron=${electronCols[col].type}, Server=${serverCols[col].type}`
          );
        }
      }
    });
  });
});

// Run tests if executed directly
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  console.log('Running schema fidelity tests...\n');
}
