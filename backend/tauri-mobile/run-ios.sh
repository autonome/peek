#!/bin/bash
# Single command to run the iOS app with dev server

set -e

echo "🚀 Starting Peek iOS development..."

# Kill any existing Vite servers
lsof -ti:1420 | xargs kill -9 2>/dev/null || true

# Start Vite dev server in background
echo "📦 Starting Vite dev server..."
npx vite &
VITE_PID=$!

# Wait for Vite to be ready
echo "⏳ Waiting for Vite to start..."
for i in {1..30}; do
  if lsof -i:1420 2>/dev/null | grep -q LISTEN; then
    echo "✓ Vite ready on http://localhost:1420"
    break
  fi
  sleep 0.5
done

# Build Rust library
echo "🦀 Building Rust library for iOS..."
cd src-tauri
cargo build --target aarch64-apple-ios-sim --lib
mkdir -p gen/apple/Externals/arm64/debug
cp target/aarch64-apple-ios-sim/debug/libtauri_app_lib.a \
   gen/apple/Externals/arm64/debug/libapp.a
cd ..
echo "✓ Rust library built"

# Build and run in simulator
echo "📱 Building and deploying to simulator..."
cd src-tauri/gen/apple

# Find the first available iOS simulator
SIMULATOR_ID=$(xcrun simctl list devices | grep -m 1 "iPhone.*Booted" | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/')
if [ -z "$SIMULATOR_ID" ]; then
  # Boot the first available iPhone simulator
  SIMULATOR_ID=$(xcrun simctl list devices | grep -m 1 "iPhone" | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/')
  echo "📱 Booting simulator $SIMULATOR_ID..."
  xcrun simctl boot "$SIMULATOR_ID" 2>/dev/null || true
fi
echo "📱 Using simulator: $SIMULATOR_ID"

# Build and install
xcodebuild -project tauri-app.xcodeproj \
  -scheme tauri-app_iOS \
  -configuration Debug \
  -destination "id=$SIMULATOR_ID" \
  -derivedDataPath build \
  build

# Install the app
APP_PATH=$(find build/Build/Products/Debug-iphonesimulator -name "*.app" -maxdepth 1)
xcrun simctl install "$SIMULATOR_ID" "$APP_PATH"

# Launch the app
BUNDLE_ID="com.dietrich.peek"
xcrun simctl launch "$SIMULATOR_ID" "$BUNDLE_ID"

echo "✅ App launched successfully!"
echo "Press Ctrl+C to stop the dev server"

# Wait for Ctrl+C
trap "kill $VITE_PID 2>/dev/null; echo '🛑 Stopped'; exit" INT TERM
wait $VITE_PID
