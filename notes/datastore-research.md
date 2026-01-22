# Datastore Technology Research & Comparison

Research conducted: 2025-11-12

## Requirements Summary (from datastore.md)

### Primary Requirements
- Store various data types with metadata (tags, MIME types, annotations)
- Store feeds (navigation history, timeseries data, custom feeds)
- Binary file support (images, videos) with filesystem references
- Bidirectional filesystem sync for markdown/text files
- Runtime/browser engine agnostic
- Designed for sync (multi-device, cloud, collaboration)
- Query capabilities (by type, tags, time, etc.)

### Performance Requirements
- Fast local queries
- Efficient indexing
- Handle potentially large datasets (navigation history)
- Reactive updates for UI

---

## Technology Comparison

### 1. TinyBase

**Overview**: Reactive data store with built-in sync engine

**Pros:**
- ✅ **Tiny size**: 5.3kB-11.7kB gzipped, zero dependencies
- ✅ **Reactive queries**: Built-in reactivity with granular listeners
- ✅ **Native CRDT support**: Deterministic sync across clients
- ✅ **Multiple persistence options**: IndexedDB, SQLite, PostgreSQL, files, OPFS
- ✅ **Schema support**: Optional typed schemas with constraints and defaults
- ✅ **Advanced queries**: TinyQL language, indexes, metrics, relationships
- ✅ **Sync built-in**: WebSocket, BroadcastChannel, custom mediums
- ✅ **Can integrate with**: Yjs, Automerge, CR-SQLite for additional CRDT options
- ✅ **100% test coverage**: Well-tested and documented

**Cons:**
- ⚠️ In-memory first (requires persistence layer configuration)
- ⚠️ Newer library (less battle-tested than SQLite)
- ⚠️ Learning curve for TinyQL query language
- ⚠️ Limited ecosystem compared to SQL

**Fit for Peek:**
- **Data modeling**: ★★★★★ (supports both key-value and tabular)
- **Metadata/tags**: ★★★★★ (schemas, indexes, flexible structure)
- **Navigation history**: ★★★★★ (indexes, metrics for aggregations)
- **Binary files**: ★★★☆☆ (would need separate blob storage + references)
- **Filesystem sync**: ★★★☆☆ (can persist to files, bidirectional needs custom logic)
- **Collaboration**: ★★★★★ (native CRDT support, built-in sync)
- **Runtime agnostic**: ★★★★★ (works anywhere JS runs)
- **Performance**: ★★★★★ (optimized, minimal overhead)

**Best for**: Reactive UIs, real-time collaboration, local-first apps with sync

---

### 2. Automerge

**Overview**: JSON-like CRDT for collaborative applications

**Pros:**
- ✅ **Built for collaboration**: Automatic conflict-free merging
- ✅ **Offline-first**: Full functionality offline, queues changes
- ✅ **Versioning**: Complete change history, branching, time travel
- ✅ **High performance**: Compressed columnar storage, handles millions of changes
- ✅ **Automerge Repo**: Built-in sync server backend
- ✅ **Multi-language**: Rust core with JS, Swift, Python, C, Java bindings
- ✅ **Framework integration**: React, Prosemirror, CodeMirror plugins
- ✅ **Actively maintained**: Recent 3.0 release with 10x memory reduction

**Cons:**
- ⚠️ **Not a database**: More of a data structure/sync protocol
- ⚠️ **Requires additional storage**: Need separate persistence layer
- ⚠️ **Learning curve**: CRDT concepts and document-based model
- ⚠️ **Query limitations**: No SQL-like queries, need to build on top
- ⚠️ **Larger size**: More overhead than minimal solutions
- ⚠️ **Best for documents**: JSON-like data, less suited for relational queries

**Fit for Peek:**
- **Data modeling**: ★★★☆☆ (JSON-like, need to structure carefully)
- **Metadata/tags**: ★★★★☆ (flexible JSON structure)
- **Navigation history**: ★★★☆☆ (can store, but querying is manual)
- **Binary files**: ★☆☆☆☆ (not designed for blobs)
- **Filesystem sync**: ★★★★☆ (excellent sync, but need custom file integration)
- **Collaboration**: ★★★★★ (core strength, best-in-class)
- **Runtime agnostic**: ★★★★★ (Rust core, multiple language bindings)
- **Performance**: ★★★★☆ (good for sync, less optimized for queries)

**Best for**: Collaborative documents, offline-first sync, version control needs

---

### 3. SQLite (via better-sqlite3)

**Overview**: Traditional relational database, synchronous Node.js bindings

**Pros:**
- ✅ **Battle-tested**: Decades of production use, extremely reliable
- ✅ **SQL queries**: Powerful relational queries, joins, aggregations
- ✅ **Fast**: 2000+ queries/sec possible with proper indexing
- ✅ **Small overhead**: Single file database, minimal dependencies
- ✅ **Full-text search**: Built-in FTS5 for text searching
- ✅ **Transactions**: ACID compliance, WAL mode for performance
- ✅ **Synchronous API**: Simpler than async (better-sqlite3)
- ✅ **Widely known**: Easier to find developers/documentation
- ✅ **JSON support**: JSON1 extension for flexible data

**Cons:**
- ⚠️ **No built-in sync**: Need to build custom sync layer
- ⚠️ **No CRDT support**: Conflicts require manual resolution
- ⚠️ **Not reactive**: Need to build change listeners
- ⚠️ **File locking**: Single writer, can cause issues with sync
- ⚠️ **Electron specific**: Need rebuild for Electron compatibility
- ⚠️ **Main thread blocking**: Synchronous operations can freeze UI

**Fit for Peek:**
- **Data modeling**: ★★★★★ (relational, flexible schemas)
- **Metadata/tags**: ★★★★★ (relations, indexes, JSON fields)
- **Navigation history**: ★★★★★ (perfect for timeseries queries)
- **Binary files**: ★★★★☆ (can store blobs or references efficiently)
- **Filesystem sync**: ★★☆☆☆ (can persist, but bidirectional sync is complex)
- **Collaboration**: ★☆☆☆☆ (no native sync, requires significant custom work)
- **Runtime agnostic**: ★★★☆☆ (SQLite is portable, but bindings are platform-specific)
- **Performance**: ★★★★★ (excellent for local queries)

**Best for**: Complex queries, relational data, local-only or simple sync needs

---

### 4. Dexie.js

**Overview**: IndexedDB wrapper with promise-based API

**Pros:**
- ✅ **Simple API**: Much easier than raw IndexedDB
- ✅ **Live queries**: Reactive liveQuery() function
- ✅ **Advanced queries**: Case-insensitive search, prefix matching, OR operations
- ✅ **Browser-native**: Uses IndexedDB, no external dependencies
- ✅ **Real classes**: Map classes to tables
- ✅ **Performance optimized**: Bulk operations, batching
- ✅ **Cross-platform**: Browsers, Electron, Capacitor, PWAs
- ✅ **Widely used**: 100,000+ projects, battle-tested
- ✅ **Dexie Cloud**: Optional commercial sync add-on
- ✅ **Bug workarounds**: Handles IndexedDB inconsistencies

**Cons:**
- ⚠️ **IndexedDB limitations**: Key-value store, limited query capabilities
- ⚠️ **No built-in sync**: Need Dexie Cloud (commercial) or custom solution
- ⚠️ **Browser-focused**: Less ideal for Node.js/backend
- ⚠️ **Larger bundle**: 33.1kB minified+gzipped
- ⚠️ **Schema migrations**: Can be tricky with IndexedDB

**Fit for Peek:**
- **Data modeling**: ★★★★☆ (key-value with indexes, flexible)
- **Metadata/tags**: ★★★★☆ (can index and query efficiently)
- **Navigation history**: ★★★★☆ (good for timeseries with indexes)
- **Binary files**: ★★★★☆ (IndexedDB can store blobs)
- **Filesystem sync**: ★★☆☆☆ (browser-focused, no native file sync)
- **Collaboration**: ★★☆☆☆ (Dexie Cloud or custom sync needed)
- **Runtime agnostic**: ★★★☆☆ (browser/Electron focused)
- **Performance**: ★★★★☆ (good for browser workloads)

**Best for**: Browser-based apps, Electron apps not needing server sync

---

### 5. PouchDB

**Overview**: CouchDB-compatible database for browser and Node.js

**Status**: ⚠️ **Declining ecosystem** - Removed from RxDB, fewer active projects

**Pros:**
- ✅ **CouchDB sync**: Seamless replication with CouchDB servers
- ✅ **Offline-first**: Designed for offline operation
- ✅ **Multi-platform**: Browser (IndexedDB), Node.js (LevelDB)
- ✅ **Change notifications**: Listen to database changes
- ✅ **Document-based**: Flexible JSON documents

**Cons:**
- ⚠️ **Declining support**: Being phased out of modern projects
- ⚠️ **Performance issues**: Slower than alternatives
- ⚠️ **Large bundle size**: More overhead than newer solutions
- ⚠️ **Complex replication**: CouchDB protocol has quirks
- ⚠️ **Limited queries**: Map-reduce only, no SQL-like queries

**Recommendation**: ❌ **Not recommended** for new projects in 2025

---

## Hybrid Approaches

### Option A: TinyBase + File Storage
- Use TinyBase for structured data, indexes, queries
- Use filesystem for binary files (referenced by hash/ID in TinyBase)
- Leverage TinyBase's native CRDT for sync
- Add custom filesystem sync for markdown bidirectional sync

**Pros**: Best of both worlds, reactive, built-in sync
**Cons**: Need to manage two storage systems

### Option B: SQLite + Automerge
- Use SQLite for local queries and storage
- Use Automerge for sync protocol
- Translate between SQLite and Automerge documents

**Pros**: Powerful queries + best-in-class sync
**Cons**: Complex integration, two systems to maintain

### Option C: TinyBase with SQLite Persistence
- Use TinyBase API and reactivity
- Persist to SQLite for durability and querying
- Best of reactive store + SQL power

**Pros**: Reactive + SQL + sync capabilities
**Cons**: Some complexity in persistence layer

---

## Recommendations

### For Peek v1 (MVP): **TinyBase + File Storage**

**Rationale:**
1. **Meets all requirements**: Handles structured data, metadata, tags, history
2. **Sync built-in**: Native CRDT support for future multi-device sync
3. **Reactive**: Perfect for Peek's modal, event-driven UI
4. **Small footprint**: Minimal bundle size (5-11kB)
5. **Flexible persistence**: Can use SQLite backend if needed later
6. **Runtime agnostic**: Works anywhere JS runs
7. **Active development**: Well-maintained, modern codebase

**Architecture:**
```
TinyBase Store
├── addresses (table)
├── visits (table)
├── notes (table)
├── tags (table)
└── blobs (table - metadata only)

Filesystem
└── blobs/
    ├── {hash}.jpg
    ├── {hash}.png
    └── {hash}.pdf

Markdown Sync
└── notes/
    ├── note1.md (bidirectional sync)
    └── note2.md
```

**Implementation phases:**
1. Start with TinyBase in-memory + IndexedDB persistence
2. Add file storage for binaries
3. Add markdown filesystem sync
4. Add SQLite persistence option for performance
5. Enable sync features for multi-device support

### For Future (v2+): **Add Automerge for Advanced Collaboration**

If Peek expands to real-time collaboration scenarios:
- Use TinyBase for local store and queries
- Add Automerge for document-level collaboration
- Use Automerge Repo for sync infrastructure

---

## Decision Matrix

| Feature | TinyBase | Automerge | SQLite | Dexie | PouchDB |
|---------|----------|-----------|--------|-------|---------|
| Local Queries | ★★★★★ | ★★☆☆☆ | ★★★★★ | ★★★★☆ | ★★☆☆☆ |
| Sync Built-in | ★★★★★ | ★★★★★ | ★☆☆☆☆ | ★★☆☆☆ | ★★★★☆ |
| Reactivity | ★★★★★ | ★★★☆☆ | ★☆☆☆☆ | ★★★★☆ | ★★★☆☆ |
| Binary Storage | ★★★☆☆ | ★☆☆☆☆ | ★★★★☆ | ★★★★☆ | ★★★☆☆ |
| Size/Performance | ★★★★★ | ★★★★☆ | ★★★★★ | ★★★★☆ | ★★☆☆☆ |
| Ecosystem | ★★★☆☆ | ★★★★☆ | ★★★★★ | ★★★★☆ | ★★☆☆☆ |
| Learning Curve | ★★★☆☆ | ★★☆☆☆ | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| **Total** | **29/35** | **23/35** | **27/35** | **28/35** | **20/35** |

---

## Next Steps

1. ✅ Complete research phase
2. ⏭️ Prototype TinyBase with basic CRUD operations
3. ⏭️ Test with Peek use case (storing URLs from peeks)
4. ⏭️ Evaluate performance with realistic data volumes
5. ⏭️ Design schema for addresses, visits, notes, metadata
6. ⏭️ Implement file storage integration
7. ⏭️ Build datastore API for Peek features

---

## References

- TinyBase: https://tinybase.org/
- Automerge: https://automerge.org/
- better-sqlite3: https://github.com/WiseLibs/better-sqlite3
- Dexie.js: https://dexie.org/
- PouchDB: https://pouchdb.com/
