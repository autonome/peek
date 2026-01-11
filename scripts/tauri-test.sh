#!/bin/bash
# Run Tauri in visible mode for manual testing
# Usage: ./scripts/tauri-test.sh [--bg]
#
# Options:
#   --bg    Run in background and return after startup
#
# This kills any existing peek-tauri process and starts fresh in visible mode.

cd "$(dirname "$0")/../backend/tauri/src-tauri"

# Kill any existing instance
pkill -f "peek-tauri" 2>/dev/null || true
sleep 1

if [ "$1" = "--bg" ]; then
    echo "Starting Tauri in background..."
    HEADLESS= cargo run 2>&1 &
    PID=$!
    sleep 5
    if kill -0 $PID 2>/dev/null; then
        echo "=== Tauri running (PID $PID). Test Settings > Extensions, Quit button, hotkeys ==="
    else
        echo "=== Tauri failed to start ==="
        exit 1
    fi
else
    echo "Starting Tauri in visible mode..."
    echo "Press Ctrl+C or use Quit button to stop."
    echo ""
    HEADLESS= cargo run 2>&1
fi
