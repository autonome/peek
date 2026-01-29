# Peek Datastore

The Peek Personal Datastore stores URLs, navigation history, tags, notes, and other user data. It uses SQLite with a unified schema across desktop backends (Electron, Tauri). The browser extension uses IndexedDB with the same logical schema.

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
| mimeType | TEXT | MIME type (e.g., `text/html`) |
| metadata | TEXT | JSON for flexible extra data |
| syncId | TEXT | Server-assigned ID for sync |
| syncSource | TEXT | Origin of sync (`server`, `history`, etc.) |
| syncedAt | INTEGER | Last sync timestamp (ms) |
| createdAt | INTEGER | Creation timestamp (ms) |
| updatedAt | INTEGER | Last update timestamp (ms) |
| deletedAt | INTEGER | Soft-delete timestamp (0 if active) |
| starred | INTEGER | 1 if starred |
| archived | INTEGER | 1 if archived |
| visitCount | INTEGER | Total visit count |
| lastVisitAt | INTEGER | Most recent visit timestamp |
| frecencyScore | INTEGER | Calculated frecency for ranking |
| title | TEXT | Display title (denormalized for URLs) |
| domain | TEXT | Domain (denormalized for URLs) |
| favicon | TEXT | Favicon URL (denormalized for URLs) |

#### `item_visits` - Navigation History
Tracks page visits with timing, context, and navigation chaining. Local-only (not synced).

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key |
| itemId | TEXT | FK to items |
| timestamp | INTEGER | Unix timestamp (ms) |
| duration | INTEGER | Time spent (ms) |
| source | TEXT | `direct`, `link`, `bookmark`, `reload`, etc. |
| sourceId | TEXT | ID of referring visit/item |
| windowType | TEXT | `main`, `modal`, `panel` |
| metadata | TEXT | JSON for extra context |
| scrollDepth | INTEGER | How far user scrolled (0-100) |
| interacted | INTEGER | 1 if user interacted (clicked, typed) |
| prevId | TEXT | Previous visit in chain |
| nextId | TEXT | Next visit in chain |

**Frecency Scoring**: Each device calculates frecency from its local visits using time-decay weighting. Recent visits and interactions score higher.

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
  metadata: { title: 'Example' }
});

// Query items
const urls = await api.datastore.queryItems({ type: 'url' });
const recent = await api.datastore.queryItems({ type: 'url', sortBy: 'lastVisit', limit: 20 });
const popular = await api.datastore.queryItems({ type: 'url', sortBy: 'frecency', limit: 20 });
const searched = await api.datastore.queryItems({ type: 'url', search: 'github' });

// Update item
await api.datastore.updateItem(id, { metadata: { title: 'New Title' } });

// Delete item (soft delete)
await api.datastore.deleteItem(id);
```

**Query filters**: `type`, `starred`, `archived`, `domain`, `search`, `limit`, `includeDeleted`
**Sort options**: `created`, `updated`, `frecency`, `lastVisit`, `visitCount`

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

### Visits & Navigation

```javascript
// Track a navigation (finds/creates item, records visit, updates frecency)
const result = await api.datastore.trackNavigation('https://example.com', {
  source: 'link',
  title: 'Example Page',
  favicon: 'https://example.com/favicon.ico'
});
// Returns: { visitId, itemId, created: true/false }

// Record visit to existing item
await api.datastore.recordItemVisit(itemId, {
  source: 'direct',
  interacted: 1
});

// Get visits for an item
const visits = await api.datastore.getItemVisits(itemId, { limit: 50 });

// Query by frecency (optimized for omnibox/history)
const topUrls = await api.datastore.queryItemsByFrecency({
  search: 'github',
  limit: 10
});
```

**Visit sources**: `direct`, `link`, `bookmark`, `reload`, `form`, `generated`, `frame`, `other`

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
