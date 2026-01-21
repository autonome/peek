#!/bin/bash
# Script to build Rust library for iOS device (release)
# Uses shared cache to avoid rebuilds across agent workspaces

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$SCRIPT_DIR/src-tauri"
DEST_DIR="$TAURI_DIR/gen/apple/Externals/arm64/Release"
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

echo "Building frontend..."
npm run build

cd "$TAURI_DIR"

# Check cache unless forced or disabled
if [ "$FORCE_REBUILD" = false ] && [ "$NO_CACHE" = false ]; then
    if check_cache "release" "$TAURI_DIR"; then
        mkdir -p "$DEST_DIR"
        use_cache "release" "$DEST_PATH"
        echo "Done! Now rebuild in Xcode with Release scheme on your device."
        exit 0
    fi
fi

# Build
if [ "$FORCE_REBUILD" = true ]; then
    echo "(Forcing Rust recompile...)"
    touch src/lib.rs
fi

echo "Building Rust for iOS device (release)..."
cargo tauri build --target aarch64-apple-ios

echo "Copying library to Xcode location..."
mkdir -p "$DEST_DIR"
cp target/aarch64-apple-ios/release/deps/libpeek_save_lib.a "$DEST_PATH"

# Update cache
if [ "$NO_CACHE" = false ]; then
    update_cache "release" "$TAURI_DIR" "$DEST_PATH"
fi

echo "Done! Now rebuild in Xcode with Release scheme on your device."
