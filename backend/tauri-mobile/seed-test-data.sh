#!/bin/bash
# Seed test data for bidirectional sync testing

set -e

# Configuration
SERVER_URL="${SERVER_URL:-http://192.168.50.140:3000}"
API_KEY="${API_KEY:-dev-test-key-1768992739}"

echo "=========================================="
echo "  Seeding Test Data for Sync Testing"
echo "=========================================="
echo ""
echo "Server: $SERVER_URL"
echo ""

# Find iOS simulator database
APP_GROUP=$(xcrun simctl get_app_container booted com.dietrich.peek-mobile groups 2>/dev/null | grep "group.com.dietrich.peek-mobile" | awk '{print $2}')

if [ -z "$APP_GROUP" ]; then
    echo "ERROR: App not installed in simulator. Build and run first."
    exit 1
fi

DB_PATH="$APP_GROUP/peek.db"
echo "iOS DB: $DB_PATH"
echo ""

# Seed server with items (these should appear on iOS after Pull)
echo "Seeding server with test items..."

curl -s -X POST "$SERVER_URL/items" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "url", "content": "https://example.com/from-server-1", "tags": ["server", "test"]}' > /dev/null

curl -s -X POST "$SERVER_URL/items" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "text", "content": "This is a text note from the server", "tags": ["server", "note"]}' > /dev/null

curl -s -X POST "$SERVER_URL/items" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "url", "content": "https://github.com/from-server", "tags": ["server", "github"]}' > /dev/null

echo "  Created 3 items on server"

# Seed iOS simulator with items (these should appear on server after Push)
echo "Seeding iOS simulator with test items..."

# Clear existing items first
sqlite3 "$DB_PATH" "DELETE FROM item_tags;"
sqlite3 "$DB_PATH" "DELETE FROM items;"
sqlite3 "$DB_PATH" "DELETE FROM tags;"
echo "  Cleared existing iOS items"

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
UUID1=$(uuidgen | tr '[:upper:]' '[:lower:]')
UUID2=$(uuidgen | tr '[:upper:]' '[:lower:]')
UUID3=$(uuidgen | tr '[:upper:]' '[:lower:]')

sqlite3 "$DB_PATH" <<EOF
-- Insert test items (unsynced - no sync_id)
INSERT OR IGNORE INTO items (id, type, url, content, created_at, updated_at, sync_id, sync_source)
VALUES ('$UUID1', 'url', 'https://mobile-only-1.example.com', NULL, '$NOW', '$NOW', '', '');

INSERT OR IGNORE INTO items (id, type, url, content, created_at, updated_at, sync_id, sync_source)
VALUES ('$UUID2', 'text', NULL, 'This text was created on mobile only', '$NOW', '$NOW', '', '');

INSERT OR IGNORE INTO items (id, type, url, content, created_at, updated_at, sync_id, sync_source)
VALUES ('$UUID3', 'url', 'https://mobile-news.example.com', NULL, '$NOW', '$NOW', '', '');

-- Add tags for the items
INSERT OR IGNORE INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at)
VALUES ('mobile', 1, '$NOW', 10.0, '$NOW', '$NOW');

INSERT OR IGNORE INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at)
VALUES ('local', 1, '$NOW', 10.0, '$NOW', '$NOW');

-- Link tags to items
INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at)
SELECT '$UUID1', id, '$NOW' FROM tags WHERE name = 'mobile';

INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at)
SELECT '$UUID1', id, '$NOW' FROM tags WHERE name = 'local';

INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at)
SELECT '$UUID2', id, '$NOW' FROM tags WHERE name = 'mobile';

INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at)
SELECT '$UUID3', id, '$NOW' FROM tags WHERE name = 'local';
EOF

echo "  Created 3 items in iOS simulator"

# Show current state
echo ""
echo "=========================================="
echo "  Current State"
echo "=========================================="
echo ""

echo "Server items:"
curl -s "$SERVER_URL/items" -H "Authorization: Bearer $API_KEY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data.get('items', []):
    print(f\"  - [{item['type']}] {item.get('content', '')[:50]} (tags: {', '.join(item.get('tags', []))})\")
"

echo ""
echo "iOS items (unsynced):"
sqlite3 "$DB_PATH" "SELECT '  - [' || type || '] ' || COALESCE(url, content, '') || ' (sync_id: ' || COALESCE(sync_id, 'none') || ')' FROM items WHERE deleted_at IS NULL LIMIT 10;"

echo ""
echo "=========================================="
echo "  Test Instructions"
echo "=========================================="
echo ""
echo "1. Open the app in simulator and go to Settings"
echo "2. Tap 'Pull' - should get 3 items from server"
echo "3. Tap 'Push' - should send 3 mobile items to server"
echo "4. Or tap 'Sync All' to do both"
echo ""
echo "After sync, both should have 6 items total."
echo ""
