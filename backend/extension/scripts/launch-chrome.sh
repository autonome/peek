#!/bin/bash
# Launch Chrome with a temp profile and the Peek extension loaded

set -e

EXTENSION_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_DIR="/tmp/peek-chrome-profile"

# Detect Chrome binary
if [[ "$OSTYPE" == "darwin"* ]]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif command -v google-chrome &>/dev/null; then
  CHROME="google-chrome"
elif command -v chromium &>/dev/null; then
  CHROME="chromium"
elif command -v chromium-browser &>/dev/null; then
  CHROME="chromium-browser"
else
  echo "Error: Chrome/Chromium not found"
  exit 1
fi

mkdir -p "$PROFILE_DIR"

echo "Launching Chrome with Peek extension..."
echo "  Profile: $PROFILE_DIR"
echo "  Extension: $EXTENSION_DIR"

"$CHROME" \
  --user-data-dir="$PROFILE_DIR" \
  --load-extension="$EXTENSION_DIR" \
  --no-first-run
