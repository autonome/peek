#!/bin/bash
# Smoke test script - runs the app briefly to verify it starts correctly
# Usage: ./scripts/smoke-test.sh [--visible] [duration_seconds]
# Example: ./scripts/smoke-test.sh           # headless, 10s
# Example: ./scripts/smoke-test.sh 15        # headless, 15s
# Example: ./scripts/smoke-test.sh --visible # visible windows, 10s
# Example: ./scripts/smoke-test.sh --visible 15

HEADLESS=1
if [ "$1" = "--visible" ]; then
    HEADLESS=0
    shift
fi

DURATION=${1:-10}

# Generate unique profile name for this test run
PROFILE="test-smoke-$$"
PIDFILE="/tmp/peek-smoke-$$.pid"
LOGFILE="/tmp/peek-smoke-$$.log"

cleanup() {
    if [ -f "$PIDFILE" ]; then
        PID=$(cat "$PIDFILE")
        # Kill the process group to get all children
        kill -TERM -"$PID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null || true
        sleep 0.5
        kill -9 -"$PID" 2>/dev/null || kill -9 "$PID" 2>/dev/null || true
        rm -f "$PIDFILE"
    fi
    # Kill any remaining electron processes from this project
    pkill -9 -f "/Users/dietrich/misc/peek/node_modules/electron" 2>/dev/null || true
}

trap cleanup EXIT

if [ "$HEADLESS" = "1" ]; then
    echo "Starting smoke test (profile: $PROFILE, duration: ${DURATION}s, headless)..."
    PROFILE="$PROFILE" DEBUG=1 PEEK_HEADLESS=1 yarn start > "$LOGFILE" 2>&1 &
else
    echo "Starting smoke test (profile: $PROFILE, duration: ${DURATION}s, visible)..."
    PROFILE="$PROFILE" DEBUG=1 yarn start > "$LOGFILE" 2>&1 &
fi
echo $! > "$PIDFILE"

# Wait for specified duration
sleep "$DURATION"

# Check if process is still running (good sign)
if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "App started successfully and ran for ${DURATION}s"

    # Check log for common errors
    if grep -qi "error\|exception\|fatal\|cannot find" "$LOGFILE" 2>/dev/null; then
        echo ""
        echo "Warnings found in log:"
        grep -i "error\|exception\|fatal\|cannot find" "$LOGFILE" | head -20
        echo ""
    fi

    # Show key startup messages
    echo ""
    echo "Key startup messages:"
    grep -E "^(PROFILE|onReady|PREFS|\[ext)" "$LOGFILE" | head -20
    echo ""

    cleanup
    rm -f "$LOGFILE"
    echo "Smoke test PASSED"
    exit 0
else
    echo "App crashed or exited early!"
    echo ""
    echo "Last 50 lines of log:"
    tail -50 "$LOGFILE"
    rm -f "$LOGFILE"
    echo ""
    echo "Smoke test FAILED"
    exit 1
fi
