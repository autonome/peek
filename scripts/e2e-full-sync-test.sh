#!/bin/bash
# Full E2E Sync Test: Server + Desktop (headless) + iOS Simulator
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

echo "=========================================="
echo "  Full E2E Sync Test (Clean Room)"
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

# --- Step 1: Build desktop ---

echo "Step 1: Building desktop..."
cd "$PROJECT_DIR"
yarn build
echo "  Build complete"

# --- Step 2: Find and wipe iOS simulator data ---

echo ""
echo "Step 2: Preparing iOS simulator (clean room)..."

APP_GROUP=$(xcrun simctl get_app_container booted com.dietrich.peek-mobile groups 2>/dev/null | grep "group.com.dietrich.peek-mobile" | awk '{print $2}')

if [ -z "$APP_GROUP" ]; then
    echo "  WARNING: iOS app not installed in simulator."
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
            "lastUsedAt": "2026-01-27T00:00:00.000Z",
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
    last_used TEXT NOT NULL,
    frecency_score REAL NOT NULL DEFAULT 0.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
CREATE INDEX IF NOT EXISTS idx_tags_frecency ON tags(frecency_score DESC);
CREATE INDEX IF NOT EXISTS idx_blobs_item ON blobs(item_id);

-- Seed iOS-origin items
INSERT INTO items (id, type, url, content, metadata, sync_source, created_at, updated_at)
VALUES
  ('ios-e2e-url-1', 'url', 'https://example.com/ios-origin-1', '', '', '', datetime('now'), datetime('now')),
  ('ios-e2e-note-1', 'text', '', 'Note created on iOS', '', '', datetime('now'), datetime('now'));

-- Tags
INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at)
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

# --- Step 10: Open Xcode ---

echo ""
echo "Step 10: Opening Xcode..."
open "$XCODE_PROJECT"

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
echo "  iOS test steps:"
echo "    1. Build & run in Xcode (Debug, iPhone simulator)"
echo "    2. Force-quit and relaunch app (pick up profiles.json)"
echo "    3. Tap 'Sync All'"
echo "       → should pull server + desktop items"
echo "       → should push iOS items to server"
echo "    4. Check expected total: $(($SERVER_COUNT + $DESKTOP_LOCAL + $IOS_COUNT)) items"
echo ""
echo "  Verify server items:"
echo "    curl -s 'http://localhost:$PORT/items?profile=$SERVER_PROFILE_ID' \\"
echo "      -H 'Authorization: Bearer $API_KEY' | python3 -m json.tool"
echo ""
echo "  Waiting for iOS to sync (polling server for $((SERVER_COUNT + DESKTOP_LOCAL + IOS_COUNT)) items)..."
echo "  Press Ctrl+C at any time to stop and clean up."
echo "=========================================="
echo ""

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

# --- Final result ---
echo ""
echo "=========================================="
if [ "$PASS" = true ]; then
    echo "  ALL PLATFORMS VERIFIED: $EXPECTED items each"
    echo "  RESULT: PASS"
else
    echo "  RESULT: FAIL (see above)"
fi
echo "=========================================="
echo ""

# Exit triggers cleanup trap which stops server/desktop and restores iOS data
exit 0
