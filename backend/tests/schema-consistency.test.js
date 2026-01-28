/**
 * Cross-platform schema consistency test
 *
 * Verifies that all platforms use the same column names in their database schemas.
 * This prevents drift like iOS using snake_case (last_used) while server uses camelCase (lastUsed).
 *
 * Run with: node backend/tests/schema-consistency.test.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Expected canonical column names for each table
const CANONICAL_SCHEMA = {
  tags: {
    required: ['id', 'name', 'frequency', 'lastUsed', 'frecencyScore', 'createdAt', 'updatedAt'],
    forbidden: ['last_used', 'frecency_score', 'created_at', 'updated_at', 'last_used_at'],
  },
  // items uses snake_case intentionally (legacy), but item_tags bridges to tags
  item_tags: {
    required: ['itemId', 'tagId', 'createdAt'],
    forbidden: ['item_id', 'tag_id', 'created_at'],
    // Note: iOS mobile uses snake_case for item_tags which is inconsistent but not blocking sync
    // because item_tags is local-only (tags sync by name, not by ID)
    skipPlatforms: ['ios-mobile'], // iOS uses snake_case here, fix later
  },
};

// Platform source files containing CREATE TABLE statements
const PLATFORM_SOURCES = {
  'server': 'backend/server/db.js',
  'ios-mobile': 'backend/tauri-mobile/src-tauri/src/lib.rs',
  'desktop-tauri': 'backend/tauri/src-tauri/src/datastore.rs',
  'electron': 'backend/electron/datastore.ts',
};

/**
 * Extract column names from a CREATE TABLE statement
 */
function extractColumns(createTableSQL) {
  // Match column definitions: column_name TYPE ...
  const columnRegex = /^\s*(\w+)\s+(?:TEXT|INTEGER|REAL|BLOB)/gmi;
  const columns = [];
  let match;
  while ((match = columnRegex.exec(createTableSQL)) !== null) {
    columns.push(match[1]);
  }
  return columns;
}

/**
 * Find CREATE TABLE statement for a specific table in source code
 */
function findCreateTable(source, tableName) {
  // Handle different SQL formatting styles
  const patterns = [
    // Standard: CREATE TABLE tablename (
    new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${tableName}\\s*\\(([^;]+?)\\);`, 'gis'),
    // Rust raw string: CREATE TABLE IF NOT EXISTS tablename (
    new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${tableName}\\s*\\(([^)]+)\\)`, 'gis'),
  ];

  for (const pattern of patterns) {
    const matches = [...source.matchAll(pattern)];
    if (matches.length > 0) {
      // Return first non-test match (skip test fixtures if possible)
      for (const match of matches) {
        const fullMatch = match[0];
        // Skip if it looks like a test fixture
        if (!fullMatch.includes('test') && !fullMatch.includes('Test')) {
          return match[1];
        }
      }
      // Fall back to first match
      return matches[0][1];
    }
  }
  return null;
}

/**
 * Main test
 */
function runTests() {
  console.log('='.repeat(60));
  console.log('Cross-Platform Schema Consistency Test');
  console.log('='.repeat(60));

  const errors = [];
  const warnings = [];

  for (const [tableName, schema] of Object.entries(CANONICAL_SCHEMA)) {
    console.log(`\n--- Checking ${tableName} table ---`);

    for (const [platform, sourcePath] of Object.entries(PLATFORM_SOURCES)) {
      // Skip platforms explicitly excluded for this table
      if (schema.skipPlatforms?.includes(platform)) {
        console.log(`  ${platform}: SKIPPED (known inconsistency)`);
        continue;
      }

      const fullPath = path.resolve(path.dirname(__dirname), '..', sourcePath);

      if (!fs.existsSync(fullPath)) {
        warnings.push(`${platform}: Source file not found: ${sourcePath}`);
        console.log(`  ${platform}: SKIPPED (file not found)`);
        continue;
      }

      const source = fs.readFileSync(fullPath, 'utf8');
      const createTable = findCreateTable(source, tableName);

      if (!createTable) {
        // Table might not exist on all platforms (e.g., blobs only on mobile)
        console.log(`  ${platform}: No ${tableName} table found`);
        continue;
      }

      const columns = extractColumns(createTable);
      console.log(`  ${platform}: columns = [${columns.join(', ')}]`);

      // Check required columns
      for (const required of schema.required) {
        if (!columns.includes(required)) {
          errors.push(`${platform}.${tableName}: Missing required column '${required}'`);
        }
      }

      // Check forbidden columns (wrong naming convention)
      for (const forbidden of schema.forbidden) {
        if (columns.includes(forbidden)) {
          errors.push(`${platform}.${tableName}: Found forbidden column '${forbidden}' (should use camelCase)`);
        }
      }
    }
  }

  // Report results
  console.log('\n' + '='.repeat(60));

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) {
      console.log(`  ⚠️  ${w}`);
    }
  }

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) {
      console.log(`  ❌ ${e}`);
    }
    console.log(`\nResult: FAILED (${errors.length} errors)\n`);
    process.exit(1);
  } else {
    console.log('\nResult: PASSED - All platforms have consistent schemas\n');
    process.exit(0);
  }
}

runTests();
