#!/bin/bash
# Smoke test script - runs the app briefly to verify it starts correctly
# Usage: ./scripts/smoke-test.sh [duration_seconds] [extra_args...]
# Example: ./scripts/smoke-test.sh 10
# Example: ./scripts/smoke-test.sh 15 --some-flag

DURATION=${1:-10}
shift 2>/dev/null || true

# Generate unique profile name for this test run
PROFILE="test-smoke-$$"
PIDFILE="/tmp/peek-smoke-$$.pid"
LOGFILE="/tmp/peek-smoke-$$.log"

cleanup() {
    if [ -f "$PIDFILE" ]; then
        PID=$(cat "$PIDFILE")
        kill "$PID" 2>/dev/null
        rm -f "$PIDFILE"
    fi
    # Also kill any remaining electron processes with our test profile
    pkill -f "PROFILE=$PROFILE" 2>/dev/null || true
    pkill -f "$PROFILE" 2>/dev/null || true
}

trap cleanup EXIT

echo "Starting smoke test (profile: $PROFILE, duration: ${DURATION}s)..."

# Start the app in background
PROFILE="$PROFILE" DEBUG=1 yarn start "$@" > "$LOGFILE" 2>&1 &
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
