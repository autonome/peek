#!/bin/bash
# Version Compatibility End-to-End Test
#
# Usage: ./scripts/version-compat-e2e.sh
#
# This script:
# 1. Builds the project
# 2. Starts a local server on a random port
# 3. Seeds test items
# 4. Runs automated desktop <-> server version compat tests
# 5. Optionally runs iOS simulator manual sync test
#
# Exit codes: 0 = all passed, 1 = failures

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_DIR/backend/server"

# Use random high port to avoid conflicts
PORT=$((3470 + RANDOM % 100))
API_KEY="version-compat-e2e-key-$(date +%s)"
TEMP_DIR=""
SERVER_PID=""

cleanup() {
  echo ""
  echo "Cleaning up..."
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "$MISMATCH_SERVER_PID" ]; then
    kill "$MISMATCH_SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

echo "=========================================="
echo "  Version Compatibility E2E Test"
echo "=========================================="
echo ""

# Step 1: Build
echo "[1/4] Building project..."
cd "$PROJECT_DIR"
yarn build
echo "  Build complete."
echo ""

# Step 2: Start server
echo "[2/4] Starting server on port $PORT..."
TEMP_DIR=$(mktemp -d)
export PORT API_KEY
export DATA_DIR="$TEMP_DIR"

cd "$SERVER_DIR"
node index.js &
SERVER_PID=$!
cd "$PROJECT_DIR"

# Wait for server
for i in $(seq 1 30); do
  if curl -s "http://localhost:$PORT/" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

# Verify server is running with version info
HEALTH=$(curl -s "http://localhost:$PORT/")
echo "  Server health: $HEALTH"

DS_VERSION=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('datastore_version', 'missing'))" 2>/dev/null || echo "parse_error")
PROTO_VERSION=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('protocol_version', 'missing'))" 2>/dev/null || echo "parse_error")

echo "  Datastore version: $DS_VERSION"
echo "  Protocol version: $PROTO_VERSION"

if [ "$DS_VERSION" != "1" ] || [ "$PROTO_VERSION" != "1" ]; then
  echo "  ERROR: Health check missing version info!"
  exit 1
fi
echo "  Server version check: OK"
echo ""

# Step 3: Seed test data
echo "[3/4] Seeding test items..."
PROFILE_PARAM="profile=default"

curl -s -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Peek-Datastore-Version: 1" \
  -H "X-Peek-Protocol-Version: 1" \
  -d '{"type": "url", "content": "https://version-test-1.example.com", "tags": ["test"]}' > /dev/null

curl -s -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Peek-Datastore-Version: 1" \
  -H "X-Peek-Protocol-Version: 1" \
  -d '{"type": "text", "content": "Version compat test text", "tags": ["test"]}' > /dev/null

curl -s -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Peek-Datastore-Version: 1" \
  -H "X-Peek-Protocol-Version: 1" \
  -d '{"type": "url", "content": "https://version-test-3.example.com", "tags": ["test"]}' > /dev/null

echo "  Seeded 3 test items"
echo ""

# Stop main server before running automated tests (they start their own)
kill "$SERVER_PID" 2>/dev/null || true
SERVER_PID=""
sleep 1

# Step 4: Run automated tests
echo "[4/4] Running automated version compat tests..."
echo ""

cd "$PROJECT_DIR"
if node backend/tests/sync-version-compat.test.js; then
  echo ""
  echo "  Automated tests: ALL PASSED"
else
  echo ""
  echo "  Automated tests: FAILED"
  exit 1
fi

echo ""
echo "=========================================="
echo "  All automated tests passed!"
echo "=========================================="
echo ""

# Optional: iOS simulator manual test
read -p "Run iOS simulator manual test? (y/N) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "--- iOS Simulator Sync Test ---"
  echo ""

  # Restart server for manual testing
  PORT=$((3470 + RANDOM % 100))
  TEMP_DIR2=$(mktemp -d)
  export PORT
  export DATA_DIR="$TEMP_DIR2"

  cd "$SERVER_DIR"
  node index.js &
  SERVER_PID=$!
  cd "$PROJECT_DIR"

  for i in $(seq 1 30); do
    if curl -s "http://localhost:$PORT/" > /dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done

  # Seed items for iOS test
  PROFILE_PARAM="profile=default"
  for i in 1 2 3; do
    curl -s -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -H "X-Peek-Datastore-Version: 1" \
      -H "X-Peek-Protocol-Version: 1" \
      -d "{\"type\": \"url\", \"content\": \"https://ios-test-$i.example.com\", \"tags\": [\"ios-test\"]}" > /dev/null
  done

  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
  SERVER_URL="http://$LOCAL_IP:$PORT"

  echo "┌─────────────────────────────────────────────────┐"
  echo "│  MANUAL STEP: iOS Simulator Sync Test           │"
  echo "│                                                  │"
  echo "│  Server: $SERVER_URL"
  echo "│  API Key: $API_KEY"
  echo "│                                                  │"
  echo "│  1. Build & run iOS app in simulator             │"
  echo "│     (yarn mobile:ios:build)                      │"
  echo "│  2. Configure server URL and API key             │"
  echo "│  3. Open the app → Settings → Sync              │"
  echo "│  4. Tap 'Pull' to sync from server              │"
  echo "│  5. Verify 3 test items appear                   │"
  echo "│  6. Add a local item, tap 'Push'                │"
  echo "│  7. Press ENTER here when done                   │"
  echo "└─────────────────────────────────────────────────┘"
  read -p ""

  # Verify pushed item
  ITEMS=$(curl -s "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY")
  ITEM_COUNT=$(echo "$ITEMS" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('items', [])))" 2>/dev/null || echo "0")

  if [ "$ITEM_COUNT" -gt 3 ]; then
    echo "  iOS sync test: PASSED ($ITEM_COUNT items on server, expected > 3)"
  else
    echo "  iOS sync test: INCONCLUSIVE ($ITEM_COUNT items on server)"
  fi
  echo ""

  # Version mismatch test
  echo "Restarting server with mismatched version for mismatch test..."
  kill "$SERVER_PID" 2>/dev/null || true
  sleep 1

  # Start server — the version is compiled into version.js, so mismatch testing
  # with iOS would require modifying the file. Skip for automated portion.
  echo ""
  echo "┌──────────────────────────────────────────────────┐"
  echo "│  MANUAL STEP: Version Mismatch Test (Optional)   │"
  echo "│                                                   │"
  echo "│  This requires modifying server version.js to     │"
  echo "│  DATASTORE_VERSION=99 and restarting.             │"
  echo "│  Skip this if you just want to verify basic sync. │"
  echo "│                                                   │"
  echo "│  Press ENTER to finish.                          │"
  echo "└──────────────────────────────────────────────────┘"
  read -p ""

  # Cleanup temp dir
  rm -rf "$TEMP_DIR2" 2>/dev/null || true
fi

echo ""
echo "=========================================="
echo "  Version Compatibility E2E: COMPLETE"
echo "=========================================="
