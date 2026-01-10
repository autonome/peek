#!/bin/bash
# Kill all dev Electron processes from this project
# Usage: ./scripts/kill-dev.sh

pkill -9 -f "/Users/dietrich/misc/peek/node_modules/electron" 2>/dev/null || true
pkill -9 -f "PROFILE=test" 2>/dev/null || true

# Verify
sleep 0.5
REMAINING=$(pgrep -fl electron 2>/dev/null | grep -c "/Users/dietrich/misc/peek" || true)
if [ "$REMAINING" -eq 0 ]; then
    echo "All dev Electron processes killed"
else
    echo "Warning: $REMAINING processes may still be running"
    pgrep -fl electron 2>/dev/null | grep "/Users/dietrich/misc/peek"
fi
