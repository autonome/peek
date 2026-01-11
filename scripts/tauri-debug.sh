#!/bin/bash
# Run Tauri and capture shortcut-related logs
# Usage: ./scripts/tauri-debug.sh [duration_seconds]
#
# Runs Tauri in visible mode and filters for shortcut/event logs.

cd "$(dirname "$0")/../backend/tauri/src-tauri"

pkill -f "peek-tauri" 2>/dev/null
sleep 1

DURATION=${1:-15}

echo "Running Tauri for $DURATION seconds, filtering shortcut logs..."
echo "Press Option+Space or other shortcuts to test."
echo ""

HEADLESS= cargo run 2>&1 &
PID=$!

sleep "$DURATION"
kill $PID 2>/dev/null
wait $PID 2>/dev/null

echo ""
echo "=== Done ==="
