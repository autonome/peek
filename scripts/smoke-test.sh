#!/bin/bash
# Unified smoke test script - runs app briefly to verify it starts correctly
# Usage: ./scripts/smoke-test.sh [backend] [--visible] [duration_seconds]
#   backend: electron (default), tauri, or all
# Examples:
#   ./scripts/smoke-test.sh                    # electron, headless, 10s
#   ./scripts/smoke-test.sh tauri              # tauri, headless, 10s
#   ./scripts/smoke-test.sh all                # both backends
#   ./scripts/smoke-test.sh --visible          # electron, visible, 10s
#   ./scripts/smoke-test.sh tauri --visible 15 # tauri, visible, 15s

set -e

SCRIPT_DIR="$(dirname "$0")"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Defaults
BACKEND="electron"
HEADLESS=1
DURATION=10

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        electron|tauri|all)
            BACKEND="$arg"
            ;;
        --visible)
            HEADLESS=0
            ;;
        [0-9]*)
            DURATION="$arg"
            ;;
    esac
done

# Generate unique profile/log names
RUN_ID="$$"
PROFILE="test-smoke-$RUN_ID"

# Common success criteria patterns
SUCCESS_PATTERNS="App setup complete|Core features initialized|App started|onReady"
# Common error patterns
ERROR_PATTERNS="error|Error|exception|Exception|fatal|Fatal|panic|PANIC|cannot find"

run_electron() {
    local PIDFILE="/tmp/peek-electron-smoke-$RUN_ID.pid"
    local LOGFILE="/tmp/peek-electron-smoke-$RUN_ID.log"

    echo "=== Electron Smoke Test ==="
    echo "Profile: $PROFILE, Duration: ${DURATION}s, Mode: $([ "$HEADLESS" = "1" ] && echo "headless" || echo "visible")"

    cleanup_electron() {
        if [ -f "$PIDFILE" ]; then
            PID=$(cat "$PIDFILE")
            kill -TERM -"$PID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null || true
            sleep 0.5
            kill -9 -"$PID" 2>/dev/null || kill -9 "$PID" 2>/dev/null || true
            rm -f "$PIDFILE"
        fi
        pkill -9 -f "$PROJECT_DIR/node_modules/electron" 2>/dev/null || true
    }

    trap cleanup_electron EXIT

    cd "$PROJECT_DIR"

    if [ "$HEADLESS" = "1" ]; then
        PROFILE="$PROFILE" DEBUG=1 PEEK_HEADLESS=1 yarn start > "$LOGFILE" 2>&1 &
    else
        PROFILE="$PROFILE" DEBUG=1 yarn start > "$LOGFILE" 2>&1 &
    fi
    echo $! > "$PIDFILE"

    sleep "$DURATION"

    local EXIT_CODE=0
    if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "Electron started and ran for ${DURATION}s"

        # Check for errors
        if grep -qiE "$ERROR_PATTERNS" "$LOGFILE" 2>/dev/null; then
            echo ""
            echo "Warnings found:"
            grep -iE "$ERROR_PATTERNS" "$LOGFILE" | head -10
        fi

        # Verify success patterns
        if grep -qE "$SUCCESS_PATTERNS" "$LOGFILE" 2>/dev/null; then
            echo "Electron smoke test PASSED"
        else
            echo "Warning: Expected startup messages not found"
            EXIT_CODE=1
        fi
    else
        echo "Electron crashed or exited early!"
        echo "Last 30 lines:"
        tail -30 "$LOGFILE"
        EXIT_CODE=1
    fi

    cleanup_electron
    rm -f "$LOGFILE"
    trap - EXIT
    return $EXIT_CODE
}

run_tauri() {
    local PIDFILE="/tmp/peek-tauri-smoke-$RUN_ID.pid"
    local LOGFILE="/tmp/peek-tauri-smoke-$RUN_ID.log"

    echo "=== Tauri Smoke Test ==="
    echo "Profile: dev, Duration: ${DURATION}s, Mode: $([ "$HEADLESS" = "1" ] && echo "headless" || echo "visible")"

    cleanup_tauri() {
        if [ -f "$PIDFILE" ]; then
            PID=$(cat "$PIDFILE")
            kill -TERM "$PID" 2>/dev/null || true
            sleep 0.5
            kill -9 "$PID" 2>/dev/null || true
            rm -f "$PIDFILE"
        fi
        pkill -9 -f "peek-tauri" 2>/dev/null || true
    }

    trap cleanup_tauri EXIT

    cd "$PROJECT_DIR/backend/tauri/src-tauri"

    # Kill any existing Tauri process
    pkill -f "peek-tauri" 2>/dev/null || true
    sleep 1

    if [ "$HEADLESS" = "1" ]; then
        HEADLESS=1 cargo run > "$LOGFILE" 2>&1 &
    else
        cargo run > "$LOGFILE" 2>&1 &
    fi
    echo $! > "$PIDFILE"

    sleep "$DURATION"

    local EXIT_CODE=0
    if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "Tauri started and ran for ${DURATION}s"

        # Check for errors (exclude compile warnings)
        if grep -E "^\[tauri" "$LOGFILE" | grep -qiE "$ERROR_PATTERNS" 2>/dev/null; then
            echo ""
            echo "Runtime warnings found:"
            grep -E "^\[tauri" "$LOGFILE" | grep -iE "$ERROR_PATTERNS" | head -10
        fi

        # Verify success patterns
        if grep -qE "$SUCCESS_PATTERNS" "$LOGFILE" 2>/dev/null; then
            echo "Tauri smoke test PASSED"
        else
            echo "Warning: Expected startup messages not found"
            EXIT_CODE=1
        fi
    else
        echo "Tauri crashed or exited early!"
        echo "Last 30 lines:"
        tail -30 "$LOGFILE"
        EXIT_CODE=1
    fi

    cleanup_tauri
    rm -f "$LOGFILE"
    trap - EXIT
    return $EXIT_CODE
}

# Run tests
TOTAL_EXIT=0

case "$BACKEND" in
    electron)
        run_electron || TOTAL_EXIT=1
        ;;
    tauri)
        run_tauri || TOTAL_EXIT=1
        ;;
    all)
        echo "Running smoke tests for all backends..."
        echo ""
        run_electron || TOTAL_EXIT=1
        echo ""
        run_tauri || TOTAL_EXIT=1
        echo ""
        if [ "$TOTAL_EXIT" = "0" ]; then
            echo "=== All smoke tests PASSED ==="
        else
            echo "=== Some smoke tests FAILED ==="
        fi
        ;;
esac

exit $TOTAL_EXIT
