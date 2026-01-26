#!/bin/bash
# E2E test server helper
# Usage:
#   yarn test:e2e:server start   — start server (reads DATA_DIR, PORT env vars)
#   yarn test:e2e:server stop    — stop server on $PORT
#   yarn test:e2e:server status  — check if server is running
#   yarn test:e2e:server log     — tail the server log

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DATA_DIR="${DATA_DIR:-/tmp/e2e-peek-mobile-pWx75j}"
PORT="${PORT:-28400}"
LOG_FILE="$DATA_DIR/server.log"
PID_FILE="$DATA_DIR/server.pid"

case "${1:-status}" in
  start)
    # Kill existing server on this port if any
    EXISTING="$(lsof -ti :"$PORT" 2>/dev/null || true)"
    if [ -n "$EXISTING" ]; then
      kill "$EXISTING" 2>/dev/null || true
      sleep 1
    fi
    mkdir -p "$DATA_DIR"
    DATA_DIR="$DATA_DIR" PORT="$PORT" node "$REPO_ROOT/backend/server/index.js" > "$LOG_FILE" 2>&1 &
    echo "$!" > "$PID_FILE"
    sleep 2
    if curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; then
      echo "Server started on port $PORT (PID: $(cat "$PID_FILE"))"
    else
      echo "Server failed to start — check $LOG_FILE"
      exit 1
    fi
    ;;
  stop)
    EXISTING="$(lsof -ti :"$PORT" 2>/dev/null || true)"
    if [ -n "$EXISTING" ]; then
      kill "$EXISTING" 2>/dev/null || true
      echo "Stopped server (PID: $EXISTING)"
    else
      echo "No server running on port $PORT"
    fi
    ;;
  status)
    if curl -sf "http://localhost:$PORT/" 2>/dev/null; then
      echo ""
      echo "Server running on port $PORT"
    else
      echo "No server running on port $PORT"
    fi
    ;;
  log)
    if [ -f "$LOG_FILE" ]; then
      cat "$LOG_FILE"
    else
      echo "No log file at $LOG_FILE"
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|status|log}"
    exit 1
    ;;
esac
