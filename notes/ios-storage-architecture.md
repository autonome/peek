# iOS Storage Architecture Research

## Executive Summary

The iOS app uses a **dual storage architecture** where the Share Extension writes to SQLite via Swift/GRDB while the main app uses Rust/rusqlite. Both target the same database file in the shared App Group container (`group.com.dietrich.peek-mobile`). This architecture has caused bugs due to schema and type divergence between the two codepaths.

---

## 1. Data Flow Analysis

### Share Extension Path (Swift/GRDB)

**File:** `backend/tauri-mobile/src-tauri/gen/apple/Peek/ShareViewController.swift`

```
User shares content → iOS Share Sheet → ShareViewController
    → DatabaseManager.saveItem() → GRDB write to items table
    → WAL checkpoint (PRAGMA wal_checkpoint(FULL))
    → Optional webhook push to server
```

Key characteristics:
- Uses GRDB library for SQLite access
- Runs in a separate process from the main app
- Limited resources (~120MB memory limit)
- Short-lived (must complete quickly or iOS kills it)
- Cannot call into main app's Rust code directly

### Main App Path (Rust/rusqlite)

**File:** `backend/tauri-mobile/src-tauri/src/lib.rs`

```
User action in UI → Tauri command → Rust handler (save_url, save_text, etc.)
    → rusqlite write to items table
    → Optional auto-sync to server
```

Key characteristics:
- Uses rusqlite crate for SQLite access
- Full app context with unlimited resources
- Can perform complex sync operations
- Tauri command interface bridges Swift UI to Rust backend

---

## 2. Divergences Between Swift and Rust

### 2.1 Type Value Mismatch (FIXED but illustrative)

**The Bug:** Recent commit `51efdb3` fixed a type filter mismatch.

| Operation | Swift (Share Extension) | Rust (Main App) |
|-----------|------------------------|-----------------|
| Save URL | Stores `type = 'url'` (via `ItemType.page.rawValue`) | Stores `type = 'page'` (hardcoded in INSERT) |
| Query URLs | Filters `WHERE type = 'url'` | Filters `WHERE type = 'url'` |

The Swift `ItemType` enum correctly maps `.page` case to `"url"` string:
```swift
enum ItemType: String {
    case page = "url"      // Raw value stored in DB
    case text = "text"
    case tagset = "tagset"
    case image = "image"
}
```

But the Rust `save_url()` function at line 1650 inserts `'page'`:
```rust
"INSERT INTO items (id, type, url, metadata, created_at, updated_at) VALUES (?, 'page', ?, ?, ?, ?)"
```

The fix was a migration (lines 921-937) that converts all `'page'` to `'url'` on startup.

### 2.2 Schema Column Differences

**Swift Schema (ShareViewController.swift:244-254):**
```sql
CREATE TABLE items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'page',  -- Note: DEFAULT differs
    url TEXT,
    content TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
    -- Missing: sync_id, sync_source, synced_at
);
```

**Rust Schema (lib.rs:822-834):**
```sql
CREATE TABLE items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'url',   -- Note: DEFAULT differs
    url TEXT,
    content TEXT,
    metadata TEXT,
    sync_id TEXT DEFAULT '',
    sync_source TEXT DEFAULT '',
    synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
```

**Key Differences:**
1. **DEFAULT type value:** Swift uses `'page'`, Rust uses `'url'`
2. **Sync columns:** Rust has `sync_id`, `sync_source`, `synced_at` - Swift doesn't create these
3. **Column order:** Differs, though this doesn't affect functionality

Since Rust creates sync columns via ALTER TABLE migrations when they're missing, this works. But Share Extension doesn't have these columns in its CREATE TABLE, so fresh installs from Share Extension alone would lack sync support.

### 2.3 Frecency Calculation

Both implementations have `calculateFrecency()` functions, but they must stay in sync:

**Swift (ShareViewController.swift:697-715):**
```swift
private func calculateFrecency(frequency: Int, lastUsed: String) -> Double {
    let daysSinceLastUse: Double
    if let date = ISO8601DateFormatter.shared.date(from: lastUsed) {
        daysSinceLastUse = Date().timeIntervalSince(date) / 86400.0
    } else {
        daysSinceLastUse = 0
    }
    let recencyMultiplier = pow(0.95, daysSinceLastUse)
    return Double(frequency) * recencyMultiplier
}
```

**Rust (lib.rs:1756-1770):**
```rust
fn calculate_frecency(frequency: u32, last_used: &str) -> f64 {
    let days_since = chrono::DateTime::parse_from_rfc3339(last_used)
        .map(|dt| {
            let now = chrono::Utc::now();
            let diff = now.signed_duration_since(dt);
            diff.num_seconds() as f64 / 86400.0
        })
        .unwrap_or(0.0);
    let recency_multiplier = 0.95_f64.powf(days_since);
    frequency as f64 * recency_multiplier
}
```

Both use the same formula (`frequency * 0.95^days`), so this is currently aligned.

### 2.4 Timestamp Formats

- **Swift:** Uses `ISO8601DateFormatter` with fractional seconds
- **Rust:** Uses `chrono::DateTime::parse_from_rfc3339` and `Utc::now().to_rfc3339()`

Both produce RFC3339/ISO8601 compatible strings. The Rust server sync layer has flexible deserialization that accepts both ISO8601 strings and Unix milliseconds.

---

## 3. Current Shared Data Mechanism

### App Groups Configuration

Both targets share the same App Group: `group.com.dietrich.peek-mobile`

**Entitlements files:**
- Main app: `gen/apple/peek-save_iOS/peek-save_iOS.entitlements`
- Share Extension: `gen/apple/Peek/Peek.entitlements`

Both contain:
```xml
<key>com.apple.security.application-groups</key>
<array>
    <string>group.com.dietrich.peek-mobile</string>
</array>
```

### Database Location

Both resolve the database path via:
```swift
FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.dietrich.peek-mobile")
```

Database files:
- Default profile: `{AppGroup}/peek.db`
- Named profiles: `{AppGroup}/peek-{profileId}.db`

### SQLite WAL Mode

Both enable WAL (Write-Ahead Logging) mode:
- Swift: `PRAGMA journal_mode=WAL` (ShareViewController.swift:183)
- Rust: `PRAGMA journal_mode = WAL` (lib.rs)

WAL allows concurrent readers and a single writer, making it safe for both processes to access the database.

### WAL Checkpoint

The Share Extension explicitly flushes writes with `PRAGMA wal_checkpoint(FULL)` (ShareViewController.swift:717-726) to ensure the main app sees changes immediately.

---

## 4. iOS Best Practices for Extension Data Sharing

Based on [Apple's Technical Note TN2408](https://developer.apple.com/library/archive/technotes/tn2408/_index.html) and [iOS App Extension data sharing patterns](https://dmtopolog.com/ios-app-extensions-data-sharing/):

### Recommended Approaches

1. **App Groups + SQLite (current approach)**
   - Pros: Simple, well-supported, both processes can read/write
   - Cons: Schema divergence risk, no type safety across codebases
   - Apple's guidance: "Use SQLite or Core Data" for shared containers

2. **App Groups + Core Data**
   - Pros: Type-safe, migrations built-in, iOS native
   - Cons: Doesn't help with Rust/Swift divergence

3. **CFPreferences / UserDefaults**
   - Pros: Very simple for small data
   - Cons: Not suitable for structured data, item lists

4. **File-based handoff**
   - Share Extension writes to a file in App Group
   - Main app reads and imports on launch
   - Pros: Decoupled, main app owns schema
   - Cons: Extra import step, stale data until import

### Apple's Key Recommendations

1. **Use WAL mode** for SQLite (already doing this)
2. **Use background task assertions** for writes (Share Extension completes quickly)
3. **Don't use file coordination** (NSFileCoordinator) with SQLite
4. **Test on real devices** - simulators may not accurately replicate entitlement behavior

---

## 5. Unification Approaches

### Option A: Share Extension Calls Rust via FFI

**Concept:** Compile the Rust database layer as a static library and link it to both the main app and the Share Extension. Use [UniFFI](https://github.com/mozilla/uniffi-rs) to generate Swift bindings.

**Implementation:**
1. Extract database operations into a separate Rust crate
2. Use UniFFI to generate Swift bindings (.swift, .h, .modulemap)
3. Create an XCFramework containing the library
4. Link XCFramework to both main app and Share Extension targets

**Pros:**
- Single source of truth for schema and logic
- Type safety via generated bindings
- No divergence possible

**Cons:**
- Significant refactoring effort
- Increases Share Extension binary size (~1-2MB for Rust runtime)
- Share Extension memory limits (~120MB) may be constrained
- Build complexity increases (must build for multiple architectures)
- [Known Tauri issues](https://github.com/tauri-apps/tauri/discussions/10197) with Share Extensions

**Feasibility:** Medium-High. Mozilla does this successfully with Firefox iOS ([reference](https://blog.mozilla.org/data/2022/01/31/this-week-in-glean-building-and-deploying-a-rust-library-on-ios/)). The existing `extern "C"` functions in lib.rs show FFI is already in use for `get_app_group_container_path()`.

### Option B: Share Extension as Thin Shim

**Concept:** Share Extension only writes to a simple handoff file/table. Main app is responsible for all real database operations.

**Implementation:**
1. Share Extension writes shared items to a simple `pending_items` table or JSON file
2. Main app reads pending items on launch and imports to real schema
3. Share Extension triggers main app to open via URL scheme after save

**Pros:**
- Share Extension code is minimal
- All schema logic in Rust
- No duplicate business logic

**Cons:**
- Items not immediately available until main app processes
- URL scheme opening may interrupt user flow
- Extra processing step on main app launch

**Feasibility:** High. Simple to implement, minimal risk.

### Option C: Generated Swift Code from Rust Schema

**Concept:** Generate Swift GRDB records and schema from a single Rust definition.

**Implementation:**
1. Define schema once in Rust (or a shared format like JSON Schema)
2. Build-time code generation produces both Rust structs and Swift structs
3. Share Extension uses generated Swift code

**Pros:**
- Schema stays in sync automatically
- Keep current architecture
- Build fails if schema drifts

**Cons:**
- Custom tooling required
- Business logic still duplicated
- Doesn't prevent logic divergence (frecency calc, etc.)

**Feasibility:** Medium. Requires custom tooling.

### Option D: Keep Current Approach + Stricter Validation

**Concept:** Accept dual codepaths but add validation and testing.

**Implementation:**
1. Add shared schema version number
2. Rust validates Share Extension writes on startup
3. Integration tests verify both paths produce identical results
4. Lint rules enforce constant alignment (e.g., type strings)

**Pros:**
- Minimal changes to current architecture
- Immediate implementation
- Low risk

**Cons:**
- Doesn't eliminate divergence, just detects it
- Ongoing maintenance burden

**Feasibility:** Very High. Can implement today.

---

## 6. Recommendations

### Short-term (Immediate)

1. **Fix the Rust `save_url()` to use `'url'` type** instead of `'page'`
   - Line 1650 in lib.rs still inserts `'page'`
   - The migration fixes existing data, but new saves are still wrong

2. **Add sync columns to Swift schema creation**
   - Share Extension should create `sync_id`, `sync_source`, `synced_at` columns
   - Prevents schema differences on fresh installs

3. **Add schema version tracking**
   - Both codepaths write a version to `settings` table
   - Detect and warn on mismatch

### Medium-term (Next Quarter)

4. **Extract shared constants**
   - Create a shared definition file for type strings, column names
   - Both codepaths import from this definition
   - Build-time check that values match

5. **Add integration tests**
   - Test that Share Extension + main app produce consistent data
   - Run on CI

### Long-term (Future)

6. **Evaluate UniFFI migration (Option A)**
   - Prototype Rust library linked to Share Extension
   - Measure binary size and memory impact
   - If viable, migrate to single codebase

---

## 7. Case Study: INTEGER→TEXT Tag Migration (January 2026)

This section documents the practical impact of the dual-codebase architecture during a real schema migration.

### The Problem

Mobile tags used `INTEGER PRIMARY KEY AUTOINCREMENT` for `tags.id` while server/desktop used `TEXT` UUIDs. This broke tag sync completely—tags created on mobile couldn't sync because their IDs were incompatible.

### Migration Scope

| Task | Rust (lib.rs) | Swift (ShareViewController.swift) |
|------|---------------|-----------------------------------|
| Schema version bump | 1 location | 1 location |
| ID generator function | New function | New function |
| Migration function | ~60 lines | ~50 lines |
| Type declaration changes | ~15 locations | ~8 locations |
| Query updates | ~10 locations | ~4 locations |
| Test updates | ~5 locations | N/A |

**Total: ~40 code changes across 2 files in 2 languages**

### What Would Have Been Different with UniFFI

With a unified Rust core linked to both main app and Share Extension:

| Task | Unified Rust Core |
|------|-------------------|
| Schema version bump | 1 location |
| ID generator function | 1 function |
| Migration function | ~60 lines (once) |
| Type declaration changes | ~15 locations (once) |
| Query updates | ~10 locations (once) |
| Swift changes | **0** (auto-generated bindings) |

**Total: ~20 code changes in 1 file, 1 language**

### Risk Comparison

| Risk | Dual Codebase | UniFFI |
|------|---------------|--------|
| Type mismatch between codepaths | High (manual sync) | None (single source) |
| Migration logic divergence | High | None |
| ID format inconsistency | Medium (copy-paste errors) | None |
| First-writer-wins race condition | Must implement twice | Implement once |
| Testing coverage | Test both paths | Test once |

### Conclusion

The migration succeeded, but required:
- Implementing identical logic twice (Rust + Swift)
- Coordinating transaction safety in two different SQLite libraries
- Ensuring ID format strings match exactly
- Updating schema fidelity tests to track the fix

**With UniFFI, this would have been a single-codebase change with auto-generated Swift bindings.** The upfront investment in UniFFI (~1-2 weeks) would pay off in reduced migration risk and maintenance burden for any future schema changes.

### Recommendation Update

Based on this experience, **Option A (UniFFI)** should be prioritized higher than originally assessed. The complexity cost of dual codepaths compounds with each schema change, and the tag migration demonstrated concrete examples of divergence risk.

---

## 8. References

- [Apple TN2408: Accessing Shared Data](https://developer.apple.com/library/archive/technotes/tn2408/_index.html)
- [iOS App Extensions Data Sharing](https://dmtopolog.com/ios-app-extensions-data-sharing/)
- [Core Data and App Extensions](https://www.avanderlee.com/swift/core-data-app-extension-data-sharing/)
- [UniFFI - Rust bindings generator](https://github.com/mozilla/uniffi-rs)
- [Calling Rust from Swift](https://www.strathweb.com/2023/07/calling-rust-code-from-swift/)
- [Mozilla: Rust library on iOS](https://blog.mozilla.org/data/2022/01/31/this-week-in-glean-building-and-deploying-a-rust-library-on-ios/)
- [Tauri iOS feedback](https://github.com/tauri-apps/tauri/discussions/10197)
- [tauri-plugin-share](https://crates.io/crates/tauri-plugin-share)

---

## Appendix: File Locations

| Component | Path |
|-----------|------|
| Share Extension | `backend/tauri-mobile/src-tauri/gen/apple/Peek/ShareViewController.swift` |
| Main App Rust | `backend/tauri-mobile/src-tauri/src/lib.rs` |
| Share Extension Entitlements | `gen/apple/Peek/Peek.entitlements` |
| Main App Entitlements | `gen/apple/peek-save_iOS/peek-save_iOS.entitlements` |
| Profile Config | `{AppGroup}/profiles.json` |
| Database | `{AppGroup}/peek.db` or `peek-{profileId}.db` |
