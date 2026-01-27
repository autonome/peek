/**
 * Data Engine
 *
 * All business logic for items, tags, deduplication, and frecency.
 * Runtime-agnostic — operates through a StorageAdapter.
 * No SQL, no IndexedDB, no platform APIs.
 */

import { calculateFrecency } from './frecency.js';

/**
 * Generate a UUID v4 identifier.
 * Uses crypto.randomUUID() where available, with fallback.
 */
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class DataEngine {
  /** @param {import('./adapters/interface.js').StorageAdapter} adapter */
  constructor(adapter) {
    this.adapter = adapter;
  }

  // ==================== Items ====================

  /**
   * Add a new item.
   * @param {string} type - 'url' | 'text' | 'tagset' | 'image'
   * @param {Object} [options]
   * @param {string|null} [options.content]
   * @param {string|null} [options.metadata] - JSON string
   * @param {string} [options.syncId]
   * @param {string} [options.syncSource]
   * @returns {Promise<{id: string}>}
   */
  async addItem(type, options = {}) {
    const id = generateId();
    const timestamp = Date.now();

    let metadata = null;
    if (options.metadata !== undefined && options.metadata !== null) {
      metadata =
        typeof options.metadata === 'string'
          ? options.metadata
          : JSON.stringify(options.metadata);
    }

    await this.adapter.insertItem({
      id,
      type,
      content: options.content ?? null,
      metadata,
      syncId: options.syncId || '',
      syncSource: options.syncSource || '',
      syncedAt: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: 0,
    });

    return { id };
  }

  /**
   * Get a single item by ID (excludes soft-deleted).
   * @param {string} id
   * @returns {Promise<import('./adapters/interface.js').Item|null>}
   */
  async getItem(id) {
    return this.adapter.getItem(id);
  }

  /**
   * Update an existing item's content and/or metadata.
   * @param {string} id
   * @param {Object} fields
   * @param {string} [fields.content]
   * @param {string} [fields.metadata] - JSON string
   */
  async updateItem(id, fields = {}) {
    const updates = { updatedAt: Date.now() };

    if (fields.content !== undefined) updates.content = fields.content;
    if (fields.metadata !== undefined) {
      updates.metadata =
        typeof fields.metadata === 'string'
          ? fields.metadata
          : JSON.stringify(fields.metadata);
    }

    await this.adapter.updateItem(id, updates);
  }

  /**
   * Soft-delete an item (sets deletedAt).
   * @param {string} id
   */
  async deleteItem(id) {
    await this.adapter.deleteItem(id);
  }

  /**
   * Physically remove an item from storage.
   * @param {string} id
   */
  async hardDeleteItem(id) {
    await this.adapter.hardDeleteItem(id);
  }

  /**
   * Query items with optional filters.
   * @param {import('./adapters/interface.js').ItemFilter} [filter]
   * @returns {Promise<import('./adapters/interface.js').Item[]>}
   */
  async queryItems(filter = {}) {
    return this.adapter.getItems(filter);
  }

  // ==================== Tags ====================

  /**
   * Get or create a tag by name. Increments frequency on existing tags.
   * @param {string} name
   * @returns {Promise<{tag: import('./adapters/interface.js').Tag, created: boolean}>}
   */
  async getOrCreateTag(name) {
    const trimmed = name.trim();
    const existing = await this.adapter.getTagByName(trimmed);
    const timestamp = Date.now();

    if (existing) {
      const newFrequency = existing.frequency + 1;
      const frecencyScore = calculateFrecency(newFrequency, timestamp);
      await this.adapter.updateTag(existing.id, {
        frequency: newFrequency,
        lastUsedAt: timestamp,
        frecencyScore,
        updatedAt: timestamp,
      });
      return {
        tag: {
          ...existing,
          frequency: newFrequency,
          lastUsedAt: timestamp,
          frecencyScore,
          updatedAt: timestamp,
        },
        created: false,
      };
    }

    const tag = {
      id: generateId(),
      name: trimmed,
      frequency: 1,
      lastUsedAt: timestamp,
      frecencyScore: calculateFrecency(1, timestamp),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.adapter.insertTag(tag);
    return { tag, created: true };
  }

  /**
   * Associate a tag with an item.
   */
  async tagItem(itemId, tagId) {
    await this.adapter.tagItem(itemId, tagId);
  }

  /**
   * Remove a tag association from an item.
   */
  async untagItem(itemId, tagId) {
    await this.adapter.untagItem(itemId, tagId);
  }

  /**
   * Get all tags for an item.
   * @param {string} itemId
   * @returns {Promise<import('./adapters/interface.js').Tag[]>}
   */
  async getItemTags(itemId) {
    return this.adapter.getItemTags(itemId);
  }

  /**
   * Get all tags sorted by frecency score descending.
   * @returns {Promise<import('./adapters/interface.js').Tag[]>}
   */
  async getTagsByFrecency() {
    const tags = await this.adapter.getAllTags();
    return tags.sort((a, b) => b.frecencyScore - a.frecencyScore);
  }

  // ==================== Dedup ====================

  /**
   * Remove duplicate items.
   * - Content items (url, text, image): groups by type+content, keeps earliest
   * - Tagsets: groups by sorted tag names, keeps earliest
   * @returns {Promise<{removedContent: number, removedTagsets: number}>}
   */
  async deduplicateItems() {
    let removedContent = 0;
    let removedTagsets = 0;

    const allItems = await this.adapter.getItems({ includeDeleted: false });

    // 1. Content-based dedup (non-tagset items)
    const contentGroups = new Map();
    for (const item of allItems) {
      if (item.type === 'tagset' || !item.content) continue;
      const key = `${item.type}|${item.content}`;
      if (!contentGroups.has(key)) contentGroups.set(key, []);
      contentGroups.get(key).push(item);
    }

    for (const group of contentGroups.values()) {
      if (group.length <= 1) continue;
      group.sort((a, b) => a.createdAt - b.createdAt);
      for (let i = 1; i < group.length; i++) {
        await this.adapter.clearItemTags(group[i].id);
        await this.adapter.hardDeleteItem(group[i].id);
        removedContent++;
      }
    }

    // 2. Tagset dedup by sorted tag names
    const tagsets = allItems.filter(i => i.type === 'tagset');
    const tagsetGroups = new Map();

    for (const item of tagsets) {
      const tags = await this.adapter.getItemTags(item.id);
      const key = tags
        .map(t => t.name)
        .sort()
        .join('\t');
      if (!tagsetGroups.has(key)) tagsetGroups.set(key, []);
      tagsetGroups.get(key).push(item);
    }

    for (const group of tagsetGroups.values()) {
      if (group.length <= 1) continue;
      group.sort((a, b) => a.createdAt - b.createdAt);
      for (let i = 1; i < group.length; i++) {
        await this.adapter.clearItemTags(group[i].id);
        await this.adapter.hardDeleteItem(group[i].id);
        removedTagsets++;
      }
    }

    return { removedContent, removedTagsets };
  }

  // ==================== Save with Dedup ====================

  /**
   * Save an item with deduplication logic.
   *
   * Sync path (syncId provided): match by syncId only, no content fallback.
   * Non-sync path: content-based dedup for non-tagsets, tag-set dedup for tagsets.
   *
   * @param {string} type
   * @param {string|null} content
   * @param {string[]} [tags]
   * @param {Object|null} [metadata]
   * @param {string|null} [syncId]
   * @returns {Promise<{id: string, created: boolean}>}
   */
  async saveItem(type, content, tags = [], metadata = null, syncId = null) {
    const timestamp = Date.now();
    const metadataStr = metadata ? JSON.stringify(metadata) : null;
    let itemId = null;
    let created = false;

    if (syncId) {
      // Sync path: match by syncId only. No content-based fallback.
      const existing = await this.adapter.findItemBySyncId(syncId);
      if (existing) {
        itemId = existing.id;
        await this.adapter.updateItem(itemId, {
          type,
          content,
          metadata: metadataStr !== null ? metadataStr : undefined,
          updatedAt: timestamp,
        });
        await this.adapter.clearItemTags(itemId);
      }
    } else {
      // Non-sync path: content-based dedup
      if (type !== 'tagset' && content) {
        const existing = await this.adapter.findItemByContent(type, content);
        if (existing) {
          itemId = existing.id;
          await this.adapter.updateItem(itemId, {
            metadata: metadataStr !== null ? metadataStr : undefined,
            updatedAt: timestamp,
          });
          await this.adapter.clearItemTags(itemId);
        }
      }

      // Tagset dedup by comparing sorted tag names
      if (!itemId && type === 'tagset' && tags.length > 0) {
        const sortedTagNames = [...tags].sort().join('\t');
        const existing = await this.adapter.findTagsetByTags(sortedTagNames);
        if (existing) {
          itemId = existing.id;
          await this.adapter.updateItem(itemId, {
            metadata: metadataStr !== null ? metadataStr : undefined,
            updatedAt: timestamp,
          });
          await this.adapter.clearItemTags(itemId);
        }
      }
    }

    // Create new item if no match found
    if (!itemId) {
      itemId = generateId();
      created = true;
      await this.adapter.insertItem({
        id: itemId,
        type,
        content: content ?? null,
        metadata: metadataStr,
        syncId: syncId || '',
        syncSource: '',
        syncedAt: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: 0,
      });
    }

    // Tag the item
    for (const tagName of tags) {
      const { tag } = await this.getOrCreateTag(tagName);
      await this.adapter.tagItem(itemId, tag.id);
    }

    return { id: itemId, created };
  }

  // ==================== Settings ====================

  /**
   * Get a setting value.
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async getSetting(key) {
    return this.adapter.getSetting(key);
  }

  /**
   * Set a setting value.
   * @param {string} key
   * @param {string} value
   */
  async setSetting(key, value) {
    await this.adapter.setSetting(key, value);
  }

  // ==================== Stats ====================

  /**
   * Get datastore statistics.
   */
  async getStats() {
    const allItems = await this.adapter.getItems({ includeDeleted: false });
    const allWithDeleted = await this.adapter.getItems({ includeDeleted: true });
    const allTags = await this.adapter.getAllTags();

    return {
      totalItems: allItems.length,
      deletedItems: allWithDeleted.length - allItems.length,
      totalTags: allTags.length,
      itemsByType: {
        url: allItems.filter(i => i.type === 'url').length,
        text: allItems.filter(i => i.type === 'text').length,
        tagset: allItems.filter(i => i.type === 'tagset').length,
        image: allItems.filter(i => i.type === 'image').length,
      },
    };
  }
}
