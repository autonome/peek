# Schema Codegen

Single source of truth for sync schema definitions across all backends.

## PRIORITY TODO: Mobile Schema Migration

**Tauri Mobile has known schema drift that needs migration:**

| Issue | Canonical | Mobile (Current) |
|-------|-----------|------------------|
| Column naming | camelCase | snake_case (`sync_id`, `created_at`) |
| Timestamp type | INTEGER (Unix ms) | TEXT (ISO strings) |
| tags.id | TEXT (UUID) | INTEGER AUTOINCREMENT |
| item_tags.tagId | TEXT | INTEGER |

**Why it's deferred:** The migration requires synchronized changes to both Rust (~4000 lines) and Swift Share Extension (~2000 lines). Sync still works because the wire format (JSON) is independent of local schema.

**Migration plan:**
1. Update Rust fresh install schema to canonical
2. Add v1→v2 migration for existing databases
3. Update all Rust SQL queries (~100+ places)
4. Update Swift record structs and initializations
5. Update Swift SQL queries
6. Test migration with real iOS databases

See `notes/sync-architecture-review.md` for full analysis.

## Quick Start

```bash
# Generate code from schema (runs automatically during build)
yarn schema:codegen

# Run fidelity tests
yarn schema:test

# Check if generated files are fresh (for CI)
yarn schema:check
```

## Build Integration

Schema codegen runs automatically as part of `yarn build`:
1. `node schema/codegen.js` - Regenerate all files from v1.json
2. `tsc -p backend/tsconfig.json` - Compile TypeScript

## Runtime Validation

Both Server and Electron backends validate their schemas on startup:

- **Server** (`backend/server/db.js`): Imports `REQUIRED_SYNC_COLUMNS` from schema/v1.json and validates after migrations
- **Electron** (`backend/electron/datastore.ts`): Calls `validateSyncSchema()` after migrations, throws if columns missing

This catches schema drift early - if a migration is missing or broken, the app fails fast with a clear error.

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
