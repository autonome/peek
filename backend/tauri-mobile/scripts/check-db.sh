#!/bin/bash
# Check if peek.db exists and has data in the simulator

DEVICE_ID=$(xcrun simctl list devices booted -j | grep -o '"udid" : "[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$DEVICE_ID" ]; then
    echo "No booted simulator found"
    exit 1
fi

echo "Checking simulator: $DEVICE_ID"

# Find peek.db in App Groups
DB_PATH=$(find ~/Library/Developer/CoreSimulator/Devices/$DEVICE_ID/data/Containers/Shared/AppGroup -name "peek.db" 2>/dev/null | head -1)

if [ -z "$DB_PATH" ]; then
    echo "❌ peek.db NOT FOUND"
    echo ""
    echo "Possible issues:"
    echo "  1. Share extension hasn't been used yet"
    echo "  2. App Groups entitlement is missing from Peek.entitlements"
    echo "  3. App needs to be rebuilt after fixing entitlements"
    exit 1
fi

echo "✅ Database found: $DB_PATH"
echo ""

echo "=== URLs (most recent 10) ==="
sqlite3 "$DB_PATH" "SELECT id, url, created_at, deleted_at FROM urls ORDER BY created_at DESC LIMIT 10;"
echo ""

echo "=== URL count ==="
sqlite3 "$DB_PATH" "SELECT COUNT(*) as total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as active FROM urls;"
echo ""

echo "=== Tags (by frecency) ==="
sqlite3 "$DB_PATH" "SELECT name, frequency, frecency_score FROM tags ORDER BY frecency_score DESC LIMIT 10;"
echo ""

echo "=== URL-Tag associations ==="
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM url_tags;"
