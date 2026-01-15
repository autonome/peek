# Development Guide

## Commands

Bare commands (`dev`, `start`, `debug`, `kill`, `restart`) default to Electron. Use `BACKEND=tauri` to switch:

```bash
yarn debug                # Electron (default)
BACKEND=tauri yarn debug  # Tauri
yarn debug:electron       # Explicit Electron
yarn debug:tauri          # Explicit Tauri
```

All Electron commands automatically build TypeScript before running.

```bash
# Install dependencies
yarn install

# Run in development mode (with devtools + hot reload)
yarn debug

# Start the application normally
yarn start

# Build TypeScript only (usually not needed - commands auto-build)
yarn build
```

## Hot Reload (Electron only)

In dev mode (`yarn debug` or `DEBUG=1`), hot reload is enabled:
- Watches `app/` and `extensions/` directories
- Auto-reloads all windows when `.html`, `.js`, or `.css` files change
- No restart needed for renderer-side changes

Note: Changes to `backend/` TypeScript files still require rebuilding (`yarn build`) and restarting the app. Hot reload is not yet implemented for the Tauri backend.

```bash
# Typical dev workflow:
yarn debug          # Start app with hot reload
# Edit files in app/ or extensions/
# Windows auto-reload on save
```

```bash
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

3. **Peek API** (`window.app`):
   - Unified API exposed to all `peek://` pages
   - Provides shortcuts, window management, pubsub, datastore, and theme APIs
   - See `docs/PEEK-API.md` for complete reference

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

## Window API

### Opening Windows

```javascript
import windows from './windows.js';

// Modal window (closes on blur/ESC)
windows.openModalWindow(url, options);

// Regular window
windows.createWindow(url, options);
```

### Window Options

| Option | Type | Description |
|--------|------|-------------|
| `width`, `height` | number | Window dimensions |
| `x`, `y` | number | Window position |
| `modal` | boolean | Frameless, closes on blur |
| `key` | string | Unique ID for window reuse |
| `keepLive` | boolean | Hide instead of close |
| `escapeMode` | string | ESC behavior: `'close'`, `'navigate'`, `'auto'` |
| `trackingSource` | string | Source for visit tracking |

### Escape Handling

Windows can control how ESC behaves using `escapeMode`:

- **`'close'`** (default): ESC immediately closes/hides the window
- **`'navigate'`**: Renderer handles ESC first; closes only when renderer signals root state
- **`'auto'`**: Transient windows (opened via hotkey from another app) close immediately; active windows use navigate behavior

#### Using escapeMode: 'navigate'

1. Open window with `escapeMode: 'navigate'`:
```javascript
windows.createWindow(url, { escapeMode: 'navigate' });
```

2. Register escape handler in renderer:
```javascript
api.escape.onEscape(() => {
  if (canNavigateBack) {
    navigateBack();
    return { handled: true };  // ESC was handled internally
  }
  return { handled: false };   // At root, let window close
});
```

See `notes/escape-navigation.md` for full design details.

## Dock / App Switcher Visibility (macOS)

The dock icon visibility is dynamic based on window state and user preference:

- **Windows visible**: Dock icon shown (regardless of preference)
- **No windows visible**: Dock icon hidden (unless preference enabled)

The `showInDockAndSwitcher` preference controls whether to *always* show the dock icon, even when no windows are open. When disabled (default), the dock icon only appears while Peek windows are visible.

This is implemented via:
- `getVisibleWindowCount()` - counts non-background visible windows
- `updateDockVisibility()` - shows/hides dock based on window count + pref
- Called from: window-open, window-show, maybeHideApp, prefs change

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
