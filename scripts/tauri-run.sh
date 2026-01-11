#!/bin/bash
# Run Tauri backend in background and capture output
# Usage: ./scripts/tauri-run.sh [seconds] [--visible]
#   seconds: how long to run before killing (default: 10, 0 = run forever)
#   --visible: show windows (default is headless/hidden)

cd "$(dirname "$0")/../backend/tauri/src-tauri"

# Kill any existing Tauri process
pkill -f "peek-tauri" 2>/dev/null
sleep 1

DURATION=10
HEADLESS=1

# Parse arguments
for arg in "$@"; do
    if [ "$arg" = "--visible" ]; then
        HEADLESS=""
    elif [[ "$arg" =~ ^[0-9]+$ ]]; then
        DURATION="$arg"
    fi
done

MODE="headless"
[ -z "$HEADLESS" ] && MODE="visible"

if [ "$DURATION" = "0" ]; then
    echo "Running Tauri $MODE (Ctrl+C to stop)..."
    HEADLESS=$HEADLESS cargo run 2>&1
else
    echo "Running Tauri $MODE for $DURATION seconds..."
    HEADLESS=$HEADLESS cargo run 2>&1 &
    PID=$!
    sleep "$DURATION"
    kill $PID 2>/dev/null
    wait $PID 2>/dev/null
    echo "=== Done ==="
fi
