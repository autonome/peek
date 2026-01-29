/**
 * History Sync — one-way import (browser → Peek)
 *
 * Imports browser history as URL items with full visit metadata
 * (for later frecency calculation). Tags each with `from:history`.
 * Listens for new visits. Updates existing items on revisit instead
 * of skipping (unlike bookmarks/tabs which only add-and-skip).
 * Behind a test feature toggle (peek_history_enabled).
 */

import { addItem, queryItems, getOrCreateTag, tagItem, updateItem, getItemsByTag, recordItemVisit } from './datastore.js';

const CONFIG_KEY = 'peek_history_enabled';
const HISTORY_TAG = 'from:history';

const INTERNAL_PREFIXES = [
  'about:',
  'chrome:',
  'moz-extension:',
  'chrome-extension:',
  'data:',
  'javascript:',
];

// ==================== Config ====================

export async function isHistorySyncEnabled() {
  const result = await chrome.storage.local.get({ [CONFIG_KEY]: false });
  return result[CONFIG_KEY];
}

export async function setHistorySyncEnabled(enabled) {
  await chrome.storage.local.set({ [CONFIG_KEY]: !!enabled });
}

// ==================== URL Filtering ====================

function isInternalUrl(url) {
  if (!url) return true;
  for (const prefix of INTERNAL_PREFIXES) {
    if (url.startsWith(prefix)) return true;
  }
  return false;
}

// ==================== Deduplication ====================

/**
 * Build a Map<url, item> of existing URL items for deduplication.
 * Unlike bookmarks/tabs which use a Set<url>, history needs the item
 * reference so it can call updateItem() on revisit.
 */
async function getExistingUrlMap() {
  const result = await queryItems({ type: 'url' });
  const map = new Map();
  if (result.success && result.data) {
    for (const item of result.data) {
      if (item.content) map.set(item.content, item);
    }
  }
  return map;
}

// ==================== Visit Metadata ====================

function buildHistoryMetadata(historyItem, visits) {
  return {
    title: historyItem.title || '',
    lastVisitTime: historyItem.lastVisitTime || 0,
    visitCount: historyItem.visitCount || 0,
    typedCount: historyItem.typedCount || 0,
    visits: (visits || []).map(v => ({
      visitId: v.visitId,
      visitTime: v.visitTime,
      referringVisitId: v.referringVisitId,
      transition: v.transition,
    })),
  };
}

// ==================== Add or Update ====================

/**
 * Add a new history item or update an existing one with fresh visit data.
 * Also records item visits for frecency calculation.
 * Returns 'imported' | 'updated' | 'skipped'.
 */
async function addOrUpdateHistoryItem(url, historyItem, visits, existingUrlMap) {
  if (isInternalUrl(url)) return 'skipped';

  const metadata = buildHistoryMetadata(historyItem, visits);
  const existing = existingUrlMap.get(url);
  let itemId;

  if (existing) {
    itemId = existing.id;
    // Update existing item with fresh metadata
    await updateItem(existing.id, { metadata });
    // Tag existing item so it's counted in history stats
    const tagResult = await getOrCreateTag(HISTORY_TAG);
    if (tagResult.success) {
      await tagItem(existing.id, tagResult.data.tag.id);
    }
  } else {
    // Add new item
    const result = await addItem('url', {
      content: url,
      metadata,
      syncSource: 'history',
    });

    if (result.success) {
      itemId = result.data.id;
      const tagResult = await getOrCreateTag(HISTORY_TAG);
      if (tagResult.success) {
        await tagItem(result.data.id, tagResult.data.tag.id);
      }
      existingUrlMap.set(url, { id: result.data.id, content: url });
    }
  }

  // Record item visits for frecency calculation
  // This populates the item_visits table which is used for frecency scoring
  if (itemId && visits && visits.length > 0) {
    for (const visit of visits) {
      // Map browser transition types to our source types
      const source = mapTransitionToSource(visit.transition);
      await recordItemVisit(itemId, {
        timestamp: visit.visitTime,
        source,
        sourceId: visit.referringVisitId ? String(visit.referringVisitId) : '',
        // Typed visits are considered "interacted" as they show user intent
        interacted: visit.transition === 'typed' ? 1 : 0,
      });
    }
  }

  return existing ? 'updated' : 'imported';
}

/**
 * Map Chrome's transition types to our source types
 */
function mapTransitionToSource(transition) {
  switch (transition) {
    case 'link':
      return 'link';
    case 'typed':
      return 'direct';
    case 'auto_bookmark':
      return 'bookmark';
    case 'auto_subframe':
    case 'manual_subframe':
      return 'frame';
    case 'generated':
    case 'auto_toplevel':
      return 'generated';
    case 'form_submit':
      return 'form';
    case 'reload':
      return 'reload';
    default:
      return 'other';
  }
}

// ==================== Import ====================

/**
 * Import all browser history. Deduplicates against existing URL items.
 * For new URLs: addItem + tag. For existing URLs: updateItem with fresh metadata.
 * Returns { imported, updated, skipped }.
 */
export async function importAllHistory() {
  const historyItems = await chrome.history.search({ text: '', startTime: 0, maxResults: 1000000 });
  const existingUrlMap = await getExistingUrlMap();

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const historyItem of historyItems) {
    if (isInternalUrl(historyItem.url)) {
      skipped++;
      continue;
    }

    const visits = await chrome.history.getVisits({ url: historyItem.url });
    const action = await addOrUpdateHistoryItem(historyItem.url, historyItem, visits, existingUrlMap);

    if (action === 'imported') imported++;
    else if (action === 'updated') updated++;
    else skipped++;
  }

  return { imported, updated, skipped };
}

// ==================== Stats ====================

/**
 * Returns { historyItems, imported, synced }.
 * historyItems = count from chrome.history.search() excluding internal URLs
 * imported = Peek items with syncSource 'history'
 * synced = subset of imported that have been synced (syncedAt > 0)
 */
export async function getHistoryStats() {
  const allHistory = await chrome.history.search({ text: '', startTime: 0, maxResults: 1000000 });
  const historyItems = allHistory.filter(h => !isInternalUrl(h.url)).length;

  const tagResult = await getOrCreateTag(HISTORY_TAG);
  let imported = 0;
  let synced = 0;
  if (tagResult.success) {
    const itemsResult = await getItemsByTag(tagResult.data.tag.id);
    if (itemsResult.success) {
      imported = itemsResult.data.length;
      synced = itemsResult.data.filter(i => i.syncedAt > 0).length;
    }
  }

  return { historyItems, imported, synced };
}

// ==================== Listener ====================

let onVisitedCallback = null;

export function activateListener() {
  if (onVisitedCallback) return; // already active

  onVisitedCallback = async (historyItem) => {
    if (!historyItem.url) return;
    if (isInternalUrl(historyItem.url)) return;

    const visits = await chrome.history.getVisits({ url: historyItem.url });
    const existingUrlMap = await getExistingUrlMap();
    await addOrUpdateHistoryItem(historyItem.url, historyItem, visits, existingUrlMap);
  };

  chrome.history.onVisited.addListener(onVisitedCallback);
}

export function deactivateListener() {
  if (!onVisitedCallback) return;

  chrome.history.onVisited.removeListener(onVisitedCallback);
  onVisitedCallback = null;
}

// ==================== Init ====================

export async function initHistorySync() {
  const enabled = await isHistorySyncEnabled();
  if (enabled) {
    activateListener();
  }
}
