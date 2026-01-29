# Research: URL/History Unification Architecture for Peek

## Executive Summary

The desktop app has **two parallel data models** that need unification:

1. **Addresses/Visits** - History tracking, frecency, revisit counting (not synced)
2. **Items** - User curation, sync, annotations (url, text, tagset, image types)

**Core insight**: Adopt a unified "everything is an item" model that merges both systems, enabling full sync, consistent frecency scoring, and advanced features (groups, addressing, chaining).

**Effort estimate**: ~4 weeks mid-term refactor that unblocks numerous TODO items.

---

## Current State Analysis

### Separate Systems Identified

**Addresses + Visits (History) - `backend/electron/datastore.ts`:**
- **addresses table**: Stores web URLs with metadata (uri, domain, path, protocol, title, favicon, mimeType, description, visitCount, lastVisitAt, starred, archived, metadata)
- **visits table**: Tracks individual navigation events (timestamp, duration, source, scrollDepth, interacted, metadata)
- **Relationship**: visits -> addressId (many-to-one)
- **Use case**: Tracking all navigation activity across any source

**Items (Curated) - `backend/electron/datastore.ts`:**
- **items table**: Stores user-curated items (type: url|text|tagset|image, content, metadata, syncId, syncSource, starred, archived, visitCount, lastVisitAt)
- **item_tags table**: M2M junction for tagging items
- **Use case**: Saved URLs, notes, groups, images with annotations
- **Key difference**: Explicit user creation, sync-aware (syncId, syncSource, syncedAt)

**Browser Extension History Import:**
- **history.js**: One-way import of browser history as URL items (tags with `from:history`)
- **bookmarks.js**: One-way import of bookmarks as URL items (tags with `from:bookmark`)
- **tabs.js**: Add-and-skip open tabs as URL items (tags with `from:tab`)
- **Strategy**: Cross-source tagging (an item can have multiple source tags)

### Schema Divergence

| Aspect | Addresses/Visits | Items |
|--------|------------------|-------|
| **Identification** | URI normalization | Content + type + syncId |
| **Tagging** | address_tags junction | item_tags junction |
| **Sync** | Not designed for sync | Full sync metadata |
| **Visit tracking** | Explicit visits table | visitCount + lastVisitAt only |
| **Timestamps** | createdAt/updatedAt | createdAt/updatedAt/syncedAt/deletedAt |
| **Deletion** | Hard delete | Soft delete (deletedAt) |
| **Source tracking** | Source field in visits | syncSource in items |

---

## Problems with Current Approach

1. **Duplication**: URL items exist in both systems - a saved URL is in `items`, but revisits create redundant `addresses` + `visits` entries

2. **Inconsistent tagging**: Addresses tagged via `address_tags`, items via `item_tags` - no unified annotation model

3. **Lost visit context**: Items track only visitCount/lastVisitAt, not detailed visit metadata (duration, source, scrollDepth, interacted)

4. **Unidirectional sync**: Items sync, but address history doesn't - synced items lose their visit history on other devices

5. **Query complexity**: Features must choose which system to use; features needing both must join two separate query paths

6. **Source identity crisis**: Browser extension tags items with source (from:bookmark, from:history) but addresses track source in visits - inconsistent

7. **Frecency calculation**: Frecency scoring would work on addresses (via visits), but items don't have visit detail - can't apply same algorithm

8. **Page groups complexity**: TODO mentions "page groups" - unclear how groups apply to both items and addresses

---

## Prior Art Research

### Firefox Places Database
- **Model**: Everything is a "place" (URI + title + annotations)
- **Tables**: moz_places (URIs), moz_history_visits, moz_bookmarks (curated subset)
- **Key insight**: Bookmarks are just "markers" on places; not separate entities
- **Tagging**: moz_tags table with M2M via moz_bookmarks_tags
- **Frecency**: Calculated from visit history, applied to both bookmarks and history
- **Unification**: moz_bookmarks.fk points to moz_places - bookmarks are views over history

### Chrome History
- **Model**: Separate history (chrome://history) and bookmarks
- **Limitation**: History not exposed to extensions reliably
- **Sync**: Cloud sync handles merge via timestamps + conflict resolution

### Safari Reading List
- **Model**: Articles are items with visit tracking
- **Pattern**: Items + visits (curated but still tracked)

### Notion/Obsidian
- **Model**: Everything is a block/note; history is just a log
- **Tagging**: Flat tags + hierarchical organization via links
- **Frecency**: Based on last edited/accessed timestamps

---

## Proposed Unified Architecture

### Core Principle: Everything is an Item

All content (URLs, notes, groups, images) and their visit history unified under a single "item" system with:
1. **Base item** with type, content, metadata
2. **Annotation layer** (tags, starred, archived, groups)
3. **Visit tracking** (detailed history with frecency)
4. **Sync support** (syncId, syncSource, deleted records)
5. **Addressability** (peek:// URLs for all items)

### Proposed Schema

```sql
-- Core items table (unified)
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  type TEXT CHECK(type IN ('url', 'text', 'tagset', 'image')),
  content TEXT,

  -- Metadata
  title TEXT DEFAULT '',
  mimeType TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}',

  -- Sync fields
  syncId TEXT DEFAULT '',
  syncSource TEXT DEFAULT '',
  syncedAt INTEGER DEFAULT 0,

  -- Audit
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER DEFAULT 0,

  -- Annotation state
  starred INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,

  -- Frecency (denormalized, calculated from visits)
  visitCount INTEGER DEFAULT 0,
  lastVisitAt INTEGER DEFAULT 0,
  frecencyScore INTEGER DEFAULT 0,

  -- Addressing (for peek:// URLs)
  addressKey TEXT DEFAULT '',
  addressTitle TEXT DEFAULT ''
);

-- Visits/history (now relates to items)
CREATE TABLE item_visits (
  id TEXT PRIMARY KEY,
  itemId TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  duration INTEGER DEFAULT 0,
  source TEXT DEFAULT 'direct',
  sourceId TEXT DEFAULT '',
  windowType TEXT DEFAULT 'main',
  metadata TEXT DEFAULT '{}',
  scrollDepth INTEGER DEFAULT 0,
  interacted INTEGER DEFAULT 0,

  FOREIGN KEY(itemId) REFERENCES items(id)
);

-- Tags (unchanged)
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  color TEXT DEFAULT '#999999',
  parentId TEXT DEFAULT '',
  description TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}',
  createdAt INTEGER,
  updatedAt INTEGER,
  frequency INTEGER DEFAULT 0,
  lastUsed INTEGER DEFAULT 0,
  frecencyScore INTEGER DEFAULT 0
);

-- Item-tag junction (unchanged)
CREATE TABLE item_tags (
  id TEXT PRIMARY KEY,
  itemId TEXT NOT NULL,
  tagId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,

  UNIQUE(itemId, tagId),
  FOREIGN KEY(itemId) REFERENCES items(id),
  FOREIGN KEY(tagId) REFERENCES tags(id)
);

-- Page groups (for TODO's "page groups" feature)
CREATE TABLE item_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}',
  createdAt INTEGER,
  updatedAt INTEGER
);

CREATE TABLE item_group_members (
  id TEXT PRIMARY KEY,
  groupId TEXT NOT NULL,
  itemId TEXT NOT NULL,
  position INTEGER DEFAULT 0,

  UNIQUE(groupId, itemId),
  FOREIGN KEY(groupId) REFERENCES item_groups(id),
  FOREIGN KEY(itemId) REFERENCES items(id)
);
```

### Unified API

```javascript
// New unified API
api.datastore.addItem(type, content, options)
  // type: 'url' | 'text' | 'tagset' | 'image'
  // content: string (URL for type:url, text for type:text, etc)
  // options: { title, metadata, syncSource, syncId }

api.datastore.recordVisit(itemId, options)
  // Replaces trackNavigation()
  // Creates item_visits record
  // Updates item.visitCount + frecencyScore

api.datastore.queryItems(filter)
  // filter: { type?, tag?, starred?, archived?, search?, sortBy?, limit? }
  // sortBy: 'frecency' | 'lastVisit' | 'created' | 'alphabetical'

api.datastore.queryItemHistory(itemId, options)
  // Returns visits with full metadata for an item

// Backward compatibility layer
api.datastore.addAddress() -> wraps addItem(type: 'url')
api.datastore.addVisit() -> wraps recordVisit()
api.datastore.queryAddresses() -> wraps queryItems(type: 'url')
```

### Addressing Scheme

```
peek://item/{itemId}           # Any item (resolves to type-specific view)
peek://url/{itemId}            # URL item
peek://note/{itemId}           # Text item
peek://group/{itemId}          # Group item
peek://tag/{tagId}             # All items with tag

peek://history                 # All items by frecency
peek://history/{itemId}        # Visits for specific item
```

---

## Frecency Calculation

```javascript
// Calculate frecency from visits (matches Firefox awesomebar)
function calculateFrecency(visits) {
  const now = Date.now();
  let score = 0;

  for (const visit of visits) {
    const ageMs = now - visit.timestamp;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    // Decay: visits age at sqrt(age_in_days/7)
    const decayFactor = 1 / (1 + (ageDays / 7) ** 0.5);

    // Weight by source/interaction
    let weight = 1;
    if (visit.interacted === 1) weight = 2;
    if (visit.source === 'direct') weight = 0.5;
    if (visit.source === 'bookmark') weight = 1.5;

    score += weight * decayFactor;
  }

  return Math.min(Math.round(score), 100);
}

// Called after each visit record
async function updateItemFrecency(itemId) {
  const visits = await queryItemHistory(itemId);
  const score = calculateFrecency(visits);
  await updateItem(itemId, { frecencyScore: score });
}
```

---

## Groups vs Tags (Addressing TODO)

From TODO.md: "Define relationship between page groups and tags"

**Proposed model:**
- **Tags**: Many-to-many annotation on items (existing) - flat namespace, multiple per item, used for filtering/search
- **Groups**: Explicit containers (new tables) - hierarchical, explicit ordering, used for workbench/collections

```javascript
// Tags: "work", "project-x", "urgent" (many per item, arbitrary)
queryItems({ tag: 'work' })  // All items tagged "work"

// Groups: "Vacation Planning", "Project X Resources" (intentional collections)
getGroup('vacation-planning')  // Ordered items in group
```

This makes them complementary: tags organize flat search/filtering, groups organize spatial/hierarchical collections.

---

## Migration Strategy

### Phase 1: Prepare (non-destructive)
- Create new schema alongside old
- Migrate addresses -> items (type: 'url', content: uri)
- Migrate visits -> item_visits (itemId = new items.id)
- Migrate address_tags -> item_tags
- Keep old tables for validation

### Phase 2: Transition
- Update API handlers to use new schema
- Provide backward-compat layer
- Run dedup on browser extension imports

### Phase 3: Cutover
- Drop old tables after validation
- Update all features to use new API

---

## Platform Alignment

**Desktop (current system)**:
- Migrate addresses -> items (type: 'url')
- Migrate visits -> item_visits
- Consolidate address_tags + item_tags
- ~2-week effort for feature updates

**Server (already modernized)**:
- Already has unified `items` table
- Just needs schema version alignment

**Mobile**:
- Already uses items model
- Will sync perfectly with unified desktop

**Browser Extension**:
- Minor updates to use items instead of addresses
- History import becomes cleaner

---

## Recommendations

**Priority 1: Adopt the unified "everything is an item" model**
- Eliminates duplication
- Enables cross-device sync of visit history
- Simplifies frecency algorithm
- Reduces feature complexity

**Priority 2: Unify visit tracking**
- One item_visits table with full metadata
- Supports both manual saves and automatic history
- Enables rich analytics (duration, source, interaction)

**Priority 3: Implement frecency + adaptive matching**
- Calculate from all item visits (manual + auto)
- Powers the "magical mind-reading" (TODO goal)
- Works across curated + historical items

**Priority 4: Define groups vs tags**
- Tags = flat annotation/search
- Groups = spatial/hierarchical collections
- Both queryable via unified API

**Priority 5: Address scheme**
- peek://item/* for all items
- Enables "daily ribbon", "record/replay" (TODO Addressability section)
- Supports chaining architecture (TODO Chaining section)

---

## Conclusion

This unified architecture (~4 weeks refactor) unblocks numerous TODO items:
- Frecency scoring across all content
- Groups/tags clarity
- Addressability for chaining/record-replay
- Feeds/time-series features
- Cross-device visit history sync

The core pattern follows Firefox Places: **items are the universal entity, visits are events on items, bookmarks/tags/groups are annotations on items**.
