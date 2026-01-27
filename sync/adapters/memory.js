/**
 * In-Memory Storage Adapter
 *
 * Map-based storage for fast unit tests. Implements the full StorageAdapter interface.
 * No external dependencies.
 */

export function createMemoryAdapter() {
  let items = new Map();
  let tags = new Map();
  let itemTags = []; // { itemId, tagId, createdAt }
  let settings = new Map();

  return {
    // ==================== Lifecycle ====================

    async open() {
      items = new Map();
      tags = new Map();
      itemTags = [];
      settings = new Map();
    },

    async close() {
      items.clear();
      tags.clear();
      itemTags = [];
      settings.clear();
    },

    // ==================== Items ====================

    async getItem(id) {
      const item = items.get(id);
      if (!item || item.deletedAt) return null;
      return { ...item };
    },

    async getItems(filter = {}) {
      let results = [...items.values()];
      if (!filter.includeDeleted) {
        results = results.filter(i => !i.deletedAt);
      }
      if (filter.type) {
        results = results.filter(i => i.type === filter.type);
      }
      if (filter.since) {
        results = results.filter(i => i.updatedAt > filter.since);
      }
      return results.map(i => ({ ...i }));
    },

    async insertItem(item) {
      items.set(item.id, { ...item });
    },

    async updateItem(id, fields) {
      const item = items.get(id);
      if (!item) return;
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          item[key] = value;
        }
      }
    },

    async deleteItem(id) {
      const item = items.get(id);
      if (!item || item.deletedAt) return;
      const timestamp = Date.now();
      item.deletedAt = timestamp;
      item.updatedAt = timestamp;
    },

    async hardDeleteItem(id) {
      items.delete(id);
      itemTags = itemTags.filter(link => link.itemId !== id);
    },

    // ==================== Tags ====================

    async getTag(id) {
      const tag = tags.get(id);
      return tag ? { ...tag } : null;
    },

    async getTagByName(name) {
      const lower = name.toLowerCase();
      for (const tag of tags.values()) {
        if (tag.name.toLowerCase() === lower) {
          return { ...tag };
        }
      }
      return null;
    },

    async insertTag(tag) {
      tags.set(tag.id, { ...tag });
    },

    async updateTag(id, fields) {
      const tag = tags.get(id);
      if (!tag) return;
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          tag[key] = value;
        }
      }
    },

    // ==================== Item-Tags ====================

    async getItemTags(itemId) {
      const tagIds = itemTags
        .filter(l => l.itemId === itemId)
        .map(l => l.tagId);
      return tagIds
        .map(id => tags.get(id))
        .filter(Boolean)
        .map(t => ({ ...t }));
    },

    async getItemsByTag(tagId) {
      const itemIds = itemTags
        .filter(l => l.tagId === tagId)
        .map(l => l.itemId);
      return itemIds
        .map(id => items.get(id))
        .filter(i => i && !i.deletedAt)
        .map(i => ({ ...i }));
    },

    async tagItem(itemId, tagId) {
      const exists = itemTags.some(
        l => l.itemId === itemId && l.tagId === tagId
      );
      if (!exists) {
        itemTags.push({ itemId, tagId, createdAt: Date.now() });
      }
    },

    async untagItem(itemId, tagId) {
      itemTags = itemTags.filter(
        l => !(l.itemId === itemId && l.tagId === tagId)
      );
    },

    async clearItemTags(itemId) {
      itemTags = itemTags.filter(l => l.itemId !== itemId);
    },

    // ==================== Settings ====================

    async getSetting(key) {
      return settings.get(key) ?? null;
    },

    async setSetting(key, value) {
      settings.set(key, value);
    },

    // ==================== Query Helpers ====================

    async findItemBySyncId(syncId) {
      // Check by direct ID first (device re-pushes with server-assigned ID)
      const byId = items.get(syncId);
      if (byId && !byId.deletedAt) return { ...byId };

      // Check by syncId field
      for (const item of items.values()) {
        if (!item.deletedAt && item.syncId === syncId) {
          return { ...item };
        }
      }
      return null;
    },

    async findItemByContent(type, content) {
      for (const item of items.values()) {
        if (!item.deletedAt && item.type === type && item.content === content) {
          return { ...item };
        }
      }
      return null;
    },

    async findTagsetByTags(sortedTagNames) {
      for (const item of items.values()) {
        if (item.type !== 'tagset' || item.deletedAt) continue;
        const tagIds = itemTags
          .filter(l => l.itemId === item.id)
          .map(l => l.tagId);
        const names = tagIds
          .map(id => tags.get(id)?.name)
          .filter(Boolean)
          .sort()
          .join('\t');
        if (names === sortedTagNames) {
          return { ...item };
        }
      }
      return null;
    },

    async getAllTags() {
      return [...tags.values()].map(t => ({ ...t }));
    },
  };
}
