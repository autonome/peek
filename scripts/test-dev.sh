#!/bin/bash
# Test dev app - runs the dev app with a fresh profile
# Usage: ./scripts/test-dev.sh [--visible] [duration_seconds]
# Example: ./scripts/test-dev.sh             # 8 seconds, headless
# Example: ./scripts/test-dev.sh --visible   # 8 seconds, show UI
# Example: ./scripts/test-dev.sh --visible 15

VISIBLE=0
if [ "$1" = "--visible" ]; then
    VISIBLE=1
    shift
fi

DURATION=${1:-8}
PROFILE="test-$$"
LOGFILE="/tmp/peek-dev-test.log"

cleanup() {
    pkill -f "/Users/dietrich/misc/peek/node_modules/electron" 2>/dev/null || true
}

trap cleanup EXIT

# Kill any existing dev instances
pkill -f "/Users/dietrich/misc/peek/node_modules/electron" 2>/dev/null || true
sleep 1

echo "Running dev Peek with test profile '$PROFILE' for ${DURATION}s..."
echo "Log file: $LOGFILE"
echo ""

if [ "$VISIBLE" = "1" ]; then
    PROFILE="$PROFILE" DEBUG=1 yarn start > "$LOGFILE" 2>&1 &
else
    PROFILE="$PROFILE" DEBUG=1 PEEK_HEADLESS=1 yarn start > "$LOGFILE" 2>&1 &
fi
PID=$!

sleep "$DURATION"

echo "=== Errors ==="
grep -iE "error|failed|exception" "$LOGFILE" | grep -v "Autofill" | head -20 || echo "(no errors found)"
echo ""

echo "=== Warnings ==="
grep -iE "warning|warn" "$LOGFILE" | head -10 || echo "(no warnings found)"
echo ""

echo "=== Key events ==="
grep -E "onReady|Loading|loaded|register" "$LOGFILE" | head -20
echo ""

echo "=== Full log available at: $LOGFILE ==="
