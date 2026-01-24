#!/bin/bash
# Start dev server with seeded test data for iOS simulator testing
#
# Usage: ./scripts/dev-server-with-data.sh
#
# This script:
# 1. Starts the backend server on localhost:3000
# 2. Seeds test data via the API
# 3. Shows connection info for iOS simulator
#
# To stop: Ctrl+C or kill the process

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_DIR/backend/server"

# Configuration
PORT="${PORT:-3000}"
API_KEY="${API_KEY:-dev-test-key-$(date +%s)}"

# Get local IP for iOS simulator to connect
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")

echo "=========================================="
echo "  Peek Dev Server with Test Data"
echo "=========================================="
echo ""
echo "Server URL: http://$LOCAL_IP:$PORT"
echo "API Key: $API_KEY"
echo ""

# Export for server
export PORT
export API_KEY

# Start server in background, capture PID
cd "$SERVER_DIR"
node index.js &
SERVER_PID=$!

# Wait for server to be ready
echo "Starting server..."
for i in {1..30}; do
    if curl -s "http://localhost:$PORT/" > /dev/null 2>&1; then
        echo "Server is ready!"
        break
    fi
    sleep 0.5
done

# Seed test data
echo ""
echo "Seeding test data..."

# Create test items with profile parameter (simulating mobile client)
PROFILE_PARAM="profile=dev-test-profile&slug=default"

curl -s -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "url", "content": "https://example.com/test-1", "tags": ["test", "example"]}' > /dev/null

curl -s -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "url", "content": "https://github.com/test-repo", "tags": ["github", "code"]}' > /dev/null

curl -s -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "text", "content": "Test note from server", "tags": ["note", "test"]}' > /dev/null

curl -s -X POST "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "url", "content": "https://news.ycombinator.com", "tags": ["news", "tech"]}' > /dev/null

echo "Created 4 test items"

# Show current items
echo ""
echo "Current items on server:"
curl -s "http://localhost:$PORT/items?$PROFILE_PARAM" \
    -H "Authorization: Bearer $API_KEY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data.get('items', []):
    content = item.get('content', '')[:50]
    tags = ', '.join(item.get('tags', []))
    print(f\"  [{item['type']}] {content} (tags: {tags})\")"

echo ""
echo "=========================================="
echo "  iOS Simulator Setup"
echo "=========================================="
echo ""
echo "In the iOS app Settings, configure:"
echo "  Server URL: http://$LOCAL_IP:$PORT"
echo "  API Key: $API_KEY"
echo ""
echo "Then tap 'Pull' or 'Sync' to fetch the test data."
echo ""
echo "Press Ctrl+C to stop the server."
echo "=========================================="
echo ""

# Wait for server process
wait $SERVER_PID
