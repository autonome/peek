# Development Guide

## Commands

```bash
# Install dependencies
yarn install

# Run in development mode (with devtools)
yarn debug

# Start the application normally
yarn start

# Package the application (output: out/mac-arm64/)
yarn package

# Package and install to /Applications (macOS)
yarn package:install

# Build distributable packages
yarn make

# Check for security vulnerabilities
yarn npm audit

# Test packaged build with dev profile
PROFILE=dev out/mac-arm64/Peek.app/Contents/MacOS/Peek
```

## Architecture Overview

### Core Structure

The application uses a multi-window Electron architecture:

1. **Main Process** (`index.js`):
   - Manages app lifecycle, windows, shortcuts, IPC communication
   - Implements custom `peek://` protocol for internal navigation
   - Handles profile management and data persistence
   - Hosts the TinyBase datastore with IPC handlers for renderer access

2. **Renderer Process** (`app/`):
   - Core app logic loads from `peek://app/background.html`
   - Feature modules: peeks, slides, scripts, cmd, groups
   - Settings UI at `peek://app/settings/settings.html`
   - Datastore viewer at `peek://app/datastore/viewer.html`

3. **Preload Script** (`preload.js`):
   - Bridges main/renderer with secure API exposure via contextBridge
   - Provides shortcuts, window management, pubsub, and datastore APIs

### Custom Protocol

- Uses `peek://` scheme for internal pages
- Cross-origin network access enabled for peek:// pages
- Special APIs available: window control, global hotkeys, pubsub messaging

### Profile Management

Profile is determined automatically:
- Packaged app (`/Applications/Peek.app`) uses `default` profile
- Running from source (`yarn start`) uses `dev` profile
- `PROFILE` env var overrides (e.g., `PROFILE=test yarn start`)

Profile data stored in `{userData}/{PROFILE}/` directory.

## App Icon Generation

The macOS app icon is generated from a source PNG using ImageMagick. The process applies rounded corners and adds padding to match macOS icon guidelines.

### Icon files in `assets/`

- `appicon-source.png` - Original source image (1232x1232, no rounding)
- `appicon-rounded.png` - Processed version with rounded corners and padding (1024x1024)
- `appicon.icns` - Final macOS icon file used by electron-builder

### Regenerating the icon

Requires ImageMagick (`brew install imagemagick`).

```bash
SRC="assets/appicon-source.png"
ROUNDED="assets/appicon-rounded.png"

SIZE=1232
RADIUS=222  # ~18% of size for rounded corners

# Step 1: Apply rounded corners to source
magick "$SRC" \
  \( +clone -alpha extract \
     -draw 'fill black polygon 0,0 0,'"$RADIUS $RADIUS"',0 fill white circle '"$RADIUS,$RADIUS $RADIUS"',0' \
     \( +clone -flip \) -compose Multiply -composite \
     \( +clone -flop \) -compose Multiply -composite \
  \) -alpha off -compose CopyOpacity -composite \
  /tmp/rounded-temp.png

# Step 2: Add padding (scale to 80% and center on 1024x1024 canvas)
magick /tmp/rounded-temp.png \
  -resize 824x824 \
  -gravity center \
  -background transparent \
  -extent 1024x1024 \
  "$ROUNDED"

# Step 3: Generate iconset and convert to icns
mkdir -p assets/AppIcon.iconset
for size in 16 32 64 128 256 512 1024; do
  magick "$ROUNDED" -resize ${size}x${size} PNG32:"assets/AppIcon.iconset/icon_${size}x${size}.png"
done

# Create @2x variants
cp assets/AppIcon.iconset/icon_32x32.png assets/AppIcon.iconset/icon_16x16@2x.png
cp assets/AppIcon.iconset/icon_64x64.png assets/AppIcon.iconset/icon_32x32@2x.png
cp assets/AppIcon.iconset/icon_256x256.png assets/AppIcon.iconset/icon_128x128@2x.png
cp assets/AppIcon.iconset/icon_512x512.png assets/AppIcon.iconset/icon_256x256@2x.png
cp assets/AppIcon.iconset/icon_1024x1024.png assets/AppIcon.iconset/icon_512x512@2x.png
rm assets/AppIcon.iconset/icon_64x64.png assets/AppIcon.iconset/icon_1024x1024.png

iconutil -c icns assets/AppIcon.iconset -o assets/appicon.icns
rm -rf assets/AppIcon.iconset /tmp/rounded-temp.png
```

### Icon design notes

- Rounded corners at ~18% radius matches common macOS app icon style
- 80% content size with 10% padding on each side matches Apple HIG
- Source image should be square, ideally 1024x1024 or larger

## Known Issues

- **Tray icon in packaged builds**: Tray icon displays correctly in debug mode but not in packaged app builds. Works fine in dev.
