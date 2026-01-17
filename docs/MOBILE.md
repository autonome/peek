# Peek Mobile (Tauri iOS/Android)

This document covers mobile development for Peek using the `peek-save` app in `backend/tauri-mobile/`.

## Architecture

Mobile uses a **separate Tauri project** rather than sharing code with the desktop Tauri backend. This approach was chosen because:

1. **iOS requires extensive native configuration** - Share Extension, App Groups, entitlements, icons, provisioning
2. **Different UI paradigms** - Mobile has a focused "save URL with tags" workflow vs desktop's multi-window browser
3. **Build complexity** - iOS builds require Xcode project customization that gets overwritten by `xcodegen`

### Project Structure

```
backend/
├── electron/        # Desktop Electron backend
├── tauri/           # Desktop Tauri backend (macOS/Windows/Linux)
└── tauri-mobile/    # Mobile Tauri app (iOS/Android)
    ├── src/         # React + TypeScript frontend
    ├── src-tauri/   # Rust backend
    │   ├── src/     # Rust code
    │   └── gen/
    │       └── apple/  # iOS Xcode project
    │           ├── peek-save.xcodeproj
    │           ├── Peek/  # Share Extension
    │           └── peek-save_iOS/  # Main app
    └── CLAUDE.md    # Full mobile documentation
```

## Quick Start

### Commands

```bash
# Build frontend
yarn mobile:build

# Build iOS debug (simulator)
yarn mobile:ios:build

# Build iOS release (device)
yarn mobile:ios:build:release

# Open Xcode project (then build with Xcode GUI)
yarn mobile:ios:xcode

# Android
yarn mobile:android:init
yarn mobile:android:dev
yarn mobile:android:build
```

### iOS Build Workflow

1. Build the Rust library:
   ```bash
   yarn mobile:ios:build
   ```

2. Open Xcode:
   ```bash
   yarn mobile:ios:xcode
   ```

3. In Xcode GUI: Product → Build (Cmd+B)

4. Run on simulator or device from Xcode

## iOS Features

### Share Extension

The iOS app includes a Share Extension with full native UI for capturing URLs:

- Native Swift UIKit interface
- Frecency-sorted tag suggestions with domain-affinity boost
- Create new tags on the fly
- Detects duplicate URLs and shows existing tags
- Merges tags when saving duplicates

### Bundle Identifiers

- Main app: `com.dietrich.peek-mobile`
- Share extension: `com.dietrich.peek-mobile.share`
- App Group: `group.com.dietrich.peek-mobile`

### Data Storage

SQLite database in iOS App Groups container (`peek.db`), enabling sharing between main app and share extension. Uses WAL mode for concurrent access.

## Critical Guidelines

**CRITICAL - Build with Xcode GUI:**
- NEVER run `xcodebuild` commands from terminal for final builds
- Use Xcode GUI (Product → Build, Product → Run) for reliable builds
- CLI xcodebuild often fails silently with code signing issues

**CRITICAL - Do NOT run `xcodegen generate`:**
- The Xcode project has custom settings (entitlements, Info.plist, share extension)
- Running xcodegen overwrites these configurations
- Edit files directly and rebuild with Xcode GUI

**CRITICAL - Frontend Embedding:**
- Use `cargo tauri build`, NOT `cargo build`
- `cargo build` doesn't embed frontend assets - app shows localhost error
- Always copy from `deps/` folder, not root target folder

## Full Documentation

For complete mobile development documentation, see:
- `backend/tauri-mobile/CLAUDE.md` - Comprehensive guide including:
  - Build workflow details
  - Share Extension implementation
  - Database schema
  - Webhook sync
  - Troubleshooting
