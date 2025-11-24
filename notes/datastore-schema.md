# Peek Datastore Schema Design

Version: 1.0
Date: 2025-11-12
Technology: TinyBase

---

## Overview

This schema design uses TinyBase's tabular data model with the following principles:
- Each table stores a specific entity type
- Relationships via ID references
- Flexible metadata using JSON cells
- Indexes for common queries
- Designed for reactivity and efficient queries

---

## Core Tables

### 1. `addresses` - URL/URI Index

Stores all web addresses and URIs that Peek interacts with.

```javascript
{
  rowId: string,  // Auto-generated or hash of URI
  cells: {
    uri: string,           // The full URI (required)
    protocol: string,      // http, https, ipfs, etc.
    domain: string,        // Extracted domain for querying
    path: string,          // URL path component
    title: string,         // Page title (if known)
    mimeType: string,      // Content MIME type
    favicon: string,       // Favicon URL or data URI
    description: string,   // Meta description or user note
    tags: string,          // Comma-separated tag IDs (for indexing)
    metadata: string,      // JSON string for flexible metadata
    createdAt: number,     // Unix timestamp (ms)
    updatedAt: number,     // Unix timestamp (ms)
    lastVisitAt: number,   // Unix timestamp of most recent visit
    visitCount: number,    // Total number of visits
    starred: number,       // 0 or 1 (boolean for indexing)
    archived: number       // 0 or 1 (boolean for indexing)
  }
}
```

**Indexes:**
- `byDomain` - Group by domain for domain-level queries
- `byProtocol` - Filter by protocol type
- `byTag` - Index on tags field for tag filtering
- `byStarred` - Quick access to starred addresses
- `byLastVisit` - Sort by most recent visit

**Example Row:**
```javascript
{
  'addr_1234': {
    uri: 'https://example.com/article',
    protocol: 'https',
    domain: 'example.com',
    path: '/article',
    title: 'Example Article',
    mimeType: 'text/html',
    favicon: 'https://example.com/favicon.ico',
    description: 'An interesting article',
    tags: 'tag_1,tag_5',
    metadata: '{"author":"John","lang":"en"}',
    createdAt: 1699564800000,
    updatedAt: 1699564800000,
    lastVisitAt: 1699651200000,
    visitCount: 5,
    starred: 1,
    archived: 0
  }
}
```

---

### 2. `visits` - Navigation History

Tracks every visit to an address with temporal data.

```javascript
{
  rowId: string,  // Auto-generated unique ID
  cells: {
    addressId: string,     // Reference to addresses table (required)
    timestamp: number,     // Unix timestamp when visit occurred
    duration: number,      // Time spent in milliseconds (0 if unknown)
    source: string,        // How arrived: 'peek', 'slide', 'direct', 'link', etc.
    sourceId: string,      // ID of source feature if applicable
    windowType: string,    // 'modal', 'persistent', 'main', etc.
    metadata: string,      // JSON string for flexible data
    scrollDepth: number,   // Percentage scrolled (0-100)
    interacted: number     // 0 or 1 (clicked, typed, etc.)
  }
}
```

**Indexes:**
- `byAddress` - Group visits by address
- `byTimestamp` - Sort chronologically
- `bySource` - Filter by entry source
- `byDate` - Index by date (derived from timestamp)

**Example Row:**
```javascript
{
  'visit_5678': {
    addressId: 'addr_1234',
    timestamp: 1699651200000,
    duration: 45000,
    source: 'peek',
    sourceId: 'peek_3',
    windowType: 'modal',
    metadata: '{"referrer":"addr_9999"}',
    scrollDepth: 80,
    interacted: 1
  }
}
```

---

### 3. `content` - Text Content

Stores any text-based content: notes, CSV data, plain text, markdown documents, code snippets, etc.
May or may not be linked to addresses.

```javascript
{
  rowId: string,  // Auto-generated unique ID
  cells: {
    title: string,         // Content title or description
    content: string,       // The actual text content
    mimeType: string,      // text/markdown, text/plain, text/csv, text/html, application/json, etc.
    contentType: string,   // Coarse type for easier querying: 'markdown', 'plain', 'csv', 'json', 'html', 'code'
    language: string,      // Language/syntax if code (js, py, etc.) or human language (en, es)
    encoding: string,      // Character encoding (default: utf-8)
    tags: string,          // Comma-separated tag IDs
    addressRefs: string,   // Comma-separated address IDs this content references or was sourced from
    parentId: string,      // Parent content ID for hierarchies (optional)
    metadata: string,      // JSON string for flexible metadata (headers for CSV, etc.)
    createdAt: number,     // Unix timestamp
    updatedAt: number,     // Unix timestamp
    syncPath: string,      // Filesystem path if synced (e.g., 'content/data.csv', 'notes/note.md')
    synced: number,        // 0 or 1 - whether synced to filesystem
    starred: number,       // 0 or 1
    archived: number       // 0 or 1
  }
}
```

**Indexes:**
- `byTag` - Filter by tags
- `byContentType` - Filter by content type (markdown, csv, plain, etc.)
- `byMimeType` - Filter by specific MIME type
- `byAddress` - Content referencing specific addresses
- `bySynced` - Find filesystem-synced content
- `byUpdated` - Sort by most recently updated

**Example Rows:**

*Markdown note:*
```javascript
{
  'content_9012': {
    title: 'Meeting Notes - Project Kick-off',
    content: '# Project Kick-off\n\n- Discuss goals\n- Set timeline',
    mimeType: 'text/markdown',
    contentType: 'markdown',
    language: 'en',
    encoding: 'utf-8',
    tags: 'tag_2,tag_8',
    addressRefs: 'addr_1234,addr_5678',
    parentId: '',
    metadata: '{"mood":"productive","location":"office"}',
    createdAt: 1699564800000,
    updatedAt: 1699651200000,
    syncPath: 'content/meeting-2024-11-12.md',
    synced: 1,
    starred: 0,
    archived: 0
  }
}
```

*CSV data:*
```javascript
{
  'content_9013': {
    title: 'Product Price List',
    content: 'product,price,stock\nWidget,19.99,150\nGadget,29.99,87',
    mimeType: 'text/csv',
    contentType: 'csv',
    language: '',
    encoding: 'utf-8',
    tags: 'tag_5',
    addressRefs: 'addr_shop',
    parentId: '',
    metadata: '{"delimiter":"comma","hasHeader":true,"columns":3}',
    createdAt: 1699564800000,
    updatedAt: 1699651200000,
    syncPath: 'content/prices.csv',
    synced: 1,
    starred: 0,
    archived: 0
  }
}
```

*Code snippet:*
```javascript
{
  'content_9014': {
    title: 'Auth Helper Function',
    content: 'function authenticate(user, pass) {\n  return hash(pass) === user.hash;\n}',
    mimeType: 'text/javascript',
    contentType: 'code',
    language: 'javascript',
    encoding: 'utf-8',
    tags: 'tag_7',
    addressRefs: '',
    parentId: '',
    metadata: '{"syntax":"js","lines":3}',
    createdAt: 1699564800000,
    updatedAt: 1699564800000,
    syncPath: '',
    synced: 0,
    starred: 1,
    archived: 0
  }
}
```

---

### 4. `tags` - Tag Taxonomy

Hierarchical tag system for organizing all entities.

```javascript
{
  rowId: string,  // Auto-generated unique ID
  cells: {
    name: string,          // Tag name (required, unique)
    slug: string,          // URL-safe version of name
    color: string,         // Hex color for UI (#FF5733)
    parentId: string,      // Parent tag ID for hierarchies
    description: string,   // Tag description
    metadata: string,      // JSON string for flexible metadata
    createdAt: number,     // Unix timestamp
    updatedAt: number,     // Unix timestamp
    usageCount: number     // Cached count of how many times used
  }
}
```

**Indexes:**
- `byName` - Lookup by name
- `byParent` - Find child tags
- `byUsage` - Sort by popularity

**Example Row:**
```javascript
{
  'tag_1': {
    name: 'Work',
    slug: 'work',
    color: '#3498db',
    parentId: '',
    description: 'Work-related content',
    metadata: '{}',
    createdAt: 1699564800000,
    updatedAt: 1699564800000,
    usageCount: 150
  }
}
```

---

### 5. `blobs` - Binary File References

Metadata index for binary files (images, videos, PDFs, etc.).
Actual files stored in filesystem at `{userData}/{PROFILE}/datastore/blobs/`

```javascript
{
  rowId: string,  // Content hash (SHA-256) serves as ID
  cells: {
    filename: string,      // Original filename
    mimeType: string,      // MIME type (image/jpeg, video/mp4, application/pdf, etc.)
    mediaType: string,     // Coarse type: 'image', 'video', 'audio', 'document', 'archive'
    size: number,          // File size in bytes
    hash: string,          // Content hash (same as rowId, for convenience)
    extension: string,     // File extension (.jpg, .mp4, etc.)
    path: string,          // Relative path in blob storage
    addressId: string,     // Source address if downloaded from web
    contentId: string,     // Associated content item if any
    tags: string,          // Comma-separated tag IDs
    metadata: string,      // JSON: dimensions, duration, EXIF, etc.
    createdAt: number,     // Unix timestamp when added
    width: number,         // Image/video width (if applicable)
    height: number,        // Image/video height (if applicable)
    duration: number,      // Audio/video duration in seconds (if applicable)
    thumbnail: string      // Path to thumbnail if generated
  }
}
```

**Indexes:**
- `byMediaType` - Filter by media type
- `byMimeType` - Filter by MIME type
- `byAddress` - Find blobs from specific address
- `byTag` - Filter by tags
- `byDate` - Sort by date added

**Example Row:**
```javascript
{
  'sha256_abc123...': {
    filename: 'screenshot.png',
    mimeType: 'image/png',
    mediaType: 'image',
    size: 1024768,
    hash: 'sha256_abc123...',
    extension: '.png',
    path: 'blobs/sha256_abc123.png',
    addressId: 'addr_1234',
    contentId: 'content_9012',
    tags: 'tag_3',
    metadata: '{"exif":{"camera":"iPhone"},"location":"home"}',
    createdAt: 1699564800000,
    width: 1920,
    height: 1080,
    duration: 0,
    thumbnail: 'blobs/thumbs/sha256_abc123_thumb.jpg'
  }
}
```

---

### 6. `scripts_data` - Script Extraction Results

Stores data extracted by background Scripts feature.

```javascript
{
  rowId: string,  // Auto-generated unique ID
  cells: {
    scriptId: string,      // ID of script that extracted this data
    scriptName: string,    // Script name for easier querying
    addressId: string,     // Source address
    selector: string,      // CSS selector used
    content: string,       // Extracted content
    contentType: string,   // text, number, html, json, etc.
    metadata: string,      // JSON string for flexible metadata
    extractedAt: number,   // Unix timestamp when extracted
    previousValue: string, // Previous value for change detection
    changed: number        // 0 or 1 - whether changed since last run
  }
}
```

**Indexes:**
- `byScript` - Group by script
- `byAddress` - Filter by source address
- `byTimestamp` - Sort chronologically
- `byChanged` - Find changed values

**Example Row:**
```javascript
{
  'script_data_3456': {
    scriptId: 'script_1',
    scriptName: 'Weather Monitor',
    addressId: 'addr_weather',
    selector: '.temperature',
    content: '72°F',
    contentType: 'text',
    metadata: '{"unit":"fahrenheit","location":"SF"}',
    extractedAt: 1699651200000,
    previousValue: '70°F',
    changed: 1
  }
}
```

---

### 7. `feeds` - Custom Feed Definitions

Defines custom feeds and their queries/sources.

```javascript
{
  rowId: string,  // Auto-generated unique ID
  cells: {
    name: string,          // Feed name
    description: string,   // Feed description
    type: string,          // 'query', 'script', 'external', 'aggregated'
    query: string,         // Query definition (TinyQL or JSON query object)
    schedule: string,      // Cron-like schedule for updates (if applicable)
    source: string,        // External URL or internal source
    tags: string,          // Comma-separated tag IDs
    metadata: string,      // JSON string for flexible metadata
    createdAt: number,     // Unix timestamp
    updatedAt: number,     // Unix timestamp
    lastFetchedAt: number, // Unix timestamp of last update
    enabled: number        // 0 or 1 - whether feed is active
  }
}
```

**Indexes:**
- `byType` - Filter by feed type
- `byEnabled` - Find active feeds
- `byTag` - Filter by tags

**Example Row:**
```javascript
{
  'feed_7890': {
    name: 'Recent Work Links',
    description: 'Links tagged work from last 7 days',
    type: 'query',
    query: '{"table":"addresses","where":{"tags":"tag_1"},"since":"7d"}',
    schedule: '0 9 * * *',
    source: 'internal',
    tags: 'tag_1',
    metadata: '{"format":"rss"}',
    createdAt: 1699564800000,
    updatedAt: 1699651200000,
    lastFetchedAt: 1699651200000,
    enabled: 1
  }
}
```

---

## Schema Definition (TinyBase Format)

```javascript
const schema = {
  addresses: {
    uri: { type: 'string' },
    protocol: { type: 'string', default: 'https' },
    domain: { type: 'string' },
    path: { type: 'string', default: '' },
    title: { type: 'string', default: '' },
    mimeType: { type: 'string', default: 'text/html' },
    favicon: { type: 'string', default: '' },
    description: { type: 'string', default: '' },
    tags: { type: 'string', default: '' },
    metadata: { type: 'string', default: '{}' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
    lastVisitAt: { type: 'number', default: 0 },
    visitCount: { type: 'number', default: 0 },
    starred: { type: 'number', default: 0 },
    archived: { type: 'number', default: 0 }
  },

  visits: {
    addressId: { type: 'string' },
    timestamp: { type: 'number' },
    duration: { type: 'number', default: 0 },
    source: { type: 'string', default: 'direct' },
    sourceId: { type: 'string', default: '' },
    windowType: { type: 'string', default: 'main' },
    metadata: { type: 'string', default: '{}' },
    scrollDepth: { type: 'number', default: 0 },
    interacted: { type: 'number', default: 0 }
  },

  content: {
    title: { type: 'string', default: 'Untitled' },
    content: { type: 'string', default: '' },
    mimeType: { type: 'string', default: 'text/plain' },
    contentType: { type: 'string', default: 'plain' },
    language: { type: 'string', default: '' },
    encoding: { type: 'string', default: 'utf-8' },
    tags: { type: 'string', default: '' },
    addressRefs: { type: 'string', default: '' },
    parentId: { type: 'string', default: '' },
    metadata: { type: 'string', default: '{}' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
    syncPath: { type: 'string', default: '' },
    synced: { type: 'number', default: 0 },
    starred: { type: 'number', default: 0 },
    archived: { type: 'number', default: 0 }
  },

  tags: {
    name: { type: 'string' },
    slug: { type: 'string' },
    color: { type: 'string', default: '#999999' },
    parentId: { type: 'string', default: '' },
    description: { type: 'string', default: '' },
    metadata: { type: 'string', default: '{}' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
    usageCount: { type: 'number', default: 0 }
  },

  blobs: {
    filename: { type: 'string' },
    mimeType: { type: 'string' },
    mediaType: { type: 'string' },
    size: { type: 'number' },
    hash: { type: 'string' },
    extension: { type: 'string' },
    path: { type: 'string' },
    addressId: { type: 'string', default: '' },
    contentId: { type: 'string', default: '' },
    tags: { type: 'string', default: '' },
    metadata: { type: 'string', default: '{}' },
    createdAt: { type: 'number' },
    width: { type: 'number', default: 0 },
    height: { type: 'number', default: 0 },
    duration: { type: 'number', default: 0 },
    thumbnail: { type: 'string', default: '' }
  },

  scripts_data: {
    scriptId: { type: 'string' },
    scriptName: { type: 'string' },
    addressId: { type: 'string' },
    selector: { type: 'string' },
    content: { type: 'string' },
    contentType: { type: 'string', default: 'text' },
    metadata: { type: 'string', default: '{}' },
    extractedAt: { type: 'number' },
    previousValue: { type: 'string', default: '' },
    changed: { type: 'number', default: 0 }
  },

  feeds: {
    name: { type: 'string' },
    description: { type: 'string', default: '' },
    type: { type: 'string' },
    query: { type: 'string', default: '' },
    schedule: { type: 'string', default: '' },
    source: { type: 'string', default: 'internal' },
    tags: { type: 'string', default: '' },
    metadata: { type: 'string', default: '{}' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
    lastFetchedAt: { type: 'number', default: 0 },
    enabled: { type: 'number', default: 1 }
  }
};
```

---

## Indexes Definition

```javascript
const indexes = {
  // Address indexes
  addresses_byDomain: {
    table: 'addresses',
    on: 'domain'
  },
  addresses_byProtocol: {
    table: 'addresses',
    on: 'protocol'
  },
  addresses_byStarred: {
    table: 'addresses',
    on: 'starred'
  },

  // Visit indexes
  visits_byAddress: {
    table: 'visits',
    on: 'addressId'
  },
  visits_byTimestamp: {
    table: 'visits',
    on: 'timestamp'
  },
  visits_bySource: {
    table: 'visits',
    on: 'source'
  },

  // Content indexes
  content_byContentType: {
    table: 'content',
    on: 'contentType'
  },
  content_byMimeType: {
    table: 'content',
    on: 'mimeType'
  },
  content_bySynced: {
    table: 'content',
    on: 'synced'
  },
  content_byUpdated: {
    table: 'content',
    on: 'updatedAt'
  },

  // Tag indexes
  tags_byName: {
    table: 'tags',
    on: 'name'
  },
  tags_byParent: {
    table: 'tags',
    on: 'parentId'
  },

  // Blob indexes
  blobs_byMediaType: {
    table: 'blobs',
    on: 'mediaType'
  },
  blobs_byMimeType: {
    table: 'blobs',
    on: 'mimeType'
  },

  // Scripts data indexes
  scripts_data_byScript: {
    table: 'scripts_data',
    on: 'scriptId'
  },
  scripts_data_byChanged: {
    table: 'scripts_data',
    on: 'changed'
  },

  // Feed indexes
  feeds_byType: {
    table: 'feeds',
    on: 'type'
  },
  feeds_byEnabled: {
    table: 'feeds',
    on: 'enabled'
  }
};
```

---

## Relationships

TinyBase relationships for efficient joins:

```javascript
const relationships = {
  // Visits to their addresses
  visitAddress: {
    localTableId: 'visits',
    remoteTableId: 'addresses',
    relationshipId: 'addressId'
  },

  // Blobs to their source addresses
  blobAddress: {
    localTableId: 'blobs',
    remoteTableId: 'addresses',
    relationshipId: 'addressId'
  },

  // Blobs to their content
  blobContent: {
    localTableId: 'blobs',
    remoteTableId: 'content',
    relationshipId: 'contentId'
  },

  // Scripts data to addresses
  scriptDataAddress: {
    localTableId: 'scripts_data',
    remoteTableId: 'addresses',
    relationshipId: 'addressId'
  },

  // Tag hierarchy (self-referential)
  childTags: {
    localTableId: 'tags',
    remoteTableId: 'tags',
    relationshipId: 'parentId'
  },

  // Content hierarchy (self-referential)
  childContent: {
    localTableId: 'content',
    remoteTableId: 'content',
    relationshipId: 'parentId'
  }
};
```

---

## Metrics (Aggregations)

Useful metrics for dashboard/analytics:

```javascript
const metrics = {
  // Total addresses
  totalAddresses: {
    table: 'addresses',
    aggregate: 'count'
  },

  // Total visits
  totalVisits: {
    table: 'visits',
    aggregate: 'count'
  },

  // Average visit duration
  avgVisitDuration: {
    table: 'visits',
    metric: 'duration',
    aggregate: 'avg'
  },

  // Total storage used by blobs
  totalBlobSize: {
    table: 'blobs',
    metric: 'size',
    aggregate: 'sum'
  },

  // Number of content items
  totalContent: {
    table: 'content',
    aggregate: 'count'
  },

  // Number of synced content items
  syncedContent: {
    table: 'content',
    where: { synced: 1 },
    aggregate: 'count'
  },

  // Content by type
  contentByType: {
    table: 'content',
    groupBy: 'contentType',
    aggregate: 'count'
  }
};
```

---

## Common Queries (Examples)

### Recent addresses by visit
```javascript
store.getTable('visits')
  .sort((a, b) => b.timestamp - a.timestamp)
  .slice(0, 10)
  .map(visit => visit.addressId)
```

### Starred addresses with tags
```javascript
store.getTable('addresses')
  .filter(addr => addr.starred === 1)
  .map(addr => ({
    ...addr,
    tags: addr.tags.split(',').map(id => store.getRow('tags', id))
  }))
```

### Content synced to filesystem
```javascript
store.getTable('content')
  .filter(item => item.synced === 1)
```

### Markdown content only
```javascript
store.getTable('content')
  .filter(item => item.contentType === 'markdown')
```

### CSV data
```javascript
store.getTable('content')
  .filter(item => item.contentType === 'csv')
```

### Blobs by media type
```javascript
store.getTable('blobs')
  .filter(blob => blob.mediaType === 'image')
```

### Script data that changed
```javascript
store.getTable('scripts_data')
  .filter(data => data.changed === 1)
  .sort((a, b) => b.extractedAt - a.extractedAt)
```

---

## Storage Strategy

### Persistence Layers

**Phase 1 (MVP):**
- TinyBase in-memory store
- Persist to IndexedDB for browser compatibility
- File storage for blobs in `{userData}/{PROFILE}/datastore/blobs/`

**Phase 2 (Performance):**
- Add SQLite persistence option
- Keep TinyBase API but use SQLite backend
- Better for large datasets and complex queries

**Phase 3 (Sync):**
- Enable TinyBase CRDT sync
- Sync between devices
- Conflict-free merging

### File System Layout

```
{userData}/
  {PROFILE}/
    datastore/
      index.db            # SQLite backend (Phase 2)
      index.json          # JSON backup
      blobs/
        sha256_abc...png  # Content-addressed blobs
        sha256_def...jpg
        thumbs/           # Thumbnails for images
          sha256_abc_thumb.jpg
      content/            # Synced text content
        notes/            # Markdown notes
          note1.md
          note2.md
        data/             # CSV and other data files
          prices.csv
        code/             # Code snippets
          helpers.js
      exports/            # User exports
        backup-2024-11-12.json
```

---

## Migration Strategy

### Version 1.0 (Initial)
- Create all tables with schema
- Set up indexes
- Set up relationships
- Initialize with empty data

### Future Versions
- TinyBase doesn't have built-in migrations
- Implement custom migration system:
  - Version table to track schema version
  - Migration functions for each version bump
  - Backup before migration
  - Rollback capability

---

## Next Steps

1. ✅ Schema design complete
2. ⏭️ Install TinyBase package
3. ⏭️ Create datastore module scaffold
4. ⏭️ Implement store initialization with schema
5. ⏭️ Implement basic CRUD operations
6. ⏭️ Test with sample data
7. ⏭️ Build datastore API layer
