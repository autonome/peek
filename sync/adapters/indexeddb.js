/**
 * IndexedDB Storage Adapter
 *
 * Browser-based storage for the extension. Implements the full StorageAdapter interface.
 * Uses the same IDB patterns as the original extension datastore.js.
 */

const DB_NAME = 'peek-datastore';
const DB_VERSION = 3;

export function createIndexedDBAdapter() {
  let db = null;

  // ==================== IDB Helpers ====================

  function getDb() {
    if (!db) throw new Error('Database not opened. Call open() first.');
    return db;
  }

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

  function req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function txComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
    });
  }

  return {
    // Expose raw db for test cleanup (getRawDb in datastore.js wrapper)
    get db() {
      return db;
    },

    // ==================== Lifecycle ====================

    async open() {
      // Close existing connection if any
      if (db) {
        db.close();
        db = null;
      }

      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const database = event.target.result;
          const oldVersion = event.oldVersion;

          if (oldVersion < 1) {
            // Fresh install — create all stores
            const items = database.createObjectStore('items', { keyPath: 'id' });
            items.createIndex('type', 'type', { unique: false });
            items.createIndex('syncId', 'syncId', { unique: false });
            items.createIndex('deletedAt', 'deletedAt', { unique: false });
            items.createIndex('createdAt', 'createdAt', { unique: false });

            const tags = database.createObjectStore('tags', { keyPath: 'id' });
            tags.createIndex('name', 'name', { unique: false });
            tags.createIndex('frecencyScore', 'frecencyScore', { unique: false });

            const itemTags = database.createObjectStore('item_tags', { keyPath: ['itemId', 'tagId'] });
            itemTags.createIndex('itemId', 'itemId', { unique: false });
            itemTags.createIndex('tagId', 'tagId', { unique: false });

            database.createObjectStore('settings', { keyPath: 'key' });

            // extension_settings for profile-specific settings
            const extSettings = database.createObjectStore('extension_settings', { keyPath: 'id' });
            extSettings.createIndex('extensionId', 'extensionId', { unique: false });
          }

          if (oldVersion >= 1 && oldVersion < 2) {
            // v1 → v2: add missing stores/indexes without destroying data.
            // Add any stores that don't exist yet.
            if (!database.objectStoreNames.contains('items')) {
              const items = database.createObjectStore('items', { keyPath: 'id' });
              items.createIndex('type', 'type', { unique: false });
              items.createIndex('syncId', 'syncId', { unique: false });
              items.createIndex('deletedAt', 'deletedAt', { unique: false });
              items.createIndex('createdAt', 'createdAt', { unique: false });
            }
            if (!database.objectStoreNames.contains('tags')) {
              const tags = database.createObjectStore('tags', { keyPath: 'id' });
              tags.createIndex('name', 'name', { unique: false });
              tags.createIndex('frecencyScore', 'frecencyScore', { unique: false });
            }
            if (!database.objectStoreNames.contains('item_tags')) {
              const itemTags = database.createObjectStore('item_tags', { keyPath: ['itemId', 'tagId'] });
              itemTags.createIndex('itemId', 'itemId', { unique: false });
              itemTags.createIndex('tagId', 'tagId', { unique: false });
            }
            if (!database.objectStoreNames.contains('settings')) {
              database.createObjectStore('settings', { keyPath: 'key' });
            }
          }

          if (oldVersion >= 1 && oldVersion < 3) {
            // v2 → v3: add extension_settings store
            if (!database.objectStoreNames.contains('extension_settings')) {
              const extSettings = database.createObjectStore('extension_settings', { keyPath: 'id' });
              extSettings.createIndex('extensionId', 'extensionId', { unique: false });
            }
          }
        };

        request.onsuccess = (event) => {
          db = event.target.result;
          resolve();
        };

        request.onerror = (event) => {
          reject(new Error(event.target.error?.message || 'Failed to open database'));
        };
      });
    },

    async close() {
      if (db) {
        db.close();
        db = null;
      }
    },

    // ==================== Items ====================

    async getItem(id) {
      const { stores } = tx('items');
      const item = await req(stores.items.get(id));
      if (!item || item.deletedAt) return null;
      return item;
    },

    async getItems(filter = {}) {
      const { stores } = tx('items');
      const allItems = await req(stores.items.getAll());

      let results = allItems;
      if (!filter.includeDeleted) {
        results = results.filter(i => !i.deletedAt);
      }
      if (filter.type) {
        results = results.filter(i => i.type === filter.type);
      }
      if (filter.since) {
        results = results.filter(i => i.updatedAt > filter.since);
      }
      return results;
    },

    async insertItem(item) {
      const { transaction, stores } = tx('items', 'readwrite');
      stores.items.add(item);
      await txComplete(transaction);
    },

    async updateItem(id, fields) {
      const { transaction, stores } = tx('items', 'readwrite');
      const item = await req(stores.items.get(id));
      if (!item) return;
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          item[key] = value;
        }
      }
      stores.items.put(item);
      await txComplete(transaction);
    },

    async deleteItem(id) {
      const { transaction, stores } = tx('items', 'readwrite');
      const item = await req(stores.items.get(id));
      if (!item || item.deletedAt) return;
      const timestamp = Date.now();
      item.deletedAt = timestamp;
      item.updatedAt = timestamp;
      stores.items.put(item);
      await txComplete(transaction);
    },

    async hardDeleteItem(id) {
      const { transaction, stores } = tx(['items', 'item_tags'], 'readwrite');

      // Delete item_tags for this item
      const index = stores.item_tags.index('itemId');
      const links = await req(index.getAll(id));
      for (const link of links) {
        stores.item_tags.delete([link.itemId, link.tagId]);
      }

      // Delete the item itself
      stores.items.delete(id);
      await txComplete(transaction);
    },

    // ==================== Tags ====================

    async getTag(id) {
      const { stores } = tx('tags');
      const tag = await req(stores.tags.get(id));
      return tag || null;
    },

    async getTagByName(name) {
      const lower = name.toLowerCase();
      const { stores } = tx('tags');
      const allTags = await req(stores.tags.getAll());
      for (const tag of allTags) {
        if (tag.name.toLowerCase() === lower) {
          return tag;
        }
      }
      return null;
    },

    async insertTag(tag) {
      const { transaction, stores } = tx('tags', 'readwrite');
      stores.tags.add(tag);
      await txComplete(transaction);
    },

    async updateTag(id, fields) {
      const { transaction, stores } = tx('tags', 'readwrite');
      const tag = await req(stores.tags.get(id));
      if (!tag) return;
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          tag[key] = value;
        }
      }
      stores.tags.put(tag);
      await txComplete(transaction);
    },

    // ==================== Item-Tags ====================

    async getItemTags(itemId) {
      const { stores } = tx(['item_tags', 'tags']);
      const index = stores.item_tags.index('itemId');
      const links = await req(index.getAll(itemId));
      const tags = [];
      for (const link of links) {
        const tag = await req(stores.tags.get(link.tagId));
        if (tag) tags.push(tag);
      }
      return tags;
    },

    async getItemsByTag(tagId) {
      const { stores } = tx(['item_tags', 'items']);
      const index = stores.item_tags.index('tagId');
      const links = await req(index.getAll(tagId));
      const items = [];
      for (const link of links) {
        const item = await req(stores.items.get(link.itemId));
        if (item && !item.deletedAt) items.push(item);
      }
      return items;
    },

    async tagItem(itemId, tagId) {
      // Check if link already exists
      const { stores: readStores } = tx('item_tags');
      const existing = await req(readStores.item_tags.get([itemId, tagId]));
      if (existing) return;

      const { transaction, stores } = tx('item_tags', 'readwrite');
      stores.item_tags.add({ itemId, tagId, createdAt: Date.now() });
      await txComplete(transaction);
    },

    async untagItem(itemId, tagId) {
      const { transaction, stores } = tx('item_tags', 'readwrite');
      stores.item_tags.delete([itemId, tagId]);
      await txComplete(transaction);
    },

    async clearItemTags(itemId) {
      const { transaction, stores } = tx('item_tags', 'readwrite');
      const index = stores.item_tags.index('itemId');
      const links = await req(index.getAll(itemId));
      for (const link of links) {
        stores.item_tags.delete([link.itemId, link.tagId]);
      }
      await txComplete(transaction);
    },

    // ==================== Settings ====================

    async getSetting(key) {
      const { stores } = tx('settings');
      const row = await req(stores.settings.get(key));
      return row ? row.value : null;
    },

    async setSetting(key, value) {
      const { transaction, stores } = tx('settings', 'readwrite');
      stores.settings.put({ key, value });
      await txComplete(transaction);
    },

    // ==================== Query Helpers ====================

    async findItemBySyncId(syncId) {
      // Check by direct ID first
      const { stores } = tx('items');
      const byId = await req(stores.items.get(syncId));
      if (byId) return byId;

      // Check by syncId index (includes deleted items for tombstone handling)
      const index = stores.items.index('syncId');
      const matches = await req(index.getAll(syncId));
      if (matches.length > 0) return matches[0];
      return null;
    },

    async getAllTags() {
      const { stores } = tx('tags');
      return req(stores.tags.getAll());
    },
  };
}
