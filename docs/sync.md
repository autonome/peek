# Peek Sync

Cross-platform data synchronization between mobile, desktop, and server.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Mobile    │────▶│   Server    │◀────│   Desktop   │
│  (Tauri)    │     │   (Hono)    │     │  (Electron) │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │                    │
      ▼                    ▼                    ▼
   SQLite              SQLite              SQLite
```

The server acts as the source of truth. All clients push and pull data via the server's REST API.

## Item Types

All platforms use the same unified types:

| Type | Description | Content Field |
|------|-------------|---------------|
| `url` | Saved URLs/bookmarks | The URL string |
| `text` | Text content/notes | The text content |
| `tagset` | Tag-only items | null |
| `image` | Binary images | Base64 data or filename |

## Sync Protocol

### Pull (Server → Client)

1. Fetch: `GET /items` (full) or `GET /items/since/:timestamp` (incremental)
2. For each server item:
   - Find local item by `syncId` matching server `id`
   - If not found: insert new item
   - If found and server is newer: update local
   - If local is newer: skip (will push later)

### Push (Client → Server)

1. Query items where `syncSource = ''` OR `updatedAt > lastSyncTime`
2. For each item: `POST /items` with type, content, tags
3. On success: update local `syncId` and `syncSource`

### Conflict Resolution

**Last-write-wins** based on `updatedAt` timestamp.

## API Endpoints

### Server

All endpoints accept a `?profile={uuid}` parameter (defaults to `default`):

```
GET  /items?profile=<uuid>                    # All items in profile
GET  /items/since/:timestamp?profile=<uuid>   # Items modified after timestamp
GET  /items/:id?profile=<uuid>               # Single item
POST /items?profile=<uuid>                   # Create item in profile
PATCH /items/:id/tags?profile=<uuid>         # Update tags
DELETE /items/:id?profile=<uuid>             # Delete item
```

The `profile` parameter is a server-side profile UUID. The server uses the UUID directly as the folder name on disk. Legacy slugs are resolved to UUIDs for backward compatibility.

**Profile Management:**
```
GET  /profiles                 # List user's profiles
POST /profiles                 # Create profile
DELETE /profiles/:id           # Delete profile
```

### Desktop IPC

```javascript
await window.app.sync.getConfig()     // Get server URL, API key
await window.app.sync.setConfig(cfg)  // Save config
await window.app.sync.pull()          // Pull from server
await window.app.sync.push()          // Push to server
await window.app.sync.full()          // Full bidirectional sync
```

## Configuration

### Desktop

Sync configuration is **per-profile** and stored in `profiles.db`:
- `api_key` - API key (authenticates with server user)
- `server_profile_slug` (mapped to `serverProfileId` in code) - Server profile UUID to sync to
- `last_sync_at` - Last sync timestamp
- `sync_enabled` - Enable sync for this profile

**Server URL** is environment-based (`SYNC_SERVER_URL` env var or default).

Each desktop profile can independently sync to different server profiles under the same server user account.

**Example:**
```
Desktop Profile    API Key        Server Profile
──────────────     ──────────     ──────────────
Work               alice's key    work
Personal           alice's key    personal
```

### Mobile

Sync configuration is stored in `profiles.json` in the App Group container:
- `sync.server_url` - Server URL (top-level, used for requests)
- `sync.api_key` - API key (top-level, used for auth)
- `profiles[].server_profile_id` - Server profile UUID for each local profile
- `profiles[].server_url` / `profiles[].api_key` - Per-profile sync config

The mobile sends `?profile=<server_profile_id>` on sync requests. If `server_profile_id` is not set, falls back to the local profile UUID.

## Server-Change Detection

When a user changes sync servers (or configures sync for the first time after having synced previously), per-item sync markers (`syncSource`, `syncedAt`, `syncId`) from the old server would prevent items from being pushed to the new server. Both desktop and mobile detect this:

1. After every pull or full sync, the current server URL and profile ID are saved to a `settings` table (`lastSyncServerUrl`, `lastSyncProfileId`).
2. Before `syncAll()`, the stored values are compared to the current config.
3. If they differ (server changed), all per-item sync markers are reset — making every item eligible for push.
4. If no stored values exist but items have `syncSource = 'server'` (upgrade/first-time tracking), those items are reset too.

This ensures no data loss when switching servers.

**Files:**
- `backend/electron/sync.ts`: `resetSyncStateIfServerChanged()`, `saveSyncServerConfig()`
- `backend/tauri-mobile/src-tauri/src/lib.rs`: `reset_sync_state_if_server_changed()`, `save_sync_server_config()`

## E2E Full Sync Test

`scripts/e2e-full-sync-test.sh` (`yarn e2e:full-sync`) runs a clean-room three-way sync test:

1. Starts a fresh temp server with 2 seeded items
2. Configures a desktop profile and seeds 2 items, pushes to server
3. Creates a fresh iOS simulator database with 2 items
4. Polls the server waiting for iOS to push (manual step: build in Xcode, sync in simulator)
5. Triggers desktop re-sync to pull iOS items
6. Verifies all three platforms have 6 items

All data is temporary and cleaned up on exit (including iOS simulator backup/restore).

## Known Limitations

### Deletes Not Synced (HIGH)

Deleted items are local-only. Items may "resurrect" on other devices after sync.

**Current behavior:**
1. Delete on desktop sets `deletedAt` locally
2. Deleted items excluded from push query
3. Server never learns about deletion
4. Other devices still see the item

**Workaround:** Delete on all devices manually.

### Push Failures Not Retried (HIGH)

Failed push operations are logged but not retried. After sync, `lastSyncTime` advances, so failed items won't be picked up on next sync.

**Workaround:** Manually trigger sync if network issues occurred.

## Files

- `backend/electron/sync.ts` - Desktop sync implementation
- `backend/server/db.js` - Server database with sync support
- `backend/tauri-mobile/src-tauri/src/lib.rs` - Mobile sync (pull/push/sync_all)
- `notes/sync-edge-cases.md` - Detailed edge case documentation
