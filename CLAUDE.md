# Sync Server — Agent Guide

This is the Peek webhook/sync server: a Node.js/Hono app that receives URLs, texts, tagsets, and images from the mobile app and stores them in SQLite. It supports both multi-user (hosted) and single-user (self-hosted) deployments.

Code lives under `apps/server/`. Key files:
- `index.js` — main HTTP server (Hono)
- `db.js` — database layer
- `auth.js` / `users.js` — auth and user management
- `backup.js` — backup logic
- `sql/` — SQLite adapter abstraction
- `storage/` — blob/image storage abstraction
- `railway.json` — Railway deployment config

For cross-cutting rules (jj workflow, subagent dispatch, Bash discipline), see the root `CLAUDE.md`.

---

## Testing

```bash
yarn server:test            # Unit tests (run from repo root)
yarn test:sync:e2e          # Sync E2E tests (13 tests)
```

Or from `apps/server/` directly:
```bash
npm test                    # Unit tests
npm run test:api:local      # Test against local server (requires PEEK_LOCAL_KEY env var)
npm run test:api:prod       # Test against production (requires PEEK_PROD_KEY + PEEK_PROD_URL)
```

### ⚠️ Native-module ABI: NEVER `npm rebuild better-sqlite3` at the repo root

The root `node_modules/better-sqlite3` is a **shared native module built for
Electron's ABI** (via the root `postinstall: electron-rebuild -f -w better-sqlite3`).
The desktop app (`apps/desktop`) loads it inside Electron. The server runs under
**system Node**, whose ABI differs from Electron's — so the same binary can't
serve both.

- To run server tests under system Node, give the server its **own** copy:
  `npm install --prefix apps/server` (creates `apps/server/node_modules/better-sqlite3`
  built for system Node). `require("better-sqlite3")` from `apps/server` resolves
  there first, so the server never needs the root copy. `yarn server:test` then
  works regardless of the root binary's ABI.
- **Do NOT run `npm rebuild better-sqlite3` (or plain `npm rebuild`) at the repo
  root** to "fix" a server-side ABI error — it clobbers the Electron build and
  **breaks every Electron/desktop test** (`ERR_DLOPEN_FAILED`,
  `NODE_MODULE_VERSION` mismatch). This caused a desktop-test outage on
  2026-06-24.
- If the root copy ever gets clobbered, restore it with the canonical command:
  `node_modules/.bin/electron-rebuild -f -w better-sqlite3` (run from repo root),
  then verify with `node scripts/check-native-modules.js`
  (prints "better-sqlite3 loads in Electron — skip rebuild" when correct).
- `.nvmrc` pins Node 22, but the machine default may be newer (e.g. v24). The
  server's own `better-sqlite3` just needs to match whichever Node actually runs
  the tests — install it with that Node.

---

## Deployment

Railway auto-deploys from the `deploy/server` branch on GitHub (`github.com/autonome/peek`). Deploy by running from the repo root:

```bash
yarn server:deploy
```

This script (`scripts/deploy-server.sh`) subtree-splits `apps/server/` and force-pushes to the `deploy/server` git branch on GitHub.

**Important:** Railway uses Nixpacks with npm. **Do not add `yarn.lock` to `apps/server/`** — Nixpacks will detect it and switch to yarn, which breaks the build. The deploy script strips `yarn.lock` automatically.

### Railway Setup
1. Connect Railway project to the `deploy/server` branch on GitHub
2. Attach a volume, set `DATA_DIR` to the mount path
3. Create users via admin commands (see `apps/server/README.md`)

---

## Operating the live server (logs / status / env)

The `railway` CLI is installed and authenticated (`me@burrito.space`). You **do**
have read/diagnostic access — don't tell the user you can't reach Railway. The
peek server is Railway project **`amusing-courtesy`**, service **`peek-node`**
(`peek-node.up.railway.app`, volume at `/app/data`). The repo root is linked to
it; pass `--service peek-node` anyway so it works regardless of link state.

Read-only — go ahead:

```bash
railway logs --service peek-node --lines 200     # runtime logs (recent, no stream)
railway logs --service peek-node --build         # last build logs
railway status --json                            # deploy state, domain, volume
railway variables --service peek-node            # env vars
```

State-changing — **confirm with the user first** (production mutation):

```bash
railway redeploy --service peek-node             # re-run last deploy
railway restart --service peek-node
railway variables --service peek-node --set KEY=value
```

**Deploy is NOT a Railway-CLI op.** `yarn server:deploy` force-pushes a subtree
to GitHub `deploy/server`, which Railway auto-builds. That's a push to an
external remote → it needs explicit user authorization (never push unprompted).
"I can't deploy" is correct; "I can't read logs" is not.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | SQLite + blob storage root |
| `API_KEY` | — | Legacy single-user key (auto-migrates) |

For test scripts, copy `apps/server/.env.example` to `.env` and fill in:
- `PEEK_LOCAL_KEY` — local dev API key
- `PEEK_PROD_KEY` / `PEEK_PROD_URL` — production testing

---

## Architecture Notes

The server uses abstraction layers so it can run on different SQLite backends (currently better-sqlite3) and different storage backends (currently filesystem). See `apps/server/ARCHITECTURE.md` for the full interface contracts.

`SINGLE_USER_MODE=true yarn server:test` exercises the single-user deployment path.

---

## Key Pitfalls

- This server is a simple webhook receiver, **not** the portable.agency service. The portable-agency-ops skill is about a different project (Bluesky OAuth). Do not apply its Railway/OAuth patterns here unless specifically instructed.
- Never commit `yarn.lock` to `apps/server/` — it breaks Railway Nixpacks.
- The `deploy/server` git branch lives on GitHub (`github.com/autonome/peek`), not the primary tangled.sh remote. `yarn server:deploy` handles the push automatically.
