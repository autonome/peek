#!/bin/bash
# Desktop + Server sync test environment
# Creates temp profile for desktop and temp data dir for server
# Pre-configures sync settings and runs initial sync
# Cleans up everything on exit

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$ROOT_DIR/backend/server"

# Generate unique identifiers
TIMESTAMP=$(date +%s)
PROFILE_NAME="test-sync-$TIMESTAMP"
SERVER_TEMP_DIR=$(mktemp -d)
API_KEY="test-sync-key-$TIMESTAMP"
PORT=$((RANDOM % 10000 + 20000))
SERVER_URL="http://localhost:$PORT"

# Get userData path (macOS)
USER_DATA_PATH="$HOME/Library/Application Support/Peek"
PROFILE_DIR="$USER_DATA_PATH/$PROFILE_NAME"

echo "=========================================="
echo "  Desktop + Server Sync Test Environment"
echo "=========================================="
echo ""
echo "Profile:     $PROFILE_NAME"
echo "Profile dir: $PROFILE_DIR"
echo "Server temp: $SERVER_TEMP_DIR"
echo "Server URL:  $SERVER_URL"
echo "API Key:     $API_KEY"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "Cleaning up..."

    # Kill background processes
    if [ -n "$SERVER_PID" ]; then
        echo "  Stopping server (PID: $SERVER_PID)..."
        kill $SERVER_PID 2>/dev/null || true
    fi

    if [ -n "$DESKTOP_PID" ]; then
        echo "  Stopping desktop (PID: $DESKTOP_PID)..."
        kill $DESKTOP_PID 2>/dev/null || true
    fi

    # Wait for processes to exit
    sleep 1

    # Remove temp directories
    if [ -d "$SERVER_TEMP_DIR" ]; then
        echo "  Removing server temp dir: $SERVER_TEMP_DIR"
        rm -rf "$SERVER_TEMP_DIR"
    fi

    if [ -d "$PROFILE_DIR" ]; then
        echo "  Removing profile dir: $PROFILE_DIR"
        rm -rf "$PROFILE_DIR"
    fi

    echo "Cleanup complete."
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Build first
echo "Building..."
cd "$ROOT_DIR"
yarn build

# Start server
echo ""
echo "Starting server..."
cd "$SERVER_DIR"
DATA_DIR="$SERVER_TEMP_DIR" API_KEY="$API_KEY" PORT="$PORT" node index.js &
SERVER_PID=$!
echo "  Server started (PID: $SERVER_PID)"

# Wait for server to be ready
echo "  Waiting for server..."
for i in {1..30}; do
    if curl -s "$SERVER_URL/" > /dev/null 2>&1; then
        echo "  Server is ready"
        break
    fi
    sleep 0.1
done

# Seed test data on server
echo ""
echo "Seeding test data on server..."
curl -s -X POST "$SERVER_URL/items" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type":"url","content":"https://example.com/synced-url-1","tags":["test","synced"],"metadata":{"title":"Example Synced URL"}}' > /dev/null

curl -s -X POST "$SERVER_URL/items" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type":"url","content":"https://github.com/test/repo","tags":["test","github"],"metadata":{"title":"Test Repository - GitHub"}}' > /dev/null

curl -s -X POST "$SERVER_URL/items" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type":"text","content":"This is a synced text note","tags":["test","note"]}' > /dev/null

echo "  Seeded 3 test items"

# Pre-configure sync and run initial sync (must use electron, not node, for better-sqlite3)
echo ""
echo "Pre-configuring sync and running initial sync..."
cd "$ROOT_DIR"
PROFILE="$PROFILE_NAME" SERVER_URL="$SERVER_URL" API_KEY="$API_KEY" electron scripts/preconfigure-sync.mjs

# Start desktop with temp profile
echo ""
echo "Starting desktop with profile: $PROFILE_NAME"
cd "$ROOT_DIR"
PROFILE="$PROFILE_NAME" DEBUG=1 electron . &
DESKTOP_PID=$!
echo "  Desktop started (PID: $DESKTOP_PID)"

# Print instructions
echo ""
echo "=========================================="
echo "  Test Environment Ready!"
echo "=========================================="
echo ""
echo "Sync is pre-configured and initial sync completed."
echo "Open the Groups extension to see synced items."
echo ""
echo "Test data synced from server:"
echo "  - https://example.com/synced-url-1 (tags: test, synced)"
echo "  - https://github.com/test/repo (tags: test, github)"
echo "  - Text note: 'This is a synced text note'"
echo ""
echo "Press Ctrl+C to stop and clean up."
echo "=========================================="
echo ""

# Wait for processes
wait
