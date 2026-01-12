#!/bin/bash
# Run Tauri with debug output for troubleshooting
# Usage: ./scripts/tauri-debug.sh [--headless] [duration_seconds]

SCRIPT_DIR="$(dirname "$0")"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_DIR="$PROJECT_DIR/backend/tauri/src-tauri"

HEADLESS=0
DURATION=10

for arg in "$@"; do
    case "$arg" in
        --headless)
            HEADLESS=1
            ;;
        [0-9]*)
            DURATION="$arg"
            ;;
    esac
done

cd "$TAURI_DIR"

echo "=== Tauri Debug Run ==="
echo "Mode: $([ "$HEADLESS" = "1" ] && echo "headless" || echo "visible")"
echo "Duration: ${DURATION}s"
echo ""

LOGFILE="/tmp/tauri-debug-$$.log"

if [ "$HEADLESS" = "1" ]; then
    HEADLESS=1 cargo run > "$LOGFILE" 2>&1 &
else
    cargo run > "$LOGFILE" 2>&1 &
fi
PID=$!

sleep "$DURATION"

echo "=== Key log entries ==="
grep -E "\[tauri\]|\[tauri:|window_open|visible|hiding|HEADLESS" "$LOGFILE" | grep -v "protocol" | head -50

kill $PID 2>/dev/null

echo ""
echo "Full log saved to: $LOGFILE"
