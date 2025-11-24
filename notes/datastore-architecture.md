# Datastore Architecture

## Overview

Peek's datastore uses a centralized architecture where all data operations are handled in the main Electron process, with renderer processes accessing the datastore through an IPC (Inter-Process Communication) API exposed via the preload script.

## Architectural Decision

### The Choice: IPC-Based API vs Direct Library Access

During implementation, we faced a critical architectural decision:

**Option 1: Direct Library Access**
- Features import and use TinyBase directly in renderer processes
- Simpler initial implementation
- Tighter coupling to TinyBase

**Option 2: IPC-Based API (Chosen)**
- Datastore logic centralized in main process
- Features access via `api.datastore` abstraction
- Complete separation between storage layer and application features

### Reasoning

We chose **Option 2** for the following strategic reasons:

1. **Runtime Portability**
   - Future consideration of Tauri as an alternative to Electron
   - No renderer code changes needed when switching runtimes
   - Abstraction isolates platform-specific concerns

2. **Storage Backend Flexibility**
   - Can swap TinyBase for SQLite, Dexie, or cloud datastores
   - Features remain unchanged regardless of backend
   - Enables gradual migration strategies

3. **Cloud & Sync Readiness**
   - Architecture naturally supports remote datastore endpoints
   - Same API can route to local or cloud storage
   - Facilitates future sync implementations

4. **Mobile App Development**
   - Mobile apps can use the same API contract
   - Platform-specific storage implementations possible
   - Consistent developer experience across platforms

5. **Security & Isolation**
   - Datastore logic contained in trusted main process
   - Renderer processes have controlled, validated access
   - Easier to audit and secure data operations

## Current Implementation

### Technology Stack

- **Storage Engine**: TinyBase v0.7.2
  - Reactive data store with CRDT support
  - Schema validation and indexes
  - Small footprint (5-11kB gzipped)
  - Built-in support for relationships and metrics

- **Communication**: Electron IPC
  - `ipcMain.handle()` for main process handlers
  - `ipcRenderer.invoke()` for renderer requests
  - Async/await throughout

### Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│ Renderer Process (app/)                                      │
│                                                              │
│  ┌────────────┐         ┌────────────┐                      │
│  │  Features  │────────▶│   api.js   │                      │
│  │ (peeks,    │         │            │                      │
│  │  slides,   │         │ api.       │                      │
│  │  scripts)  │         │ datastore  │                      │
│  └────────────┘         └─────┬──────┘                      │
│                               │                              │
└───────────────────────────────┼──────────────────────────────┘
                                │ IPC invoke()
                                │
┌───────────────────────────────┼──────────────────────────────┐
│ Main Process (index.js)       │                              │
│                               ▼                              │
│  ┌──────────────────────────────────────────┐               │
│  │         IPC Handlers                     │               │
│  │  • datastore-add-address                 │               │
│  │  • datastore-get-address                 │               │
│  │  • datastore-query-addresses             │               │
│  │  • datastore-add-visit                   │               │
│  │  • datastore-query-visits                │               │
│  │  • datastore-add-content                 │               │
│  │  • datastore-get-table                   │               │
│  │  • datastore-set-row                     │               │
│  │  • datastore-get-stats                   │               │
│  └──────────────┬───────────────────────────┘               │
│                 │                                            │
│                 ▼                                            │
│  ┌──────────────────────────────────────────┐               │
│  │          TinyBase Store                  │               │
│  │  • Store (datastoreStore)                │               │
│  │  • Indexes (datastoreIndexes)            │               │
│  │  • Relationships (datastoreRelationships)│               │
│  │  • Metrics (datastoreMetrics)            │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### File Structure

```
/Users/dietrich/misc/peek/
├── index.js                      # Main process
│   ├── TinyBase initialization (lines 115-175)
│   ├── Helper functions (lines 177-230)
│   └── IPC handlers (lines 979-1230)
│
├── preload.js                    # Preload script
│   └── api.datastore exposure (lines 210-242)
│
└── app/                          # Renderer process
    ├── datastore/
    │   ├── schema.js            # TinyBase schema definitions
    │   ├── config.js            # Datastore configuration
    │   ├── history.js           # Navigation tracking helpers
    │   └── test-ipc.html        # IPC API test page
    │
    ├── scripts/index.js         # Script results tracking
    ├── peeks/index.js           # Peek navigation tracking
    └── slides/index.js          # Slide navigation tracking
```

## API Reference

### api.datastore Methods

All methods return a Promise that resolves to `{ success: boolean, data?: any, error?: string, id?: string }`

#### Address Management

```javascript
// Add a new address
await api.datastore.addAddress(uri, options)
// Parameters:
//   uri: string - The URL to track
//   options: {
//     title?: string
//     mimeType?: string
//     favicon?: string
//     description?: string
//     tags?: string (comma-separated)
//     metadata?: string (JSON)
//   }
// Returns: { success: true, id: 'addr_...' }

// Get address by ID
await api.datastore.getAddress(id)
// Returns: { success: true, data: { uri, domain, title, ... } }

// Update address
await api.datastore.updateAddress(id, updates)
// Parameters:
//   id: string - Address ID
//   updates: object - Fields to update
// Returns: { success: true, data: { ...updatedRow } }

// Query addresses
await api.datastore.queryAddresses(filter)
// Parameters:
//   filter: {
//     domain?: string
//     protocol?: string
//     starred?: 0 | 1
//     tag?: string
//     sortBy?: 'lastVisit' | 'visitCount' | 'created'
//     limit?: number
//   }
// Returns: { success: true, data: [...addresses] }
```

#### Visit Tracking

```javascript
// Add a visit
await api.datastore.addVisit(addressId, options)
// Parameters:
//   addressId: string - The address being visited
//   options: {
//     source?: string - Source of navigation (peek, slide, direct)
//     sourceId?: string - ID of the source feature
//     windowType?: string - Type of window (modal, persistent, main)
//     duration?: number - Time spent in milliseconds
//     scrollDepth?: number - Scroll percentage (0-100)
//     interacted?: 0 | 1 - Whether user interacted
//     metadata?: string - Additional JSON data
//   }
// Returns: { success: true, id: 'visit_...' }
// Side effect: Updates address visitCount and lastVisitAt

// Query visits
await api.datastore.queryVisits(filter)
// Parameters:
//   filter: {
//     addressId?: string
//     source?: string
//     windowType?: string
//     startDate?: number (timestamp)
//     endDate?: number (timestamp)
//     limit?: number
//   }
// Returns: { success: true, data: [...visits] }
```

#### Content Management

```javascript
// Add content (notes, markdown, code, etc.)
await api.datastore.addContent(options)
// Parameters:
//   options: {
//     title?: string
//     content: string
//     contentType?: 'plain' | 'markdown' | 'code' | 'json' | 'csv'
//     mimeType?: string
//     language?: string (for code)
//     tags?: string
//     addressId?: string (if related to an address)
//     metadata?: string
//   }
// Returns: { success: true, id: 'content_...' }
```

#### Direct Table Access

```javascript
// Get entire table
await api.datastore.getTable(tableName)
// Parameters:
//   tableName: 'addresses' | 'visits' | 'content' | 'tags' | 'blobs' | 'scripts_data' | 'feeds'
// Returns: { success: true, data: { rowId: { ...row }, ... } }

// Set row directly
await api.datastore.setRow(tableName, rowId, rowData)
// Parameters:
//   tableName: string
//   rowId: string
//   rowData: object - Complete row data matching schema
// Returns: { success: true }
```

#### Statistics

```javascript
// Get aggregate statistics
await api.datastore.getStats()
// Returns: {
//   success: true,
//   data: {
//     totalAddresses: number,
//     totalVisits: number,
//     totalContent: number,
//     // ... other metrics
//   }
// }
```

## Usage Examples

### Example 1: Track Navigation from a Feature

```javascript
// app/peeks/index.js
import api from '../api.js';

const executeItem = async (item) => {
  // Open window and navigate
  const window = await windows.createWindow(item.address, params);

  // Track the navigation
  if (api.datastore) {
    try {
      // Get or create address
      const addResult = await api.datastore.addAddress(item.address, {
        title: item.title,
        mimeType: 'text/html'
      });

      // Record visit
      if (addResult.success) {
        await api.datastore.addVisit(addResult.id, {
          source: 'peek',
          sourceId: `peek_${item.keyNum}`,
          windowType: 'modal'
        });
      }
    } catch (error) {
      console.error('Failed to track navigation:', error);
    }
  }
};
```

### Example 2: Save Script Results

```javascript
// app/scripts/index.js
import api from '../api.js';

const saveScriptResult = async (script, result) => {
  try {
    // Find or create address
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

    // Get previous results to detect changes
    const prevResults = await api.datastore.getTable('scripts_data');
    let changed = 1;

    if (prevResults.success) {
      const scriptResults = Object.entries(prevResults.data)
        .filter(([id, row]) => row.scriptId === script.id)
        .sort((a, b) => b[1].extractedAt - a[1].extractedAt);

      if (scriptResults.length > 0) {
        const previousValue = scriptResults[0][1].content;
        changed = (result !== previousValue) ? 1 : 0;
      }
    }

    // Save new result
    await api.datastore.setRow('scripts_data',
      `script_data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      {
        scriptId: script.id,
        scriptName: script.title,
        addressId: addressId,
        selector: script.selector,
        content: result,
        contentType: 'text',
        metadata: '{}',
        extractedAt: Date.now(),
        previousValue: scriptResults[0]?.[1]?.content || '',
        changed: changed
      }
    );
  } catch (error) {
    console.error('Error saving script result:', error);
  }
};
```

### Example 3: Query Recent History

```javascript
// app/features/history-browser.js
import api from '../api.js';

const getRecentHistory = async (limit = 20) => {
  try {
    // Get recent addresses
    const addressesResult = await api.datastore.queryAddresses({
      sortBy: 'lastVisit',
      limit: limit
    });

    if (!addressesResult.success) {
      console.error('Failed to fetch history:', addressesResult.error);
      return [];
    }

    // Enrich with visit details
    const enriched = await Promise.all(
      addressesResult.data.map(async (address) => {
        const visitsResult = await api.datastore.queryVisits({
          addressId: address.id,
          limit: 5
        });

        return {
          ...address,
          recentVisits: visitsResult.success ? visitsResult.data : []
        };
      })
    );

    return enriched;
  } catch (error) {
    console.error('Error getting recent history:', error);
    return [];
  }
};
```

## Implementation Details

### Data Schema

The datastore uses 7 tables defined in `app/datastore/schema.js`:

1. **addresses**: Web addresses (URLs) visited by the user
2. **visits**: Individual visit records with duration and interaction data
3. **content**: User-created notes, markdown files, code snippets
4. **tags**: Tags for organizing addresses and content
5. **blobs**: Binary data (images, files) with content-addressable storage
6. **scripts_data**: Results from background script executions
7. **feeds**: RSS/Atom feed subscriptions and entries

### Helper Functions (Main Process)

```javascript
// Generate unique IDs
generateId(prefix) // Returns: 'prefix_timestamp_randomstring'

// Current timestamp
now() // Returns: Date.now()

// Parse URL into components
parseUrl(uri) // Returns: { protocol, domain, path }
```

### Error Handling

All IPC handlers use try-catch blocks and return structured responses:

```javascript
// Success response
{ success: true, data: {...}, id: '...' }

// Error response
{ success: false, error: 'Error message' }
```

Features should always check the `success` field before using `data`.

### Initialization

The datastore initializes automatically when the main process starts:

```javascript
// index.js (main process)
const initDatastore = () => {
  console.log('main initializing datastore');

  // Create store with schema
  datastoreStore = createStore().setTablesSchema(schema);

  // Create indexes for efficient queries
  datastoreIndexes = createIndexes(datastoreStore);
  for (const [indexName, indexDef] of Object.entries(indexes)) {
    datastoreIndexes.setIndexDefinition(indexName, ...indexDef);
  }

  // Create relationships for joins
  datastoreRelationships = createRelationships(datastoreStore);
  for (const [relName, relDef] of Object.entries(relationships)) {
    datastoreRelationships.setRelationshipDefinition(relName, ...relDef);
  }

  // Create metrics for aggregations
  datastoreMetrics = createMetrics(datastoreStore);
  for (const [metricName, metricDef] of Object.entries(metrics)) {
    datastoreMetrics.setMetricDefinition(metricName, ...metricDef);
  }

  console.log('main datastore initialized successfully');
};

// Called during app ready
app.whenReady().then(async () => {
  initDatastore();
  // ... rest of initialization
});
```

## Testing

A test suite verifies the IPC API works correctly:

```bash
# Run the app in debug mode
npm run debug

# The app automatically runs integration tests on startup
# Check console for test results
```

Test coverage includes:
- Address creation, retrieval, updates
- Visit tracking and queries
- Content management
- Table access
- Statistics aggregation

## Future Considerations

### Persistence Layer

Currently, data exists only in memory. Future work includes:

1. **IndexedDB Persister** (Browser)
   - Use TinyBase's `createIndexedDbPersister()`
   - Automatic persistence to browser storage
   - Good for development and testing

2. **SQLite Persister** (Desktop)
   - Use TinyBase's SQL persisters
   - Better performance for large datasets
   - Native database queries

3. **File System Persister** (Desktop)
   - Use TinyBase's `createFilePersister()`
   - Human-readable JSON files
   - Easy backup and migration

### Sync Implementation

The IPC architecture naturally supports synchronization:

1. **Local Sync**
   - Multiple renderer processes sharing same datastore
   - Already supported via IPC

2. **Cloud Sync**
   - Modify IPC handlers to route to remote API
   - Use TinyBase CRDT features for conflict resolution
   - Implement offline-first with local cache

3. **Peer-to-Peer Sync**
   - Use TinyBase's CRDT merge capabilities
   - Sync between devices on local network

### Migration Path

To change storage backends:

1. Keep IPC API contract unchanged
2. Implement new backend in main process
3. Update IPC handlers to use new backend
4. Features continue working without changes

Example: Migrating to SQLite:

```javascript
// Old: TinyBase
datastoreStore.setRow('addresses', id, row);

// New: SQLite (better-sqlite3)
db.prepare('INSERT INTO addresses VALUES (?, ?, ...)').run(id, ...values);

// IPC handler updated, but api.datastore.addAddress() unchanged
```

## Benefits Realized

1. **Clean Separation**: Storage logic completely isolated from UI code
2. **Easy Testing**: Can mock `api.datastore` for unit tests
3. **Consistent API**: Same patterns across all features
4. **Type Safety**: Single source of truth for data structures
5. **Performance**: Main process handles heavy data operations
6. **Security**: Validated data access through controlled IPC
7. **Flexibility**: Storage implementation can evolve independently

## References

- [TinyBase Documentation](https://tinybase.org)
- [Electron IPC Documentation](https://www.electronjs.org/docs/latest/api/ipc-main)
- [Datastore Schema](./datastore-schema.md)
- [Datastore Research](./datastore-research.md)
- [Integration Summary](./datastore-integration.md)
