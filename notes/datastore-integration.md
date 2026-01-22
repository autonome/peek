# Datastore Integration Summary

Date: 2025-11-12
Branch: datastore

**ARCHITECTURE NOTE**: This document originally described a `window.datastore` approach. The actual implementation uses an **IPC-based architecture** with the datastore in the main process. See [datastore-architecture.md](./datastore-architecture.md) for the complete architectural documentation.

## What Was Built

### Core Datastore Module
- ✅ **Full TinyBase implementation** with schema, indexes, relationships, metrics
- ✅ **7 tables**: addresses, visits, content, tags, blobs, scripts_data, feeds
- ✅ **IPC-based API** accessed via `api.datastore` in renderer processes
- ✅ **Datastore in main process** for security, isolation, and portability
- ✅ **Comprehensive testing** - all IPC handlers verified working
- ✅ **Complete separation** between storage layer and features

### Files Created/Modified

**New Files:**
- `app/datastore/schema.js` - TinyBase schema definitions
- `app/datastore/config.js` - Configuration
- `app/datastore/history.js` - Navigation history tracking helpers (uses IPC API)
- `app/datastore/test-ipc.html` - IPC API test page
- `notes/datastore-research.md` - Technology research & comparison
- `notes/datastore-schema.md` - Detailed schema documentation
- `notes/datastore-architecture.md` - **Complete architectural documentation**
- `notes/datastore-integration.md` - This file

**Modified Files:**
- `index.js` - **Datastore initialization in main process** (lines 115-230, 979-1230)
- `preload.js` - **Expose api.datastore via IPC** (lines 210-242)
- `app/index.js` - Import history tracking helpers, expose via window.datastoreHistory
- `app/scripts/index.js` - Save script results using api.datastore IPC
- `app/peeks/index.js` - Track peek navigation via history helpers
- `app/slides/index.js` - Track slide navigation via history helpers
- `package.json` - Added tinybase@0.7.2 dependency

## Integration Details

### 1. Scripts Feature Integration

**What it does:**
- Saves all script extraction results to `scripts_data` table
- Tracks changes between runs
- Creates/links addresses for script URLs
- Maintains full history of extracted values

**Implementation:**
```javascript
// In app/scripts/index.js
const saveScriptResult = async (script, result) => {
  // Find or create address using IPC
  const addressesResult = await api.datastore.queryAddresses({});
  let addressId;

  if (addressesResult.success) {
    const existing = addressesResult.data.find(a => a.uri === script.address);
    if (existing) {
      addressId = existing.id;
    } else {
      const addResult = await api.datastore.addAddress(script.address, {
        title: `Script: ${script.title}`
      });
      addressId = addResult.id;
    }
  }

  // Check for previous values using IPC
  const prevResults = await api.datastore.getTable('scripts_data');
  let changed = 1;

  if (prevResults.success) {
    const scriptResults = Object.entries(prevResults.data)
      .filter(([id, row]) => row.scriptId === script.id)
      .sort((a, b) => b[1].extractedAt - a[1].extractedAt);
    if (scriptResults.length > 0) {
      changed = (result !== scriptResults[0][1].content) ? 1 : 0;
    }
  }

  // Save to datastore using IPC
  await api.datastore.setRow('scripts_data', rowId, {
    scriptId, scriptName, addressId, selector,
    content: result, contentType: 'text',
    extractedAt: Date.now(),
    previousValue, changed
  });
};
```

**Data captured:**
- Script ID and name
- Source address (with automatic address creation)
- CSS selector used
- Extracted content
- Timestamp
- Previous value for change detection
- Changed flag

### 2. Navigation History Tracking

**What it does:**
- Tracks every navigation from peeks and slides
- Creates address records automatically
- Records visit metadata (source, windowType, duration)
- Updates visit counts and timestamps

**Implementation:**
```javascript
// In app/datastore/history.js
export const trackNavigation = async (uri, options = {}) => {
  // Get or create address using IPC
  let addressId;
  const addressesResult = await api.datastore.queryAddresses({});

  if (addressesResult.success) {
    const existing = addressesResult.data.find(addr => addr.uri === uri);

    if (existing) {
      addressId = existing.id;
    } else {
      const addResult = await api.datastore.addAddress(uri, {
        title: options.title || '',
        mimeType: options.mimeType || 'text/html'
      });
      addressId = addResult.id;
    }
  }

  // Add visit record using IPC
  const visitResult = await api.datastore.addVisit(addressId, {
    source: options.source || 'direct',
    sourceId: options.sourceId || '',
    windowType: options.windowType || 'main',
    duration: options.duration || 0,
    metadata: JSON.stringify(options.metadata || {})
  });

  return { visitId: visitResult.id, addressId };
};
```

**Data captured:**
- Full URI and parsed components (protocol, domain, path)
- Page title
- Visit timestamp
- Source feature (peek, slide, direct)
- Source ID (peek_3, slide_left, etc.)
- Window type (modal, persistent, main)
- Visit count and last visit time

### 3. Peeks Integration

**Integration point:** `app/peeks/index.js:32-44`

```javascript
windows.openModalWindow(item.address, params)
  .then(result => {
    // Track navigation in datastore
    if (window.datastoreHistory) {
      window.datastoreHistory.trackNavigation(item.address, {
        source: 'peek',
        sourceId: `peek_${item.keyNum}`,
        windowType: 'modal',
        title: item.title
      });
    }
  });
```

**Tracks:**
- Which peek was opened (peek_0 through peek_9)
- URL visited
- Modal window type
- Creates address if first visit

### 4. Slides Integration

**Integration point:** `app/slides/index.js:147-155`

```javascript
windows.openModalWindow(item.address, params).then(result => {
  if (result.success) {
    // Track navigation in datastore
    if (window.datastoreHistory) {
      window.datastoreHistory.trackNavigation(item.address, {
        source: 'slide',
        sourceId: `slide_${item.screenEdge}`,
        windowType: 'modal',
        title: item.title
      });
    }
  }
});
```

**Tracks:**
- Which slide direction (slide_left, slide_right, slide_up, slide_down)
- URL visited
- Modal window type
- Reuses existing address records

## API Available to Features

### Datastore Core API (IPC-based)

All methods are async and return Promises with structure: `{ success: boolean, data?: any, error?: string, id?: string }`

```javascript
// Access via api.datastore (exposed through preload.js)

// Addresses
await api.datastore.addAddress(uri, options)
await api.datastore.getAddress(id)
await api.datastore.updateAddress(id, updates)
await api.datastore.queryAddresses(filter)

// Visits
await api.datastore.addVisit(addressId, options)
await api.datastore.queryVisits(filter)

// Content
await api.datastore.addContent(options)

// Direct table access
await api.datastore.getTable(tableName)
await api.datastore.setRow(tableName, rowId, rowData)

// Stats
await api.datastore.getStats()
```

**Note**: All IPC operations are asynchronous. Always use `await` or `.then()` and check the `success` field before using `data`.

### History Helper API

```javascript
// Access via window.datastoreHistory

// Track navigation
window.datastoreHistory.trackNavigation(uri, {
  source, sourceId, windowType, duration, metadata
})

// Query history
window.datastoreHistory.getHistory(filter)

// Get frequent addresses
window.datastoreHistory.getFrequentAddresses(limit)

// Get recent addresses
window.datastoreHistory.getRecentAddresses(limit)
```

## Example Queries (Using IPC API)

### Get Recent Navigation History
```javascript
const recentVisits = await window.datastoreHistory.getHistory({ limit: 20 });
// Returns: [{ id, addressId, timestamp, source, address: {...} }, ...]
```

### Find Most Visited Sites
```javascript
const result = await api.datastore.queryAddresses({
  sortBy: 'visitCount',
  limit: 10
});

if (result.success) {
  const frequent = result.data;
  // Use frequent addresses...
}
```

### Get All Script Results That Changed
```javascript
const tableResult = await api.datastore.getTable('scripts_data');

if (tableResult.success) {
  const changedResults = Object.entries(tableResult.data)
    .filter(([id, row]) => row.changed === 1)
    .map(([id, row]) => ({ id, ...row }));
}
```

### Get Script History for Specific Script
```javascript
const scriptId = 'my-script-id';
const tableResult = await api.datastore.getTable('scripts_data');

if (tableResult.success) {
  const history = Object.entries(tableResult.data)
    .filter(([id, row]) => row.scriptId === scriptId)
    .sort((a, b) => b[1].extractedAt - a[1].extractedAt)
    .map(([id, row]) => ({ id, ...row }));
}
```

### Get All Markdown Content
```javascript
const result = await api.datastore.getTable('content');

if (result.success) {
  const markdown = Object.entries(result.data)
    .filter(([id, row]) => row.contentType === 'markdown')
    .map(([id, row]) => ({ id, ...row }));
}
```

### Get Starred Addresses
```javascript
const result = await api.datastore.queryAddresses({ starred: 1 });

if (result.success) {
  const starred = result.data;
}
```

## What's Working

✅ **Datastore initialization** - Loads on app startup
✅ **Schema enforcement** - TinyBase validates all data
✅ **Indexes** - Fast queries by domain, tag, timestamp, etc.
✅ **Relationships** - Visits→Addresses, Blobs→Content, etc.
✅ **Metrics** - Automatic aggregations (counts, averages)
✅ **Scripts tracking** - All extractions saved with history
✅ **Navigation tracking** - Peeks and slides log visits
✅ **Automatic address creation** - No duplicates, proper linking
✅ **Change detection** - Scripts know when data changes
✅ **Visit statistics** - Count and last visit time updated

## What's NOT Done Yet

⏭️ **Binary file storage** - Blobs table schema exists but no file I/O
⏭️ **Markdown sync** - Content table ready but no filesystem bidirectional sync
⏭️ **Persistence** - Currently in-memory only (need IndexedDB or SQLite persister)
⏭️ **Groups feature** - Not integrated yet
⏭️ **Cmd feature** - Not integrated yet
⏭️ **Navigation in main windows** - Only tracking peek/slide navigation
⏭️ **Duration tracking** - Visits record duration=0, needs window close tracking
⏭️ **Scroll depth tracking** - Schema ready but not implemented
⏭️ **Search/filtering UI** - No UI to browse datastore yet

## Next Steps

### Phase 1: Persistence (Critical)
1. Add IndexedDB persister (TinyBase has built-in support)
2. Auto-save on changes
3. Load from IndexedDB on startup
4. Verify data persists across app restarts

### Phase 2: Enhanced Tracking
1. Track duration when windows close
2. Track scroll depth and interaction
3. Add navigation tracking to groups/cmd features
4. Track main window navigation (not just peeks/slides)

### Phase 3: Binary Storage
1. Implement filesystem storage for blobs
2. Add image/video download capability
3. Generate thumbnails
4. Link blobs to addresses and content

### Phase 4: Filesystem Sync
1. Implement bidirectional markdown sync
2. Watch filesystem for changes
3. Sync content table to markdown files
4. Handle conflicts

### Phase 5: UI & Features
1. Build history browser UI
2. Add search interface
3. Create feeds viewer
4. Implement tagging UI
5. Show stats dashboard

## Testing

### IPC API Testing

A test page was created at `app/datastore/test-ipc.html` to verify all IPC handlers work correctly.

To test in the app:
1. Start Peek: `npm run debug`
2. Open a peek (Alt+0-9) - navigation tracked via IPC
3. Open a slide (Alt+arrows) - navigation tracked via IPC
4. Configure and run a script - results saved via IPC
5. Check main process console for IPC handler logs

### Verified Working
- ✅ `datastore-add-address` - Address creation with URL parsing
- ✅ `datastore-get-address` - Address retrieval
- ✅ `datastore-update-address` - Address updates
- ✅ `datastore-query-addresses` - Query with filters and sorting
- ✅ `datastore-add-visit` - Visit tracking with stat updates
- ✅ `datastore-query-visits` - Visit history queries
- ✅ `datastore-add-content` - Content creation
- ✅ `datastore-get-table` - Table access
- ✅ `datastore-set-row` - Direct row manipulation
- ✅ `datastore-get-stats` - Statistics aggregation

## Performance Notes

- **In-memory storage**: Fast but needs persistence
- **Small overhead**: TinyBase is 5-11kB gzipped
- **Reactive**: Changes trigger index/metric updates automatically
- **Scalable**: Tested with addresses, visits, content - all working

## Architecture Benefits

✅ **Complete separation**: Datastore isolated in main process, features access via IPC
✅ **Runtime portable**: Can migrate to Tauri without changing feature code
✅ **Backend flexible**: Can swap TinyBase for SQLite, cloud, etc. without feature changes
✅ **Cloud ready**: Same API can route to local or remote datastores
✅ **Mobile ready**: Architecture supports future mobile app development
✅ **Secure**: Datastore logic in trusted process with validated IPC access
✅ **Type safety**: Schema validation prevents bad data
✅ **Reactive**: Indexes and metrics update automatically (in main process)
✅ **Testable**: IPC handlers individually tested and verified
✅ **Extensible**: Easy to add new IPC handlers and tables
✅ **Sync ready**: Built-in CRDT support for future multi-device sync

**Key Decision**: IPC-based architecture chosen over direct library access for maximum portability and flexibility. See [datastore-architecture.md](./datastore-architecture.md) for complete rationale.

## Conclusion

The IPC-based datastore integration is **functional and working** for:
- Script data extraction and history (via async IPC)
- Navigation history from peeks and slides (via history helpers)
- Address management with automatic deduplication
- Visit tracking with statistics
- Complete isolation between storage and UI layers

The foundation is solid with:
- ✅ All IPC handlers tested and verified
- ✅ Async/await throughout for clean code
- ✅ Error handling with structured responses
- ✅ Main process datastore initialization
- ✅ Preload script API exposure
- ✅ Feature integration complete

Ready for next phases: **persistence**, enhanced tracking, and UI development.

**For complete architectural details**, see [datastore-architecture.md](./datastore-architecture.md).
