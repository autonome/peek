#!/bin/bash
# Run Tauri visibly for manual testing
# Usage: ./scripts/tauri-visible.sh
# Press Ctrl+C to stop

cd "$(dirname "$0")/../backend/tauri/src-tauri"

# Kill any existing Tauri process
pkill -f "peek-tauri" 2>/dev/null
sleep 1

echo "Running Tauri visible (Ctrl+C to stop)..."
cargo run 2>&1
