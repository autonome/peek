#!/bin/bash
# iOS Simulator E2E Sync Test Setup
#
# Usage: ./scripts/ios-sync-test.sh
#
# This script:
# 1. Starts a local server with fresh temp data
# 2. Creates a server profile (gets UUID for folder-based routing)
# 3. Seeds test items on the server
# 4. Finds the iOS simulator app container
# 5. Pre-configures profiles.json with server URL, API key, server_profile_id
# 6. Clears last_sync timestamps for a fresh pull
# 7. Opens Xcode (build & run from there)
#
# The server keeps running until you press Ctrl+C.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_DIR/backend/server"
TAURI_DIR="$PROJECT_DIR/backend/tauri-mobile"
XCODE_PROJECT="$TAURI_DIR/src-tauri/gen/apple/peek-save.xcodeproj"

# --- Configuration ---

PORT="${PORT:-3459}"
API_KEY="ios-e2e-key-$(date +%s)"
SERVER_TEMP_DIR="$(mktemp -d /tmp/e2e-peek-ios-XXXXXX)"

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
SERVER_URL="http://$LOCAL_IP:$PORT"

echo "=========================================="
echo "  iOS E2E Sync Test Setup"
echo "=========================================="
echo ""
echo "  Server URL:  $SERVER_URL"
echo "  API Key:     $API_KEY"
echo "  Data dir:    $SERVER_TEMP_DIR"
echo ""

# --- Cleanup trap ---

SERVER_PID=""
cleanup() {
    echo ""
    echo "Cleaning up..."
    if [ -n "$SERVER_PID" ]; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
        echo "  Stopped server (PID $SERVER_PID)"
    fi
    rm -rf "$SERVER_TEMP_DIR"
    echo "  Removed $SERVER_TEMP_DIR"
}
trap cleanup EXIT

# --- Step 1: Start server ---

echo "Step 1: Starting server..."
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

# --- Step 2: Create server profile ---

echo ""
echo "Step 2: Creating server profile..."
PROFILE_RESP=$(curl -sf -X POST "http://localhost:$PORT/profiles" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"name":"Default"}')

SERVER_PROFILE_ID=$(echo "$PROFILE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['profile']['id'])")
echo "  Server profile ID: $SERVER_PROFILE_ID"

# --- Step 3: Seed test data ---

echo ""
echo "Step 3: Seeding test data..."

PROFILE_PARAM="profile=$SERVER_PROFILE_ID"
VER_HEADERS='-H "X-Peek-Datastore-Version: 1" -H "X-Peek-Protocol-Version: 1"'

curl -sf -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" \
    -d '{"type":"url","content":"https://example.com/from-server","tags":["server","test"]}' > /dev/null

curl -sf -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" \
    -d '{"type":"url","content":"https://github.com/anthropics/claude-code","tags":["github","ai"]}' > /dev/null

curl -sf -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" \
    -d '{"type":"text","content":"Server test note for e2e sync","tags":["note","test"]}' > /dev/null

curl -sf -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" \
    -d '{"type":"url","content":"https://news.ycombinator.com","tags":["news","tech"]}' > /dev/null

echo "  Seeded 4 items on server"

# Verify
ITEM_COUNT=$(curl -sf "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))")
echo "  Verified: $ITEM_COUNT items on server"

# --- Step 4: Find iOS simulator app container ---

echo ""
echo "Step 4: Configuring iOS simulator..."

APP_GROUP=$(xcrun simctl get_app_container booted com.dietrich.peek-mobile groups 2>/dev/null | grep "group.com.dietrich.peek-mobile" | awk '{print $2}')

if [ -z "$APP_GROUP" ]; then
    echo "  WARNING: iOS app not installed in simulator."
    echo "  Build and run the app once from Xcode, then re-run this script."
    echo ""
    echo "  Opening Xcode anyway so you can build..."
    open "$XCODE_PROJECT"
    echo ""
    echo "  Server is running. Press Ctrl+C to stop."
    wait "$SERVER_PID"
    exit 0
fi

PROFILES_JSON="$APP_GROUP/profiles.json"
echo "  App container: $APP_GROUP"

# --- Step 5: Update profiles.json ---

echo ""
echo "Step 5: Updating profiles.json..."

python3 << PYEOF
import json, os

path = "$PROFILES_JSON"

# Read existing config or create minimal one
config = {"profiles": [], "currentProfileId": ""}
if os.path.exists(path):
    try:
        with open(path) as f:
            config = json.load(f)
    except Exception:
        pass

# Update every profile entry with our test server settings
for p in config.get("profiles", []):
    p["server_url"] = "$SERVER_URL"
    p["api_key"] = "$API_KEY"
    p["server_profile_id"] = "$SERVER_PROFILE_ID"

# Update global sync settings
config["sync"] = {
    "server_url": "$SERVER_URL",
    "api_key": "$API_KEY",
    "auto_sync": False
}

with open(path, "w") as f:
    json.dump(config, f, indent=2)

n_profiles = len(config.get("profiles", []))
current = config.get("currentProfileId", "?")
print(f"  Updated {n_profiles} profile(s)")
print(f"  Current profile: {current}")
print(f"  Server profile ID: $SERVER_PROFILE_ID")
PYEOF

# --- Step 6: Clear last_sync ---

echo ""
echo "Step 6: Clearing last_sync timestamps..."

for dbfile in "$APP_GROUP"/peek-*.db; do
    if [ -f "$dbfile" ]; then
        sqlite3 "$dbfile" "DELETE FROM settings WHERE key = 'last_sync';" 2>/dev/null || true
        echo "  Cleared last_sync in $(basename "$dbfile")"
    fi
done

# --- Step 7: Open Xcode ---

echo ""
echo "Step 7: Opening Xcode..."
open "$XCODE_PROJECT"

# --- Summary ---

echo ""
echo "=========================================="
echo "  Ready for E2E Sync Testing"
echo "=========================================="
echo ""
echo "  Server:             $SERVER_URL"
echo "  API Key:            $API_KEY"
echo "  Server Profile ID:  $SERVER_PROFILE_ID"
echo "  Items on server:    $ITEM_COUNT"
echo ""
echo "  Test steps:"
echo "    1. Build & run in Xcode (Debug, iPhone simulator)"
echo "    2. Force-quit and relaunch app (to pick up profiles.json)"
echo "    3. Go to Settings → verify server URL"
echo "    4. Tap 'Sync All' → should pull $ITEM_COUNT items"
echo "    5. Add a local item, tap Push → verify on server"
echo ""
echo "  Verify server items:"
echo "    curl -s 'http://localhost:$PORT/items?profile=$SERVER_PROFILE_ID' \\"
echo "      -H 'Authorization: Bearer $API_KEY' | python3 -m json.tool"
echo ""
echo "  Server is running. Press Ctrl+C to stop."
echo "=========================================="
echo ""

wait "$SERVER_PID"
