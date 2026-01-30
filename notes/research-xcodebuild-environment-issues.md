# Research: xcodebuild CLI vs Xcode GUI Environment Issues

## Problem

Running `xcodebuild` from the command line can conflict with Xcode GUI builds due to shared DerivedData paths. This causes issues like:
- Build artifacts from one environment interfering with the other
- Incremental build state getting corrupted
- "Stale" build products being used unexpectedly

## Solution

Use isolated DerivedData paths for CLI builds:

```bash
xcodebuild -scheme peek-save_iOS \
    -configuration Debug \
    -sdk iphonesimulator \
    -derivedDataPath /tmp/peek-xcodebuild \
    -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
    build
```

Key points:
- `-derivedDataPath /tmp/peek-xcodebuild` - Isolates CLI builds from Xcode GUI
- Xcode GUI uses `~/Library/Developer/Xcode/DerivedData/` by default
- No interference between the two build environments

## Scripts Added

```bash
# List available schemes
yarn mobile:ios:xcodebuild:list

# Build Debug with CLI
yarn mobile:ios:xcodebuild

# Build Release with CLI
yarn mobile:ios:xcodebuild:release

# Install to simulator (Debug)
yarn mobile:ios:xcodebuild:install

# Install to simulator (Release)
yarn mobile:ios:xcodebuild:install:release

# Full flow: Rust lib + xcodebuild + install
yarn mobile:ios:xcodebuild:full

# Fully automated e2e test (CLI build + headless + auto-sync)
yarn interactive-test:e2e:full-sync:auto
```

## E2E Test Integration

The `--build` flag for `e2e-full-sync-test.sh` enables CLI builds:

```bash
# Uses xcodebuild CLI instead of opening Xcode GUI
yarn interactive-test:e2e:full-sync -- --headless --build
```

Combined with the `PEEK_AUTO_SYNC=true` env var support in the iOS app, this enables fully automated e2e testing without any manual intervention.

## Release CLI Builds

### The Problem

When running `-configuration Release` via CLI, the Share Extension target was ignoring the configuration flag and building in Debug mode. This caused path mismatches:
- GRDB (SPM dependency) built to `Release-iphonesimulator/`
- Share Extension looked for dependencies in `debug-iphonesimulator/`
- Build failed with: `lstat(.../debug-iphonesimulator/GRDB_GRDB.bundle): No such file or directory`

### Root Cause

The xcodebuild `-configuration` flag doesn't always propagate to embedded extension targets when they're built as implicit dependencies. The Xcode build system determines the configuration for each target independently.

### The Fix

Two changes were needed:

1. **Force configuration via build setting override**:
   ```bash
   xcodebuild ... CONFIGURATION=Release build
   ```
   This overrides the configuration for ALL targets, not just the main app.

2. **Symlink Debug simulator library to Release path**:
   ```bash
   ln -sf ../Debug/libapp.a Externals/arm64/Release/libapp.a
   ```
   We only have a Debug build of libapp.a for the simulator (Release is for device deployment). Symlinking lets the Release build find the library.

### Why This Works

| Component | Debug Build | Release Build |
|-----------|-------------|---------------|
| `-configuration` flag | Targets use debug | Targets use **debug** (ignored by extensions) |
| `CONFIGURATION=Release` build setting | N/A | **Forces Release on all targets** |
| Rust library (libapp.a) | `Externals/arm64/Debug/` | `Externals/arm64/Release/` (symlinked from Debug) |

## References

- Apple: [xcodebuild man page](https://developer.apple.com/library/archive/technotes/tn2339/_index.html)
- Tauri Mobile: `backend/tauri-mobile/src-tauri/gen/apple/peek-save.xcodeproj`
