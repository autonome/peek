# Schema Codegen

Single source of truth for sync schema definitions across all backends.

## Quick Start

```bash
# Generate code from schema
node schema/codegen.js
# or
yarn schema:codegen

# Run fidelity tests
node --test schema/fidelity.test.js
# or
yarn schema:test
```

## Files

| File | Purpose |
|------|---------|
| `v1.json` | Canonical schema definition |
| `codegen.js` | Code generator script |
| `fidelity.test.js` | Cross-platform schema validation tests |
| `generated/` | Generated output (do not edit) |

## Generated Files

| File | Usage |
|------|-------|
| `sqlite-full.sql` | Full schema for desktop (includes local-only columns) |
| `sqlite-sync.sql` | Sync-only schema for server |
| `types.ts` | TypeScript interfaces |
| `types.rs` | Rust structs with serde attributes |
| `validate.js` | Schema validator function |

## Schema Structure

The schema defines three core sync tables:

### items
Unified content storage for URLs, text notes, tagsets, and images.

**Sync columns**: id, type, content, mimeType, metadata, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt, starred, archived

**Local-only columns**: visitCount, lastVisitAt, frecencyScore, title, domain, favicon

### tags
Tag definitions with frecency tracking.

**Sync columns**: id, name, frequency, lastUsed, frecencyScore, createdAt, updatedAt

**Local-only columns**: slug, color, parentId, description, metadata

### item_tags
Junction table linking items to tags.

**Sync columns**: itemId, tagId, createdAt

**Local-only columns**: id (desktop only - server uses composite PK)

## Validation

The generated `validate.js` provides two functions:

```javascript
import { validateSyncSchema, assertValidSyncSchema } from './generated/validate.js';

// Non-throwing validation
const result = validateSyncSchema((table) => {
  // Return array of column names for the table
  return db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
});

if (!result.valid) {
  console.error('Missing columns:', result.missing);
}

// Throwing validation
assertValidSyncSchema((table) => getColumnNames(table));
```

## Adding/Modifying Schema

1. Edit `v1.json`
2. Run `node schema/codegen.js`
3. Run `node --test schema/fidelity.test.js` to verify backends match
4. Update backend implementations if tests fail
5. Commit all changes together

## Sync vs Local Columns

- `"sync": true` - Column participates in cross-device sync
- `"sync": false` - Column is local-only (not included in sync payloads)

Local-only columns are typically:
- Computed values (frecencyScore)
- UI state (visitCount, lastVisitAt)
- Platform-specific data (desktop-only metadata)
