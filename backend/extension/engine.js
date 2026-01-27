/**
 * Engine Singleton
 *
 * Creates the IndexedDB adapter and wires the unified sync engine.
 * All extension modules import from here instead of datastore.js / sync.js.
 */

import { createEngine } from './sync/index.js';
import { createIndexedDBAdapter } from './sync/adapters/indexeddb.js';
import { getCurrentProfile, getSyncConfig as getProfileSyncConfig, updateLastSyncTime } from './profiles.js';

const SERVER_URL_KEY = 'peek_sync_serverUrl';
const AUTO_SYNC_KEY = 'peek_sync_autoSync';

const adapter = createIndexedDBAdapter();

async function getConfig() {
  const urlData = await chrome.storage.local.get({ [SERVER_URL_KEY]: '' });
  const autoData = await chrome.storage.local.get({ [AUTO_SYNC_KEY]: false });
  const serverUrl = urlData[SERVER_URL_KEY];
  const autoSync = autoData[AUTO_SYNC_KEY];

  const profileResult = await getCurrentProfile();
  if (!profileResult.success || !profileResult.data) {
    return { serverUrl, apiKey: '', lastSyncTime: 0, autoSync };
  }

  const profile = profileResult.data;
  const syncConfigResult = await getProfileSyncConfig(profile.id);
  const syncConfig = syncConfigResult.data;

  return {
    serverUrl,
    apiKey: syncConfig?.apiKey || '',
    serverProfileId: syncConfig?.serverProfileId || '',
    lastSyncTime: profile.lastSyncAt || 0,
    autoSync,
  };
}

async function setConfig(updates) {
  if (updates.serverUrl !== undefined) {
    await chrome.storage.local.set({ [SERVER_URL_KEY]: updates.serverUrl });
  }
  if (updates.autoSync !== undefined) {
    await chrome.storage.local.set({ [AUTO_SYNC_KEY]: updates.autoSync });
  }
  if (updates.lastSyncTime !== undefined) {
    const profileResult = await getCurrentProfile();
    if (profileResult.success && profileResult.data) {
      await updateLastSyncTime(profileResult.data.id, updates.lastSyncTime);
    }
  }
}

const { data, sync } = createEngine(adapter, { getConfig, setConfig });

export { adapter, data, sync };
export { getConfig, setConfig };

export async function initialize() {
  await adapter.open();
}

export async function close() {
  await adapter.close();
}
