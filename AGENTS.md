# Peek Agent Instructions

Project-specific rules and context for agents working on Peek.

**Remotes:**
- Tangled: `git@tangled.sh:burrito.space/peek` (primary)
- GitHub: `git@github.com:autonome/peek`

---

## Protected Directories

**NEVER modify files in `./app` without explicit user approval.** The `app/` directory is backend-agnostic - it must work unchanged with both Electron and Tauri backends. All backend-specific code belongs in `backend/{electron,tauri}/`. If you think `app/` needs changes, ASK FIRST.

---

## Process Management

**Only use `yarn kill` to kill dev processes.** NEVER use generic pkill commands like `pkill -f "Peek"` or `pkill -f "electron"` - these will kill the user's production app.

```bash
yarn kill  # ONLY way to kill dev Peek
```

**Testing without UI**: When testing startup, logs, or non-interactive behavior, use headless mode:
```bash
./scripts/test-headless.sh 8    # Run headless for 8 seconds, auto-kills
yarn test:electron              # Run automated tests
```

---

## Development Resources

- `DEVELOPMENT.md` - Architecture, commands, common pitfalls
- `docs/api.md` - Peek API reference
- `docs/extensions.md` - Extension development
- `docs/mobile.md` - iOS/Android development

---

## Database Migrations

When adding columns via migration, ensure indexes are created AFTER the column migration:

```javascript
// Correct order:
db.exec(`CREATE TABLE IF NOT EXISTS items (...)`);
migrateAddSyncColumns(db);  // Adds sync_id column
db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_id ON items(sync_id)`);  // Now safe
```

---

## iOS/Tauri Mobile

### Build Both Libraries
iOS requires BOTH debug and release Rust libraries:

```bash
# Debug for simulator
cargo tauri build --target aarch64-apple-ios-sim --debug
cp target/aarch64-apple-ios-sim/debug/deps/lib*.a gen/apple/Externals/arm64/Debug/libapp.a

# Release for device
cargo tauri build --target aarch64-apple-ios
cp target/aarch64-apple-ios/release/deps/lib*.a gen/apple/Externals/arm64/Release/libapp.a
```

### Assets Symlink
```bash
ln -s ../../../dist gen/apple/assets
```

### Build in Xcode GUI
Never use `xcodebuild` from terminal - use Xcode GUI for iOS builds. The "Build Rust Code" pre-build script can hang; pre-build outside Xcode first.

---

## Railway Deployment (Server)

| Item | Value |
|------|-------|
| Project | `amusing-courtesy` |
| Service | `peek-node` |
| URL | https://peek-node.up.railway.app/ |
| Directory | `backend/server/` |

### Deployment

```bash
cd backend/server
npm test                              # Always test first
railway link -p amusing-courtesy      # One-time per workspace
railway up -d --service peek-node     # Deploy
railway logs -n 50 --service peek-node
```

### User Management

```bash
node -e "const u = require('./users'); console.log(u.createUser('username'))"
node -e "const u = require('./users'); console.log(u.listUsers())"
```

### Deployment Order
1. **Server first** - stateless, auto-migrations
2. **Mobile second** - works offline, adapts to server

---

## Electron/Desktop

### better-sqlite3 Version Mismatch

```bash
# For Node.js (server, tests)
npm rebuild better-sqlite3

# For Electron (desktop app)
npx electron-rebuild -f -w better-sqlite3
```
