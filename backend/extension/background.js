/**
 * Peek Browser Extension - Service Worker
 *
 * Handles auto-sync alarms, install events, and message passing.
 */

import { openDatabase } from './datastore.js';
import { ensureDefaultProfile, getCurrentProfile, getSyncConfig, updateProfileEnvironment } from './profiles.js';
import { syncAll, getSyncConfig as getFullSyncConfig, getSyncStatus } from './sync.js';
import { DATASTORE_VERSION, PROTOCOL_VERSION } from './version.js';
import { getEnvironment } from './environment.js';
import { initBookmarkSync, activateListener, deactivateListener, importAllBookmarks, getBookmarkStats } from './bookmarks.js';
import { initTabSync, activateListeners as activateTabListeners, deactivateListeners as deactivateTabListeners, importAllTabs, getTabStats } from './tabs.js';
import { initHistorySync, activateListener as activateHistoryListener, deactivateListener as deactivateHistoryListener, importAllHistory, getHistoryStats } from './history.js';

const AUTO_SYNC_ALARM = 'peek-auto-sync';
const SYNC_INTERVAL_MINUTES = 15;

// ==================== Install ====================

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[peek:bg] onInstalled:', details.reason);

  try {
    await openDatabase();
    await ensureDefaultProfile();

    // Stamp active profile with environment info
    const profile = await getCurrentProfile();
    if (profile.success && profile.data) {
      const env = await getEnvironment();
      await updateProfileEnvironment(profile.data.id, env);
    }
  } catch (error) {
    console.error('[peek:bg] Init error:', error);
  }

  // Initialize bookmark sync listener if enabled
  await initBookmarkSync();

  // Initialize tab sync listener if enabled
  await initTabSync();

  // Initialize history sync listener if enabled
  await initHistorySync();

  // Set up auto-sync alarm
  chrome.alarms.create(AUTO_SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES });

  // Open options page on first install
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// ==================== Service Worker Restart ====================

(async () => {
  try {
    await openDatabase();
    await initBookmarkSync();
    await initTabSync();
    await initHistorySync();
  } catch (error) {
    console.error('[peek:bg] Sync init error:', error);
  }
})();

// ==================== Toolbar Button ====================

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// ==================== Alarms ====================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== AUTO_SYNC_ALARM) return;

  console.log('[peek:bg] Auto-sync alarm fired');

  try {
    const configResult = await getFullSyncConfig();
    const config = configResult.data;

    if (!config.autoSync || !config.apiKey) {
      console.log('[peek:bg] Auto-sync skipped (not configured or disabled)');
      return;
    }

    await openDatabase();
    const result = await syncAll();
    console.log('[peek:bg] Auto-sync complete:', result.data);
  } catch (error) {
    console.error('[peek:bg] Auto-sync error:', error);
  }
});

// ==================== Message Handling ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'sync-now') {
    handleSyncNow().then(sendResponse);
    return true; // async response
  }

  if (message.type === 'get-diagnostics') {
    handleGetDiagnostics().then(sendResponse);
    return true;
  }

  if (message.type === 'bookmark-sync-toggle') {
    handleBookmarkSyncToggle(message.enabled).then(sendResponse);
    return true;
  }

  if (message.type === 'tab-sync-toggle') {
    handleTabSyncToggle(message.enabled).then(sendResponse);
    return true;
  }

  if (message.type === 'history-sync-toggle') {
    handleHistorySyncToggle(message.enabled).then(sendResponse);
    return true;
  }

  if (message.type === 'get-bookmark-stats') {
    handleGetBookmarkStats().then(sendResponse);
    return true;
  }

  if (message.type === 'get-tab-stats') {
    handleGetTabStats().then(sendResponse);
    return true;
  }

  if (message.type === 'get-history-stats') {
    handleGetHistoryStats().then(sendResponse);
    return true;
  }
});

async function handleSyncNow() {
  try {
    await openDatabase();
    const result = await syncAll();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleBookmarkSyncToggle(enabled) {
  try {
    await openDatabase();
    if (enabled) {
      activateListener();
      const result = await importAllBookmarks();
      return result;
    } else {
      deactivateListener();
      return { disabled: true };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleTabSyncToggle(enabled) {
  try {
    await openDatabase();
    if (enabled) {
      activateTabListeners();
      const result = await importAllTabs();
      return result;
    } else {
      deactivateTabListeners();
      return { disabled: true };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleHistorySyncToggle(enabled) {
  try {
    await openDatabase();
    if (enabled) {
      activateHistoryListener();
      const result = await importAllHistory();
      return result;
    } else {
      deactivateHistoryListener();
      return { disabled: true };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleGetBookmarkStats() {
  try {
    return await getBookmarkStats();
  } catch (error) {
    return { browserBookmarks: 0, imported: 0, synced: 0 };
  }
}

async function handleGetTabStats() {
  try {
    return await getTabStats();
  } catch (error) {
    return { openTabs: 0, imported: 0, synced: 0 };
  }
}

async function handleGetHistoryStats() {
  try {
    return await getHistoryStats();
  } catch (error) {
    return { historyItems: 0, imported: 0, synced: 0 };
  }
}

async function handleGetDiagnostics() {
  try {
    await openDatabase();
    const status = await getSyncStatus();
    const profile = await getCurrentProfile();
    const environment = await getEnvironment();

    return {
      success: true,
      data: {
        syncStatus: status.data,
        activeProfile: profile.data,
        environment,
        versions: {
          datastore: DATASTORE_VERSION,
          protocol: PROTOCOL_VERSION,
        },
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
