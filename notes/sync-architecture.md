# Sync Architecture

This document describes the cross-platform sync system for Peek, enabling data synchronization between the mobile app, desktop app, and server.

## Overview

Peek uses a centralized sync architecture where the server acts as the single source of truth. All clients (mobile, desktop) can push and pull data to/from the server.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Mobile    │────▶│   Server    │◀────│   Desktop   │
│  (Tauri)    │     │   (Hono)    │     │  (Electron) │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │                    │
      ▼                    ▼                    ▼
   SQLite              SQLite              SQLite
```

## Unified Type System

All platforms use the same item types:

| Type | Description | Content Field |
|------|-------------|---------------|
| `url` | Saved URLs/bookmarks | The URL string |
| `text` | Text content/notes | The text content |
| `tagset` | Tag-only items (no content) | null |
| `image` | Binary images | Base64 data or filename |

### Desktop Schema Migration

The desktop app previously used `note` instead of `text`. A migration (`migrateToUnifiedItemTypes()` in `datastore.ts`) automatically converts existing items when the database is opened.

## Sync Protocol

### Timestamp Formats

- **Desktop**: Unix milliseconds (`Date.now()`)
- **Server**: ISO 8601 strings (`new Date().toISOString()`)

The sync module handles conversion transparently.

### Pull (Server → Desktop)

1. Fetch items: `GET /items` (full) or `GET /items/since/:timestamp` (incremental)
2. For each server item:
   - Find local item by `syncId` matching server `id`
   - If not found: insert with `syncId=server.id`, `syncSource='server'`
   - If found and server is newer (`updated_at > local.updatedAt`): update local
   - If found and local is newer: skip (will be pushed later)

### Push (Desktop → Server)

1. Query items where `syncSource = ''` (never synced) OR `updatedAt > lastSyncTime`
2. For each item:
   - `POST /items` with type, content, tags, metadata
   - On success: update local `syncId` and `syncSource='server'`

### Conflict Resolution

**Last-write-wins** based on `updatedAt` timestamp:
- When pulling: if `serverItem.updated_at > localItem.updatedAt`, server wins
- When both modified: local is preserved during pull, then pushed to overwrite server

## API Endpoints

### Server Sync Endpoints

```
GET /items                    # All items
GET /items/since/:timestamp   # Items modified after timestamp (ISO 8601)
GET /items/:id               # Single item by ID
POST /items                  # Create new item
PATCH /items/:id/tags        # Update item tags
DELETE /items/:id            # Delete item
```

### Desktop IPC Handlers

```javascript
// Configuration
ipcMain.handle('sync-get-config')    // Get server URL, API key, etc.
ipcMain.handle('sync-set-config')    // Save sync config

// Sync operations
ipcMain.handle('sync-pull')          // Pull from server
ipcMain.handle('sync-push')          // Push to server
ipcMain.handle('sync-full')          // Full bidirectional sync
ipcMain.handle('sync-status')        // Get sync status
```

## Configuration

Sync settings are stored in the `extension_settings` table with `extensionId = 'sync'`:

| Key | Type | Description |
|-----|------|-------------|
| `serverUrl` | string | Server URL (e.g., `https://api.peek.app`) |
| `apiKey` | string | API key for authentication |
| `lastSyncTime` | number | Unix ms of last successful sync |
| `autoSync` | boolean | Enable automatic background sync |

## Database Schema

### Desktop Items Table

```sql
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('url', 'text', 'tagset', 'image')),
  content TEXT,
  mimeType TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}',
  syncId TEXT DEFAULT '',      -- Server item ID
  syncSource TEXT DEFAULT '',  -- 'server' if synced
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER DEFAULT 0,
  starred INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0
);
```

### Server Items Table

```sql
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('url', 'text', 'tagset', 'image')),
  content TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
```

## Testing

Run sync integration tests:

```bash
yarn test:sync           # Normal output
yarn test:sync:verbose   # Verbose server logs
```

Tests cover:
- Pull to empty desktop
- Push from desktop
- Bidirectional sync
- Conflict resolution
- Incremental sync
- All types (url, text, tagset, image)
- Tags sync

## Known Limitations

1. **No offline queue**: If sync fails, items aren't queued for retry
2. **No binary image sync**: Images are currently metadata-only (no file sync)
3. **No real-time sync**: Polling-based, no WebSocket updates
4. **Single-user per API key**: No multi-device account management
5. **Mobile → Server only**: No pull/download sync from server to mobile

## Deployment Order

When deploying updates to both server and mobile:

1. **Deploy server first**
   - Server is stateless and can be updated independently
   - Auto-migrations run on first request per user database
   - Always run `npm test` before deploying

2. **Update mobile second**
   - Mobile works offline and adapts to server changes
   - Users can update when ready

**Why this order:**
- Server changes can't break existing mobile apps (backwards compatible)
- Mobile apps continue working offline if server is temporarily down
- No data flows server→mobile, so server changes can't corrupt mobile data

## Future Improvements

- [ ] Add offline queue with retry logic
- [ ] Binary file sync for images
- [ ] WebSocket for real-time updates
- [ ] Pagination for large syncs
- [ ] Soft delete sync (currently hard deletes aren't synced)
