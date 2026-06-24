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
