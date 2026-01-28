# Sync Architecture Review: Breaking the Firefighting Cycle

**Date:** 2026-01-28
**Scope:** Schema management and sync across 5 backends
**Status:** Analysis complete, recommendations for stabilization

---

## Executive Summary

The team has been firefighting migration and schema issues because **each backend independently defines and manages its own schema** with no single source of truth. This review documents the current state and provides industry-standard recommendations for achieving stability.

### Root Causes of Instability

1. **5 independent schema implementations** - Each backend (Server, Electron, Tauri Desktop, Tauri Mobile, Sync Engine) defines schemas in isolation
2. **Inconsistent data types** - Timestamps stored as TEXT (ISO 8601) in mobile, INTEGER (Unix ms) elsewhere; Tag IDs as INTEGER AUTOINCREMENT in mobile vs TEXT UUID elsewhere
3. **No shared schema definition** - No single authoritative schema file that all backends derive from
4. **Missing migrations in some backends** - Tauri Desktop missing visit chaining, deduplication, address→items migration
5. **Different normalization rules** - Tauri doesn't sort URL query parameters; Electron does
6. **No schema validation on some platforms** - Server validates; mobile does not

---

## Current Architecture by Backend

### 1. Server (backend/server/db.js)

**Strengths:**
- Most robust migration system with 4-layer approach:
  1. Soft column rename via `ALTER TABLE RENAME COLUMN`
  2. Table rebuild fallback when rename fails (handles complex indexes)
  3. Missing column addition (safety net)
  4. Timestamp coercion (TEXT → INTEGER)
- Explicit `validateSchema()` function - fails fast if required columns missing
- Production-hardened against unknown legacy schemas
- Comprehensive logging for diagnostics

**Schema:**
```sql
-- items: camelCase, INTEGER timestamps, TEXT IDs
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('url', 'text', 'tagset', 'image')),
  syncId TEXT DEFAULT '',
  syncSource TEXT DEFAULT '',
  syncedAt INTEGER DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER DEFAULT 0
);

-- tags: TEXT ID (migrated from INTEGER AUTOINCREMENT)
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  frequency INTEGER DEFAULT 1,
  lastUsed INTEGER NOT NULL,        -- Canonical name (not lastUsedAt)
  frecencyScore REAL DEFAULT 0.0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
```

**Key Migration Code:**
- `migrateColumns()` - Lines 67-89: snake_case → camelCase
- `rebuildTableIfNeeded()` - Lines 91-115: Atomic table rebuild
- `migrateTimestamps()` - Lines 391-442: TEXT → INTEGER conversion
- `validateSchema()` - Lines 165-191: Fail-fast validation

---

### 2. Electron Desktop (backend/electron/datastore.ts)

**Strengths:**
- Maintains dual data model (legacy addresses + new items) for backward compatibility
- Sequential migrations with idempotency checks
- Version mismatch detection that disables sync
- Graceful error handling (continues on non-fatal failures)

**Schema:**
- Identical to Server for sync-relevant tables (items, tags, item_tags)
- Additional tables: addresses, visits, content, blobs, extensions, themes

**Migrations Implemented:**
1. `migrateTinyBaseData()` - Legacy format conversion
2. `migrateSyncColumns()` - Add syncId, syncSource, syncedAt
3. `migrateItemTypes()` - 'note' → 'url'/'text' conversion
4. `migrateItemVisitColumns()` - Add visitCount, lastVisitAt
5. `migrateAddressesToItems()` - Convert tagged addresses to items
6. `migrateVisitChaining()` - Add prevId/nextId to visits
7. `migrateDeduplicateItems()` - Remove duplicates

---

### 3. Tauri Desktop (backend/tauri/src-tauri/src/datastore.rs)

**CRITICAL GAPS:**

| Missing Feature | Impact |
|-----------------|--------|
| Visit chaining (prevId/nextId) | Cannot reconstruct browser history as linked list |
| Query parameter normalization | `?a=1&b=2` ≠ `?b=2&a=1` (creates duplicates) |
| Item deduplication | Duplicates accumulate during sync |
| Address→items migration | Old tagged addresses not visible in Items UI |
| TinyBase legacy support | Cannot migrate old TinyBase storage |

**Schema Divergence:**
```sql
-- themes table is INCOMPLETE
-- Tauri has: colorScheme, cssPath
-- Electron has: version, author, builtin, enabled, installedAt, lastError
```

---

### 4. Tauri Mobile (backend/tauri-mobile/src-tauri/src/lib.rs)

**CRITICAL INCOMPATIBILITIES:**

| Issue | Mobile | Server/Desktop | Impact |
|-------|--------|----------------|--------|
| Timestamps | TEXT (ISO 8601) | INTEGER (Unix ms) | Type mismatch on sync |
| Tag IDs | INTEGER AUTOINCREMENT | TEXT (UUID) | Cannot sync tags |
| Migration errors | Non-fatal (logged) | Fatal (throws) | Silent schema corruption |
| Schema validation | None | Explicit | Corrupted DBs boot normally |

**Timestamp Handling:**
```rust
// Mobile stores ISO 8601 strings
created_at TEXT NOT NULL,  -- "2026-01-27T21:12:47.876Z"

// Server expects Unix milliseconds
createdAt INTEGER NOT NULL,  -- 1706388767876
```

The mobile code has deserializers to handle both formats when **receiving** from server, but **sends** ISO strings which server must handle.

---

### 5. Sync Engine (sync/)

**Strengths:**
- Runtime agnostic - works across Node, browser, Tauri, Electron
- Adapter pattern enables storage backend swapping
- Comprehensive test suite (1660+ lines)
- Well-documented with edge case analysis

**Architecture:**
```
sync/
├── index.js      - Engine factory
├── sync.js       - Pull/push logic, conflict resolution
├── data.js       - DataEngine (CRUD operations)
├── version.js    - Version constants
├── frecency.js   - Decay scoring
└── adapters/
    ├── interface.js     - StorageAdapter contract
    ├── memory.js        - Testing
    ├── indexeddb.js     - Browser extension
    └── better-sqlite3.js - Desktop/server
```

**Protocol:**
- **Pull:** GET `/items/since/:timestamp` with `includeDeleted=true`
- **Push:** POST `/items` per item with tombstone support
- **Conflict Resolution:** Last-write-wins based on `updatedAt`
- **Versioning:** `X-Peek-Datastore-Version` and `X-Peek-Protocol-Version` headers

**CRITICAL GAP:**
```
Push failures are logged but not retried.
lastSyncTime advances regardless of failures.
Failed items have updatedAt < lastSyncTime, never re-pushed.
Result: DATA LOSS on network failures.
```

---

## Schema Comparison Matrix

| Field | Server | Electron | Tauri Desktop | Tauri Mobile |
|-------|--------|----------|---------------|--------------|
| **items.createdAt** | INTEGER | INTEGER | INTEGER | TEXT |
| **items.syncedAt** | INTEGER | INTEGER | INTEGER | TEXT |
| **tags.id** | TEXT (UUID) | TEXT (UUID) | TEXT (UUID) | INTEGER |
| **tags.lastUsed** | INTEGER | INTEGER | INTEGER | TEXT |
| **visits.prevId** | N/A | TEXT | ❌ Missing | N/A |
| **visits.nextId** | N/A | TEXT | ❌ Missing | N/A |
| **URL normalization** | camelCase | Sorts params | ❌ No sorting | Sorts params |
| **Schema validation** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |

---

## Industry Best Practices for Multi-Device Sync

### 1. Single Source of Truth for Schema

**Recommendation:** Create a canonical schema definition file that all backends derive from.

```yaml
# schema/v1.yaml - Single source of truth
version: 1
tables:
  items:
    columns:
      id: { type: text, primary_key: true }
      type: { type: text, not_null: true, check: "type IN ('url', 'text', 'tagset', 'image')" }
      content: { type: text }
      syncId: { type: text, default: '' }
      syncSource: { type: text, default: '' }
      syncedAt: { type: integer, default: 0 }
      createdAt: { type: integer, not_null: true }
      updatedAt: { type: integer, not_null: true }
      deletedAt: { type: integer, default: 0 }
    indexes:
      - { columns: [type] }
      - { columns: [syncId] }
      - { columns: [deletedAt] }
```

**Implementation:**
- Generate SQLite CREATE TABLE statements from YAML
- Generate TypeScript interfaces from YAML
- Generate Rust structs from YAML
- Validate actual schema against canonical definition at startup

### 2. Unified Timestamp Format

**Recommendation:** Standardize on INTEGER (Unix milliseconds) everywhere.

**Rationale:**
- INTEGER is SQLite's recommended type for timestamps
- Avoids parsing overhead
- Enables direct comparison without conversion
- 64-bit integers handle dates until year 292,277,026

**Migration Path for Mobile:**
```rust
// Add to mobile startup
fn migrate_timestamps(conn: &Connection) -> Result<()> {
    // Convert TEXT ISO 8601 to INTEGER Unix ms
    conn.execute_batch("
        UPDATE items SET createdAt =
            CAST(strftime('%s', createdAt) * 1000 AS INTEGER)
        WHERE typeof(createdAt) = 'text' AND createdAt LIKE '%-%T%';
    ")?;
    Ok(())
}
```

### 3. Unified ID Generation

**Recommendation:** Use TEXT UUIDs for all entity IDs.

**Current Problem:** Mobile uses INTEGER AUTOINCREMENT for tags, which cannot sync with server's TEXT UUIDs.

**Migration:**
```rust
// Mobile tag ID migration
fn migrate_tag_ids(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        CREATE TABLE tags_new (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            -- ... other columns
        );
        INSERT INTO tags_new SELECT
            printf('%s', id),  -- Convert INTEGER to TEXT
            name, ...
        FROM tags;
        DROP TABLE tags;
        ALTER TABLE tags_new RENAME TO tags;
    ")?;
    Ok(())
}
```

### 4. Schema Validation on All Platforms

**Recommendation:** Implement `validateSchema()` on every platform.

```rust
// Tauri validation (add to both desktop and mobile)
fn validate_schema(conn: &Connection) -> Result<(), String> {
    let required = vec![
        ("items", vec!["id", "type", "syncId", "syncSource", "syncedAt", "createdAt", "updatedAt", "deletedAt"]),
        ("tags", vec!["id", "name", "frequency", "lastUsed", "frecencyScore", "createdAt", "updatedAt"]),
        ("item_tags", vec!["itemId", "tagId", "createdAt"]),
    ];

    for (table, columns) in required {
        let actual: HashSet<String> = conn
            .prepare(&format!("PRAGMA table_info({})", table))?
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();

        for col in columns {
            if !actual.contains(col) {
                return Err(format!("Missing column: {}.{}", table, col));
            }
        }
    }
    Ok(())
}
```

### 5. Retry Queue for Sync Failures

**Recommendation:** Implement exponential backoff retry for failed pushes.

```javascript
// sync/retry-queue.js
class RetryQueue {
    constructor(maxRetries = 5, baseDelayMs = 1000) {
        this.queue = new Map(); // itemId -> { item, attempts, nextRetry }
    }

    async push(item) {
        const existing = this.queue.get(item.id);
        if (existing && existing.attempts >= this.maxRetries) {
            // Move to dead letter queue
            await this.moveToDeadLetter(item);
            return;
        }

        const attempts = existing ? existing.attempts + 1 : 1;
        const delay = this.baseDelayMs * Math.pow(2, attempts - 1);

        this.queue.set(item.id, {
            item,
            attempts,
            nextRetry: Date.now() + delay
        });
    }

    async processQueue() {
        const now = Date.now();
        for (const [id, entry] of this.queue) {
            if (entry.nextRetry <= now) {
                try {
                    await this.syncItem(entry.item);
                    this.queue.delete(id);
                } catch (e) {
                    await this.push(entry.item); // Re-queue with backoff
                }
            }
        }
    }
}
```

### 6. Fidelity Tests Across All Platforms

**Recommendation:** Cross-platform schema fidelity tests that run in CI.

```javascript
// tests/schema-fidelity.test.js
describe('Schema Fidelity', () => {
    const backends = ['server', 'electron', 'tauri-desktop', 'tauri-mobile'];

    for (const backend of backends) {
        describe(backend, () => {
            it('has all required items columns', async () => {
                const schema = await getSchemaFor(backend);
                expect(schema.items.columns).toContain('syncId');
                expect(schema.items.columns).toContain('syncedAt');
                // ...
            });

            it('uses INTEGER for timestamps', async () => {
                const schema = await getSchemaFor(backend);
                expect(schema.items.types.createdAt).toBe('INTEGER');
                expect(schema.items.types.updatedAt).toBe('INTEGER');
            });

            it('uses TEXT for tag IDs', async () => {
                const schema = await getSchemaFor(backend);
                expect(schema.tags.types.id).toBe('TEXT');
            });
        });
    }
});
```

---

## Immediate Action Items

### Priority 1: Stop the Bleeding (This Week)

1. **Add schema validation to Tauri Desktop and Mobile**
   - Port `validateSchema()` from server
   - Fail startup if schema is corrupted
   - Prevents silent data corruption

2. **Fix timestamp types in Mobile**
   - Migrate TEXT → INTEGER
   - Align with server/desktop
   - Prevents sync failures

3. **Fix tag ID types in Mobile**
   - Migrate INTEGER → TEXT UUID
   - Enables tag sync

### Priority 2: Architectural Fixes (This Month)

4. **Create canonical schema definition**
   - Single YAML/JSON file
   - Generate code for all platforms
   - Add CI validation

5. **Implement retry queue in sync engine**
   - Exponential backoff
   - Dead letter queue for permanent failures
   - Prevents data loss

6. **Add missing migrations to Tauri Desktop**
   - Visit chaining (prevId/nextId)
   - URL query parameter normalization
   - Item deduplication

### Priority 3: Long-term Stability (This Quarter)

7. **Cross-platform fidelity test suite**
   - Run on every PR
   - Catch schema drift early
   - Document expected schema

8. **Migration versioning system**
   - Track which migrations have run
   - Support rollback
   - Audit trail

---

## Files Referenced

| File | Purpose |
|------|---------|
| `backend/server/db.js` | Server schema and migrations |
| `backend/electron/datastore.ts` | Electron schema and migrations |
| `backend/tauri/src-tauri/src/datastore.rs` | Tauri Desktop schema |
| `backend/tauri-mobile/src-tauri/src/lib.rs` | Tauri Mobile schema |
| `sync/sync.js` | Sync engine logic |
| `sync/adapters/better-sqlite3.js` | SQLite adapter with migrations |
| `backend/types/index.ts` | Shared TypeScript types |
| `backend/version.ts` | Version constants |

---

## Conclusion

The current firefighting cycle stems from **schema fragmentation** across 5 independently-maintained backends. The path forward requires:

1. **Single source of truth** for schema definitions
2. **Strict validation** on all platforms
3. **Unified data types** (INTEGER timestamps, TEXT UUIDs)
4. **Robust sync** with retry queues
5. **Cross-platform fidelity tests** in CI

The sync protocol itself is well-designed with comprehensive tests. The instability comes from the storage layer inconsistencies feeding into sync. Fix the schema foundation, and sync stability will follow.
