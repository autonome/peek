# Peek Agent Instructions

This project uses the multi-agent workflow. See `~/sync/Dev/agent-workflow/` for:
- `WORKFLOW.md` - Full workflow documentation
- `AGENT_RULES.md` - Universal agent rules
- `multi-agent.zsh` - Shell commands reference

**Remotes:**
- Tangled: `git@tangled.sh:burrito.space/peek` (primary)
- GitHub: `git@github.com:autonome/peek`

---

## Quick Reference

```bash
mnext                    # Start agent on next Today item (enters plan mode)
magent <name> "prompt"   # Create workspace + window + start claude
mclean <name>            # Remove workspace/window
mmerge <name> "msg"      # Squash + cleanup
mpush                    # Push to remotes
```

---

## Peek-Specific Rules

### Protected Directories

**NEVER modify files in `./app` without explicit user approval.** The `app/` directory is backend-agnostic - it must work unchanged with both Electron and Tauri backends. All backend-specific code belongs in `backend/{electron,tauri}/`. If you think `app/` needs changes, ASK FIRST.

### Process Management

**Only use `yarn kill` to kill dev processes.** NEVER use generic pkill commands like `pkill -f "Peek"` or `pkill -f "electron"` - these will kill the user's production app.

```bash
yarn kill  # ONLY way to kill dev Peek
```

**Testing without UI**: When testing startup, logs, or non-interactive behavior, use headless mode:
```bash
./scripts/test-headless.sh 8    # Run headless for 8 seconds, auto-kills
yarn test:electron              # Run automated tests
```

### Command Pattern: Use scratch.sh

For any command beyond simple `yarn` scripts:

1. Write commands to `scratch.sh`
2. Run `./scratch.sh`

This keeps commands visible, auditable, and prevents `&&` chaining.

```bash
# Example workflow
echo '#!/bin/bash
cargo build --target aarch64-apple-ios
cp target/aarch64-apple-ios/release/lib*.a gen/apple/Externals/
' > scratch.sh
chmod +x scratch.sh
./scratch.sh
```

---

## Development Resources

- See `DEVELOPMENT.md` for architecture, commands, and common pitfalls
- See `docs/api.md` for the Peek API reference
- See `docs/extensions.md` for extension development
- See `docs/mobile.md` for iOS/Android development

---

## Database Migrations

### Migration Ordering
When adding columns via migration, ensure indexes on those columns are created AFTER the column migration:

**Wrong:**
```javascript
// CREATE TABLE includes index on column that doesn't exist yet
db.exec(`
  CREATE TABLE IF NOT EXISTS items (...);
  CREATE INDEX IF NOT EXISTS idx_sync_id ON items(sync_id);  // FAILS if table exists without column
`);
migrateAddSyncColumns(db);  // Too late!
```

**Correct:**
```javascript
db.exec(`CREATE TABLE IF NOT EXISTS items (...)`);
migrateAddSyncColumns(db);  // Adds sync_id column
db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_id ON items(sync_id)`);  // Now safe
```

---

## iOS/Tauri Mobile

### Build Both Libraries
iOS requires BOTH debug and release Rust libraries:
- **Debug** (aarch64-apple-ios-sim): For simulator testing
- **Release** (aarch64-apple-ios): For device testing

```bash
# Debug for simulator
cargo tauri build --target aarch64-apple-ios-sim --debug
cp target/aarch64-apple-ios-sim/debug/deps/lib*.a gen/apple/Externals/arm64/Debug/libapp.a

# Release for device
cargo tauri build --target aarch64-apple-ios
cp target/aarch64-apple-ios/release/deps/lib*.a gen/apple/Externals/arm64/Release/libapp.a
```

### Assets Symlink
Xcode needs frontend assets linked:
```bash
ln -s ../../../dist gen/apple/assets
```

### Build in Xcode GUI
Never use `xcodebuild` from terminal - use Xcode GUI for iOS builds.

### Xcode Build Hang Workaround
The "Build Rust Code" pre-build script in Xcode can hang indefinitely. Pre-build the Rust library outside Xcode first, then open Xcode and build normally.

---

## Railway Deployment (Peek Server)

### Quick Reference

| Item | Value |
|------|-------|
| Project | `amusing-courtesy` |
| Service | `peek-node` |
| Production URL | https://peek-node.up.railway.app/ |
| Directory | `backend/server/` |

### Complete Deployment Workflow

```bash
# 1. Navigate to server directory
cd backend/server

# 2. Run tests first (ALWAYS)
npm test

# 3. Link to Railway (one-time per workspace)
railway link -p amusing-courtesy
# Select: peek-node service, production environment

# 4. Deploy (detached mode)
railway up -d --service peek-node

# 5. Check deployment logs
railway logs -n 50 --service peek-node

# 6. Health check
curl https://peek-node.up.railway.app/
```

### Pre-Deployment Checklist

Before deploying, verify:
- [ ] `npm test` passes (all 92+ tests)
- [ ] No breaking API changes (check if mobile app compatibility affected)
- [ ] If database schema changed, migration handles existing data safely

### Creating Users and API Keys

Users are managed via the `users.js` module. Run from `backend/server/`:

```javascript
// In Node REPL: node -e "..."
// Create a new user (returns API key ONCE - save it!)
node -e "const u = require('./users'); console.log(u.createUser('username'))"

// List all users
node -e "const u = require('./users'); console.log(u.listUsers())"

// Regenerate API key for existing user
node -e "const u = require('./users'); console.log(u.regenerateApiKey('username'))"
```

**Important:** The raw API key is only shown once when created. Store it securely.

### Testing Against Production

```bash
# Set environment variables
export PEEK_PROD_KEY=<your-api-key>
export PEEK_PROD_URL=https://peek-node.up.railway.app

# Run production API tests
npm run test:api:prod

# Or test locally first
export PEEK_LOCAL_KEY=<local-test-key>
npm run test:api:local
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| Service not starting | Check `railway logs -n 100 --service peek-node` for errors |
| Database errors | Ensure volume is mounted at `DATA_DIR` path |
| Node module errors | Nixpacks rebuilds on each deploy; check Node version in logs |
| 401 Unauthorized | Verify API key with health check first; check key format |
| Deploy stuck | Cancel with Ctrl+C, check Railway dashboard for status |
| Old code running | Railway caches; force rebuild via dashboard or redeploy |

### Server + Mobile Deployment Order

When updating both server and mobile:
1. **Server first** - stateless, auto-migrations run on first request
2. **Mobile second** - works offline, adapts to server changes

---

## Electron/Desktop

### better-sqlite3 Node vs Electron Version Mismatch
Native modules compile for specific Node versions. Electron uses a different version than system Node.

```bash
# For Node.js (server tests, sync E2E tests)
npm rebuild better-sqlite3

# For Electron (desktop app)
npx electron-rebuild -f -w better-sqlite3
```

If you see `NODE_MODULE_VERSION` mismatch errors, rebuild for the correct runtime.
