/**
 * Peek Frontend API
 *
 * This is the contract between frontend code (app/, extensions/) and the backend.
 * Each backend (Electron, Tauri, browser extension) implements this API differently.
 *
 * In Electron: Implemented via preload.js using ipcRenderer
 * In Tauri: Would use Tauri invoke/commands
 * In Browser Extension: Would use chrome.runtime.sendMessage
 */

// ==================== Result Types ====================

export interface ApiResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ==================== Scopes ====================

export enum ApiScope {
  SYSTEM = 1,
  SELF = 2,
  GLOBAL = 3
}

// ==================== Shortcuts ====================

export interface ShortcutOptions {
  /** If true, shortcut works even when app doesn't have focus */
  global?: boolean;
}

export interface IShortcutsApi {
  /**
   * Register a keyboard shortcut
   * @param shortcut - Key combination (e.g., 'Alt+1', 'CommandOrControl+Q')
   * @param callback - Function called when shortcut is triggered
   * @param options - Optional configuration
   */
  register(shortcut: string, callback: () => void, options?: ShortcutOptions): void;

  /**
   * Unregister a keyboard shortcut
   * @param shortcut - The shortcut to unregister
   * @param options - Must match registration options
   */
  unregister(shortcut: string, options?: ShortcutOptions): void;
}

// ==================== Window ====================

export interface WindowOptions {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  show?: boolean;
  modal?: boolean;
  keepLive?: boolean;
  key?: string;
  transparent?: boolean;
  frame?: boolean;
  type?: string;
  escapeMode?: 'close' | 'navigate' | 'auto';
  openDevTools?: boolean;
  detachedDevTools?: boolean;
  debug?: boolean;
  [key: string]: unknown;
}

export interface WindowInfo {
  id: number;
  url: string;
  title: string;
  source: string;
  params: WindowOptions;
}

export interface IWindowApi {
  /** Open a new window */
  open(url: string, options?: WindowOptions): Promise<ApiResult<{ id: number; reused?: boolean }>>;

  /** Close a window by ID, or close current window if null */
  close(id?: number | null): Promise<ApiResult<void>> | void;

  /** Hide a window */
  hide(id: number): Promise<ApiResult<void>>;

  /** Show a hidden window */
  show(id: number): Promise<ApiResult<void>>;

  /** Check if a window exists */
  exists(id: number): Promise<{ exists: boolean }>;

  /** Move a window to coordinates */
  move(id: number, x: number, y: number): Promise<ApiResult<void>>;

  /** Focus a window */
  focus(id: number): Promise<ApiResult<void>>;

  /** Blur (unfocus) a window */
  blur(id: number): Promise<ApiResult<void>>;

  /** List all windows */
  list(options?: { includeInternal?: boolean }): Promise<ApiResult<{ windows: WindowInfo[] }>>;
}

// ==================== Datastore ====================

export interface Address {
  id: string;
  uri: string;
  protocol: string;
  domain: string;
  path: string;
  title: string;
  mimeType: string;
  favicon: string;
  description: string;
  tags: string;
  metadata: string;
  createdAt: number;
  updatedAt: number;
  lastVisitAt: number;
  visitCount: number;
  starred: number;
  archived: number;
}

export interface Visit {
  id: string;
  addressId: string;
  timestamp: number;
  duration: number;
  source: string;
  sourceId: string;
  windowType: string;
  metadata: string;
  scrollDepth: number;
  interacted: number;
}

export interface Content {
  id: string;
  title: string;
  content: string;
  mimeType: string;
  contentType: string;
  // ... other fields
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  color: string;
  parentId: string;
  description: string;
  metadata: string;
  createdAt: number;
  updatedAt: number;
  frequency: number;
  lastUsedAt: number;
  frecencyScore: number;
}

export interface AddressFilter {
  domain?: string;
  protocol?: string;
  starred?: number;
  tag?: string;
  sortBy?: 'lastVisit' | 'visitCount' | 'created';
  limit?: number;
}

export interface VisitFilter {
  addressId?: string;
  source?: string;
  since?: number;
  until?: number;
  limit?: number;
}

export interface ContentFilter {
  contentType?: string;
  mimeType?: string;
  synced?: number;
  starred?: number;
  tag?: string;
  sortBy?: 'updated' | 'created';
  limit?: number;
}

export interface DatastoreStats {
  totalAddresses: number;
  totalVisits: number;
  avgVisitDuration: number;
  totalContent: number;
  syncedContent: number;
}

export interface IDatastoreApi {
  // Address operations
  addAddress(uri: string, options?: Partial<Address>): Promise<ApiResult<{ id: string }>>;
  getAddress(id: string): Promise<ApiResult<Address>>;
  updateAddress(id: string, updates: Partial<Address>): Promise<ApiResult<Address>>;
  queryAddresses(filter?: AddressFilter): Promise<ApiResult<Address[]>>;

  // Visit operations
  addVisit(addressId: string, options?: Partial<Visit>): Promise<ApiResult<{ id: string }>>;
  queryVisits(filter?: VisitFilter): Promise<ApiResult<Visit[]>>;

  // Content operations
  addContent(options?: Partial<Content>): Promise<ApiResult<{ id: string }>>;
  queryContent(filter?: ContentFilter): Promise<ApiResult<Content[]>>;

  // Generic table operations
  getTable(tableName: string): Promise<ApiResult<Record<string, unknown>>>;
  setRow(tableName: string, rowId: string, rowData: Record<string, unknown>): Promise<ApiResult<void>>;

  // Stats
  getStats(): Promise<ApiResult<DatastoreStats>>;

  // Tag operations
  getOrCreateTag(name: string): Promise<ApiResult<{ data: Tag; created: boolean }>>;
  tagAddress(addressId: string, tagId: string): Promise<ApiResult<unknown>>;
  untagAddress(addressId: string, tagId: string): Promise<ApiResult<{ removed: boolean }>>;
  getTagsByFrecency(domain?: string): Promise<ApiResult<Tag[]>>;
  getAddressTags(addressId: string): Promise<ApiResult<Tag[]>>;
  getAddressesByTag(tagId: string): Promise<ApiResult<Address[]>>;
  getUntaggedAddresses(): Promise<ApiResult<Address[]>>;
}

// ==================== Commands ====================

export interface Command {
  name: string;
  description?: string;
  execute: (msg?: unknown) => void | Promise<void>;
}

export interface CommandInfo {
  name: string;
  description: string;
  source: string;
}

export interface ICommandsApi {
  /** Register a command with the cmd palette */
  register(command: Command): void;

  /** Unregister a command */
  unregister(name: string): void;

  /** Get all registered commands */
  getAll(): Promise<CommandInfo[]>;
}

// ==================== PubSub ====================

export interface IPubSubApi {
  /** Publish a message to a topic */
  publish(topic: string, msg: unknown, scope?: ApiScope): void;

  /** Subscribe to a topic */
  subscribe(topic: string, callback: (msg: unknown) => void, scope?: ApiScope): void;
}

// ==================== Extensions ====================

export interface ExtensionManifest {
  id: string;
  shortname?: string;
  name: string;
  version?: string;
  description?: string;
  [key: string]: unknown;
}

export interface ExtensionInfo {
  id: string;
  manifest: ExtensionManifest | null;
  status: string;
}

export interface Extension {
  id: string;
  name: string;
  description: string;
  version: string;
  path: string;
  enabled: number;
  status: string;
  builtin: number;
  // ... other fields
}

export interface IExtensionsApi {
  /** List running extensions */
  list(): Promise<ApiResult<ExtensionInfo[]>>;

  /** Load an extension (permission required) */
  load(id: string): Promise<ApiResult<void>>;

  /** Unload an extension (permission required) */
  unload(id: string): Promise<ApiResult<void>>;

  /** Reload an extension (permission required) */
  reload(id: string): Promise<ApiResult<void>>;

  /** Get manifest for an extension */
  getManifest(id: string): Promise<ApiResult<ExtensionManifest>>;

  // Datastore-backed operations
  pickFolder(): Promise<ApiResult<{ path: string } | null>>;
  validateFolder(folderPath: string): Promise<ApiResult<{ valid: boolean; errors?: string[]; manifest?: ExtensionManifest }>>;
  add(folderPath: string, manifest: ExtensionManifest, enabled?: boolean): Promise<ApiResult<{ id: string }>>;
  remove(id: string): Promise<ApiResult<void>>;
  update(id: string, updates: Partial<Extension>): Promise<ApiResult<Extension>>;
  getAll(): Promise<ApiResult<Extension[]>>;
  get(id: string): Promise<ApiResult<Extension>>;
  getSettingsSchema(extId: string): Promise<ApiResult<{ extId: string; name: string; schema: unknown } | null>>;
}

// ==================== Settings ====================

export interface ISettingsApi {
  /** Get all settings for current extension */
  get(): Promise<ApiResult<Record<string, unknown>>>;

  /** Set all settings for current extension */
  set(settings: Record<string, unknown>): Promise<ApiResult<void>>;

  /** Get a single setting key */
  getKey(key: string): Promise<ApiResult<unknown>>;

  /** Set a single setting key */
  setKey(key: string, value: unknown): Promise<ApiResult<void>>;
}

// ==================== Escape ====================

export interface EscapeResult {
  handled: boolean;
}

export interface IEscapeApi {
  /** Register escape key handler */
  onEscape(callback: () => EscapeResult | Promise<EscapeResult>): void;
}

// ==================== Main API ====================

/**
 * The main Peek API exposed to frontend code as window.app
 */
export interface IPeekApi {
  /** Log to main process (shows in terminal) */
  log(...args: unknown[]): void;

  /** Debug mode flag */
  debug: boolean;

  /** Debug level constants */
  debugLevels: { BASIC: number; FIRST_RUN: number };

  /** Current debug level */
  debugLevel: number;

  /** Scope constants for pubsub */
  scopes: typeof ApiScope;

  /** Keyboard shortcuts */
  shortcuts: IShortcutsApi;

  /** Window management */
  window: IWindowApi;

  /** Legacy close window (use window.close instead) */
  closeWindow(id: number, callback?: (result: unknown) => void): void;

  /** Legacy modify window */
  modifyWindow(winName: string, params: Record<string, unknown>): void;

  /** PubSub publish */
  publish: IPubSubApi['publish'];

  /** PubSub subscribe */
  subscribe: IPubSubApi['subscribe'];

  /** Datastore operations */
  datastore: IDatastoreApi;

  /** Quit the application */
  quit(): void;

  /** Command registration */
  commands: ICommandsApi;

  /** Extension management */
  extensions: IExtensionsApi;

  /** Extension settings (for extension contexts only) */
  settings: ISettingsApi;

  /** Escape key handling */
  escape: IEscapeApi;
}

// Declare global for TypeScript
declare global {
  interface Window {
    app: IPeekApi;
  }
}
