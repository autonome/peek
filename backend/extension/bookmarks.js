/**
 * Bookmark Sync — one-way import (browser → Peek)
 *
 * Imports browser bookmarks as URL items. Listens for new bookmark
 * additions. Does NOT delete Peek items when bookmarks are deleted.
 * Behind a test feature toggle (peek_bookmarks_enabled).
 */

import { addItem, queryItems, getOrCreateTag, tagItem, getItemsByTag } from './datastore.js';

const CONFIG_KEY = 'peek_bookmarks_enabled';
const BOOKMARK_TAG = 'from:bookmark';

// ==================== Config ====================

export async function isBookmarkSyncEnabled() {
  const result = await chrome.storage.local.get({ [CONFIG_KEY]: false });
  return result[CONFIG_KEY];
}

export async function setBookmarkSyncEnabled(enabled) {
  await chrome.storage.local.set({ [CONFIG_KEY]: !!enabled });
}

// ==================== Import ====================

/**
 * Walk the bookmark tree and collect all bookmark URLs (skip folders).
 */
function collectBookmarks(nodes) {
  const urls = [];
  for (const node of nodes) {
    if (node.url) {
      urls.push({ url: node.url, title: node.title || '', id: node.id });
    }
    if (node.children) {
      urls.push(...collectBookmarks(node.children));
    }
  }
  return urls;
}

/**
 * Build a Map of existing URL content → item for deduplication.
 * Needs the item reference so we can tag existing items.
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

/**
 * Add a single bookmark as a Peek URL item with tag.
 * If the URL already exists, tags the existing item with from:bookmark.
 * Returns true if a new item was imported, false if already existed.
 */
async function addBookmarkItem(url, title, bookmarkId, existingUrlMap) {
  const existing = existingUrlMap.get(url);

  if (existing) {
    // Tag existing item so it's counted in bookmark stats
    const tagResult = await getOrCreateTag(BOOKMARK_TAG);
    if (tagResult.success) {
      await tagItem(existing.id, tagResult.data.tag.id);
    }
    return false;
  }

  const result = await addItem('url', {
    content: url,
    metadata: { title, bookmarkId },
    syncSource: 'bookmark',
  });

  if (result.success) {
    const tagResult = await getOrCreateTag(BOOKMARK_TAG);
    if (tagResult.success) {
      await tagItem(result.data.id, tagResult.data.tag.id);
    }
    existingUrlMap.set(url, { id: result.data.id, content: url });
  }

  return true;
}

/**
 * Import all browser bookmarks. Deduplicates against existing URL items.
 * Returns { imported, skipped }.
 */
export async function importAllBookmarks() {
  const tree = await chrome.bookmarks.getTree();
  const bookmarks = collectBookmarks(tree);
  const existingUrlMap = await getExistingUrlMap();

  let imported = 0;
  let skipped = 0;

  for (const bm of bookmarks) {
    const added = await addBookmarkItem(bm.url, bm.title, bm.id, existingUrlMap);
    if (added) imported++;
    else skipped++;
  }

  return { imported, skipped };
}

// ==================== Stats ====================

/**
 * Returns { browserBookmarks, imported, synced }.
 * browserBookmarks = total URLs in the bookmark tree
 * imported = Peek items with syncSource 'bookmark'
 * synced = subset of imported that have been synced (syncedAt > 0)
 */
export async function getBookmarkStats() {
  const tree = await chrome.bookmarks.getTree();
  const browserBookmarks = collectBookmarks(tree).length;

  const tagResult = await getOrCreateTag(BOOKMARK_TAG);
  let imported = 0;
  let synced = 0;
  if (tagResult.success) {
    const itemsResult = await getItemsByTag(tagResult.data.tag.id);
    if (itemsResult.success) {
      imported = itemsResult.data.length;
      synced = itemsResult.data.filter(i => i.syncedAt > 0).length;
    }
  }

  return { browserBookmarks, imported, synced };
}

// ==================== Listener ====================

let onCreatedCallback = null;

export function activateListener() {
  if (onCreatedCallback) return; // already active

  onCreatedCallback = async (id, bookmark) => {
    if (!bookmark.url) return; // folder, ignore

    const existingUrlMap = await getExistingUrlMap();
    await addBookmarkItem(bookmark.url, bookmark.title || '', id, existingUrlMap);
  };

  chrome.bookmarks.onCreated.addListener(onCreatedCallback);
}

export function deactivateListener() {
  if (!onCreatedCallback) return;

  chrome.bookmarks.onCreated.removeListener(onCreatedCallback);
  onCreatedCallback = null;
}

// ==================== Init ====================

export async function initBookmarkSync() {
  const enabled = await isBookmarkSyncEnabled();
  if (enabled) {
    activateListener();
  }
}
