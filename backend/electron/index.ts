/**
 * Electron Backend Entry Point
 *
 * Exports database functions and types for the Electron main process.
 */

// Database functions
export {
  initDatabase,
  closeDatabase,
  getDb,
  generateId,
  now,
  parseUrl,
  normalizeUrl,
  isValidTable,
  calculateFrecency,
} from './datastore.js';

// Re-export shared data types
export type {
  Address,
  Visit,
  Content,
  Tag,
  AddressTag,
  Extension,
  ExtensionSetting,
  DatastoreStats,
  TableName,
} from '../types/index.js';

export { tableNames } from '../types/index.js';

// Re-export frontend API types (the contract that preload.js implements)
export type {
  IPeekApi,
  ApiResult,
  ApiScope,
  IShortcutsApi,
  IWindowApi,
  IDatastoreApi,
  IPubSubApi,
  ICommandsApi,
  IExtensionsApi,
  ISettingsApi,
  IEscapeApi,
} from '../types/api.js';
