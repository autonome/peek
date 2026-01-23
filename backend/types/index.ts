/**
 * Shared data types used by both the API and backend implementations
 */

// ==================== Datastore Entity Types ====================

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
  language: string;
  encoding: string;
  tags: string;
  addressRefs: string;
  parentId: string;
  metadata: string;
  createdAt: number;
  updatedAt: number;
  syncPath: string;
  synced: number;
  starred: number;
  archived: number;
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

export interface AddressTag {
  id: string;
  addressId: string;
  tagId: string;
  createdAt: number;
}

// ==================== Item Types (for mobile-style lightweight content) ====================

// Unified types across all platforms (mobile, desktop, server)
// - url: Saved URLs/bookmarks
// - text: Text content/notes
// - tagset: Tag-only items
// - image: Binary images
export type ItemType = 'url' | 'text' | 'tagset' | 'image';

export interface Item {
  id: string;
  type: ItemType;
  content: string | null;
  mimeType: string;
  metadata: string;
  syncId: string;
  syncSource: string;
  syncedAt: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number;
  starred: number;
  archived: number;
  visitCount: number;
  lastVisitAt: number;
}

export interface ItemTag {
  id: string;
  itemId: string;
  tagId: string;
  createdAt: number;
}

export interface Extension {
  id: string;
  name: string;
  description: string;
  version: string;
  path: string;
  backgroundUrl: string;
  settingsUrl: string;
  iconPath: string;
  builtin: number;
  enabled: number;
  status: string;
  installedAt: number;
  updatedAt: number;
  lastErrorAt: number;
  lastError: string;
  metadata: string;
}

export interface ExtensionSetting {
  id: string;
  extensionId: string;
  key: string;
  value: string;
  updatedAt: number;
}

export interface DatastoreStats {
  totalAddresses: number;
  totalVisits: number;
  avgVisitDuration: number;
  totalContent: number;
  syncedContent: number;
}

// ==================== Filter Types ====================

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

export interface AddressOptions {
  protocol?: string;
  domain?: string;
  path?: string;
  title?: string;
  mimeType?: string;
  favicon?: string;
  description?: string;
  tags?: string;
  metadata?: string;
  lastVisitAt?: number;
  visitCount?: number;
  starred?: number;
  archived?: number;
}

export interface VisitOptions {
  timestamp?: number;
  duration?: number;
  source?: string;
  sourceId?: string;
  windowType?: string;
  metadata?: string;
  scrollDepth?: number;
  interacted?: number;
}

export interface ContentOptions {
  title?: string;
  content?: string;
  mimeType?: string;
  contentType?: string;
  language?: string;
  encoding?: string;
  tags?: string;
  addressRefs?: string;
  parentId?: string;
  metadata?: string;
  syncPath?: string;
  synced?: number;
  starred?: number;
  archived?: number;
}

export interface ItemOptions {
  content?: string;
  mimeType?: string;
  metadata?: string;
  syncId?: string;
  syncSource?: string;
  starred?: number;
  archived?: number;
}

export interface ItemFilter {
  type?: ItemType;
  starred?: number;
  archived?: number;
  includeDeleted?: boolean;
  limit?: number;
  sortBy?: 'created' | 'updated';
}

// ==================== Table Names ====================

export type TableName =
  | 'addresses'
  | 'visits'
  | 'content'
  | 'tags'
  | 'address_tags'
  | 'blobs'
  | 'scripts_data'
  | 'feeds'
  | 'extensions'
  | 'extension_settings'
  | 'migrations'
  | 'items'
  | 'item_tags';

export const tableNames: TableName[] = [
  'addresses',
  'visits',
  'content',
  'tags',
  'address_tags',
  'blobs',
  'scripts_data',
  'feeds',
  'extensions',
  'extension_settings',
  'migrations',
  'items',
  'item_tags'
];

// ==================== Sync Types ====================

export interface SyncConfig {
  serverUrl: string;
  apiKey: string;
  lastSyncTime: number;
  autoSync: boolean;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: number;
  lastSyncTime: number;
}

// Server item format (ISO timestamps, different field names)
export interface ServerItem {
  id: string;
  type: ItemType;
  content: string | null;
  metadata?: Record<string, unknown> | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ==================== Backup Types ====================

export interface BackupConfig {
  enabled: boolean;
  backupDir: string;
  retentionCount: number;
  lastBackupTime: number;
}

export interface BackupResult {
  success: boolean;
  path?: string;
  error?: string;
}
