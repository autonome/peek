/**
 * Electron Backend Entry Point
 *
 * Exports database functions and types for the Electron main process.
 */

// Configuration
export {
  APP_DEF_WIDTH,
  APP_DEF_HEIGHT,
  WEB_CORE_ADDRESS,
  SETTINGS_ADDRESS,
  IPC_CHANNELS,
  TOPICS,
  setPreloadPath,
  setProfile,
  getPreloadPath,
  getProfile,
  isTestProfile,
  isDevProfile,
  isHeadless,
} from './config.js';

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

// Protocol handling
export {
  APP_SCHEME,
  APP_PROTOCOL,
  registerScheme,
  registerExtensionPath,
  getExtensionPath,
  getRegisteredExtensionIds,
  registerThemePath,
  getThemePath,
  getRegisteredThemeIds,
  getActiveThemeId,
  setActiveThemeId,
  initProtocol,
} from './protocol.js';

// Extension management
export {
  discoverExtensions,
  loadExtensionManifest,
  isBuiltinExtensionEnabled,
  getExternalExtensions,
} from './extensions.js';

export type {
  ExtensionManifest,
  DiscoveredExtension,
} from './extensions.js';

// System tray
export {
  initTray,
  getTray,
  destroyTray,
} from './tray.js';

export type { TrayOptions } from './tray.js';

// Shortcuts
export {
  parseShortcut,
  inputMatchesShortcut,
  registerGlobalShortcut,
  unregisterGlobalShortcut,
  registerLocalShortcut,
  unregisterLocalShortcut,
  handleLocalShortcut,
  unregisterShortcutsForAddress,
  getGlobalShortcutSource,
  isGlobalShortcutRegistered,
} from './shortcuts.js';

export type { InputEvent } from './shortcuts.js';

// PubSub messaging
export {
  scopes,
  publish,
  subscribe,
  unsubscribe,
  unsubscribeAll,
  setExtensionBroadcaster,
  getSystemAddress,
} from './pubsub.js';

export type { Scope } from './pubsub.js';

// Main process orchestration
export {
  configure,
  initialize,
  discoverBuiltinExtensions,
  discoverBuiltinThemes,
  createExtensionWindow,
  loadEnabledExtensions,
  loadExtensions,
  getRunningExtensions,
  destroyExtensionWindow,
  getExtensionWindow,
  registerWindow,
  getWindowInfo,
  findWindowByKey,
  removeWindow,
  getChildWindows,
  getAllWindows,
  shutdown,
  // External URL handling
  handleExternalUrl,
  setAppReady,
  registerExternalUrlHandlers,
  registerSecondInstanceHandler,
  handleCliUrl,
  // Background window
  createBackgroundWindow,
  getBackgroundWindow,
  // App lifecycle
  registerWindowAllClosedHandler,
  registerActivateHandler,
  requestSingleInstance,
  quitApp,
} from './main.js';

export type { AppConfig } from './main.js';

// IPC handlers
export {
  registerDatastoreHandlers,
  registerExtensionHandlers,
  registerDarkModeHandlers,
  registerWindowHandlers,
  registerMiscHandlers,
  registerAllHandlers,
  restoreSavedTheme,
} from './ipc.js';

// Window helpers
export {
  setPrefsGetter,
  modWindow,
  addEscHandler,
  winDevtoolsConfig,
  closeWindow,
  getVisibleWindowCount,
  updateDockVisibility,
  maybeHideApp,
  closeOrHideWindow,
  closeChildWindows,
  getSystemThemeBackgroundColor,
} from './windows.js';

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
