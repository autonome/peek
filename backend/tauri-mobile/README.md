# Peek Mobile

A Tauri-based iOS app for saving and organizing URLs, notes, and tag-sets using frecency (frequency + recency) scoring.

## Overview

Peek is a mobile bookmarking and note-taking app that allows you to:
- Save **Pages** (URLs) directly from the iOS share sheet
- Save **Notes** (text with inline #hashtags) from the share sheet or main app
- Create **Tag-sets** (collections of tags) for quick categorization
- Tag items with multiple tags using frecency-scored suggestions
- Automatically merge tags when saving duplicate items
- Browse saved items in tabbed interface (Pages | Notes | Tags)
- Use domain-affinity tag boost for smarter suggestions
- Sync all item types to an external webhook endpoint
- Edit and delete any saved item

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust with Tauri v2
- **Platform**: iOS (simulator and device)
- **Storage**: SQLite database in iOS App Groups container (shared between app and extension)
- **Database Access**:
  - Main app: Rust with `rusqlite` crate via Objective-C FFI bridge
  - Share Extension: Swift with GRDB.swift library
- **Native Bridge**: Objective-C bridge for accessing App Group container path from Rust

## Architecture

### Item Types

Peek supports three item types, accessible via tab navigation:

| Type | Description | Source |
|------|-------------|--------|
| **Pages** | URLs/bookmarks | Share Extension (Safari, etc.) |
| **Notes** | Text with inline #hashtags | Share Extension (text) or main app |
| **Tag-sets** | Tag collections only | Main app only |

**Notes** support two ways to add tags:
- Inline hashtags in the text (e.g., `#idea #todo`) are auto-parsed
- Tag buttons below the textarea for adding additional tags

**Tag-sets** are useful for creating reusable tag combinations.

### iOS Share Extension

The app uses an iOS Share Extension with a full UI that allows:
- Immediate tagging without opening the main app
- Tag selection from frecency-sorted list
- Creating new tags on the fly
- Automatic detection and merging of duplicate items
- Status display showing existing tags for already-saved items
- Support for both URLs and plain text content

### Frecency Algorithm

Tags are scored using frecency (frequency + recency):

```
frecency_score = frequency × 10 × decay_factor
decay_factor = 1 / (1 + days_since_use / 7)
```

This ensures frequently used tags appear first, but decay over time if not used.

### Domain-Affinity Tag Boost

When displaying unused tags in the save/edit interfaces, tags that have been used on URLs from the same domain get a **2x frecency score multiplier**. This makes relevant tags appear higher in suggestions.

**Example**: When saving a URL from `github.com/foo/bar`, any tags previously used on other GitHub URLs (e.g., `github.com/bar/baz`) will appear higher in the tag suggestions.

**Implementation:**
- Domain extraction removes `www.` prefix for matching
- Applied in both Share Extension (Swift) and main app edit mode (Rust/React)

### URL Deduplication

When saving a URL that already exists:
1. The share extension detects the duplicate
2. Shows status: "Already saved with tags: existing, tags"
3. Pre-selects existing tags
4. Button changes to "Update Tags"
5. On save, merges new tags with existing tags (set union)
6. Preserves original ID and timestamp

### Webhook Sync

The app supports syncing all item types to an external webhook endpoint:

- **Configure webhook URL and API key** in the Settings screen
- **Manual sync** via "Sync All" button
- **Auto-sync on save** from both main app and share extension
- **Daily auto-sync** checks `last_sync` timestamp, syncs if >24 hours
- **Offline detection** skips webhook POST if device is offline (uses `NWPathMonitor`)

**Payload format:**
```json
{
  "urls": [
    { "id": "uuid", "url": "https://...", "tags": ["tag1"], "saved_at": "..." }
  ],
  "texts": [
    { "id": "uuid", "content": "Note with #hashtag", "tags": ["hashtag"], "saved_at": "..." }
  ],
  "tagsets": [
    { "id": "uuid", "tags": ["tag1", "tag2"], "saved_at": "..." }
  ]
}
```

### Data Storage

Data is stored in a SQLite database (`peek.db`) within the iOS App Groups container (`group.com.dietrich.peek-mobile`). This enables sharing between the main app and share extension with proper concurrent access via WAL mode.

**Database Location:**
```
~/Library/Developer/CoreSimulator/Devices/<DEVICE_ID>/data/Containers/Shared/AppGroup/<GROUP_UUID>/peek.db
```

**Database Schema:**

```sql
-- Unified items table (pages, texts, tagsets)
CREATE TABLE items (
    id TEXT PRIMARY KEY,           -- UUID
    type TEXT NOT NULL DEFAULT 'page',  -- 'page', 'text', or 'tagset'
    url TEXT,                      -- URL (required for 'page' type)
    content TEXT,                  -- Text content (required for 'text' type)
    created_at TEXT NOT NULL,      -- ISO8601 timestamp
    updated_at TEXT NOT NULL,      -- ISO8601 timestamp
    deleted_at TEXT                -- Soft delete timestamp (NULL = active)
);

-- Tags table
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,     -- Tag name (lowercase)
    frequency INTEGER NOT NULL DEFAULT 0,
    last_used TEXT NOT NULL,       -- ISO8601 timestamp
    frecency_score REAL NOT NULL DEFAULT 0.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Item-Tag junction table (many-to-many)
CREATE TABLE item_tags (
    item_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (item_id, tag_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Settings table (key-value store)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,          -- e.g., 'webhook_url', 'webhook_api_key', 'last_sync'
    value TEXT NOT NULL
);
```

**Key Features:**
- WAL mode for concurrent access from main app and share extension
- Unified items table supports all three item types
- Automatic migration from legacy `urls`/`url_tags` tables
- Normalized schema with junction table for item-tag relationships
- Indexes on frequently queried columns (type, url, content, frecency_score)

## Key Files

### Share Extension
- `src-tauri/gen/apple/Peek/ShareViewController.swift` - Full UI share extension
- `ShareViewController-full-ui.swift.example` - Reference implementation

### App Group Bridge
- `src-tauri/AppGroupBridge.m` - Objective-C bridge for App Groups access
- Provides C functions for Rust FFI:
  - `get_app_group_container_path()` - Returns path to App Group container for SQLite database
  - `get_system_is_dark_mode()` - Returns current system appearance (dark/light mode)

### Rust Backend
- `src-tauri/src/lib.rs` - Tauri commands and business logic
- **Page commands**: `save_url`, `get_saved_urls`, `update_url`, `delete_url`
- **Text commands**: `save_text`, `get_saved_texts`, `update_text`
- **Tagset commands**: `save_tagset`, `get_saved_tagsets`, `update_tagset`
- **Tag commands**: `get_tags_by_frecency`, `get_tags_by_frecency_for_url`
- **Webhook commands**: `sync_to_webhook`, `auto_sync_if_needed`

### Frontend
- `src/App.tsx` - React UI with tabbed navigation (Pages | Notes | Tags)
- `src/App.css` - Mobile-optimized styling with dark mode

### Tests
- `tests/integration.test.js` - Integration tests against peek-node server

### Configuration
- `src-tauri/tauri.conf.json` - Bundle ID: `com.dietrich.peek-mobile`
- `src-tauri/gen/apple/tauri-app_iOS/tauri-app_iOS.entitlements` - App Groups entitlement
- `src-tauri/gen/apple/Peek/Peek.entitlements` - Share extension entitlements

## Development

### Prerequisites

- Node.js and npm
- Rust and Cargo
- Xcode (for iOS development)
- Apple Developer certificate

### Setup

```bash
npm install
```

### Running

**iOS Simulator:**
```bash
npm run tauri ios dev -- "iPhone 17 Pro"
```

**Desktop (for quick UI testing):**
```bash
npm run tauri dev
```

### Build Workflow

Frontend assets (CSS, JS, HTML) are **embedded in the Rust binary** at compile time. This means:
- Changing CSS/JS requires rebuilding Rust with `cargo tauri build` (NOT just `cargo build`)
- Simply rebuilding in Xcode won't pick up frontend changes
- The library file to copy is in the `deps/` subdirectory

**Debug Build (Simulator):**
```bash
# 1. Start Vite dev server (for hot reload during development)
npx vite --host

# 2. Build and run from Xcode with Debug scheme on simulator
#    OR use the full embedded build:
npm run build
cd src-tauri
cargo tauri build --target aarch64-apple-ios-sim --debug
cp target/aarch64-apple-ios-sim/debug/deps/libpeek_save_lib.a gen/apple/Externals/arm64/Debug/libapp.a
# Then build in Xcode with Debug scheme, simulator target
```

**Release Build (Device):**
```bash
# Use the build script:
npm run build:release

# Or manually:
npm run build
cd src-tauri
cargo tauri build --target aarch64-apple-ios
cp target/aarch64-apple-ios/release/deps/libpeek_save_lib.a gen/apple/Externals/arm64/Release/libapp.a
# Then build in Xcode with Release scheme, device target
```

**Important Notes:**
- Debug uses `Externals/arm64/Debug/libapp.a` and target `aarch64-apple-ios-sim`
- Release uses `Externals/arm64/Release/libapp.a` and target `aarch64-apple-ios`
- Always copy from the `deps/` subfolder (has embedded assets), not the root folder
- Use `cargo tauri build`, NOT `cargo build` (the latter doesn't embed frontend assets)

The Xcode preBuildScript checks if `libapp.a` exists and skips the Rust build if so. To force a Rust rebuild from Xcode, delete the corresponding `libapp.a` file.

### App Icon

The app uses `Peek.icon` bundle (Xcode 15+ unified icon format):
- Source: `src-tauri/gen/apple/Peek.icon/Assets/Peek clouds src.png` (1232x1232)
- Xcode generates all required icon sizes during build
- Do NOT recreate `Assets.xcassets/AppIcon.appiconset/` - that's Tauri's default icons

### Building

**Build Rust library for iOS:**
```bash
cd src-tauri
./build-ios.sh
```

**Build iOS app:**
```bash
cd src-tauri/gen/apple
xcodebuild -scheme tauri-app_iOS -configuration Debug -sdk iphonesimulator -derivedDataPath build
```

**Install on simulator:**
```bash
xcrun simctl install <DEVICE_ID> "src-tauri/gen/apple/build/Build/Products/debug-iphonesimulator/Peek.app"
```

### Bundle Identifiers

- Main app: `com.dietrich.peek-mobile`
- Share extension: `com.dietrich.peek-mobile.share` (must be prefixed with main app ID)
- App Group: `group.com.dietrich.peek-mobile`

**Important**: All three must match the `-mobile` suffix for the App Groups sharing to work.

### Build Script

The `build-ios.sh` script:
1. Builds Rust library for both `aarch64-apple-ios-sim` and `x86_64-apple-ios`
2. Creates universal library with `lipo`
3. Copies to `gen/apple/Externals/arm64/debug/libapp.a`
4. Compiles Objective-C bridge code

### Testing

Integration tests verify the webhook sync with peek-node server:

```bash
# Run tests (starts peek-node server with temp data, runs tests, cleans up)
npm test

# Verbose mode (shows server logs)
npm run test:verbose
```

Tests cover:
- Webhook sync for pages (URLs)
- Texts API (create, read, update, delete)
- Tagsets API (create, read, update, delete)
- Unified `/items` API with type filtering
- Tags frecency tracking
- Update and delete operations

**Requirements:** peek-node server at `~/misc/peek-node`

### Cleaning Data

To clear all saved items and tags from simulator:

```bash
# Find the SQLite database
find ~/Library/Developer/CoreSimulator/Devices/<DEVICE_ID>/data/Containers/Shared/AppGroup -name "peek.db"

# Delete it (also removes WAL files)
rm "<path_to_peek.db>"*

# Or to just clear data without deleting the database:
sqlite3 "<path_to_peek.db>" "DELETE FROM item_tags; DELETE FROM items; DELETE FROM tags;"
```

### Share Extension in Xcode

The share extension must be configured in Xcode:
1. Target: "Peek" (Share Extension)
2. Bundle ID: `com.dietrich.peek-mobile.share`
3. Principal Class: `ShareViewController`
4. Copy `ShareViewController-full-ui.swift.example` to `src-tauri/gen/apple/Peek/ShareViewController.swift`
5. Ensure entitlements include App Groups

## Troubleshooting

### Stale Build Cache

If changes to `AppGroupBridge.m` aren't reflected:

```bash
cd src-tauri
cargo clean
./build-ios.sh
# Rebuild in Xcode
```

### Share Extension Not Appearing

Check:
1. Bundle ID has correct prefix: `com.dietrich.peek-mobile.share`
2. Share extension Info.plist has correct NSExtension configuration
3. App Groups entitlements match between app and extension

### No Saved URLs Showing

Verify:
1. App Groups identifier matches in all three places
2. Both Rust (rusqlite) and Swift (GRDB) are accessing the same database path
3. Database is being created in the App Group container, not the app sandbox
4. Check database contents: `sqlite3 <path_to_peek.db> "SELECT * FROM urls;"`

## License

See LICENSE file.
