#!/bin/bash
set -e

# Use --force flag to force full Rust recompile (for Rust code changes)
FORCE_REBUILD=false
if [ "$1" = "--force" ] || [ "$1" = "-f" ]; then
    FORCE_REBUILD=true
fi

echo "Building frontend..."
npm run build

echo "Building Rust for iOS device (release)..."
cd src-tauri

if [ "$FORCE_REBUILD" = true ]; then
    echo "(Forcing Rust recompile...)"
    touch src/lib.rs
fi

cargo tauri build --target aarch64-apple-ios

echo "Copying library to Xcode location..."
cp target/aarch64-apple-ios/release/deps/libpeek_save_lib.a gen/apple/Externals/arm64/Release/libapp.a

echo "Done! Now rebuild in Xcode with Release scheme on your device."
