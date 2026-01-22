# Peek Datastore

The Peek Personal Datastore stores addresses, navigation history, tags, notes, and other user data. It uses SQLite with a unified schema across all backends (Electron, Tauri, Server).

## Architecture

All data operations are handled in the main/backend process, with renderer processes accessing via IPC through `window.app.datastore`.

```
Renderer Process                    Main/Backend Process
┌─────────────────┐                ┌─────────────────────┐
│  window.app.    │  IPC invoke()  │  IPC Handlers       │
│  datastore.*    │───────────────▶│  ├─ add-item        │
│                 │                │  ├─ query-items     │
│                 │                │  ├─ add-visit       │
│                 │                │  └─ ...             │
└─────────────────┘                │         │           │
                                   │         ▼           │
                                   │  ┌─────────────┐    │
                                   │  │   SQLite    │    │
                                   │  │  Database   │    │
                                   │  └─────────────┘    │
                                   └─────────────────────┘
```

### Why IPC-Based?

1. **Backend Portability** - Same renderer code works with Electron, Tauri, or mobile
2. **Storage Flexibility** - Can swap SQLite for other backends without renderer changes
3. **Security** - Datastore logic in trusted main process
4. **Sync Readiness** - Same API can route to local or remote storage

## Database Schema

Location: `{app_data}/{profile}/datastore.sqlite`

### Core Tables

#### `items` - Unified Item Storage
Stores all user content types: URLs, text notes, tagsets, images.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (UUID) |
| type | TEXT | `url`, `text`, `tagset`, `image` |
| content | TEXT | The actual content (URL, note text, etc.) |
| title | TEXT | Display title |
| metadata | TEXT | JSON for flexible extra data |
| createdAt | TEXT | ISO timestamp |
| updatedAt | TEXT | ISO timestamp |
| syncedAt | TEXT | Last sync timestamp |
| sync_id | TEXT | Server-assigned ID for sync |

#### `visits` - Navigation History
Tracks page visits with timing and context.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key |
| addressId | TEXT | FK to items |
| timestamp | INTEGER | Unix timestamp (ms) |
| duration | INTEGER | Time spent (ms) |
| source | TEXT | `peek`, `slide`, `direct`, `link` |
| windowType | TEXT | `modal`, `persistent`, `main` |

#### `tags` - Tag Definitions
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key |
| name | TEXT | Tag name (unique) |
| frecency | REAL | Usage frequency score |

#### `item_tags` - Tag Associations
| Column | Type | Description |
|--------|------|-------------|
| item_id | TEXT | FK to items |
| tag_id | TEXT | FK to tags |

#### `extension_settings` - Extension Config
Key-value storage for extension and core settings.

| Column | Type | Description |
|--------|------|-------------|
| key | TEXT | Setting key (e.g., `sync.serverUrl`) |
| value | TEXT | JSON-encoded value |

## API Reference

Access via `window.app.datastore` in any `peek://` page.

### Items

```javascript
// Add item
const result = await api.datastore.addItem({
  type: 'url',
  content: 'https://example.com',
  title: 'Example',
  tags: ['bookmark', 'work']
});

// Query items
const urls = await api.datastore.queryItems({ type: 'url' });
const tagged = await api.datastore.queryItems({ tag: 'bookmark' });

// Update item
await api.datastore.updateItem(id, { title: 'New Title' });

// Delete item
await api.datastore.deleteItem(id);
```

### Tags

```javascript
// Get or create tag
const tag = await api.datastore.getOrCreateTag('bookmark');

// Tag an item
await api.datastore.tagItem(itemId, tagId);

// Untag
await api.datastore.untagItem(itemId, tagId);

// Get item's tags
const tags = await api.datastore.getItemTags(itemId);

// Get items by tag
const items = await api.datastore.getItemsByTag(tagId);
```

### Visits

```javascript
// Record visit
await api.datastore.addVisit(addressId, {
  source: 'peek',
  windowType: 'modal'
});

// Query visits
const history = await api.datastore.queryVisits({
  limit: 100,
  offset: 0
});
```

### Settings

```javascript
// Get setting
const value = await api.datastore.getSetting('sync.serverUrl');

// Set setting
await api.datastore.setSetting('sync.serverUrl', 'https://...');
```

### Stats

```javascript
const stats = await api.datastore.getStats();
// Returns: { items: 150, visits: 1200, tags: 25 }
```

## Sync

The datastore syncs between backends via the server API:

1. **Desktop ↔ Server**: Bidirectional sync in `backend/electron/sync.ts`
2. **Mobile → Server**: Push sync from mobile app
3. **Conflict Resolution**: Last-write-wins based on `updatedAt`

See `docs/sync.md` for sync architecture details.

## Files

- `backend/electron/datastore.ts` - Electron SQLite implementation
- `backend/tauri/src-tauri/src/datastore.rs` - Tauri SQLite implementation
- `backend/server/db.js` - Server SQLite implementation
- `app/datastore/` - Shared schema and helpers
