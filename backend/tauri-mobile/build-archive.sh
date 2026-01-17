#!/bin/bash
# Build iOS archive for TestFlight distribution
#
# This script uses `tauri ios build` which:
# 1. Runs beforeBuildCommand (npm run build) to build frontend assets
# 2. Bundles frontend assets into the app
# 3. Builds Rust library for iOS device
# 4. Opens Xcode for archiving and distribution

set -e

cd "$(dirname "$0")"

echo "Building iOS app with Tauri..."
echo "This will build frontend, bundle assets, compile Rust, and open Xcode."
echo ""

# Use Tauri's build command which handles everything properly
npm run tauri ios build -- --open

echo ""
echo "Xcode should now be open."
echo "To distribute via TestFlight:"
echo "  1. In Xcode, go to Product > Archive"
echo "  2. Once archived, click 'Distribute App'"
echo "  3. Select 'App Store Connect' and follow the prompts"
