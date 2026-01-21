#!/bin/bash
# Script to build Rust library for iOS simulator (debug)
# Uses shared cache to avoid rebuilds across agent workspaces

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$SCRIPT_DIR/src-tauri"
DEST_DIR="$TAURI_DIR/gen/apple/Externals/arm64/Debug"
DEST_PATH="$DEST_DIR/libapp.a"

# Source cache utilities
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/scripts/ios-cache.sh"

# Parse flags
FORCE_REBUILD=false
NO_CACHE=false
while [ $# -gt 0 ]; do
    case "$1" in
        --force|-f)
            FORCE_REBUILD=true
            ;;
        --no-cache)
            NO_CACHE=true
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--force|-f] [--no-cache]"
            exit 1
            ;;
    esac
    shift
done

cd "$TAURI_DIR"

# Check cache unless forced or disabled
if [ "$FORCE_REBUILD" = false ] && [ "$NO_CACHE" = false ]; then
    if check_cache "debug" "$TAURI_DIR"; then
        mkdir -p "$DEST_DIR"
        use_cache "debug" "$DEST_PATH"
        echo "✓ iOS debug library ready at $DEST_PATH (from cache)"
        exit 0
    fi
fi

# Build
if [ "$FORCE_REBUILD" = true ]; then
    echo "(Forcing Rust recompile...)"
    touch src/lib.rs
fi

echo "Building Rust for iOS simulator (debug)..."
cargo tauri build --target aarch64-apple-ios-sim --debug

# Copy to Xcode location
mkdir -p "$DEST_DIR"
cp target/aarch64-apple-ios-sim/debug/deps/libpeek_save_lib.a "$DEST_PATH"

# Update cache
if [ "$NO_CACHE" = false ]; then
    update_cache "debug" "$TAURI_DIR" "$DEST_PATH"
fi

echo "✓ iOS debug library built successfully at $DEST_PATH"
