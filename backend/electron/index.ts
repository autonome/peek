/**
 * Electron Backend Entry Point
 *
 * Exports database functions and types for the Electron main process.
 */

// Database lifecycle and helpers
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

// Datastore operations
export {
  // Addresses
  addAddress,
  getAddress,
  updateAddress,
  queryAddresses,
  // Visits
  addVisit,
  queryVisits,
  // Content
  addContent,
  queryContent,
  // Tags
  getOrCreateTag,
  tagAddress,
  untagAddress,
  getTagsByFrecency,
  getAddressTags,
  getAddressesByTag,
  getUntaggedAddresses,
  // Generic
  getTable,
  setRow,
  getStats,
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
  AddressFilter,
  VisitFilter,
  ContentFilter,
  AddressOptions,
  VisitOptions,
  ContentOptions,
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
