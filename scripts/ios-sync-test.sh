#!/bin/bash
# iOS Simulator Sync Test Setup
#
# Usage: ./scripts/ios-sync-test.sh
#
# This script:
# 1. Finds the iOS simulator app container
# 2. Pre-configures profiles.json with server URL and API key
# 3. Seeds test data on server
# 4. Starts the server
#
# After running this, build and run the iOS app in simulator to test sync.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_DIR/backend/server"

# Configuration
PORT="${PORT:-3000}"
API_KEY="ios-sync-test-key-12345"

# Get local IP for iOS simulator
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
SERVER_URL="http://$LOCAL_IP:$PORT"

echo "=========================================="
echo "  iOS Simulator Sync Test Setup"
echo "=========================================="
echo ""
echo "Server URL: $SERVER_URL"
echo "API Key: $API_KEY"
echo ""

# Find iOS simulator app group container
APP_GROUP=$(xcrun simctl get_app_container booted com.dietrich.peek-mobile groups 2>/dev/null | grep "group.com.dietrich.peek-mobile" | awk '{print $2}')

if [ -z "$APP_GROUP" ]; then
    echo "ERROR: iOS app not installed in simulator."
    echo "Build and run the app first, then run this script again."
    exit 1
fi

PROFILES_JSON="$APP_GROUP/profiles.json"
echo "iOS App Container: $APP_GROUP"
echo "Profiles config: $PROFILES_JSON"
echo ""

# Read existing profiles.json and update sync settings
if [ -f "$PROFILES_JSON" ]; then
    echo "Updating profiles.json with sync settings..."

    # Use Python to update the JSON (preserves existing profile data)
    python3 << EOF
import json

with open("$PROFILES_JSON", "r") as f:
    config = json.load(f)

# Update sync settings
config["sync"] = {
    "server_url": "$SERVER_URL",
    "api_key": "$API_KEY",
    "auto_sync": False
}

with open("$PROFILES_JSON", "w") as f:
    json.dump(config, f, indent=2)

print("  Updated sync settings:")
print(f"    server_url: {config['sync']['server_url']}")
print(f"    api_key: {config['sync']['api_key']}")
print(f"  Current profile: {config['currentProfileId']}")
EOF
else
    echo "WARNING: profiles.json not found. Run the iOS app once first."
fi

echo ""

# Export for server
export PORT
export API_KEY

# Start server
echo "Starting server..."
cd "$SERVER_DIR"
node index.js &
SERVER_PID=$!

# Wait for server to be ready
for i in {1..30}; do
    if curl -s "http://localhost:$PORT/" > /dev/null 2>&1; then
        echo "Server is ready!"
        break
    fi
    sleep 0.5
done

# Get current profile ID from profiles.json for the slug
CURRENT_PROFILE_ID=$(python3 -c "import json; print(json.load(open('$PROFILES_JSON'))['currentProfileId'])")
PROFILE_SLUG="default"  # Fallback slug for the default profile

echo ""
echo "Seeding test data for profile $CURRENT_PROFILE_ID (slug: $PROFILE_SLUG)..."

# Seed test data with profile UUID and slug fallback
PROFILE_PARAM="profile=$CURRENT_PROFILE_ID&slug=$PROFILE_SLUG"

curl -s -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "url", "content": "https://example.com/from-server", "tags": ["server", "test"]}' > /dev/null

curl -s -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "url", "content": "https://github.com/anthropics/claude-code", "tags": ["github", "ai"]}' > /dev/null

curl -s -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "text", "content": "This is a test note seeded from the server for sync testing", "tags": ["note", "test"]}' > /dev/null

curl -s -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "url", "content": "https://news.ycombinator.com", "tags": ["news", "tech"]}' > /dev/null

echo "Seeded 4 test items"

# Show current server state
echo ""
echo "Server items:"
curl -s "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data.get('items', []):
    content = item.get('content', '')[:60]
    tags = ', '.join(item.get('tags', []))
    print(f\"  [{item['type']}] {content}\")"

echo ""
echo "=========================================="
echo "  Ready for Testing"
echo "=========================================="
echo ""
echo "iOS app is pre-configured with:"
echo "  Server: $SERVER_URL"
echo "  API Key: $API_KEY"
echo ""
echo "Next steps:"
echo "  1. Build and run iOS app in simulator (Xcode or 'yarn mobile:ios:build')"
echo "  2. Go to Settings in the app"
echo "  3. Tap 'Pull' to fetch test data from server"
echo "  4. Verify 4 items appear"
echo "  5. Add items locally, tap 'Push' to send to server"
echo ""
echo "Press Ctrl+C to stop the server."
echo "=========================================="
echo ""

# Cleanup on exit
trap "kill $SERVER_PID 2>/dev/null" EXIT

# Wait for server
wait $SERVER_PID
