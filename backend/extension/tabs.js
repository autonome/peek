/**
 * Tab Sync — one-way import (browser → Peek)
 *
 * Imports open browser tabs as URL items. Listens for tab updates
 * (new pages loaded). Does NOT remove Peek items when tabs close.
 * Behind a test feature toggle (peek_tabs_enabled).
 */

import { addItem, queryItems, getOrCreateTag, tagItem, getItemsByTag } from './datastore.js';

const CONFIG_KEY = 'peek_tabs_enabled';
const TAB_TAG = 'from:tab';

const INTERNAL_PREFIXES = [
  'about:',
  'chrome:',
  'moz-extension:',
  'chrome-extension:',
  'data:',
  'javascript:',
];

// ==================== Config ====================

export async function isTabSyncEnabled() {
  const result = await chrome.storage.local.get({ [CONFIG_KEY]: false });
  return result[CONFIG_KEY];
}

export async function setTabSyncEnabled(enabled) {
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

// ==================== Group Resolution ====================

async function getGroupName(groupId) {
  if (groupId === -1 || groupId === undefined || groupId === null) {
    return 'unfiled';
  }
  // chrome.tabGroups may not exist (e.g. Firefox)
  if (!chrome.tabGroups || !chrome.tabGroups.get) {
    return 'unfiled';
  }
  try {
    const group = await chrome.tabGroups.get(groupId);
    return group.title || 'unnamed';
  } catch {
    return 'unfiled';
  }
}

// ==================== Deduplication ====================

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

// ==================== Tab Metadata ====================

function buildTabMetadata(tab, groupTitle, groupColor) {
  const meta = {};
  const fields = [
    'title', 'tabId', 'windowId', 'index', 'pinned', 'active',
    'status', 'incognito', 'lastAccessed', 'favIconUrl',
    'openerTabId', 'groupId',
  ];
  // tab.id is the standard property; map to tabId
  if (tab.id !== undefined) meta.tabId = tab.id;
  for (const field of fields) {
    if (field === 'tabId') continue; // handled above
    if (tab[field] !== undefined) meta[field] = tab[field];
  }
  if (groupTitle !== undefined) meta.groupTitle = groupTitle;
  if (groupColor !== undefined) meta.groupColor = groupColor;
  return meta;
}

// ==================== Add Single Tab ====================

async function addTabItem(tab, existingUrlMap) {
  const url = tab.url;
  if (isInternalUrl(url)) return false;

  const existing = existingUrlMap.get(url);

  if (existing) {
    // Tag existing item so it's counted in tab stats
    const tabTagResult = await getOrCreateTag(TAB_TAG);
    if (tabTagResult.success) {
      await tagItem(existing.id, tabTagResult.data.tag.id);
    }
    const groupId = tab.groupId !== undefined ? tab.groupId : -1;
    const groupName = await getGroupName(groupId);
    const groupTag = `group:${groupName}`;
    const groupTagResult = await getOrCreateTag(groupTag);
    if (groupTagResult.success) {
      await tagItem(existing.id, groupTagResult.data.tag.id);
    }
    return false;
  }

  const groupId = tab.groupId !== undefined ? tab.groupId : -1;
  const groupName = await getGroupName(groupId);

  // Resolve group color if available
  let groupColor;
  if (groupId !== -1 && chrome.tabGroups && chrome.tabGroups.get) {
    try {
      const group = await chrome.tabGroups.get(groupId);
      groupColor = group.color;
    } catch {
      // ignore
    }
  }

  const metadata = buildTabMetadata(tab, groupName !== 'unfiled' ? groupName : undefined, groupColor);

  const result = await addItem('url', {
    content: url,
    metadata,
    syncSource: 'tab',
  });

  if (result.success) {
    // Tag with from:tab
    const tabTagResult = await getOrCreateTag(TAB_TAG);
    if (tabTagResult.success) {
      await tagItem(result.data.id, tabTagResult.data.tag.id);
    }

    // Tag with group:<name>
    const groupTag = `group:${groupName}`;
    const groupTagResult = await getOrCreateTag(groupTag);
    if (groupTagResult.success) {
      await tagItem(result.data.id, groupTagResult.data.tag.id);
    }

    existingUrlMap.set(url, { id: result.data.id, content: url });
  }

  return true;
}

// ==================== Import ====================

/**
 * Import all open browser tabs. Deduplicates against existing URL items.
 * Returns { imported, skipped }.
 */
export async function importAllTabs() {
  const tabs = await chrome.tabs.query({});
  const existingUrlMap = await getExistingUrlMap();

  let imported = 0;
  let skipped = 0;

  for (const tab of tabs) {
    if (isInternalUrl(tab.url)) {
      skipped++;
      continue;
    }
    const added = await addTabItem(tab, existingUrlMap);
    if (added) imported++;
    else skipped++;
  }

  return { imported, skipped };
}

// ==================== Stats ====================

/**
 * Returns { openTabs, imported, synced }.
 * openTabs = count from chrome.tabs.query (excluding internal URLs)
 * imported = Peek items with syncSource 'tab'
 * synced = subset of imported that have been synced (syncedAt > 0)
 */
export async function getTabStats() {
  const allTabs = await chrome.tabs.query({});
  const openTabs = allTabs.filter(t => !isInternalUrl(t.url)).length;

  const tagResult = await getOrCreateTag(TAB_TAG);
  let imported = 0;
  let synced = 0;
  if (tagResult.success) {
    const itemsResult = await getItemsByTag(tagResult.data.tag.id);
    if (itemsResult.success) {
      imported = itemsResult.data.length;
      synced = itemsResult.data.filter(i => i.syncedAt > 0).length;
    }
  }

  return { openTabs, imported, synced };
}

// ==================== Listener ====================

let onUpdatedCallback = null;

export function activateListeners() {
  if (onUpdatedCallback) return; // already active

  onUpdatedCallback = async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    if (!tab.url) return;
    if (isInternalUrl(tab.url)) return;

    const existingUrlMap = await getExistingUrlMap();
    await addTabItem(tab, existingUrlMap);
  };

  chrome.tabs.onUpdated.addListener(onUpdatedCallback);
}

export function deactivateListeners() {
  if (!onUpdatedCallback) return;

  chrome.tabs.onUpdated.removeListener(onUpdatedCallback);
  onUpdatedCallback = null;
}

// ==================== Init ====================

export async function initTabSync() {
  const enabled = await isTabSyncEnabled();
  if (enabled) {
    activateListeners();
  }
}
