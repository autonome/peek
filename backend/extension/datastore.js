/**
 * Browser Extension Datastore - IndexedDB adapter
 *
 * Mirrors the SQLite schema from backend/electron/datastore.ts
 * using IndexedDB for browser extension storage.
 */

import { DATASTORE_VERSION } from './version.js';

const DB_NAME = 'peek-datastore';
const DB_VERSION = 1;

let db = null;

// ==================== Lifecycle ====================

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // items store
      if (!database.objectStoreNames.contains('items')) {
        const items = database.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('type', 'type', { unique: false });
        items.createIndex('syncId', 'syncId', { unique: false });
        items.createIndex('deletedAt', 'deletedAt', { unique: false });
        items.createIndex('createdAt', 'createdAt', { unique: false });
        items.createIndex('starred', 'starred', { unique: false });
      }

      // tags store
      if (!database.objectStoreNames.contains('tags')) {
        const tags = database.createObjectStore('tags', { keyPath: 'id' });
        tags.createIndex('name', 'name', { unique: false });
        tags.createIndex('slug', 'slug', { unique: false });
        tags.createIndex('parentId', 'parentId', { unique: false });
        tags.createIndex('frecencyScore', 'frecencyScore', { unique: false });
      }

      // item_tags store
      if (!database.objectStoreNames.contains('item_tags')) {
        const itemTags = database.createObjectStore('item_tags', { keyPath: 'id' });
        itemTags.createIndex('itemId', 'itemId', { unique: false });
        itemTags.createIndex('tagId', 'tagId', { unique: false });
        itemTags.createIndex('itemId_tagId', ['itemId', 'tagId'], { unique: true });
      }

      // extension_settings store
      if (!database.objectStoreNames.contains('extension_settings')) {
        const settings = database.createObjectStore('extension_settings', { keyPath: 'id' });
        settings.createIndex('extensionId', 'extensionId', { unique: false });
        settings.createIndex('extensionId_key', ['extensionId', 'key'], { unique: true });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve({ success: true });
    };

    request.onerror = (event) => {
      reject({ success: false, error: event.target.error?.message || 'Failed to open database' });
    };
  });
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
  return { success: true };
}

function getDb() {
  if (!db) {
    throw new Error('Database not opened. Call openDatabase() first.');
  }
  return db;
}

// ==================== Helpers ====================

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function now() {
  return Date.now();
}

function slugify(name) {
  return name.toLowerCase().trim().replace(/\s+/g, '-');
}

function calculateFrecency(frequency, lastUsedAt) {
  const currentTime = Date.now();
  const daysSinceUse = (currentTime - lastUsedAt) / (1000 * 60 * 60 * 24);
  const decayFactor = 1 / (1 + daysSinceUse / 7);
  return Math.round(frequency * 10 * decayFactor);
}

// Generic IDB transaction helper
function tx(storeNames, mode = 'readonly') {
  const database = getDb();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  const transaction = database.transaction(names, mode);
  const stores = {};
  for (const name of names) {
    stores[name] = transaction.objectStore(name);
  }
  return { transaction, stores };
}

// Promisify an IDB request
function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Wait for a transaction to complete
function txComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
  });
}

// ==================== Item Operations ====================

export async function addItem(type, options = {}) {
  const id = generateId('item');
  const timestamp = now();

  let metadata = '{}';
  if (options.metadata) {
    metadata = typeof options.metadata === 'string' ? options.metadata : JSON.stringify(options.metadata);
  }

  const item = {
    id,
    type,
    content: options.content ?? null,
    mimeType: options.mimeType || '',
    metadata,
    syncId: options.syncId || '',
    syncSource: options.syncSource || '',
    syncedAt: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: 0,
    starred: options.starred || 0,
    archived: options.archived || 0,
    visitCount: 0,
    lastVisitAt: 0,
  };

  const { transaction, stores } = tx('items', 'readwrite');
  stores.items.add(item);
  await txComplete(transaction);

  return { success: true, data: { id } };
}

export async function getItem(id) {
  const { stores } = tx('items');
  const item = await req(stores.items.get(id));
  if (!item || item.deletedAt !== 0) {
    return { success: true, data: null };
  }
  return { success: true, data: item };
}

export async function updateItem(id, options = {}) {
  const { transaction, stores } = tx('items', 'readwrite');
  const item = await req(stores.items.get(id));

  if (!item || item.deletedAt !== 0) {
    return { success: true, data: false };
  }

  if (options.content !== undefined) item.content = options.content;
  if (options.mimeType !== undefined) item.mimeType = options.mimeType;
  if (options.metadata !== undefined) {
    // Merge metadata
    let existing = {};
    try { existing = JSON.parse(item.metadata || '{}'); } catch {}
    let incoming = {};
    try {
      incoming = typeof options.metadata === 'string' ? JSON.parse(options.metadata) : options.metadata;
    } catch {}
    item.metadata = JSON.stringify({ ...existing, ...incoming });
  }
  if (options.syncId !== undefined) item.syncId = options.syncId;
  if (options.syncSource !== undefined) item.syncSource = options.syncSource;
  if (options.starred !== undefined) item.starred = options.starred;
  if (options.archived !== undefined) item.archived = options.archived;

  item.updatedAt = now();

  stores.items.put(item);
  await txComplete(transaction);

  return { success: true, data: true };
}

export async function deleteItem(id) {
  const { transaction, stores } = tx('items', 'readwrite');
  const item = await req(stores.items.get(id));

  if (!item || item.deletedAt !== 0) {
    return { success: true, data: false };
  }

  const timestamp = now();
  item.deletedAt = timestamp;
  item.updatedAt = timestamp;

  stores.items.put(item);
  await txComplete(transaction);

  return { success: true, data: true };
}

export async function hardDeleteItem(id) {
  const { transaction, stores } = tx(['items', 'item_tags'], 'readwrite');

  // Delete item_tags for this item
  const index = stores.item_tags.index('itemId');
  const links = await req(index.getAll(id));
  for (const link of links) {
    stores.item_tags.delete(link.id);
  }

  // Delete the item itself
  const item = await req(stores.items.get(id));
  if (!item) {
    await txComplete(transaction);
    return { success: true, data: false };
  }

  stores.items.delete(id);
  await txComplete(transaction);

  return { success: true, data: true };
}

export async function queryItems(filter = {}) {
  const { stores } = tx('items');
  const allItems = await req(stores.items.getAll());

  let results = allItems;

  // Filter
  if (!filter.includeDeleted) {
    results = results.filter(i => i.deletedAt === 0);
  }
  if (filter.type) {
    results = results.filter(i => i.type === filter.type);
  }
  if (filter.starred !== undefined) {
    results = results.filter(i => i.starred === filter.starred);
  }
  if (filter.archived !== undefined) {
    results = results.filter(i => i.archived === filter.archived);
  }

  // Sort
  if (filter.sortBy === 'updated') {
    results.sort((a, b) => b.updatedAt - a.updatedAt);
  } else {
    results.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Limit
  if (filter.limit) {
    results = results.slice(0, filter.limit);
  }

  return { success: true, data: results };
}

// ==================== Tag Operations ====================

export async function getOrCreateTag(name) {
  const trimmed = name.trim();
  const slug = slugify(trimmed);
  const timestamp = now();

  // Check for existing tag (case-insensitive)
  const { stores } = tx('tags');
  const allTags = await req(stores.tags.getAll());
  const existing = allTags.find(t => t.name.toLowerCase() === trimmed.toLowerCase());

  if (existing) {
    return { success: true, data: { tag: existing, created: false } };
  }

  const tagId = generateId('tag');
  const tag = {
    id: tagId,
    name: trimmed,
    slug,
    color: '#999999',
    parentId: '',
    description: '',
    metadata: '{}',
    createdAt: timestamp,
    updatedAt: timestamp,
    frequency: 0,
    lastUsedAt: 0,
    frecencyScore: 0,
  };

  const { transaction: writeTx, stores: writeStores } = tx('tags', 'readwrite');
  writeStores.tags.add(tag);
  await txComplete(writeTx);

  return { success: true, data: { tag, created: true } };
}

export async function tagItem(itemId, tagId) {
  const timestamp = now();

  // Check if link already exists
  const { stores: readStores } = tx('item_tags');
  const index = readStores.item_tags.index('itemId_tagId');
  const existing = await req(index.get([itemId, tagId]));

  if (existing) {
    return { success: true, data: { link: existing, alreadyExists: true } };
  }

  const linkId = generateId('item_tag');
  const link = { id: linkId, itemId, tagId, createdAt: timestamp };

  const { transaction, stores } = tx(['item_tags', 'tags'], 'readwrite');
  stores.item_tags.add(link);

  // Update tag frequency and frecency
  const tag = await req(stores.tags.get(tagId));
  if (tag) {
    const newFrequency = (tag.frequency || 0) + 1;
    tag.frequency = newFrequency;
    tag.lastUsedAt = timestamp;
    tag.frecencyScore = calculateFrecency(newFrequency, timestamp);
    tag.updatedAt = timestamp;
    stores.tags.put(tag);
  }

  await txComplete(transaction);

  return { success: true, data: { link, alreadyExists: false } };
}

export async function untagItem(itemId, tagId) {
  const { transaction, stores } = tx('item_tags', 'readwrite');
  const index = stores.item_tags.index('itemId_tagId');
  const existing = await req(index.get([itemId, tagId]));

  if (!existing) {
    await txComplete(transaction);
    return { success: true, data: false };
  }

  stores.item_tags.delete(existing.id);
  await txComplete(transaction);

  return { success: true, data: true };
}

export async function getItemTags(itemId) {
  const { stores } = tx(['item_tags', 'tags']);
  const index = stores.item_tags.index('itemId');
  const links = await req(index.getAll(itemId));
  const tags = [];

  for (const link of links) {
    const tag = await req(stores.tags.get(link.tagId));
    if (tag) tags.push(tag);
  }

  return { success: true, data: tags };
}

export async function getItemsByTag(tagId) {
  const { stores } = tx(['item_tags', 'items']);
  const index = stores.item_tags.index('tagId');
  const links = await req(index.getAll(tagId));
  const items = [];

  for (const link of links) {
    const item = await req(stores.items.get(link.itemId));
    if (item && item.deletedAt === 0) items.push(item);
  }

  return { success: true, data: items };
}

// ==================== Generic Table Operations ====================

const STORE_NAMES = ['items', 'tags', 'item_tags', 'extension_settings'];

function validStore(name) {
  return STORE_NAMES.includes(name);
}

export async function getTable(tableName) {
  if (!validStore(tableName)) {
    return { success: false, error: `Invalid table: ${tableName}` };
  }
  const { stores } = tx(tableName);
  const rows = await req(stores[tableName].getAll());
  const table = {};
  for (const row of rows) {
    table[row.id] = row;
  }
  return { success: true, data: table };
}

export async function getRow(tableName, id) {
  if (!validStore(tableName)) {
    return { success: false, error: `Invalid table: ${tableName}` };
  }
  const { stores } = tx(tableName);
  const row = await req(stores[tableName].get(id));
  return { success: true, data: row || null };
}

export async function setRow(tableName, id, data) {
  if (!validStore(tableName)) {
    return { success: false, error: `Invalid table: ${tableName}` };
  }
  const row = { id, ...data };
  const { transaction, stores } = tx(tableName, 'readwrite');
  stores[tableName].put(row);
  await txComplete(transaction);
  return { success: true };
}

// ==================== Stats ====================

export async function getStats() {
  const { stores } = tx(['items', 'tags', 'item_tags']);
  const items = await req(stores.items.getAll());
  const tags = await req(stores.tags.getAll());
  const itemTags = await req(stores.item_tags.getAll());

  const activeItems = items.filter(i => i.deletedAt === 0);
  const deletedItems = items.filter(i => i.deletedAt !== 0);

  return {
    success: true,
    data: {
      totalItems: activeItems.length,
      deletedItems: deletedItems.length,
      totalTags: tags.length,
      totalItemTags: itemTags.length,
      itemsByType: {
        url: activeItems.filter(i => i.type === 'url').length,
        text: activeItems.filter(i => i.type === 'text').length,
        tagset: activeItems.filter(i => i.type === 'tagset').length,
        image: activeItems.filter(i => i.type === 'image').length,
      },
    },
  };
}

// ==================== Raw DB access (for sync) ====================

export function getRawDb() {
  return getDb();
}
