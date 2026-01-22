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

```
GET  /items                    # All items
GET  /items/since/:timestamp   # Items modified after timestamp
GET  /items/:id               # Single item
POST /items                   # Create item
PATCH /items/:id/tags         # Update tags
DELETE /items/:id             # Delete item
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

Sync settings stored in `extension_settings` table:
- `sync.serverUrl` - Server URL
- `sync.apiKey` - API key
- `sync.lastSyncTime` - Last sync timestamp
- `sync.autoSync` - Enable auto-sync

### Mobile

Settings keys in Tauri:
- `webhook_url` - Server URL
- `webhook_api_key` - API key

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
- `backend/tauri-mobile/src-tauri/src/commands/sync.rs` - Mobile sync
- `notes/sync-edge-cases.md` - Detailed edge case documentation
