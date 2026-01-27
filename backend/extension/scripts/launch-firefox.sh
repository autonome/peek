#!/bin/bash
# Launch Firefox with a temp profile for extension development

set -e

EXTENSION_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_DIR="/tmp/peek-firefox-profile"

# Detect Firefox binary
if [[ "$OSTYPE" == "darwin"* ]]; then
  FIREFOX="/Applications/Firefox.app/Contents/MacOS/firefox"
elif command -v firefox &>/dev/null; then
  FIREFOX="firefox"
else
  echo "Error: Firefox not found"
  exit 1
fi

mkdir -p "$PROFILE_DIR"

echo "Launching Firefox with temp profile..."
echo "  Profile: $PROFILE_DIR"
echo ""
echo "To load the extension:"
echo "  1. Navigate to about:debugging"
echo "  2. Click 'This Firefox'"
echo "  3. Click 'Load Temporary Add-on...'"
echo "  4. Select: $EXTENSION_DIR/manifest.json"
echo ""

"$FIREFOX" \
  --profile "$PROFILE_DIR" \
  --no-remote
