/**
 * Storage Adapter Interface
 *
 * Every adapter implements this async interface.
 * SQLite adapters wrap sync calls in Promises for uniformity.
 *
 * Item shape:
 * @typedef {Object} Item
 * @property {string} id
 * @property {string} type - 'url' | 'text' | 'tagset' | 'image'
 * @property {string|null} content
 * @property {string|null} metadata - JSON string
 * @property {string} syncId
 * @property {string} syncSource
 * @property {number} syncedAt - Unix ms
 * @property {number} createdAt - Unix ms
 * @property {number} updatedAt - Unix ms
 * @property {number} deletedAt - Unix ms, 0 = active
 *
 * Tag shape:
 * @typedef {Object} Tag
 * @property {string|number} id
 * @property {string} name
 * @property {number} frequency
 * @property {number} lastUsedAt - Unix ms
 * @property {number} frecencyScore
 * @property {number} createdAt - Unix ms
 * @property {number} updatedAt - Unix ms
 *
 * Filter shape:
 * @typedef {Object} ItemFilter
 * @property {string} [type]
 * @property {number} [since] - Unix ms, return items with updatedAt > since
 * @property {boolean} [includeDeleted]
 *
 * @interface StorageAdapter
 */

/**
 * @method open
 * @param {Object} [config]
 * @returns {Promise<void>}
 */

/**
 * @method close
 * @returns {Promise<void>}
 */

// ==================== Items ====================

/**
 * @method getItem
 * @param {string} id
 * @returns {Promise<Item|null>} - null if not found or soft-deleted
 */

/**
 * @method getItems
 * @param {ItemFilter} [filter]
 * @returns {Promise<Item[]>}
 */

/**
 * @method insertItem
 * @param {Item} item - Complete item object with id already assigned
 * @returns {Promise<void>}
 */

/**
 * @method updateItem
 * @param {string} id
 * @param {Partial<Item>} fields - Only provided fields are updated (undefined values skipped)
 * @returns {Promise<void>}
 */

/**
 * @method deleteItem
 * @param {string} id - Soft delete: sets deletedAt
 * @returns {Promise<void>}
 */

/**
 * @method hardDeleteItem
 * @param {string} id - Physical delete from storage
 * @returns {Promise<void>}
 */

// ==================== Tags ====================

/**
 * @method getTag
 * @param {string|number} id
 * @returns {Promise<Tag|null>}
 */

/**
 * @method getTagByName
 * @param {string} name - Case-insensitive match
 * @returns {Promise<Tag|null>}
 */

/**
 * @method insertTag
 * @param {Tag} tag - Complete tag object with id already assigned
 * @returns {Promise<void>}
 */

/**
 * @method updateTag
 * @param {string|number} id
 * @param {Partial<Tag>} fields - Only provided fields are updated
 * @returns {Promise<void>}
 */

// ==================== Item-Tags ====================

/**
 * @method getItemTags
 * @param {string} itemId
 * @returns {Promise<Tag[]>}
 */

/**
 * @method getItemsByTag
 * @param {string|number} tagId
 * @returns {Promise<Item[]>}
 */

/**
 * @method tagItem
 * @param {string} itemId
 * @param {string|number} tagId
 * @returns {Promise<void>}
 */

/**
 * @method untagItem
 * @param {string} itemId
 * @param {string|number} tagId
 * @returns {Promise<void>}
 */

/**
 * @method clearItemTags
 * @param {string} itemId - Remove all tag associations for this item
 * @returns {Promise<void>}
 */

// ==================== Settings ====================

/**
 * @method getSetting
 * @param {string} key
 * @returns {Promise<string|null>}
 */

/**
 * @method setSetting
 * @param {string} key
 * @param {string} value
 * @returns {Promise<void>}
 */

// ==================== Query Helpers ====================

/**
 * @method findItemBySyncId
 * @param {string} syncId - Checks both item.id and item.syncId fields
 * @returns {Promise<Item|null>}
 */

/**
 * @method findItemByContent
 * @param {string} type
 * @param {string} content
 * @returns {Promise<Item|null>} - First non-deleted match
 */

/**
 * @method findTagsetByTags
 * @param {string} sortedTagNames - Tab-separated sorted tag names
 * @returns {Promise<Item|null>} - First tagset item with matching tag set
 */

/**
 * @method getAllTags
 * @returns {Promise<Tag[]>}
 */
