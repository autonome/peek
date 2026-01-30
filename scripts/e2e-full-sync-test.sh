#!/bin/bash
# Full E2E Sync Test: Server + Desktop (headless) + iOS Simulator
#
# ┌─────────────────────────────────────────────────────────────────┐
# │  E2E Sync Test - Server + Desktop + iOS Simulator               │
# │                                                                 │
# │  Usage:                                                         │
# │    # Interactive mode (opens Xcode, manual sync taps)           │
# │    yarn interactive-test:e2e:full-sync                          │
# │                                                                 │
# │    # Headless mode (auto-sync, requires pre-built app)          │
# │    yarn interactive-test:e2e:full-sync -- --headless            │
# │                                                                 │
# │    # Fully automated (builds with xcodebuild CLI + auto-sync)   │
# │    yarn interactive-test:e2e:full-sync -- --headless --build    │
# │                                                                 │
# │  The --build flag uses xcodebuild CLI with isolated DerivedData │
# │  path (/tmp/peek-xcodebuild) to avoid conflicts with Xcode GUI. │
# └─────────────────────────────────────────────────────────────────┘
#
# Clean-room test covering all sync permutations:
# - Server has pre-existing items (seeded via API)
# - Desktop has pre-existing items (seeded via preconfigure script)
# - iOS has pre-existing items (seeded into SQLite before sync)
# - After sync: all three should have the combined set
#
# All data is in temp dirs and wiped on exit.
# iOS simulator databases are wiped before test and restored on exit.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_DIR/backend/server"
TAURI_DIR="$PROJECT_DIR/backend/tauri-mobile"
XCODE_PROJECT="$TAURI_DIR/src-tauri/gen/apple/peek-save.xcodeproj"

# --- Parse arguments ---
HEADLESS=false
CLI_BUILD=false
for arg in "$@"; do
    case "$arg" in
        --headless|--auto)
            HEADLESS=true
            ;;
        --build)
            CLI_BUILD=true
            ;;
    esac
done

# --- Configuration ---

PORT="${PORT:-3459}"
TIMESTAMP=$(date +%s)
API_KEY="e2e-full-key-$TIMESTAMP"
SERVER_TEMP_DIR="$(mktemp -d /tmp/e2e-peek-full-XXXXXX)"
DESKTOP_PROFILE="e2e-test-$TIMESTAMP"
DESKTOP_PROFILE_DIR="$HOME/Library/Application Support/Peek/$DESKTOP_PROFILE"
IOS_BACKUP_DIR="$(mktemp -d /tmp/e2e-peek-ios-backup-XXXXXX)"

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
SERVER_URL="http://$LOCAL_IP:$PORT"
IOS_BUNDLE_ID="com.dietrich.peek-mobile"

# --- Helper functions ---

# Relaunch iOS app in simulator (terminate + launch)
# Usage: relaunch_ios_app [reason] [auto_sync]
#   reason: optional description for logging
#   auto_sync: if "true", passes PEEK_AUTO_SYNC=true to trigger sync on launch
relaunch_ios_app() {
    local reason="${1:-}"
    local auto_sync="${2:-false}"
    if [ -n "$reason" ]; then
        echo "  Relaunching iOS app ($reason)..."
    else
        echo "  Relaunching iOS app..."
    fi
    xcrun simctl terminate booted "$IOS_BUNDLE_ID" 2>/dev/null || true
    sleep 1

    # Launch with optional auto-sync environment variable
    if [ "$auto_sync" = "true" ]; then
        echo "  [AUTO-SYNC] Launching with PEEK_AUTO_SYNC=true"
        SIMCTL_CHILD_PEEK_AUTO_SYNC=true xcrun simctl launch booted "$IOS_BUNDLE_ID" 2>/dev/null || {
            echo "  WARNING: Failed to launch iOS app. Is it installed?"
            return 1
        }
    else
        xcrun simctl launch booted "$IOS_BUNDLE_ID" 2>/dev/null || {
            echo "  WARNING: Failed to launch iOS app. Is it installed?"
            return 1
        }
    fi
    sleep 2
    echo "  iOS app relaunched."
}

# Prompt user or auto-proceed in headless mode
prompt_or_continue() {
    local message="$1"
    local action="${2:-}"

    if [ "$HEADLESS" = true ]; then
        if [ -n "$action" ]; then
            echo "  [HEADLESS] $action"
        fi
        echo "  [HEADLESS] Continuing without user prompt..."
    else
        echo ""
        echo "=========================================="
        echo "  $message"
        echo "=========================================="
        echo ""
    fi
}

echo "=========================================="
echo "  Full E2E Sync Test (Clean Room)"
if [ "$HEADLESS" = true ]; then
    if [ "$CLI_BUILD" = true ]; then
        echo "  Mode: HEADLESS + CLI BUILD (fully automated)"
    else
        echo "  Mode: HEADLESS (auto-relaunch, no prompts)"
    fi
else
    echo "  Mode: INTERACTIVE (manual prompts)"
fi
echo "=========================================="
echo ""
echo "  Server URL:       $SERVER_URL"
echo "  API Key:          $API_KEY"
echo "  Server data:      $SERVER_TEMP_DIR"
echo "  Desktop profile:  $DESKTOP_PROFILE"
echo "  Desktop data:     $DESKTOP_PROFILE_DIR"
echo "  iOS backup:       $IOS_BACKUP_DIR"
echo ""

# --- Cleanup trap ---

SERVER_PID=""
DESKTOP_PID=""
APP_GROUP=""
cleanup() {
    echo ""
    echo "Cleaning up..."
    if [ -n "$DESKTOP_PID" ]; then
        kill "$DESKTOP_PID" 2>/dev/null || true
        wait "$DESKTOP_PID" 2>/dev/null || true
        echo "  Stopped desktop (PID $DESKTOP_PID)"
    fi
    if [ -n "$SERVER_PID" ]; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
        echo "  Stopped server (PID $SERVER_PID)"
    fi
    rm -rf "$SERVER_TEMP_DIR"
    echo "  Removed server temp: $SERVER_TEMP_DIR"
    if [ -d "$DESKTOP_PROFILE_DIR" ]; then
        rm -rf "$DESKTOP_PROFILE_DIR"
        echo "  Removed desktop profile: $DESKTOP_PROFILE_DIR"
    fi
    # Remove temp desktop profile from profiles.db
    PROFILES_DB="$HOME/Library/Application Support/Peek/.dev-profiles.db"
    if [ -f "$PROFILES_DB" ]; then
        sqlite3 "$PROFILES_DB" "DELETE FROM profiles WHERE slug = '$DESKTOP_PROFILE';" 2>/dev/null || true
        sqlite3 "$PROFILES_DB" "DELETE FROM active_profile WHERE profile_slug = '$DESKTOP_PROFILE';" 2>/dev/null || true
        echo "  Cleaned desktop profiles.db"
    fi
    # Restore iOS simulator data from backup
    if [ -n "$APP_GROUP" ] && [ -d "$IOS_BACKUP_DIR" ]; then
        rm -f "$APP_GROUP"/peek-*.db "$APP_GROUP"/peek-*.db-journal "$APP_GROUP"/peek-*.db-wal "$APP_GROUP"/peek-*.db-shm 2>/dev/null || true
        rm -f "$APP_GROUP/profiles.json" 2>/dev/null || true
        if [ "$(ls -A "$IOS_BACKUP_DIR" 2>/dev/null)" ]; then
            cp "$IOS_BACKUP_DIR"/* "$APP_GROUP/" 2>/dev/null || true
            echo "  Restored iOS simulator data from backup"
        else
            echo "  iOS simulator data was empty (no backup to restore)"
        fi
    fi
    rm -rf "$IOS_BACKUP_DIR"
    echo "  Removed iOS backup: $IOS_BACKUP_DIR"
    echo "Done."
}
trap cleanup EXIT

# --- Step 1: Build desktop + iOS Rust library ---

echo "Step 1: Building desktop + iOS Rust library..."
cd "$PROJECT_DIR"
yarn build
echo "  Desktop build complete"
yarn mobile:ios:build --force
echo "  iOS Rust library build complete"

# --- Step 2: Find and wipe iOS simulator data ---

echo ""
echo "Step 2: Preparing iOS simulator (clean room)..."

APP_GROUP=$(xcrun simctl get_app_container booted "$IOS_BUNDLE_ID" groups 2>/dev/null | grep "group.$IOS_BUNDLE_ID" | awk '{print $2}')

if [ -z "$APP_GROUP" ]; then
    echo "  ERROR: iOS app not installed in simulator."
    if [ "$HEADLESS" = true ]; then
        echo "  [HEADLESS] Cannot continue without iOS app installed."
        echo "  Build and run the app once from Xcode, then re-run this script."
        exit 1
    else
        echo "  Build and run the app once from Xcode, then re-run this script."
        echo ""
        open "$XCODE_PROJECT"
        echo "  Server is running. Press Ctrl+C to stop."
        # Start server so user can build/install, then re-run
        DATA_DIR="$SERVER_TEMP_DIR" PORT="$PORT" API_KEY="$API_KEY" node "$SERVER_DIR/index.js" &
        SERVER_PID=$!
        wait "$SERVER_PID"
        exit 0
    fi
fi

echo "  App container: $APP_GROUP"

# Backup existing iOS data
cp "$APP_GROUP"/peek-*.db "$IOS_BACKUP_DIR/" 2>/dev/null || true
cp "$APP_GROUP"/peek-*.db-journal "$IOS_BACKUP_DIR/" 2>/dev/null || true
cp "$APP_GROUP"/peek-*.db-wal "$IOS_BACKUP_DIR/" 2>/dev/null || true
cp "$APP_GROUP"/peek-*.db-shm "$IOS_BACKUP_DIR/" 2>/dev/null || true
cp "$APP_GROUP/profiles.json" "$IOS_BACKUP_DIR/" 2>/dev/null || true
echo "  Backed up existing iOS data"

# Wipe iOS data
rm -f "$APP_GROUP"/peek-*.db "$APP_GROUP"/peek-*.db-journal "$APP_GROUP"/peek-*.db-wal "$APP_GROUP"/peek-*.db-shm 2>/dev/null || true
rm -f "$APP_GROUP/profiles.json" 2>/dev/null || true
echo "  Wiped iOS simulator data (clean slate)"

# Create fresh profiles.json with a single test profile
IOS_PROFILE_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
echo "  Fresh iOS profile ID: $IOS_PROFILE_ID"

# We'll write profiles.json after we have the server profile ID (step 4)

# --- Step 3: Start server ---

echo ""
echo "Step 3: Starting server (fresh temp data)..."
DATA_DIR="$SERVER_TEMP_DIR" PORT="$PORT" API_KEY="$API_KEY" node "$SERVER_DIR/index.js" &
SERVER_PID=$!

for i in {1..30}; do
    if curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; then
        echo "  Server ready on port $PORT (PID $SERVER_PID)"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "  ERROR: Server failed to start"
        exit 1
    fi
    sleep 0.5
done

# --- Step 4: Create server profile ---

echo ""
echo "Step 4: Creating server profile..."
PROFILE_RESP=$(curl -sf -X POST "http://localhost:$PORT/profiles" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"name":"Default"}')

SERVER_PROFILE_ID=$(echo "$PROFILE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['profile']['id'])")
echo "  Server profile ID: $SERVER_PROFILE_ID"

PROFILE_PARAM="profile=$SERVER_PROFILE_ID"

# --- Step 5: Seed SERVER-ORIGIN items ---

echo ""
echo "Step 5: Seeding server-origin items..."

curl -sf -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" \
    -d '{"type":"url","content":"https://example.com/server-origin-1","tags":["server","e2e"]}' > /dev/null

curl -sf -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" \
    -d '{"type":"text","content":"Note created on server","tags":["server","note"]}' > /dev/null

SERVER_COUNT=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))")
echo "  Server-origin items: $SERVER_COUNT"

# --- Step 6: Pre-configure desktop and seed DESKTOP-ORIGIN items ---

echo ""
echo "Step 6: Pre-configuring desktop sync and seeding desktop-origin items..."
cd "$PROJECT_DIR"
PROFILE="$DESKTOP_PROFILE" SERVER_URL="$SERVER_URL" API_KEY="$API_KEY" SERVER_PROFILE_ID="$SERVER_PROFILE_ID" electron scripts/preconfigure-sync.mjs
echo "  Desktop configured (pulled server items)"

# Seed desktop-origin items directly into desktop database
# Desktop schema: content (no url column), camelCase columns, integer timestamps
DESKTOP_DB="$DESKTOP_PROFILE_DIR/datastore.sqlite"
sqlite3 "$DESKTOP_DB" << 'SQLEOF'
INSERT INTO items (id, type, content, metadata, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt)
VALUES
  (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
   'url', 'https://example.com/desktop-origin-1', '{}', '', '', 0,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000, 0),
  (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
   'text', 'Note created on desktop', '{}', '', '', 0,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000, 0);
SQLEOF

# Tag desktop items
# Desktop schema: tags(id TEXT, name, slug, ...), item_tags(id TEXT, itemId, tagId, createdAt)
sqlite3 "$DESKTOP_DB" << 'SQLEOF'
INSERT OR IGNORE INTO tags (id, name, slug, createdAt) VALUES ('tag-desktop', 'desktop', 'desktop', strftime('%s','now') * 1000);
INSERT OR IGNORE INTO tags (id, name, slug, createdAt) VALUES ('tag-e2e', 'e2e', 'e2e', strftime('%s','now') * 1000);
INSERT OR IGNORE INTO tags (id, name, slug, createdAt) VALUES ('tag-note', 'note', 'note', strftime('%s','now') * 1000);

INSERT INTO item_tags (id, itemId, tagId, createdAt)
SELECT 'it-' || hex(randomblob(8)), id, 'tag-desktop', strftime('%s','now') * 1000
FROM items WHERE content = 'https://example.com/desktop-origin-1' OR content = 'Note created on desktop';
INSERT INTO item_tags (id, itemId, tagId, createdAt)
SELECT 'it-' || hex(randomblob(8)), id, 'tag-e2e', strftime('%s','now') * 1000
FROM items WHERE content = 'https://example.com/desktop-origin-1';
INSERT INTO item_tags (id, itemId, tagId, createdAt)
SELECT 'it-' || hex(randomblob(8)), id, 'tag-note', strftime('%s','now') * 1000
FROM items WHERE content = 'Note created on desktop';
SQLEOF

DESKTOP_TOTAL=$(sqlite3 "$DESKTOP_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
DESKTOP_LOCAL=$(sqlite3 "$DESKTOP_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0 AND syncSource = '';")
echo "  Desktop total items: $DESKTOP_TOTAL ($DESKTOP_LOCAL local-only, rest from server pull)"

# Push desktop-origin items to server via full sync
echo "  Running full sync to push desktop items to server..."
cd "$PROJECT_DIR"
PROFILE="$DESKTOP_PROFILE" SERVER_URL="$SERVER_URL" API_KEY="$API_KEY" SERVER_PROFILE_ID="$SERVER_PROFILE_ID" SYNC_MODE=full electron scripts/preconfigure-sync.mjs

SERVER_AFTER_DESKTOP=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))")
echo "  Server now has $SERVER_AFTER_DESKTOP items (server + desktop)"

# --- Step 7: Write fresh iOS profiles.json ---

echo ""
echo "Step 7: Writing fresh iOS profiles.json..."

python3 << PYEOF
import json

config = {
    "currentProfileId": "$IOS_PROFILE_ID",
    "profiles": [
        {
            "id": "$IOS_PROFILE_ID",
            "name": "E2E Test",
            "createdAt": "2026-01-27T00:00:00.000Z",
            "lastUsed": "2026-01-27T00:00:00.000Z",
            "server_url": "$SERVER_URL",
            "api_key": "$API_KEY",
            "server_profile_id": "$SERVER_PROFILE_ID"
        }
    ],
    "sync": {
        "server_url": "$SERVER_URL",
        "api_key": "$API_KEY",
        "auto_sync": False
    }
}

with open("$APP_GROUP/profiles.json", "w") as f:
    json.dump(config, f, indent=2)

print(f"  Created profiles.json with profile {config['currentProfileId']}")
PYEOF

# --- Step 8: Seed iOS-ORIGIN items into fresh database ---

echo ""
echo "Step 8: Seeding iOS-origin items..."

IOS_DB="$APP_GROUP/peek-$IOS_PROFILE_ID.db"

# Create the database with the exact schema the iOS app expects
sqlite3 "$IOS_DB" << SQLEOF
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'url',
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

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    frequency INTEGER NOT NULL DEFAULT 0,
    lastUsed TEXT NOT NULL,
    frecencyScore REAL NOT NULL DEFAULT 0.0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_tags (
    item_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (item_id, tag_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blobs (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    data BLOB NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    thumbnail BLOB,
    created_at TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_url ON items(url);
CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);
CREATE INDEX IF NOT EXISTS idx_items_sync_id ON items(sync_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_frecency ON tags(frecencyScore DESC);
CREATE INDEX IF NOT EXISTS idx_blobs_item ON blobs(item_id);

-- Seed iOS-origin items
INSERT INTO items (id, type, url, content, metadata, sync_source, created_at, updated_at)
VALUES
  ('ios-e2e-url-1', 'url', 'https://example.com/ios-origin-1', '', '', '', datetime('now'), datetime('now')),
  ('ios-e2e-note-1', 'text', '', 'Note created on iOS', '', '', datetime('now'), datetime('now'));

-- Tags
INSERT INTO tags (name, frequency, lastUsed, frecencyScore, createdAt, updatedAt)
VALUES
  ('ios', 1, datetime('now'), 1.0, datetime('now'), datetime('now')),
  ('e2e', 1, datetime('now'), 1.0, datetime('now'), datetime('now')),
  ('note', 1, datetime('now'), 1.0, datetime('now'), datetime('now'));

-- Tag associations
INSERT INTO item_tags (item_id, tag_id, created_at) VALUES ('ios-e2e-url-1', 1, datetime('now'));
INSERT INTO item_tags (item_id, tag_id, created_at) VALUES ('ios-e2e-url-1', 2, datetime('now'));
INSERT INTO item_tags (item_id, tag_id, created_at) VALUES ('ios-e2e-note-1', 1, datetime('now'));
INSERT INTO item_tags (item_id, tag_id, created_at) VALUES ('ios-e2e-note-1', 3, datetime('now'));
SQLEOF

IOS_COUNT=$(sqlite3 "$IOS_DB" "SELECT COUNT(*) FROM items WHERE deleted_at IS NULL;")
echo "  iOS-origin items: $IOS_COUNT (in fresh database)"

# --- Step 9: Start headless desktop ---

echo ""
echo "Step 9: Starting headless desktop..."
cd "$PROJECT_DIR"
PROFILE="$DESKTOP_PROFILE" PEEK_HEADLESS=1 DEBUG=1 electron . &
DESKTOP_PID=$!
echo "  Desktop started headless (PID $DESKTOP_PID)"
sleep 3

# --- Summary ---

echo ""
echo "=========================================="
echo "  Full E2E Clean Room Test Ready"
echo "=========================================="
echo ""
echo "  Pre-existing data:"
echo "    Server:   $SERVER_COUNT items (server-origin)"
echo "    Desktop:  $DESKTOP_LOCAL items (desktop-origin) + $SERVER_COUNT pulled from server"
echo "    iOS:      $IOS_COUNT items (ios-origin, fresh database)"
echo ""
echo "  Expected after sync:"
echo "    All three should have $(($SERVER_COUNT + $DESKTOP_LOCAL + $IOS_COUNT)) total items"
echo "    Server:  server-origin + desktop-origin + ios-origin"
echo "    Desktop: server-origin + desktop-origin + ios-origin (after re-sync)"
echo "    iOS:     server-origin + desktop-origin + ios-origin"
echo ""
echo "  Server:             $SERVER_URL"
echo "  API Key:            $API_KEY"
echo "  Server Profile ID:  $SERVER_PROFILE_ID"
echo ""
echo "  Desktop: headless PID $DESKTOP_PID, profile '$DESKTOP_PROFILE'"
echo "  iOS:     profile $IOS_PROFILE_ID"
echo ""
if [ "$HEADLESS" = true ]; then
    echo "  [HEADLESS] Fully automated - iOS app will be auto-relaunched with PEEK_AUTO_SYNC=true"
    echo "  [HEADLESS] No manual steps required!"
    echo "  Expected total: $(($SERVER_COUNT + $DESKTOP_LOCAL + $IOS_COUNT)) items"
else
    echo "  iOS test steps:"
    echo "    1. Build & run in Xcode (Debug, iPhone simulator)"
    echo "    2. Force-quit and relaunch app (pick up profiles.json)"
    echo "    3. Tap 'Sync All'"
    echo "       → should pull server + desktop items"
    echo "       → should push iOS items to server"
    echo "    4. Check expected total: $(($SERVER_COUNT + $DESKTOP_LOCAL + $IOS_COUNT)) items"
fi
echo ""
echo "  Verify server items:"
echo "    curl -s 'http://localhost:$PORT/items?profile=$SERVER_PROFILE_ID' \\"
echo "      -H 'Authorization: Bearer $API_KEY' | python3 -m json.tool"
echo ""
echo "  Waiting for iOS to sync (polling server for $((SERVER_COUNT + DESKTOP_LOCAL + IOS_COUNT)) items)..."
echo "  Press Ctrl+C at any time to stop and clean up."
echo "=========================================="
echo ""

# --- Build and/or open Xcode ---

if [ "$CLI_BUILD" = true ]; then
    echo ""
    echo "Building iOS app with xcodebuild (CLI)..."
    cd "$PROJECT_DIR"

    # Build with xcodebuild using isolated DerivedData path
    cd backend/tauri-mobile/src-tauri/gen/apple
    xcodebuild -scheme peek-save_iOS -configuration Debug -sdk iphonesimulator \
        -derivedDataPath /tmp/peek-xcodebuild \
        -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
        build 2>&1 | grep -E "(BUILD|error:|warning:.*error)" || true

    if [ $? -eq 0 ]; then
        echo "  iOS app built successfully"
    else
        echo "  ERROR: xcodebuild failed"
        exit 1
    fi

    # Install to simulator
    echo "  Installing to simulator..."
    xcrun simctl install booted '/tmp/peek-xcodebuild/Build/Products/debug-iphonesimulator/Peek Save.app'
    echo "  iOS app installed"
    cd "$PROJECT_DIR"
fi

if [ "$HEADLESS" = true ]; then
    if [ "$CLI_BUILD" = false ]; then
        echo "[HEADLESS] Skipping Xcode open. Ensure iOS app is already built and installed."
    fi
    echo "[HEADLESS] Relaunching iOS app with PEEK_AUTO_SYNC=true..."
    relaunch_ios_app "pick up fresh test profile + auto-sync" "true"
    echo ""
else
    echo "Opening Xcode... Build & Run (⌘R), then tap 'Sync All' in the app."
    open "$XCODE_PROJECT"
    echo ""
fi

# --- Poll server until iOS items appear (or timeout) ---

EXPECTED_SERVER=$(($SERVER_COUNT + $DESKTOP_LOCAL + $IOS_COUNT))
POLL_TIMEOUT=300  # 5 minutes
POLL_INTERVAL=5
POLL_ELAPSED=0

echo "Waiting for server to have $EXPECTED_SERVER items (polling every ${POLL_INTERVAL}s, timeout ${POLL_TIMEOUT}s)..."
while [ "$POLL_ELAPSED" -lt "$POLL_TIMEOUT" ]; do
    CURRENT=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM" \
        -H "Authorization: Bearer $API_KEY" \
        -H "X-Peek-Datastore-Version: 1" \
        -H "X-Peek-Protocol-Version: 1" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))" 2>/dev/null || echo "0")
    if [ "$CURRENT" -ge "$EXPECTED_SERVER" ] 2>/dev/null; then
        echo "  Server has $CURRENT items — iOS sync detected!"
        break
    fi
    echo "  ... $CURRENT / $EXPECTED_SERVER items (${POLL_ELAPSED}s elapsed)"
    sleep "$POLL_INTERVAL"
    POLL_ELAPSED=$(($POLL_ELAPSED + $POLL_INTERVAL))
done

if [ "$POLL_ELAPSED" -ge "$POLL_TIMEOUT" ]; then
    echo "  TIMEOUT: Server still has $CURRENT items after ${POLL_TIMEOUT}s"
    echo "  Proceeding with verification anyway..."
fi

# Small delay for server to finish processing
sleep 2

echo ""
echo "=========================================="
echo "  Verification"
echo "=========================================="

EXPECTED=$(($SERVER_COUNT + $DESKTOP_LOCAL + $IOS_COUNT))
PASS=true

# --- Verify server ---
SERVER_FINAL=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" | python3 -c "import sys,json; d=json.load(sys.stdin)['items']; print(len(d))")

echo ""
echo "  SERVER: $SERVER_FINAL / $EXPECTED items"
if [ "$SERVER_FINAL" -eq "$EXPECTED" ]; then
    echo "    ✓ PASS"
else
    echo "    ✗ FAIL (expected $EXPECTED)"
    PASS=false
fi

# List server items by origin
curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
for item in items:
    c = item.get('content','') or item.get('url','') or ''
    raw_tags = item.get('tags', [])
    tags = ', '.join(t if isinstance(t, str) else (t.get('name','') or t.get('slug','')) for t in raw_tags)
    print(f'    - {item[\"type\"]}: {c[:60]}  [{tags}]')
"

# --- Trigger desktop re-sync to pull iOS items ---
echo ""
echo "  Triggering desktop re-sync to pull iOS items..."
cd "$PROJECT_DIR"
PROFILE="$DESKTOP_PROFILE" SERVER_URL="$SERVER_URL" API_KEY="$API_KEY" SERVER_PROFILE_ID="$SERVER_PROFILE_ID" SYNC_MODE=full electron scripts/preconfigure-sync.mjs 2>&1 | grep -E "(Full sync|Pulled|sync)"

# --- Verify desktop ---
DESKTOP_FINAL=$(sqlite3 "$DESKTOP_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
echo ""
echo "  DESKTOP: $DESKTOP_FINAL / $EXPECTED items"
if [ "$DESKTOP_FINAL" -eq "$EXPECTED" ]; then
    echo "    ✓ PASS"
else
    echo "    ✗ FAIL (expected $EXPECTED)"
    PASS=false
fi
sqlite3 "$DESKTOP_DB" "SELECT '    - ' || type || ': ' || substr(content, 1, 60) FROM items WHERE deletedAt = 0;"

# --- Verify iOS ---
IOS_FINAL=$(sqlite3 "$IOS_DB" "SELECT COUNT(*) FROM items WHERE deleted_at IS NULL;")
echo ""
echo "  iOS: $IOS_FINAL / $EXPECTED items"
if [ "$IOS_FINAL" -eq "$EXPECTED" ]; then
    echo "    ✓ PASS"
else
    echo "    ✗ FAIL (expected $EXPECTED)"
    PASS=false
fi
sqlite3 "$IOS_DB" "SELECT '    - ' || type || ': ' || substr(COALESCE(url, content), 1, 60) FROM items WHERE deleted_at IS NULL;"

# --- Final result (Phase 1) ---
echo ""
echo "=========================================="
if [ "$PASS" = true ]; then
    echo "  PHASE 1 PASS: ALL PLATFORMS VERIFIED: $EXPECTED items each"
else
    echo "  PHASE 1 FAIL (see above)"
    echo "  Skipping Phase 2 (sync dedup testing requires Phase 1 pass)"
    echo "=========================================="
    echo ""
    exit 1
fi
echo "=========================================="
echo ""

# ==========================================================================
#  PHASE 2: Sync Dedup Testing (syncId only — no content matching)
# ==========================================================================

echo ""
echo "=========================================="
echo "  Phase 2: Sync Dedup Testing"
echo "=========================================="
echo ""

PHASE2_PASS=true

# --- Step 11: sync_id re-push dedup (automated) ---

echo "Step 11: sync_id re-push dedup..."

# Get a server item's ID and push it back with sync_id set to that ID
ITEM_ID=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['id'])")

echo "  Re-pushing item $ITEM_ID with sync_id set to its own server ID..."
curl -sf -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" \
    -d "{\"type\":\"url\",\"content\":\"https://example.com/server-origin-1\",\"tags\":[\"dedup-test\"],\"sync_id\":\"$ITEM_ID\"}" > /dev/null

STEP11_COUNT=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))")

echo "  Server item count after sync_id re-push: $STEP11_COUNT"
if [ "$STEP11_COUNT" -eq 6 ]; then
    echo "    PASS: sync_id dedup working (still 6 items)"
else
    echo "    FAIL: Expected 6 items, got $STEP11_COUNT (sync_id dedup broken)"
    PHASE2_PASS=false
fi

# --- Step 12: Seed cross-device URL into desktop + iOS ---

echo ""
echo "Step 12: Seeding cross-device identical URL..."

CROSS_URL="https://example.com/cross-device-url"

# Seed into desktop SQLite (no syncId, no syncSource — appears as local-only)
sqlite3 "$DESKTOP_DB" << SQLEOF
INSERT INTO items (id, type, content, metadata, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt)
VALUES
  (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
   'url', '$CROSS_URL', '{}', '', '', 0,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000, 0);
SQLEOF

# Tag desktop cross-device item
sqlite3 "$DESKTOP_DB" << 'SQLEOF'
INSERT OR IGNORE INTO tags (id, name, slug, createdAt) VALUES ('tag-crossdev', 'cross-device', 'cross-device', strftime('%s','now') * 1000);
INSERT INTO item_tags (id, itemId, tagId, createdAt)
SELECT 'it-' || hex(randomblob(8)), id, 'tag-crossdev', strftime('%s','now') * 1000
FROM items WHERE content = 'https://example.com/cross-device-url' AND syncSource = '';
SQLEOF

echo "  Seeded cross-device URL into desktop"

# Seed into iOS SQLite (no sync_id — appears as local-only)
sqlite3 "$IOS_DB" << SQLEOF
INSERT INTO items (id, type, url, content, metadata, sync_source, created_at, updated_at)
VALUES
  ('ios-crossdev-1', 'url', '$CROSS_URL', '', '', '', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO tags (name, frequency, lastUsed, frecencyScore, createdAt, updatedAt)
VALUES ('cross-device', 1, datetime('now'), 1.0, datetime('now'), datetime('now'));

INSERT INTO item_tags (item_id, tag_id, created_at)
SELECT 'ios-crossdev-1', id, datetime('now') FROM tags WHERE name = 'cross-device';
SQLEOF

echo "  Seeded cross-device URL into iOS"

# --- Step 13: Seed cross-device tagset into desktop + iOS ---

echo ""
echo "Step 13: Seeding cross-device identical tagset..."

# Seed into desktop SQLite
sqlite3 "$DESKTOP_DB" << 'SQLEOF'
INSERT INTO items (id, type, content, metadata, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt)
VALUES
  (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
   'tagset', '', '{}', '', '', 0,
   strftime('%s','now') * 1000, strftime('%s','now') * 1000, 0);

INSERT OR IGNORE INTO tags (id, name, slug, createdAt) VALUES ('tag-shared', 'shared', 'shared', strftime('%s','now') * 1000);
INSERT OR IGNORE INTO tags (id, name, slug, createdAt) VALUES ('tag-tagset', 'tagset', 'tagset', strftime('%s','now') * 1000);

INSERT INTO item_tags (id, itemId, tagId, createdAt)
SELECT 'it-' || hex(randomblob(8)), id, 'tag-shared', strftime('%s','now') * 1000
FROM items WHERE type = 'tagset' AND content = '' AND syncSource = '' AND deletedAt = 0
ORDER BY createdAt DESC LIMIT 1;

INSERT INTO item_tags (id, itemId, tagId, createdAt)
SELECT 'it-' || hex(randomblob(8)), id, 'tag-tagset', strftime('%s','now') * 1000
FROM items WHERE type = 'tagset' AND content = '' AND syncSource = '' AND deletedAt = 0
ORDER BY createdAt DESC LIMIT 1;
SQLEOF

echo "  Seeded cross-device tagset into desktop"

# Seed into iOS SQLite
sqlite3 "$IOS_DB" << 'SQLEOF'
INSERT INTO items (id, type, url, content, metadata, sync_source, created_at, updated_at)
VALUES ('ios-tagset-1', 'tagset', '', '', '', '', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO tags (name, frequency, lastUsed, frecencyScore, createdAt, updatedAt)
VALUES
  ('shared', 1, datetime('now'), 1.0, datetime('now'), datetime('now')),
  ('tagset', 1, datetime('now'), 1.0, datetime('now'), datetime('now'));

INSERT INTO item_tags (item_id, tag_id, created_at)
SELECT 'ios-tagset-1', id, datetime('now') FROM tags WHERE name = 'shared';
INSERT INTO item_tags (item_id, tag_id, created_at)
SELECT 'ios-tagset-1', id, datetime('now') FROM tags WHERE name = 'tagset';
SQLEOF

echo "  Seeded cross-device tagset into iOS"

# --- Step 14: Trigger desktop sync to push new items ---

echo ""
echo "Step 14: Triggering desktop sync to push new items..."
cd "$PROJECT_DIR"
PROFILE="$DESKTOP_PROFILE" SERVER_URL="$SERVER_URL" API_KEY="$API_KEY" SERVER_PROFILE_ID="$SERVER_PROFILE_ID" SYNC_MODE=full electron scripts/preconfigure-sync.mjs 2>&1 | grep -E "(Full sync|Pulled|Pushed|sync)"

echo ""

# --- Step 15: Prompt iOS sync, poll for expected items ---

echo ""
echo "=========================================="
echo "  Phase 2: Cross-Device Data Seeded"
echo "=========================================="
echo ""
echo "  New items seeded (no content matching — each device creates its own copy):"
echo "    - Cross-device URL (desktop + iOS): $CROSS_URL"
echo "    - Cross-device tagset (desktop + iOS): shared, tagset"
echo ""
echo "  Expected after all syncs: 10 items total"
echo "    6 original + 2 cross-device URLs + 2 cross-device tagsets"
echo "    (No content dedup — each device's copy is a separate item)"
echo ""
if [ "$HEADLESS" = true ]; then
    echo "  [HEADLESS] Relaunching iOS app to pick up seeded items and sync..."
    relaunch_ios_app "pick up Phase 2 seeded items + sync" "true"
    echo "  [HEADLESS] Polling server for 10 items..."
else
    echo "  Please tap 'Sync All' in the iOS simulator."
    echo "  Polling server for 10 items..."
fi
echo "=========================================="
echo ""

PHASE2_EXPECTED=10
POLL_TIMEOUT=300
POLL_INTERVAL=5
POLL_ELAPSED=0

echo "Waiting for server to have $PHASE2_EXPECTED items (polling every ${POLL_INTERVAL}s, timeout ${POLL_TIMEOUT}s)..."
while [ "$POLL_ELAPSED" -lt "$POLL_TIMEOUT" ]; do
    CURRENT=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM" \
        -H "Authorization: Bearer $API_KEY" \
        -H "X-Peek-Datastore-Version: 1" \
        -H "X-Peek-Protocol-Version: 1" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))" 2>/dev/null || echo "0")
    if [ "$CURRENT" -ge "$PHASE2_EXPECTED" ] 2>/dev/null; then
        echo "  Server has $CURRENT items — Phase 2 sync detected!"
        break
    fi
    echo "  ... $CURRENT / $PHASE2_EXPECTED items (${POLL_ELAPSED}s elapsed)"
    sleep "$POLL_INTERVAL"
    POLL_ELAPSED=$(($POLL_ELAPSED + $POLL_INTERVAL))
done

if [ "$POLL_ELAPSED" -ge "$POLL_TIMEOUT" ]; then
    echo "  TIMEOUT: Server still has $CURRENT items after ${POLL_TIMEOUT}s"
    echo "  Proceeding with verification anyway..."
fi

sleep 2

# --- Step 16: Trigger desktop re-sync (automated) ---

echo ""
echo "Step 16: Triggering desktop re-sync..."
cd "$PROJECT_DIR"
PROFILE="$DESKTOP_PROFILE" SERVER_URL="$SERVER_URL" API_KEY="$API_KEY" SERVER_PROFILE_ID="$SERVER_PROFILE_ID" SYNC_MODE=full electron scripts/preconfigure-sync.mjs 2>&1 | grep -E "(Full sync|Pulled|Pushed|sync)"

# --- Step 17: Verify 10 items on all platforms ---

echo ""
echo "=========================================="
echo "  Phase 2 Verification"
echo "=========================================="

# --- 17a: Server item count ---
SERVER_P2=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1")

SERVER_P2_COUNT=$(echo "$SERVER_P2" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))")
echo ""
echo "  SERVER: $SERVER_P2_COUNT / $PHASE2_EXPECTED items"
if [ "$SERVER_P2_COUNT" -eq "$PHASE2_EXPECTED" ]; then
    echo "    PASS"
else
    echo "    FAIL (expected $PHASE2_EXPECTED)"
    PHASE2_PASS=false
fi

# --- 17b: Desktop item count ---
DESKTOP_P2_COUNT=$(sqlite3 "$DESKTOP_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
echo ""
echo "  DESKTOP: $DESKTOP_P2_COUNT / $PHASE2_EXPECTED items"
if [ "$DESKTOP_P2_COUNT" -eq "$PHASE2_EXPECTED" ]; then
    echo "    PASS"
else
    echo "    FAIL (expected $PHASE2_EXPECTED)"
    PHASE2_PASS=false
fi

# --- 17c: iOS item count ---
IOS_P2_COUNT=$(sqlite3 "$IOS_DB" "SELECT COUNT(*) FROM items WHERE deleted_at IS NULL;")
echo ""
echo "  iOS: $IOS_P2_COUNT / $PHASE2_EXPECTED items"
if [ "$IOS_P2_COUNT" -eq "$PHASE2_EXPECTED" ]; then
    echo "    PASS"
else
    echo "    FAIL (expected $PHASE2_EXPECTED)"
    PHASE2_PASS=false
fi

# --- 17d: Cross-device URL appears twice (one from each device, no content dedup) ---
echo ""
echo "  Checking cross-device URL count..."
echo "$SERVER_P2" | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
cross_dev = [i for i in items if (i.get('content','') or '') == 'https://example.com/cross-device-url']
if len(cross_dev) == 2:
    print('    PASS: cross-device URL appears twice (one per device, no content dedup)')
else:
    print(f'    FAIL: cross-device URL appears {len(cross_dev)} times (expected 2)')
    sys.exit(1)
" || PHASE2_PASS=false

# --- 17e: Cross-device tagsets appear twice (no content dedup) ---
echo ""
echo "  Checking cross-device tagset count..."
echo "$SERVER_P2" | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
tagsets = [i for i in items if i.get('type') == 'tagset']
shared_tagsets = []
for ts in tagsets:
    raw_tags = ts.get('tags', [])
    tag_names = sorted(t if isinstance(t, str) else (t.get('name','') or t.get('slug','')) for t in raw_tags)
    if tag_names == ['shared', 'tagset']:
        shared_tagsets.append(ts)
if len(shared_tagsets) == 2:
    print('    PASS: shared/tagset tagsets appear twice (one per device, no content dedup)')
else:
    print(f'    FAIL: shared/tagset tagsets appear {len(shared_tagsets)} times (expected 2)')
    sys.exit(1)
" || PHASE2_PASS=false

# --- List all server items for debugging ---
echo ""
echo "  All server items:"
echo "$SERVER_P2" | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
for item in items:
    c = item.get('content','') or item.get('url','') or ''
    raw_tags = item.get('tags', [])
    tags = ', '.join(t if isinstance(t, str) else (t.get('name','') or t.get('slug','')) for t in raw_tags)
    print(f'    - {item[\"type\"]}: {c[:60]}  [{tags}]')
"

# --- Step 18: Re-sync stability (automated) ---

echo ""
echo "Step 18: Re-sync stability check..."
cd "$PROJECT_DIR"
RESYNC_OUTPUT=$(PROFILE="$DESKTOP_PROFILE" SERVER_URL="$SERVER_URL" API_KEY="$API_KEY" SERVER_PROFILE_ID="$SERVER_PROFILE_ID" SYNC_MODE=full electron scripts/preconfigure-sync.mjs 2>&1)
echo "$RESYNC_OUTPUT" | grep -E "(Full sync|Pulled|Pushed|sync)" || true

# Verify counts unchanged
DESKTOP_RESYNC=$(sqlite3 "$DESKTOP_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
echo "  Desktop items after re-sync: $DESKTOP_RESYNC"
if [ "$DESKTOP_RESYNC" -eq "$PHASE2_EXPECTED" ]; then
    echo "    PASS: Stable (no growth)"
else
    echo "    FAIL: Item count changed after re-sync (got $DESKTOP_RESYNC, expected $PHASE2_EXPECTED)"
    PHASE2_PASS=false
fi

# --- Phase 2 Final Result ---

echo ""
echo "=========================================="
if [ "$PHASE2_PASS" = true ]; then
    echo "  PHASE 2 PASS: All sync dedup scenarios verified"
    echo "  Total items: $PHASE2_EXPECTED (6 original + 2 cross-device URLs + 2 cross-device tagsets)"
else
    echo "  PHASE 2 FAIL (see above)"
fi
echo ""
echo "  NOTE: Content matching removed. Each device creates its own items."
echo "  NOTE: Delete propagation tested in Phase 4."
echo "=========================================="
echo ""

# ==========================================================================
#  PHASE 3: One-Time Dedup Cleanup Testing
# ==========================================================================
#
# Tests the dedup_cleanup_v1 migration that removes pre-existing duplicate
# items on each platform at startup. Seeds explicit duplicates into each
# database, clears the dedup flag, restarts each platform, and verifies
# duplicates were removed and the flag was set.

echo ""
echo "=========================================="
echo "  Phase 3: One-Time Dedup Cleanup"
echo "=========================================="
echo ""

PHASE3_PASS=true
SERVER_DB="$SERVER_TEMP_DIR/default/profiles/$SERVER_PROFILE_ID/datastore.sqlite"

# --- Step 19: Stop server and desktop ---

echo "Step 19: Stopping server and desktop for dedup seeding..."
kill "$DESKTOP_PID" 2>/dev/null || true
wait "$DESKTOP_PID" 2>/dev/null || true
DESKTOP_PID=""
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
SERVER_PID=""
echo "  Stopped."

# --- Step 20: Record counts and seed duplicates ---

echo ""
echo "Step 20: Seeding duplicate items into all three databases..."

SERVER_PRE=$(sqlite3 "$SERVER_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
DESKTOP_PRE=$(sqlite3 "$DESKTOP_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
IOS_PRE=$(sqlite3 "$IOS_DB" "SELECT COUNT(*) FROM items WHERE deleted_at IS NULL;")
echo "  Pre-seed counts: Server=$SERVER_PRE Desktop=$DESKTOP_PRE iOS=$IOS_PRE"

# SERVER duplicates (camelCase schema, content column for url+text)
sqlite3 "$SERVER_DB" << 'SQLEOF'
INSERT INTO items (id, type, content, metadata, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt)
VALUES
  ('dup-srv-url-1', 'url', 'https://example.com/server-origin-1', '', '', '', 0, 1000000, 1000000, 0),
  ('dup-srv-text-1', 'text', 'Note created on server', '', '', '', 0, 1000000, 1000000, 0);

-- Duplicate tagset: same tags as cross-device tagset (shared, tagset)
INSERT INTO items (id, type, content, metadata, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt)
VALUES ('dup-srv-tagset-1', 'tagset', NULL, '', '', '', 0, 1000000, 1000000, 0);

INSERT INTO item_tags (itemId, tagId, createdAt)
SELECT 'dup-srv-tagset-1', id, 1000000 FROM tags WHERE name IN ('shared', 'tagset');
SQLEOF
echo "  Seeded 3 duplicates into server DB"

# DESKTOP duplicates (camelCase schema, item_tags has id column)
sqlite3 "$DESKTOP_DB" << 'SQLEOF'
INSERT INTO items (id, type, content, metadata, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt)
VALUES
  ('dup-desk-url-1', 'url', 'https://example.com/desktop-origin-1', '{}', '', '', 0, 1000000, 1000000, 0),
  ('dup-desk-text-1', 'text', 'Note created on desktop', '{}', '', '', 0, 1000000, 1000000, 0);

-- Duplicate tagset
INSERT INTO items (id, type, content, metadata, syncId, syncSource, syncedAt, createdAt, updatedAt, deletedAt)
VALUES ('dup-desk-tagset-1', 'tagset', '', '{}', '', '', 0, 1000000, 1000000, 0);

INSERT INTO item_tags (id, itemId, tagId, createdAt)
SELECT 'it-dup-' || hex(randomblob(4)), 'dup-desk-tagset-1', id, 1000000
FROM tags WHERE name IN ('shared', 'tagset');
SQLEOF
echo "  Seeded 3 duplicates into desktop DB"

# iOS duplicates (snake_case schema, url column for url-type, content for text-type)
sqlite3 "$IOS_DB" << 'SQLEOF'
INSERT INTO items (id, type, url, content, metadata, sync_source, created_at, updated_at)
VALUES
  ('dup-ios-url-1', 'url', 'https://example.com/ios-origin-1', '', '', '', datetime('now'), datetime('now', '-1 day')),
  ('dup-ios-text-1', 'text', '', 'Note created on iOS', '', '', datetime('now'), datetime('now', '-1 day'));

-- Duplicate tagset
INSERT INTO items (id, type, url, content, metadata, sync_source, created_at, updated_at)
VALUES ('dup-ios-tagset-1', 'tagset', '', '', '', '', datetime('now'), datetime('now', '-1 day'));

INSERT INTO item_tags (item_id, tag_id, created_at)
SELECT 'dup-ios-tagset-1', id, datetime('now') FROM tags WHERE name IN ('shared', 'tagset');
SQLEOF
echo "  Seeded 3 duplicates into iOS DB"

# Verify counts went up
SERVER_SEEDED=$(sqlite3 "$SERVER_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
DESKTOP_SEEDED=$(sqlite3 "$DESKTOP_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
IOS_SEEDED=$(sqlite3 "$IOS_DB" "SELECT COUNT(*) FROM items WHERE deleted_at IS NULL;")
echo "  Post-seed counts: Server=$SERVER_SEEDED Desktop=$DESKTOP_SEEDED iOS=$IOS_SEEDED"

# --- Step 21: Clear dedup flags ---

echo ""
echo "Step 21: Clearing dedup_cleanup_v1 flags..."
sqlite3 "$SERVER_DB" "DELETE FROM settings WHERE key = 'dedup_cleanup_v1';"
sqlite3 "$DESKTOP_DB" "DELETE FROM settings WHERE key = 'dedup_cleanup_v1';"
sqlite3 "$IOS_DB" "DELETE FROM settings WHERE key = 'dedup_cleanup_v1';"
echo "  Cleared all dedup flags"

# --- Step 22: Restart server (triggers deduplicateAllUsers at startup) ---

echo ""
echo "Step 22: Restarting server (triggers dedup cleanup)..."
DATA_DIR="$SERVER_TEMP_DIR" PORT="$PORT" API_KEY="$API_KEY" node "$SERVER_DIR/index.js" &
SERVER_PID=$!

for i in {1..30}; do
    if curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; then
        echo "  Server restarted (PID $SERVER_PID)"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "  ERROR: Server failed to restart"
        exit 1
    fi
    sleep 0.5
done

# Verify server dedup
SERVER_POST=$(sqlite3 "$SERVER_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
SERVER_URL_TEXT_DUPS=$(sqlite3 "$SERVER_DB" "SELECT COUNT(*) FROM (SELECT type, content FROM items WHERE deletedAt = 0 AND type IN ('url','text') AND content IS NOT NULL AND content != '' GROUP BY type, content HAVING COUNT(*) > 1);")

echo "  Server after dedup: $SERVER_POST items (was $SERVER_SEEDED), $SERVER_URL_TEXT_DUPS url/text dup groups"
if [ "$SERVER_POST" -lt "$SERVER_SEEDED" ] && [ "$SERVER_URL_TEXT_DUPS" -eq 0 ]; then
    echo "    PASS: Server dedup removed duplicates ($SERVER_SEEDED -> $SERVER_POST)"
else
    echo "    FAIL: Server dedup issue (seeded=$SERVER_SEEDED now=$SERVER_POST dups=$SERVER_URL_TEXT_DUPS)"
    PHASE3_PASS=false
fi

# Verify flag is set
SERVER_FLAG=$(sqlite3 "$SERVER_DB" "SELECT value FROM settings WHERE key = 'dedup_cleanup_v1';")
if [ "$SERVER_FLAG" = "1" ]; then
    echo "    PASS: dedup_cleanup_v1 flag set on server"
else
    echo "    FAIL: dedup_cleanup_v1 flag not set on server (got '$SERVER_FLAG')"
    PHASE3_PASS=false
fi

# --- Step 23: Re-launch desktop headless (triggers migrateDeduplicateItems) ---

echo ""
echo "Step 23: Re-launching desktop (triggers dedup cleanup)..."
cd "$PROJECT_DIR"
PROFILE="$DESKTOP_PROFILE" PEEK_HEADLESS=1 DEBUG=1 electron . &
DESKTOP_PID=$!
sleep 3

DESKTOP_POST=$(sqlite3 "$DESKTOP_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
DESKTOP_URL_TEXT_DUPS=$(sqlite3 "$DESKTOP_DB" "SELECT COUNT(*) FROM (SELECT type, content FROM items WHERE deletedAt = 0 AND type IN ('url','text') AND content IS NOT NULL AND content != '' GROUP BY type, content HAVING COUNT(*) > 1);")

echo "  Desktop after dedup: $DESKTOP_POST items (was $DESKTOP_SEEDED), $DESKTOP_URL_TEXT_DUPS url/text dup groups"
if [ "$DESKTOP_POST" -lt "$DESKTOP_SEEDED" ] && [ "$DESKTOP_URL_TEXT_DUPS" -eq 0 ]; then
    echo "    PASS: Desktop dedup removed duplicates ($DESKTOP_SEEDED -> $DESKTOP_POST)"
else
    echo "    FAIL: Desktop dedup issue (seeded=$DESKTOP_SEEDED now=$DESKTOP_POST dups=$DESKTOP_URL_TEXT_DUPS)"
    PHASE3_PASS=false
fi

DESKTOP_FLAG=$(sqlite3 "$DESKTOP_DB" "SELECT value FROM settings WHERE key = 'dedup_cleanup_v1';")
if [ "$DESKTOP_FLAG" = "1" ]; then
    echo "    PASS: dedup_cleanup_v1 flag set on desktop"
else
    echo "    FAIL: dedup_cleanup_v1 flag not set on desktop (got '$DESKTOP_FLAG')"
    PHASE3_PASS=false
fi

# --- Step 24: iOS dedup (semi-automated — user must relaunch app) ---

echo ""
echo "Step 24: iOS dedup verification..."
if [ "$HEADLESS" = true ]; then
    echo "  [HEADLESS] Auto-relaunching iOS app to trigger dedup migration..."
    relaunch_ios_app "trigger dedup migration"
else
    echo "  Please force-quit and relaunch the iOS app in the simulator."
fi
echo "  The dedup migration runs in ensure_database_initialized() on startup."
echo "  Polling iOS database for dedup_cleanup_v1 flag..."

IOS_POLL_TIMEOUT=120
IOS_POLL_INTERVAL=3
IOS_POLL_ELAPSED=0

while [ "$IOS_POLL_ELAPSED" -lt "$IOS_POLL_TIMEOUT" ]; do
    IOS_FLAG=$(sqlite3 "$IOS_DB" "SELECT value FROM settings WHERE key = 'dedup_cleanup_v1';" 2>/dev/null || echo "")
    if [ "$IOS_FLAG" = "1" ]; then
        echo "  iOS dedup flag detected!"
        break
    fi
    echo "  ... waiting for iOS app restart (${IOS_POLL_ELAPSED}s elapsed)"
    sleep "$IOS_POLL_INTERVAL"
    IOS_POLL_ELAPSED=$(($IOS_POLL_ELAPSED + $IOS_POLL_INTERVAL))
done

if [ "$IOS_POLL_ELAPSED" -ge "$IOS_POLL_TIMEOUT" ]; then
    echo "  TIMEOUT: iOS dedup flag not detected after ${IOS_POLL_TIMEOUT}s"
fi

IOS_POST=$(sqlite3 "$IOS_DB" "SELECT COUNT(*) FROM items WHERE deleted_at IS NULL;")
IOS_URL_DUPS=$(sqlite3 "$IOS_DB" "SELECT COUNT(*) FROM (SELECT type, url FROM items WHERE deleted_at IS NULL AND type = 'url' AND url IS NOT NULL AND url != '' GROUP BY type, url HAVING COUNT(*) > 1);")
IOS_TEXT_DUPS=$(sqlite3 "$IOS_DB" "SELECT COUNT(*) FROM (SELECT type, content FROM items WHERE deleted_at IS NULL AND type = 'text' AND content IS NOT NULL AND content != '' GROUP BY type, content HAVING COUNT(*) > 1);")

echo "  iOS after dedup: $IOS_POST items (was $IOS_SEEDED), $IOS_URL_DUPS url dup groups, $IOS_TEXT_DUPS text dup groups"
if [ "$IOS_POST" -lt "$IOS_SEEDED" ] && [ "$IOS_URL_DUPS" -eq 0 ] && [ "$IOS_TEXT_DUPS" -eq 0 ]; then
    echo "    PASS: iOS dedup removed duplicates ($IOS_SEEDED -> $IOS_POST)"
else
    echo "    FAIL: iOS dedup issue (seeded=$IOS_SEEDED now=$IOS_POST url_dups=$IOS_URL_DUPS text_dups=$IOS_TEXT_DUPS)"
    PHASE3_PASS=false
fi

# --- Step 25: Idempotency — restart server again, verify no further changes ---

echo ""
echo "Step 25: Idempotency check (restart server, verify stable)..."
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

DATA_DIR="$SERVER_TEMP_DIR" PORT="$PORT" API_KEY="$API_KEY" node "$SERVER_DIR/index.js" &
SERVER_PID=$!

for i in {1..30}; do
    if curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; then break; fi
    if [ "$i" -eq 30 ]; then echo "  ERROR: Server failed to restart"; exit 1; fi
    sleep 0.5
done

SERVER_IDEM=$(sqlite3 "$SERVER_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
echo "  Server after second restart: $SERVER_IDEM items"
if [ "$SERVER_IDEM" -eq "$SERVER_POST" ]; then
    echo "    PASS: Idempotent (still $SERVER_IDEM items, flag prevented re-run)"
else
    echo "    FAIL: Not idempotent ($SERVER_POST -> $SERVER_IDEM after second restart)"
    PHASE3_PASS=false
fi

# --- Phase 3 Final Result ---

echo ""
echo "=========================================="
if [ "$PHASE3_PASS" = true ]; then
    echo "  PHASE 3 PASS: Dedup cleanup verified on all platforms"
    echo "    Server:  $SERVER_SEEDED -> $SERVER_POST items (duplicates removed)"
    echo "    Desktop: $DESKTOP_SEEDED -> $DESKTOP_POST items (duplicates removed)"
    echo "    iOS:     $IOS_SEEDED -> $IOS_POST items (duplicates removed)"
    echo "    Idempotency: confirmed (flag prevents re-run)"
else
    echo "  PHASE 3 FAIL (see above)"
fi
echo "=========================================="
echo ""

# ==========================================================================
#  PHASE 4: Delete Propagation Testing (Tombstone Sync)
# ==========================================================================
#
# Tests that deleting an item on one platform propagates to all others:
# 1. Delete an item on desktop → sync → verify server has tombstone
# 2. iOS pulls tombstone → verify item soft-deleted on iOS
# 3. Delete a different item on iOS → sync → verify server has tombstone
# 4. Desktop pulls tombstone → verify item soft-deleted on desktop

echo ""
echo "=========================================="
echo "  Phase 4: Delete Propagation (Tombstone Sync)"
echo "=========================================="
echo ""

PHASE4_PASS=true

# Record pre-delete counts
SERVER_PRE_DEL=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))")
DESKTOP_PRE_DEL=$(sqlite3 "$DESKTOP_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
echo "  Pre-delete counts: Server=$SERVER_PRE_DEL Desktop=$DESKTOP_PRE_DEL"

# --- Step 26: Delete an item on desktop ---

echo ""
echo "Step 26: Deleting an item on desktop..."

# Pick a desktop-origin item to delete
DEL_DESKTOP_ID=$(sqlite3 "$DESKTOP_DB" "SELECT id FROM items WHERE deletedAt = 0 AND content LIKE '%desktop-origin%' LIMIT 1;")
DEL_DESKTOP_CONTENT=$(sqlite3 "$DESKTOP_DB" "SELECT content FROM items WHERE id = '$DEL_DESKTOP_ID';")
echo "  Deleting desktop item: $DEL_DESKTOP_ID ($DEL_DESKTOP_CONTENT)"

# Soft-delete it
DESKTOP_DEL_TS=$(python3 -c "import time; print(int(time.time() * 1000))")
sqlite3 "$DESKTOP_DB" "UPDATE items SET deletedAt = $DESKTOP_DEL_TS, updatedAt = $DESKTOP_DEL_TS WHERE id = '$DEL_DESKTOP_ID';"

DESKTOP_AFTER_DEL=$(sqlite3 "$DESKTOP_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
echo "  Desktop items after delete: $DESKTOP_AFTER_DEL (was $DESKTOP_PRE_DEL)"

# --- Step 27: Desktop sync pushes tombstone to server ---

echo ""
echo "Step 27: Desktop sync (pushes tombstone to server)..."
cd "$PROJECT_DIR"
PROFILE="$DESKTOP_PROFILE" SERVER_URL="$SERVER_URL" API_KEY="$API_KEY" SERVER_PROFILE_ID="$SERVER_PROFILE_ID" SYNC_MODE=full electron scripts/preconfigure-sync.mjs 2>&1 | grep -E "(Full sync|Pulled|Pushed|sync)" || true

# Verify server has the tombstone
SERVER_AFTER_DESKTOP_DEL=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))")

echo "  Server active items after desktop delete: $SERVER_AFTER_DESKTOP_DEL (was $SERVER_PRE_DEL)"

# Check that server has the deleted item with deleted_at > 0
SERVER_DEL_SYNC_ID=$(sqlite3 "$DESKTOP_DB" "SELECT syncId FROM items WHERE id = '$DEL_DESKTOP_ID';")
echo "  Looking for tombstone with sync_id: $SERVER_DEL_SYNC_ID (or item ID: $DEL_DESKTOP_ID)"

# Check server DB for the tombstone
SERVER_TOMBSTONE=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM&includeDeleted=true" \
    -H "Authorization: Bearer $API_KEY" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
tombstones = [i for i in items if i.get('deletedAt', 0) > 0]
print(len(tombstones))
")
echo "  Server tombstones: $SERVER_TOMBSTONE"

if [ "$SERVER_AFTER_DESKTOP_DEL" -lt "$SERVER_PRE_DEL" ] || [ "$SERVER_TOMBSTONE" -gt 0 ]; then
    echo "    PASS: Server received desktop deletion"
else
    echo "    FAIL: Server did not register desktop deletion"
    PHASE4_PASS=false
fi

# --- Step 28: iOS pulls tombstone ---

echo ""
echo "=========================================="
if [ "$HEADLESS" = true ]; then
    echo "  [HEADLESS] Relaunching iOS app with auto-sync to pull tombstone..."
    relaunch_ios_app "pull desktop deletion tombstone" "true"
else
    echo "  Please tap 'Sync All' in the iOS simulator to pull the tombstone."
fi
echo "  Polling iOS database for the deleted item..."
echo "=========================================="

IOS_DEL_POLL_TIMEOUT=120
IOS_DEL_POLL_INTERVAL=5
IOS_DEL_POLL_ELAPSED=0

# Look for the desktop-deleted item appearing as deleted on iOS
while [ "$IOS_DEL_POLL_ELAPSED" -lt "$IOS_DEL_POLL_TIMEOUT" ]; do
    IOS_DEL_COUNT=$(sqlite3 "$IOS_DB" "SELECT COUNT(*) FROM items WHERE deleted_at IS NOT NULL;" 2>/dev/null || echo "0")
    if [ "$IOS_DEL_COUNT" -gt 0 ] 2>/dev/null; then
        echo "  iOS has $IOS_DEL_COUNT soft-deleted items — tombstone received!"
        break
    fi
    echo "  ... iOS has $IOS_DEL_COUNT soft-deleted items (${IOS_DEL_POLL_ELAPSED}s elapsed)"
    sleep "$IOS_DEL_POLL_INTERVAL"
    IOS_DEL_POLL_ELAPSED=$(($IOS_DEL_POLL_ELAPSED + $IOS_DEL_POLL_INTERVAL))
done

if [ "$IOS_DEL_POLL_ELAPSED" -ge "$IOS_DEL_POLL_TIMEOUT" ]; then
    echo "  TIMEOUT: iOS did not receive tombstone after ${IOS_DEL_POLL_TIMEOUT}s"
    PHASE4_PASS=false
else
    echo "    PASS: iOS received desktop deletion tombstone"
fi

# --- Step 29: Delete an item on iOS ---
#
# We must terminate the iOS app BEFORE modifying the database externally.
# The running app has its own SQLite connection (WAL mode) and won't see
# external writes. After modifying, we checkpoint the WAL and relaunch.

echo ""
echo "Step 29: Terminating iOS app before modifying database..."
xcrun simctl terminate booted "$IOS_BUNDLE_ID" 2>/dev/null || true
sleep 2

# Pick an iOS-origin item to delete
IOS_DEL_ID=$(sqlite3 "$IOS_DB" "SELECT id FROM items WHERE deleted_at IS NULL AND id LIKE 'ios-e2e%' LIMIT 1;" 2>/dev/null)
IOS_DEL_CONTENT=$(sqlite3 "$IOS_DB" "SELECT COALESCE(url, content) FROM items WHERE id = '$IOS_DEL_ID';" 2>/dev/null)
echo "  Deleting iOS item: $IOS_DEL_ID ($IOS_DEL_CONTENT)"

# Use RFC 3339 timestamp (same format the iOS app uses: Utc::now().to_rfc3339())
# SQLite's datetime('now') produces 'YYYY-MM-DD HH:MM:SS' which parse_from_rfc3339() rejects
IOS_RFC3339_NOW=$(python3 -c "from datetime import datetime, timezone; print(datetime.now(timezone.utc).isoformat())")
sqlite3 "$IOS_DB" "UPDATE items SET deleted_at = '$IOS_RFC3339_NOW', updated_at = '$IOS_RFC3339_NOW' WHERE id = '$IOS_DEL_ID';"

# Checkpoint WAL to ensure data is in the main DB file for next app launch
sqlite3 "$IOS_DB" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true

IOS_ACTIVE=$(sqlite3 "$IOS_DB" "SELECT COUNT(*) FROM items WHERE deleted_at IS NULL;")
IOS_DELETED=$(sqlite3 "$IOS_DB" "SELECT COUNT(*) FROM items WHERE deleted_at IS NOT NULL;")
echo "  iOS items: $IOS_ACTIVE active, $IOS_DELETED deleted"

# --- Step 30: iOS sync pushes tombstone to server ---

echo ""
echo "=========================================="
if [ "$HEADLESS" = true ]; then
    echo "  [HEADLESS] Relaunching iOS app with PEEK_AUTO_SYNC=true to push tombstone..."
    relaunch_ios_app "pick up DB changes + auto-sync tombstone" "true"
else
    echo "  Please relaunch the iOS app in the simulator and tap 'Sync All'"
    echo "  to push the tombstone. (App was terminated to pick up DB changes.)"
fi
echo "  Polling server for updated deletion count..."
echo "=========================================="

SERVER_TOMB_POLL_TIMEOUT=120
SERVER_TOMB_POLL_INTERVAL=5
SERVER_TOMB_POLL_ELAPSED=0
EXPECTED_TOMBSTONES=2  # One from desktop + one from iOS

while [ "$SERVER_TOMB_POLL_ELAPSED" -lt "$SERVER_TOMB_POLL_TIMEOUT" ]; do
    CURRENT_TOMBS=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM&includeDeleted=true" \
        -H "Authorization: Bearer $API_KEY" \
        -H "X-Peek-Datastore-Version: 1" \
        -H "X-Peek-Protocol-Version: 1" 2>/dev/null | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
tombstones = [i for i in items if i.get('deletedAt', 0) > 0]
print(len(tombstones))
" 2>/dev/null || echo "0")
    if [ "$CURRENT_TOMBS" -ge "$EXPECTED_TOMBSTONES" ] 2>/dev/null; then
        echo "  Server has $CURRENT_TOMBS tombstones — iOS push detected!"
        break
    fi
    echo "  ... $CURRENT_TOMBS / $EXPECTED_TOMBSTONES tombstones (${SERVER_TOMB_POLL_ELAPSED}s elapsed)"
    sleep "$SERVER_TOMB_POLL_INTERVAL"
    SERVER_TOMB_POLL_ELAPSED=$(($SERVER_TOMB_POLL_ELAPSED + $SERVER_TOMB_POLL_INTERVAL))
done

if [ "$SERVER_TOMB_POLL_ELAPSED" -ge "$SERVER_TOMB_POLL_TIMEOUT" ]; then
    echo "  TIMEOUT: Server did not receive iOS tombstone after ${SERVER_TOMB_POLL_TIMEOUT}s"
    PHASE4_PASS=false
else
    echo "    PASS: Server received iOS deletion tombstone"
fi

# --- Step 31: Desktop pulls iOS tombstone ---

echo ""
echo "Step 31: Desktop sync (pulls iOS tombstone)..."
cd "$PROJECT_DIR"
PROFILE="$DESKTOP_PROFILE" SERVER_URL="$SERVER_URL" API_KEY="$API_KEY" SERVER_PROFILE_ID="$SERVER_PROFILE_ID" SYNC_MODE=full electron scripts/preconfigure-sync.mjs 2>&1 | grep -E "(Full sync|Pulled|Pushed|sync)" || true

DESKTOP_FINAL_ACTIVE=$(sqlite3 "$DESKTOP_DB" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")
DESKTOP_FINAL_DELETED=$(sqlite3 "$DESKTOP_DB" "SELECT COUNT(*) FROM items WHERE deletedAt > 0;")
echo "  Desktop items: $DESKTOP_FINAL_ACTIVE active, $DESKTOP_FINAL_DELETED deleted"

if [ "$DESKTOP_FINAL_DELETED" -ge 2 ]; then
    echo "    PASS: Desktop received both tombstones"
else
    echo "    FAIL: Desktop should have at least 2 deleted items (got $DESKTOP_FINAL_DELETED)"
    PHASE4_PASS=false
fi

# --- Step 32: Verify final counts match across platforms ---

echo ""
echo "Step 32: Final cross-platform verification..."

SERVER_FINAL_ALL=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM&includeDeleted=true" \
    -H "Authorization: Bearer $API_KEY" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
active = len([i for i in items if i.get('deletedAt', 0) == 0])
deleted = len([i for i in items if i.get('deletedAt', 0) > 0])
print(f'{active} active, {deleted} deleted')
")
echo "  Server: $SERVER_FINAL_ALL"
echo "  Desktop: $DESKTOP_FINAL_ACTIVE active, $DESKTOP_FINAL_DELETED deleted"

IOS_FINAL_ACTIVE=$(sqlite3 "$IOS_DB" "SELECT COUNT(*) FROM items WHERE deleted_at IS NULL;")
IOS_FINAL_DELETED=$(sqlite3 "$IOS_DB" "SELECT COUNT(*) FROM items WHERE deleted_at IS NOT NULL;")
echo "  iOS: $IOS_FINAL_ACTIVE active, $IOS_FINAL_DELETED deleted"

# --- Phase 4 Final Result ---

echo ""
echo "=========================================="
if [ "$PHASE4_PASS" = true ]; then
    echo "  PHASE 4 PASS: Delete propagation verified"
    echo "    Desktop delete → Server tombstone → iOS soft-delete"
    echo "    iOS delete → Server tombstone → Desktop soft-delete"
else
    echo "  PHASE 4 FAIL (see above)"
fi
echo "=========================================="
echo ""

# --- Overall result ---
echo ""
echo "=========================================="
if [ "$PASS" = true ] && [ "$PHASE2_PASS" = true ] && [ "$PHASE3_PASS" = true ] && [ "$PHASE4_PASS" = true ]; then
    echo "  OVERALL RESULT: PASS (Phase 1 + Phase 2 + Phase 3 + Phase 4)"
else
    echo "  OVERALL RESULT: FAIL"
    [ "$PASS" != true ] && echo "    Phase 1: FAIL"
    [ "$PHASE2_PASS" != true ] && echo "    Phase 2: FAIL"
    [ "$PHASE3_PASS" != true ] && echo "    Phase 3: FAIL"
    [ "$PHASE4_PASS" != true ] && echo "    Phase 4: FAIL"
fi
echo "=========================================="
echo ""

# Exit triggers cleanup trap which stops server/desktop and restores iOS data
exit 0
