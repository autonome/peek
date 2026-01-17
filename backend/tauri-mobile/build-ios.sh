#!/bin/bash
# Script to build Rust library for iOS simulator manually

cd "$(dirname "$0")/src-tauri"
cargo tauri build --target aarch64-apple-ios-sim --debug
mkdir -p gen/apple/Externals/arm64/Debug
cp target/aarch64-apple-ios-sim/debug/deps/libpeek_save_lib.a \
   gen/apple/Externals/arm64/Debug/libapp.a
echo "✓ iOS library built successfully at gen/apple/Externals/arm64/Debug/libapp.a"
