# Sync Edge Cases Investigation

This document details the investigation of sync edge cases between mobile, desktop, and server. It documents current behavior, known limitations, and recommendations for future fixes.

## Summary

| Edge Case | Priority | Current Behavior | Impact |
|-----------|----------|------------------|--------|
| Deleted items not synced | HIGH | Deletes are local-only | Items "resurrect" on other devices |
| Push failures not retried | HIGH | Failed items lost | Potential data loss |
| Tagset sync | LOW | Works correctly | None |
| Unicode content | LOW | Works correctly | None |
| Identical timestamps | LOW | Item skipped | None (correct behavior) |
| Clock skew | LOW | Not validated | Incorrect conflict resolution |

## Category 1: Deleted Items (HIGH PRIORITY)

### Current Behavior

When an item is soft-deleted on desktop:
1. `deleteItem()` sets `deletedAt = timestamp` in local database
2. Item is excluded from `queryItems()` results (which filter `WHERE deletedAt = 0`)
3. **Critically**: Push query also filters `WHERE deletedAt = 0`, so deleted items are never pushed to server
4. Server never learns about the delete
5. Other devices (mobile) never learn about the delete

### Code Evidence

**Desktop sync.ts - Pull (line 187)**:
```javascript
const localItem = db.prepare(
  'SELECT * FROM items WHERE syncId = ? AND deletedAt = 0'
).get(serverItem.id);
```

**Desktop sync.ts - Push (lines 288-297)**:
```javascript
items = db.prepare(`
  SELECT * FROM items
  WHERE deletedAt = 0 AND (syncSource = '' OR updatedAt > ?)
`).all(lastSyncTime);
```

**Server db.js - getItemsSince (line 717)**:
```javascript
WHERE deleted_at IS NULL AND updated_at > ?
```

### Impact

1. Delete item on Desktop → Still exists on Server → Mobile still sees it
2. Delete item on Mobile → Still exists on Server → Desktop still sees it
3. Items effectively "resurrect" when syncing to other devices
4. User confusion when deleted items keep reappearing

### Recommended Fix

**Option A: Push delete tombstones**
- When `deletedAt` is set, keep item in push query
- Push includes `deleted_at` timestamp to server
- Server marks item as deleted
- Other clients pull the deletion and apply locally

**Option B: Push explicit delete operations**
- Add `DELETE /items/:id` call when item is deleted locally
- Track pending deletes separately from pending creates/updates
- Retry failed deletes

**Recommended**: Option A (tombstone approach) is cleaner and matches the existing last-write-wins model.

### Test Added

`testDeletedItemsNotSynced()` in `sync-e2e.test.js` - Documents and verifies this limitation.

---

## Category 2: Push Failure Recovery (HIGH PRIORITY)

### Current Behavior

When pushing items to server:
1. Each item is pushed individually in `pushSingleItem()`
2. If push fails, error is caught and logged
3. `failed` counter is incremented
4. **Critically**: After sync completes, `lastSyncTime` is updated regardless of failures
5. On next sync, failed items have `updatedAt < lastSyncTime`
6. Failed items are never retried

### Code Evidence

**Desktop sync.ts - Push loop (lines 305-312)**:
```javascript
for (const item of items) {
  try {
    await pushSingleItem(serverUrl, apiKey, item);
    pushed++;
  } catch (error) {
    DEBUG && console.log(`[sync] Failed to push item ${item.id}:`, (error as Error).message);
    failed++;  // Just logged and counted, no retry mechanism
  }
}
```

**Desktop sync.ts - syncAll (line 408)**:
```javascript
setSyncConfig({ lastSyncTime: startTime });  // Updated even if pushes failed
```

### Impact

1. Network glitch during push → Item fails to sync
2. `lastSyncTime` advances past item's `updatedAt`
3. Item is never retried on subsequent syncs
4. **Data loss**: Item exists only on device that created it

### Recommended Fix

**Option A: Track failed items**
```javascript
// Add to extension_settings or separate table
interface FailedPushItem {
  itemId: string;
  lastAttempt: number;
  errorMessage: string;
  retryCount: number;
}
```
- On push failure, add item to failed queue
- On each sync, retry failed items first
- Remove from failed queue on success
- Exponential backoff after multiple failures

**Option B: Don't advance lastSyncTime if any failures**
```javascript
if (pushResult.failed === 0) {
  setSyncConfig({ lastSyncTime: startTime });
}
```
- Simpler but may cause extra work on subsequent syncs
- Could retry already-synced items

**Recommended**: Option A provides more robust tracking. Option B is a quick fix.

### Test Added

`testPushFailureNotRetried()` in `sync-e2e.test.js` - Documents this issue.

---

## Category 3: Timestamp Edge Cases (MEDIUM PRIORITY)

### 3a. lastSyncTime Update Timing

**Current behavior**: `lastSyncTime` is set to `startTime` (beginning of sync) not end.

This is **correct** because:
- Items created during sync have `createdAt > startTime`
- They will be caught on the next sync
- If we used end time, items created mid-sync could be missed

### 3b. Clock Skew

**Current behavior**: No validation of client vs server times.

**Impact**:
- If client clock is significantly ahead, local items always "win"
- If client clock is behind, server items always "win"
- Extreme skew (>24 hours) could cause data loss

**Recommendation**: Add optional clock skew warning when server time differs significantly.

### 3c. Identical Timestamps

**Current behavior**: In `mergeServerItem()`, line 241:
```javascript
if (localItem.updatedAt > serverUpdatedAt) {
  return 'conflict';  // Local wins
}
// Same timestamp falls through to 'skipped'
return 'skipped';
```

This is **correct** - equal timestamps mean no update needed.

### Test Added

`testIdenticalTimestamps()` in `sync-e2e.test.js` - Verifies no duplicates on repeated pulls.

---

## Category 4: Data Edge Cases (MEDIUM PRIORITY)

### 4a. Tagset Sync

**Current behavior**: Works correctly.

Tagsets are items with null content that exist solely to hold tags. Testing confirmed tagsets sync properly between desktop and server.

**Test**: `testTagsetSync()` creates a tagset with specific tags on desktop, pushes to server, and verifies the tagset appears with correct tags.

### 4b. Unicode Content

**Current behavior**: Full Unicode support works correctly.

Tested:
- Emoji (🌍, 🎉)
- CJK characters (日本語)
- Greek (Ελληνικά)
- URLs with Unicode query params
- Control characters (newlines, tabs)

All sync correctly through SQLite and JSON serialization.

### 4c. Large Content

**Current behavior**: No size limits enforced.

**Potential issues**:
- Very large text items could cause memory issues
- No pagination on pull

**Recommendation**: Consider adding soft limits (e.g., warn on >1MB content).

### Tests Added

`testEmptyContent()` and `testUnicodeContent()` in `sync-e2e.test.js`.

---

## Category 5: Network Failures (LOW PRIORITY)

### Current Behavior

- Sync throws on network error
- Error is propagated to caller
- No offline queue

### Recommendation

For mobile especially, consider:
1. Queue sync operations when offline
2. Auto-retry when network returns
3. Show pending sync status to user

This is documented in `sync-architecture.md:178` as a known limitation.

---

## Category 6: Image Binary Sync (OUT OF SCOPE)

This is a documented limitation (`sync-architecture.md:179`). Images sync metadata only, not binary data. This is intentional for now to avoid bandwidth issues.

---

## Test Summary

Added 5 new edge case tests to `backend/tests/sync-e2e.test.js`:

| Test | Purpose |
|------|---------|
| `testDeletedItemsNotSynced` | Documents that soft deletes don't propagate |
| `testPushFailureNotRetried` | Documents that failed pushes can cause data loss |
| `testEmptyContent` | Verifies empty string and null content handling |
| `testUnicodeContent` | Verifies non-ASCII content syncs correctly |
| `testIdenticalTimestamps` | Verifies no duplicates on repeated pulls |

Run with:
```bash
yarn test:sync
```

---

## Recommendations Summary

### Immediate (Should Fix)

1. **Push failure retry** - At minimum, don't advance `lastSyncTime` if any pushes fail
2. **Soft delete sync** - Push deletions as tombstones to server

### Future Improvements

1. Offline queue with retry logic
2. Clock skew detection and warning
3. Content size limits
4. Pagination for large syncs
