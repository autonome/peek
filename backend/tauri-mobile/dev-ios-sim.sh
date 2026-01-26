#!/bin/bash
# Start iOS simulator dev environment with a random available port.
# Usage: ./dev-ios-sim.sh
#
# This avoids port conflicts by picking a fresh port each run,
# patching tauri.conf.json temporarily, and restoring on exit.

set -e
cd "$(dirname "$0")"

# Pick a random available port
PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()")
echo "[dev] Using port $PORT"

# Patch tauri.conf.json with the chosen port
CONF=src-tauri/tauri.conf.json
sed -i '' "s|\"devUrl\": \"http://localhost:[0-9]*\"|\"devUrl\": \"http://localhost:$PORT\"|" "$CONF"
sed -i '' "s|\"beforeDevCommand\": \".*\"|\"beforeDevCommand\": \"DEV_PORT=$PORT npm run dev\"|" "$CONF"

# Restore tauri.conf.json on exit (any signal)
cleanup() {
  echo ""
  echo "[dev] Restoring tauri.conf.json..."
  sed -i '' "s|\"devUrl\": \"http://localhost:[0-9]*\"|\"devUrl\": \"http://localhost:1420\"|" "$CONF"
  sed -i '' "s|\"beforeDevCommand\": \".*\"|\"beforeDevCommand\": \"npm run dev\"|" "$CONF"
  echo "[dev] Done."
}
trap cleanup EXIT

# Clean old libraries so Xcode picks up fresh dev build
rm -f src-tauri/gen/apple/Externals/arm64/*/libapp.a

# Run cargo tauri ios dev (builds Rust in dev mode pointing to devUrl, starts vite, opens Xcode)
cd src-tauri && cargo tauri ios dev --open
