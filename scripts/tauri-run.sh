#!/bin/bash
# Run Tauri backend in background and capture output
# Usage: ./scripts/tauri-run.sh [seconds] [--visible]
#   seconds: how long to run before killing (default: 10, 0 = run forever)
#   --visible: show windows (default is headless/hidden)

cd "$(dirname "$0")/../backend/tauri/src-tauri"

DURATION=${1:-10}
HEADLESS=1

# Check for --visible flag
for arg in "$@"; do
    if [ "$arg" = "--visible" ]; then
        HEADLESS=""
    fi
done

if [ "$DURATION" = "0" ]; then
    echo "Running Tauri (Ctrl+C to stop)..."
    HEADLESS=$HEADLESS cargo run 2>&1
else
    MODE="headless"
    [ -z "$HEADLESS" ] && MODE="visible"
    echo "Running Tauri ($MODE) for $DURATION seconds..."
    LOGFILE=$(mktemp)
    # Run in background, capture all output to file
    HEADLESS=$HEADLESS cargo run > "$LOGFILE" 2>&1 &
    PID=$!
    sleep "$DURATION"
    kill $PID 2>/dev/null
    wait $PID 2>/dev/null
    echo "=== Output ==="
    cat "$LOGFILE"
    rm "$LOGFILE"
    echo ""
    echo "=== Stopped after $DURATION seconds ==="
fi
