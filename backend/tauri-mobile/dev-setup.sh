#!/bin/bash
# Dev setup script: starts servers and opens Xcode with config info

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/../server"

# Reset server data for fresh start
rm -rf "$SERVER_DIR/data"

# Get local IP address
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
PORT=$((RANDOM % 10000 + 10000))  # Random port between 10000-19999
API_KEY="dev-test-key-$(date +%s)"

echo "=========================================="
echo "  Peek Dev Setup"
echo "=========================================="
echo ""
echo "Local IP: $IP"
echo "Server URL: http://$IP:$PORT"
echo "API Key: $API_KEY"
echo ""

# Start backend server in background
echo "Starting backend server..."
cd "$SERVER_DIR"
API_KEY="$API_KEY" PORT="$PORT" node index.js &
BACKEND_PID=$!
echo "Backend server started (PID: $BACKEND_PID)"

# Start frontend dev server in background
echo "Starting frontend dev server..."
cd "$SCRIPT_DIR"
npx vite --port 1420 &
FRONTEND_PID=$!
echo "Frontend server started (PID: $FRONTEND_PID)"

# Wait for servers to be ready
sleep 3

# Configure iOS simulator with server settings
echo "Configuring iOS simulator..."
APP_GROUP=$(xcrun simctl get_app_container booted com.dietrich.peek-mobile groups 2>/dev/null | grep "group.com.dietrich.peek-mobile" | awk '{print $2}')

if [ -n "$APP_GROUP" ]; then
    DB_PATH="$APP_GROUP/peek.db"
    if [ -f "$DB_PATH" ]; then
        sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO settings (key, value) VALUES ('webhook_url', 'http://$IP:$PORT');"
        sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO settings (key, value) VALUES ('webhook_api_key', '$API_KEY');"
        echo "  Pre-configured server URL and API key in simulator"
    else
        echo "  Database not found yet - settings will need manual config on first run"
    fi
else
    echo "  App not installed yet - settings will need manual config on first run"
fi

# Copy libraries and open Xcode
echo ""
echo "Copying libraries..."
cp src-tauri/target/aarch64-apple-ios-sim/debug/deps/libpeek_save_lib.a src-tauri/gen/apple/Externals/arm64/Debug/libapp.a
cp src-tauri/target/aarch64-apple-ios/release/deps/libpeek_save_lib.a src-tauri/gen/apple/Externals/arm64/Release/libapp.a

echo "Opening Xcode..."
open src-tauri/gen/apple/peek-save.xcodeproj

# Seed test data
echo ""
echo "Seeding test data..."
SERVER_URL="http://$IP:$PORT" API_KEY="$API_KEY" "$SCRIPT_DIR/seed-test-data.sh"

echo ""
echo "=========================================="
echo "  Ready to test!"
echo "=========================================="
echo ""
echo "  Server URL: http://$IP:$PORT"
echo "  API Key:    $API_KEY"
echo ""
echo "=========================================="
echo ""
echo "Servers running:"
echo "  - Frontend: http://localhost:1420 (PID: $FRONTEND_PID)"
echo "  - Backend:  http://$IP:$PORT (PID: $BACKEND_PID)"
echo ""
echo "Press Ctrl+C to stop all servers."
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping servers..."
    kill $FRONTEND_PID 2>/dev/null
    kill $BACKEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Keep script running
wait
