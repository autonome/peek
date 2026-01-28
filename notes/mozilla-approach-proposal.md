# Mozilla Approach Implementation Proposal

## Unified Rust Core with UniFFI Bindings for iOS

**Problem Statement**: The Peek iOS app has a dual storage architecture where the Share Extension writes via Swift/GRDB while the main Tauri app uses Rust/rusqlite. Both target the same SQLite database file. This has caused bugs due to schema divergence, type mismatches (`'page'` vs `'url'`), and duplicated business logic (frecency calculation, tag management).

**Proposed Solution**: Follow Mozilla's application-services pattern - extract database operations into a dedicated Rust crate, generate Swift bindings via UniFFI, and link the resulting XCFramework to both the main app and Share Extension.

---

## Complexity Assessment: Current vs UniFFI Approach

### Short-Term vs Long-Term Tradeoff

**Short-term**: The UniFFI approach is **more complex**. Significant upfront investment required:
- Learning UniFFI and its quirks
- Setting up XCFramework build pipeline (multi-arch Rust builds, lipo, xcodebuild)
- Migrating existing code from two implementations to one
- Updating CI/CD workflows

**Long-term**: The UniFFI approach is **less complex**. The current dual system has ongoing costs paid forever:

| Aspect | Current (Dual Swift + Rust) | UniFFI (Unified Rust) |
|--------|----------------------------|----------------------|
| **Schema changes** | Edit 2 places, hope they match | Edit 1 place |
| **Business logic** | Duplicate in Swift + Rust | Write once |
| **Bug surface** | Either codebase can diverge | Single codebase |
| **New features** | Implement twice | Implement once |
| **Testing** | Verify both paths produce consistent results | Test Rust only |
| **Debugging** | "Which path caused this bug?" | Clear ownership |
| **Type safety** | Manual sync of constants/enums | Generated from Rust |

### The `'page'` vs `'url'` Bug as Case Study

The recent type mismatch bug (commit `51efdb3`) is a perfect example of dual-system divergence:
- Swift `ItemType.page.rawValue` → `"url"` (correct)
- Rust `save_url()` hardcoded → `'page'` (wrong)
- Both passed tests in isolation, failed together

**With UniFFI, this category of bug becomes impossible.** The `ItemType` enum is defined once in Rust:

```rust
#[derive(uniffi::Enum)]
pub enum ItemType {
    Page,   // Always serializes to "url"
    Text,
    Tagset,
    Image,
}
```

The Swift version is generated automatically - there's no separate Swift enum to get wrong.

### Honest Assessment

The current approach is **simpler to understand** but **more complex to maintain correctly**.

The UniFFI approach inverts that - **harder to set up**, but once running, you stop thinking about the Share Extension as a separate system. It just calls into Rust like the main app does.

### When Each Approach Makes Sense

**Keep current dual approach if:**
- Share Extension changes rarely
- Occasional divergence bugs are acceptable
- Mobile isn't a primary focus
- Team is more comfortable with Swift than Rust FFI

**Migrate to UniFFI if:**
- Actively developing mobile features
- Want confidence both paths behave identically
- Planning additional iOS extensions (widgets, intents, etc.)
- Sync logic is becoming more complex

### Realistic Timeline

The 6-week estimate in this proposal is conservative. Mozilla took years to build application-services, but they were:
- Supporting multiple platforms (iOS, Android, Desktop)
- Building dozens of components (logins, places, tabs, etc.)
- Designing for external consumers

For a single `PeekStore` with ~10 methods, **2-3 weeks of focused work** is more realistic:
- Week 1: Create peek-core crate, extract code, add UniFFI annotations
- Week 2: Build XCFramework, integrate with Share Extension
- Week 3: Testing, edge cases, CI/CD updates

---

## 1. Architecture Restructure: Rust as Single Source of Truth

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CURRENT (DUAL PATH)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐          ┌─────────────────────┐          │
│  │   Share Extension   │          │      Main App        │          │
│  │   (Swift/GRDB)      │          │   (Rust/rusqlite)    │          │
│  │                     │          │                      │          │
│  │  - Schema creation  │          │  - Schema creation   │          │
│  │  - save_item()      │          │  - save_url()        │          │
│  │  - frecency calc    │          │  - frecency calc     │          │
│  │  - tag management   │          │  - tag management    │          │
│  └──────────┬──────────┘          └──────────┬───────────┘          │
│             │                                │                      │
│             └──────────────┬─────────────────┘                      │
│                            ▼                                        │
│                   ┌─────────────────┐                               │
│                   │   peek.db       │                               │
│                   │ (App Group)     │                               │
│                   └─────────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘
```

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PROPOSED (UNIFIED RUST CORE)                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐          ┌─────────────────────┐          │
│  │   Share Extension   │          │      Main App        │          │
│  │   (Swift thin UI)   │          │   (Tauri + React)    │          │
│  │                     │          │                      │          │
│  │  UI only:           │          │  UI + Tauri IPC:     │          │
│  │  - Tag selection    │          │  - React frontend    │          │
│  │  - Content preview  │          │  - Tauri commands    │          │
│  └──────────┬──────────┘          └──────────┬───────────┘          │
│             │ UniFFI bindings                │ Direct Rust calls    │
│             ▼                                ▼                      │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │                    peek-core (Rust crate)                 │      │
│  │                                                           │      │
│  │  - Schema definition (single source of truth)             │      │
│  │  - Database initialization & migrations                   │      │
│  │  - save_item(), get_items(), update_item(), delete_item() │      │
│  │  - Tag management with frecency                           │      │
│  │  - Sync operations                                        │      │
│  │  - Type definitions (ItemType, TagStats, SavedItem)       │      │
│  └──────────────────────────┬───────────────────────────────┘      │
│                             ▼                                       │
│                   ┌─────────────────┐                               │
│                   │   peek.db       │                               │
│                   │ (App Group)     │                               │
│                   └─────────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘
```

### Crate Structure

Create a new `peek-core` crate alongside the existing Tauri app:

```
backend/tauri-mobile/
├── src-tauri/
│   ├── src/
│   │   └── lib.rs              # Tauri app (imports peek-core)
│   └── Cargo.toml              # Depends on peek-core
├── peek-core/                   # NEW: Shared Rust library
│   ├── src/
│   │   ├── lib.rs              # Public API + UniFFI scaffolding
│   │   ├── db.rs               # Database connection management
│   │   ├── schema.rs           # Schema definitions & migrations
│   │   ├── items.rs            # Item CRUD operations
│   │   ├── tags.rs             # Tag management & frecency
│   │   ├── sync.rs             # Webhook sync operations
│   │   └── types.rs            # Shared types (ItemType, SavedItem, etc.)
│   ├── uniffi.toml             # UniFFI configuration
│   ├── Cargo.toml
│   └── build.rs                # UniFFI build script
└── ios-framework/               # NEW: XCFramework build
    ├── build-xcframework.sh
    ├── module.modulemap
    └── PeekCore.h              # Umbrella header
```

### What Moves to peek-core

**From `lib.rs` (Rust)**:
- `ensure_database_initialized()` → `db::init()`
- `get_connection()` → `db::connection()`
- Schema creation SQL → `schema::create_tables()`
- `calculate_frecency()` → `tags::calculate_frecency()`
- `save_url()`, `save_text()`, `save_tagset()` → `items::save()`
- `get_saved_urls()`, `get_saved_texts()` → `items::list()`
- `update_url()`, `delete_url()` → `items::update()`, `items::delete()`
- `get_tags_by_frecency()` → `tags::list_by_frecency()`
- `sync_to_webhook()` → `sync::push_to_server()`

**From `ShareViewController.swift` (DELETE)**:
- `DatabaseManager` class → **replaced by UniFFI calls**
- `ItemRecord`, `TagRecord` structs → **generated by UniFFI**
- `createTables()` → **handled by Rust**
- `calculateFrecency()` → **handled by Rust**
- `saveItem()` → **UniFFI call to Rust**

---

## 2. Share Extension Calling Rust via UniFFI

### How It Works

UniFFI generates three files for Swift:
1. **`peek_coreFFI.h`** - C header with FFI function declarations
2. **`module.modulemap`** - Tells Swift compiler how to use C APIs
3. **`peek_core.swift`** - Public Swift API wrapping the FFI

The Share Extension imports the generated Swift module and calls Rust directly:

```swift
// ShareViewController.swift (simplified)
import UIKit
import PeekCore  // Generated UniFFI module

class ShareViewController: SLComposeServiceViewController {
    private var store: PeekStore?

    override func viewDidLoad() {
        super.viewDidLoad()

        // Initialize Rust store with App Group path
        let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.dietrich.peek-mobile"
        )!
        let dbPath = containerURL.appendingPathComponent("peek.db").path

        do {
            store = try PeekStore(dbPath: dbPath)
        } catch {
            // Handle initialization error
        }
    }

    override func didSelectPost() {
        guard let store = store else { return }

        // Extract shared content
        let url = extractURL()
        let selectedTags = getSelectedTags()

        do {
            // Single Rust call - no Swift DB code needed
            try store.saveItem(
                itemType: .page,
                url: url,
                content: nil,
                tags: selectedTags,
                metadata: nil
            )

            // Optionally trigger sync (if online)
            if isConnected {
                try? store.syncToServer()
            }
        } catch PeekError.duplicateUrl(let existingId) {
            // Merge tags with existing item
            try? store.updateItemTags(id: existingId, tags: selectedTags)
        } catch {
            // Handle error
        }

        extensionContext?.completeRequest(returningItems: nil)
    }

    func loadTags() -> [TagStats] {
        guard let store = store else { return [] }

        // Frecency-sorted tags from Rust
        return (try? store.getTagsByFrecency()) ?? []
    }

    func loadTagsForDomain(domain: String) -> [TagStats] {
        // Domain-affinity boosted tags
        return (try? store.getTagsByFrecencyForDomain(domain: domain)) ?? []
    }
}
```

### Thread Safety

UniFFI requires all exported objects to be `Send + Sync`. The Rust store uses interior mutability:

```rust
// peek-core/src/db.rs
use std::sync::Mutex;
use rusqlite::Connection;

#[derive(uniffi::Object)]
pub struct PeekStore {
    connection: Mutex<Connection>,
    db_path: String,
}

#[uniffi::export]
impl PeekStore {
    #[uniffi::constructor]
    pub fn new(db_path: String) -> Result<Arc<Self>, PeekError> {
        let conn = Connection::open(&db_path)
            .map_err(|e| PeekError::Database(e.to_string()))?;

        // Initialize schema
        schema::ensure_initialized(&conn)?;

        Ok(Arc::new(Self {
            connection: Mutex::new(conn),
            db_path,
        }))
    }

    pub fn save_item(
        &self,
        item_type: ItemType,
        url: Option<String>,
        content: Option<String>,
        tags: Vec<String>,
        metadata: Option<String>,
    ) -> Result<String, PeekError> {
        let conn = self.connection.lock().unwrap();
        items::save(&conn, item_type, url, content, tags, metadata)
    }
}
```

---

## 3. Required UniFFI Bindings

### Types (peek-core/src/types.rs)

```rust
use uniffi;

#[derive(Debug, Clone, uniffi::Enum)]
pub enum ItemType {
    Page,   // URLs
    Text,   // Notes
    Tagset, // Tag collections
    Image,  // Images
}

impl ItemType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ItemType::Page => "url",
            ItemType::Text => "text",
            ItemType::Tagset => "tagset",
            ItemType::Image => "image",
        }
    }
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SavedItem {
    pub id: String,
    pub item_type: ItemType,
    pub url: Option<String>,
    pub content: Option<String>,
    pub tags: Vec<String>,
    pub metadata: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TagStats {
    pub name: String,
    pub frequency: u32,
    pub last_used: String,
    pub frecency_score: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncResult {
    pub items_pushed: u32,
    pub items_pulled: u32,
    pub errors: Vec<String>,
}

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum PeekError {
    #[error("Database error: {message}")]
    Database { message: String },

    #[error("Item not found: {id}")]
    NotFound { id: String },

    #[error("Duplicate URL already saved: {existing_id}")]
    DuplicateUrl { existing_id: String },

    #[error("Network error: {message}")]
    Network { message: String },

    #[error("Invalid input: {message}")]
    InvalidInput { message: String },
}
```

### Store Object (peek-core/src/lib.rs)

```rust
use uniffi;
use std::sync::Arc;

uniffi::setup_scaffolding!();

mod db;
mod schema;
mod items;
mod tags;
mod sync;
mod types;

pub use types::*;

#[derive(uniffi::Object)]
pub struct PeekStore {
    connection: std::sync::Mutex<rusqlite::Connection>,
    db_path: String,
}

#[uniffi::export]
impl PeekStore {
    // Constructor
    #[uniffi::constructor]
    pub fn new(db_path: String) -> Result<Arc<Self>, PeekError>;

    // Item operations
    pub fn save_item(
        &self,
        item_type: ItemType,
        url: Option<String>,
        content: Option<String>,
        tags: Vec<String>,
        metadata: Option<String>,
    ) -> Result<String, PeekError>;

    pub fn get_item(&self, id: String) -> Result<SavedItem, PeekError>;

    pub fn get_items(&self, item_type: Option<ItemType>) -> Result<Vec<SavedItem>, PeekError>;

    pub fn update_item(
        &self,
        id: String,
        url: Option<String>,
        content: Option<String>,
        metadata: Option<String>,
    ) -> Result<(), PeekError>;

    pub fn update_item_tags(&self, id: String, tags: Vec<String>) -> Result<(), PeekError>;

    pub fn delete_item(&self, id: String) -> Result<(), PeekError>;

    // Check for duplicate URL (returns existing ID if found)
    pub fn find_existing_url(&self, url: String) -> Result<Option<String>, PeekError>;

    // Tag operations
    pub fn get_tags_by_frecency(&self) -> Result<Vec<TagStats>, PeekError>;

    pub fn get_tags_by_frecency_for_domain(&self, domain: String) -> Result<Vec<TagStats>, PeekError>;

    // Sync operations
    pub fn get_sync_settings(&self) -> Result<Option<SyncSettings>, PeekError>;

    pub fn sync_to_server(&self) -> Result<SyncResult, PeekError>;

    // Cleanup (call before extension terminates)
    pub fn close(&self);
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncSettings {
    pub server_url: String,
    pub api_key: String,
}
```

### Generated Swift (auto-generated, for reference)

```swift
// PeekCore.swift (generated by UniFFI)

public enum ItemType {
    case page
    case text
    case tagset
    case image
}

public struct SavedItem {
    public var id: String
    public var itemType: ItemType
    public var url: String?
    public var content: String?
    public var tags: [String]
    public var metadata: String?
    public var createdAt: String
    public var updatedAt: String
}

public struct TagStats {
    public var name: String
    public var frequency: UInt32
    public var lastUsed: String
    public var frecencyScore: Double
}

public enum PeekError: Error {
    case Database(message: String)
    case NotFound(id: String)
    case DuplicateUrl(existingId: String)
    case Network(message: String)
    case InvalidInput(message: String)
}

public class PeekStore {
    public init(dbPath: String) throws

    public func saveItem(
        itemType: ItemType,
        url: String?,
        content: String?,
        tags: [String],
        metadata: String?
    ) throws -> String

    public func getItem(id: String) throws -> SavedItem
    public func getItems(itemType: ItemType?) throws -> [SavedItem]
    public func updateItem(id: String, url: String?, content: String?, metadata: String?) throws
    public func updateItemTags(id: String, tags: [String]) throws
    public func deleteItem(id: String) throws

    public func findExistingUrl(url: String) throws -> String?

    public func getTagsByFrecency() throws -> [TagStats]
    public func getTagsByFrecencyForDomain(domain: String) throws -> [TagStats]

    public func getSyncSettings() throws -> SyncSettings?
    public func syncToServer() throws -> SyncResult

    public func close()

    deinit  // Calls Rust destructor
}
```

---

## 4. Migration Path from Current Dual System

### Phase 1: Create peek-core Crate (Week 1-2)

1. **Create crate structure**
   ```bash
   mkdir -p backend/tauri-mobile/peek-core/src
   cd backend/tauri-mobile/peek-core
   cargo init --lib
   ```

2. **Add dependencies to Cargo.toml**
   ```toml
   [lib]
   crate-type = ["lib", "cdylib", "staticlib"]
   name = "peek_core"

   [dependencies]
   uniffi = { version = "0.28", features = ["cli"] }
   rusqlite = { version = "0.31", features = ["bundled"] }
   chrono = { version = "0.4", features = ["serde"] }
   uuid = { version = "1.0", features = ["v4"] }
   serde = { version = "1.0", features = ["derive"] }
   serde_json = "1.0"
   thiserror = "1.0"

   [build-dependencies]
   uniffi = { version = "0.28", features = ["build"] }
   ```

3. **Extract database code from lib.rs**
   - Move schema SQL to `schema.rs`
   - Move item operations to `items.rs`
   - Move tag operations to `tags.rs`
   - Move sync operations to `sync.rs`
   - Keep types centralized in `types.rs`

4. **Add UniFFI annotations** to public types and functions

5. **Test crate independently**
   ```bash
   cargo test
   ```

### Phase 2: Integrate with Tauri App (Week 2-3)

1. **Update src-tauri/Cargo.toml**
   ```toml
   [dependencies]
   peek-core = { path = "../peek-core" }
   ```

2. **Refactor lib.rs to use peek-core**
   ```rust
   use peek_core::{PeekStore, ItemType, SavedItem, TagStats};

   // Replace direct rusqlite calls with PeekStore methods
   #[tauri::command]
   async fn save_url(url: String, tags: Vec<String>) -> Result<(), String> {
       let store = get_store()?;
       store.save_item(ItemType::Page, Some(url), None, tags, None)
           .map(|_| ())
           .map_err(|e| e.to_string())
   }
   ```

3. **Verify all existing functionality works**
   - Run existing tests
   - Manual testing on simulator

### Phase 3: Build XCFramework (Week 3-4)

1. **Create build script** (`ios-framework/build-xcframework.sh`)
   ```bash
   #!/bin/bash
   set -e

   CRATE_DIR="../peek-core"
   OUT_DIR="./output"

   # Build for all iOS targets
   cd "$CRATE_DIR"
   cargo build --release --target aarch64-apple-ios
   cargo build --release --target aarch64-apple-ios-sim
   cargo build --release --target x86_64-apple-ios

   # Generate Swift bindings
   cargo run --bin uniffi-bindgen generate \
     --library ../target/aarch64-apple-ios/release/libpeek_core.a \
     --language swift \
     --out-dir "$OUT_DIR/bindings"

   # Combine simulator architectures
   mkdir -p "$OUT_DIR/ios-simulator"
   lipo -create \
     ../target/aarch64-apple-ios-sim/release/libpeek_core.a \
     ../target/x86_64-apple-ios/release/libpeek_core.a \
     -output "$OUT_DIR/ios-simulator/libpeek_core.a"

   # Create XCFramework
   xcodebuild -create-xcframework \
     -library ../target/aarch64-apple-ios/release/libpeek_core.a \
       -headers "$OUT_DIR/bindings" \
     -library "$OUT_DIR/ios-simulator/libpeek_core.a" \
       -headers "$OUT_DIR/bindings" \
     -output "$OUT_DIR/PeekCore.xcframework"

   # Rename modulemap for Xcode compatibility
   find "$OUT_DIR/PeekCore.xcframework" -name "*FFI.modulemap" \
     -exec sh -c 'mv "$1" "$(dirname "$1")/module.modulemap"' _ {} \;

   echo "XCFramework built: $OUT_DIR/PeekCore.xcframework"
   ```

2. **Add XCFramework to Xcode project**
   - Drag `PeekCore.xcframework` into both app and extension targets
   - Ensure "Embed & Sign" is selected

### Phase 4: Migrate Share Extension (Week 4-5)

1. **Remove GRDB dependency**
   - Delete GRDB from Share Extension's Swift Package dependencies

2. **Replace DatabaseManager with PeekStore**
   ```swift
   // OLD: DatabaseManager.shared.saveItem(...)
   // NEW:
   let store = try PeekStore(dbPath: dbPath)
   try store.saveItem(itemType: .page, url: url, ...)
   ```

3. **Update all database calls**
   - `getTagsByFrecency()` → `store.getTagsByFrecency()`
   - `saveItem()` → `store.saveItem()`
   - etc.

4. **Remove all Swift database code**
   - Delete `ItemRecord`, `TagRecord`, `BlobRecord` structs
   - Delete `createTables()` function
   - Delete `calculateFrecency()` function

### Phase 5: Testing & Cleanup (Week 5-6)

1. **Integration testing**
   - Share Extension saves item → Main app sees it
   - Main app saves item → Share Extension sees it
   - Tags sync correctly between both

2. **Memory profiling**
   - Profile Share Extension memory usage with Instruments
   - Verify stays under 120MB limit

3. **Remove deprecated code**
   - Delete old GRDB-related Swift files
   - Clean up any remaining dual-path code

### Phase 6: Documentation & CI (Week 6)

1. **Update build scripts**
   - Modify `npm run build:ios` to build XCFramework
   - Add XCFramework to CI pipeline

2. **Document new architecture**
   - Update `docs/mobile.md`
   - Add peek-core crate documentation

---

## 5. Risks and Gotchas for iOS App Extensions Calling Rust

### Memory Constraints (~120MB Limit)

**Risk**: Share Extension has a hard 120MB memory limit. iOS terminates extensions exceeding this.

**Mitigations**:
- **Lazy initialization**: Don't open database until first use
- **Release builds only**: Debug Rust builds use significantly more memory
- **Minimal dependencies**: Only include necessary crates
- **Monitor with Instruments**: Profile memory during development

**Implementation**:
```rust
// Lazy database connection
use once_cell::sync::OnceCell;

#[derive(uniffi::Object)]
pub struct PeekStore {
    connection: OnceCell<Mutex<Connection>>,
    db_path: String,
}

impl PeekStore {
    fn conn(&self) -> &Mutex<Connection> {
        self.connection.get_or_init(|| {
            let conn = Connection::open(&self.db_path).unwrap();
            Mutex::new(conn)
        })
    }
}
```

### Extension Lifecycle

**Risk**: iOS can terminate Share Extension immediately after `completeRequest()`. Long-running Rust operations may be interrupted.

**Mitigations**:
- Keep operations synchronous and fast
- Call `close()` explicitly before `completeRequest()`
- Use `ProcessInfo.beginActivity()` for critical sections

**Implementation**:
```swift
override func didSelectPost() {
    // Begin activity to prevent termination during save
    let activity = ProcessInfo.processInfo.beginActivity(
        options: .background,
        reason: "Saving shared item"
    )

    defer {
        store?.close()
        ProcessInfo.processInfo.endActivity(activity)
        extensionContext?.completeRequest(returningItems: nil)
    }

    do {
        try store?.saveItem(...)
    } catch {
        // Log error, but still complete
    }
}
```

### Binary Size

**Risk**: Adding Rust increases app binary size by 1-3MB depending on dependencies.

**Mitigations**:
- Use `opt-level = "z"` for size optimization
- Enable LTO (Link-Time Optimization)
- Strip debug symbols in release builds

**Cargo.toml configuration**:
```toml
[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
strip = true
panic = "abort"
```

### Thread Safety Requirements

**Risk**: UniFFI requires all exported objects to be `Send + Sync`. Rust code must handle concurrent access from Swift.

**Mitigations**:
- Use `Mutex` for all mutable state
- Keep critical sections short
- Don't hold locks across async boundaries

**Implementation**:
```rust
// All state protected by Mutex
pub struct PeekStore {
    connection: Mutex<Connection>,  // Not Option<Connection>
}

// Short critical sections
pub fn save_item(&self, ...) -> Result<String, PeekError> {
    let conn = self.connection.lock().unwrap();
    // Do all work while holding lock
    let id = items::insert(&conn, ...)?;
    // Lock released here
    Ok(id)
}
```

### Database Concurrency

**Risk**: Both main app and Share Extension may access database simultaneously.

**Mitigations**:
- SQLite WAL mode (already enabled) handles this
- Use short transactions
- Handle `SQLITE_BUSY` errors with retry

**Implementation**:
```rust
fn with_retry<T, F: Fn(&Connection) -> Result<T, rusqlite::Error>>(
    conn: &Connection,
    f: F,
) -> Result<T, PeekError> {
    for attempt in 0..3 {
        match f(conn) {
            Ok(result) => return Ok(result),
            Err(rusqlite::Error::SqliteFailure(err, _))
                if err.code == rusqlite::ErrorCode::DatabaseBusy => {
                std::thread::sleep(std::time::Duration::from_millis(50 * (attempt + 1)));
                continue;
            }
            Err(e) => return Err(PeekError::Database { message: e.to_string() }),
        }
    }
    Err(PeekError::Database { message: "Database busy after retries".to_string() })
}
```

### Schema Migration Coordination

**Risk**: If main app and extension have different versions of peek-core, schema migrations could conflict.

**Mitigations**:
- Schema version stored in database
- Migrations are idempotent (safe to re-run)
- Newer version always handles migration
- Main app and extension updated together via App Store

**Implementation**:
```rust
const SCHEMA_VERSION: i32 = 5;

fn ensure_initialized(conn: &Connection) -> Result<(), PeekError> {
    let current_version: i32 = conn
        .query_row("SELECT value FROM settings WHERE key = 'schema_version'", [], |r| r.get(0))
        .unwrap_or(0);

    if current_version < SCHEMA_VERSION {
        run_migrations(conn, current_version)?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)",
            [SCHEMA_VERSION.to_string()],
        )?;
    }

    Ok(())
}
```

### Build Complexity

**Risk**: Building XCFramework adds complexity to CI/CD pipeline.

**Mitigations**:
- Script the entire build process
- Cache Rust compilation artifacts
- Consider pre-built XCFramework in git-lfs for faster CI

**CI workflow addition**:
```yaml
# .github/workflows/ios.yml
- name: Build XCFramework
  run: |
    rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
    cd backend/tauri-mobile/ios-framework
    ./build-xcframework.sh

- name: Cache Rust build
  uses: actions/cache@v3
  with:
    path: |
      ~/.cargo/registry
      backend/tauri-mobile/target
    key: rust-ios-${{ hashFiles('**/Cargo.lock') }}
```

### Debugging Across Language Boundary

**Risk**: Errors in Rust code are harder to debug from Swift.

**Mitigations**:
- Rich error types with context
- Logging from Rust side (use `os_log` crate)
- Symbolic names in error enums

**Implementation**:
```rust
use os_log::{OsLog, OsLogType};

static LOG: OsLog = OsLog::new("com.dietrich.peek-mobile", "PeekCore");

pub fn save_item(...) -> Result<String, PeekError> {
    LOG.log(OsLogType::Info, format!("Saving item: type={:?}", item_type));

    let result = do_save(...);

    if let Err(ref e) = result {
        LOG.log(OsLogType::Error, format!("Save failed: {:?}", e));
    }

    result
}
```

---

## References

### Mozilla Application-Services
- [GitHub Repository](https://github.com/mozilla/application-services)
- [Design Documentation](https://mozilla.github.io/application-services/book/)
- [iOS Megazord](https://github.com/mozilla/application-services/tree/main/megazords/ios-rust)
- [Build Script](https://github.com/mozilla/application-services/blob/main/megazords/ios-rust/build-xcframework.sh)

### UniFFI
- [GitHub Repository](https://github.com/mozilla/uniffi-rs)
- [User Guide](https://mozilla.github.io/uniffi-rs/latest/)
- [Proc-Macro Documentation](https://mozilla.github.io/uniffi-rs/latest/proc_macro/index.html)
- [Object References](https://mozilla.github.io/uniffi-rs/latest/internals/object_references.html)
- [Error Handling](https://mozilla.github.io/uniffi-rs/latest/udl/errors.html)

### iOS Extension Development
- [Apple - App Extension Programming Guide](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/)
- [Memory Limits in App Extensions](https://blog.kulman.sk/dealing-with-memory-limits-in-app-extensions/)
- [Wire - Share Extension Challenges](https://medium.com/@wireapp/the-challenge-of-implementing-ios-share-extension-for-end-to-end-encrypted-messenger-dd33b52b1e97)

### Related Blog Posts
- [Mozilla - Building Rust Library on iOS](https://blog.mozilla.org/data/2022/01/31/this-week-in-glean-building-and-deploying-a-rust-library-on-ios/)
- [Calling Rust from Swift](https://www.strathweb.com/2023/07/calling-rust-code-from-swift/)
- [DEV - Building iOS App with Rust and UniFFI](https://dev.to/almaju/building-an-ios-app-with-rust-using-uniffi-200a)

---

## Appendix: Current Code Locations

| Component | Current Location | After Migration |
|-----------|-----------------|-----------------|
| Schema SQL | `lib.rs:822-834`, `ShareViewController.swift:244-254` | `peek-core/src/schema.rs` |
| Item save | `lib.rs:1609-1730`, `ShareViewController.swift:470-580` | `peek-core/src/items.rs` |
| Frecency calc | `lib.rs:1202-1215`, `ShareViewController.swift:697-715` | `peek-core/src/tags.rs` |
| Tag operations | `lib.rs:1732-1825`, `ShareViewController.swift:600-690` | `peek-core/src/tags.rs` |
| Sync operations | `lib.rs:2800-2950`, `ShareViewController.swift:820-920` | `peek-core/src/sync.rs` |
| Types | `lib.rs:100-180`, `ShareViewController.swift:10-85` | `peek-core/src/types.rs` |
