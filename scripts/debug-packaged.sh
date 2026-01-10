#!/bin/bash
# Debug packaged app - runs the installed app with DEBUG output
# Usage: ./scripts/debug-packaged.sh [--visible] [--profile NAME] [duration_seconds]
# Example: ./scripts/debug-packaged.sh                    # 10 seconds, default profile
# Example: ./scripts/debug-packaged.sh --visible          # 10 seconds, show UI
# Example: ./scripts/debug-packaged.sh --profile test     # fresh test profile
# Example: ./scripts/debug-packaged.sh --visible --profile test 20

VISIBLE=0
PROFILE=""

while [[ "$1" == --* ]]; do
    case "$1" in
        --visible)
            VISIBLE=1
            shift
            ;;
        --profile)
            PROFILE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

DURATION=${1:-10}
LOGFILE="/tmp/peek-packaged-debug.log"

cleanup() {
    pkill -f "/Applications/Peek.app" 2>/dev/null || true
}

trap cleanup EXIT

# Kill any existing instances first
pkill -f "/Applications/Peek.app" 2>/dev/null || true
sleep 1

if [ -n "$PROFILE" ]; then
    echo "Running packaged Peek.app with DEBUG for ${DURATION}s (profile: $PROFILE)..."
else
    echo "Running packaged Peek.app with DEBUG for ${DURATION}s (default profile)..."
fi
echo "Log file: $LOGFILE"
echo ""

if [ -n "$PROFILE" ]; then
    PROFILE="$PROFILE" DEBUG=1 /Applications/Peek.app/Contents/MacOS/Peek > "$LOGFILE" 2>&1 &
else
    DEBUG=1 /Applications/Peek.app/Contents/MacOS/Peek > "$LOGFILE" 2>&1 &
fi
PID=$!

sleep "$DURATION"

echo "=== Extension manifest loading ==="
grep -E "\[ext:win\].*Creating window" "$LOGFILE" || echo "(no extension window creation found)"
echo ""

echo "=== Manifest details ==="
grep -E "manifest:" "$LOGFILE" | head -20 || echo "(no manifest details found)"
echo ""

echo "=== Errors ==="
grep -iE "error|failed|cannot" "$LOGFILE" | head -20 || echo "(no errors found)"
echo ""

echo "=== Full log available at: $LOGFILE ==="
echo "View with: cat $LOGFILE"
