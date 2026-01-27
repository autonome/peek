/**
 * Unified Sync Engine — Entry Point
 *
 * Usage:
 *   import { createEngine } from './sync/index.js';
 *   import { createMemoryAdapter } from './sync/adapters/memory.js';
 *
 *   const adapter = createMemoryAdapter();
 *   const { data, sync } = createEngine(adapter, {
 *     getConfig: () => ({ serverUrl, apiKey, serverProfileId, lastSyncTime }),
 *     setConfig: (updates) => { ... },
 *   });
 *
 *   await adapter.open();
 *   const { id } = await data.saveItem('url', 'https://example.com', ['tag1']);
 *   const result = await sync.syncAll();
 */

import { DataEngine } from './data.js';
import { SyncEngine } from './sync.js';

export { DataEngine } from './data.js';
export { SyncEngine } from './sync.js';
export { calculateFrecency } from './frecency.js';
export { DATASTORE_VERSION, PROTOCOL_VERSION } from './version.js';
export { createMemoryAdapter } from './adapters/memory.js';
export { createBetterSqliteAdapter } from './adapters/better-sqlite3.js';

/**
 * Create a fully wired engine from an adapter.
 *
 * @param {import('./adapters/interface.js').StorageAdapter} adapter
 * @param {Object} [syncOptions] - Omit for data-only usage (no sync)
 * @param {() => Promise<import('./sync.js').SyncConfig>|import('./sync.js').SyncConfig} [syncOptions.getConfig]
 * @param {(updates: Partial<import('./sync.js').SyncConfig>) => Promise<void>|void} [syncOptions.setConfig]
 * @param {typeof globalThis.fetch} [syncOptions.fetch] - Custom fetch for testing
 * @returns {{ data: DataEngine, sync: SyncEngine|null }}
 */
export function createEngine(adapter, syncOptions) {
  const data = new DataEngine(adapter);

  let sync = null;
  if (syncOptions && syncOptions.getConfig && syncOptions.setConfig) {
    sync = new SyncEngine(data, syncOptions);
  }

  return { data, sync };
}
