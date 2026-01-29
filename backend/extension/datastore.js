/**
 * Datastore Wrapper for Browser Extension
 *
 * Re-exports DataEngine methods in a flat format with consistent
 * { success, data, error } response shape for extension modules.
 * Also exposes adapter/database internals for tests.
 */

import { initialize, close, data, adapter } from './engine.js';

// ==================== Lifecycle ====================

export async function openDatabase() {
  await initialize();
}

export async function closeDatabase() {
  await close();
}

/**
 * Get the raw IndexedDB database for test cleanup.
 * @returns {IDBDatabase}
 */
export function getRawDb() {
  return adapter.db;
}

// ==================== Items ====================

/**
 * Add a new item.
 * @param {'url'|'text'|'tagset'|'image'} type
 * @param {Object} options
 * @returns {Promise<{success: boolean, data?: {id: string}, error?: string}>}
 */
export async function addItem(type, options = {}) {
  try {
    const result = await data.addItem(type, options);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get an item by ID.
 * @param {string} id
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function getItem(id) {
  try {
    const result = await data.getItem(id);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update an existing item.
 * @param {string} id
 * @param {Object} options
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateItem(id, options = {}) {
  try {
    await data.updateItem(id, options);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Soft delete an item.
 * @param {string} id
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteItem(id) {
  try {
    await data.deleteItem(id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Query items with optional filters.
 * @param {Object} filter
 * @returns {Promise<{success: boolean, data?: Object[], error?: string}>}
 */
export async function queryItems(filter = {}) {
  try {
    const result = await data.queryItems(filter);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== Tags ====================

/**
 * Get or create a tag by name.
 * @param {string} name
 * @returns {Promise<{success: boolean, data?: {tag: Object, created: boolean}, error?: string}>}
 */
export async function getOrCreateTag(name) {
  try {
    const result = await data.getOrCreateTag(name);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Associate a tag with an item.
 * @param {string} itemId
 * @param {string} tagId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function tagItem(itemId, tagId) {
  try {
    await data.tagItem(itemId, tagId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Remove a tag from an item.
 * @param {string} itemId
 * @param {string} tagId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function untagItem(itemId, tagId) {
  try {
    await data.untagItem(itemId, tagId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get all tags for an item.
 * @param {string} itemId
 * @returns {Promise<{success: boolean, data?: Object[], error?: string}>}
 */
export async function getItemTags(itemId) {
  try {
    const result = await data.getItemTags(itemId);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get all items with a specific tag.
 * @param {string} tagId
 * @returns {Promise<{success: boolean, data?: Object[], error?: string}>}
 */
export async function getItemsByTag(tagId) {
  try {
    const result = await adapter.getItemsByTag(tagId);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get all tags sorted by frecency.
 * @returns {Promise<{success: boolean, data?: Object[], error?: string}>}
 */
export async function getTagsByFrecency() {
  try {
    const result = await data.getTagsByFrecency();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== Item Visits (URL History Unification) ====================

/**
 * Record a visit to an item.
 * Note: For the browser extension, visit data is stored in metadata.visits
 * since the extension uses IndexedDB without a separate item_visits table.
 * This function is a no-op for now but included for API compatibility.
 * The desktop app handles frecency via the item_visits table.
 *
 * @param {string} itemId
 * @param {Object} options
 * @returns {Promise<{success: boolean, data?: {id: string}, error?: string}>}
 */
export async function recordItemVisit(itemId, options = {}) {
  // For the browser extension, visit tracking is handled via metadata
  // in the addOrUpdateHistoryItem function. This is a no-op to maintain
  // API compatibility with code that imports recordItemVisit.
  //
  // The frecency calculation for the extension happens based on
  // metadata.visits stored in the item, not a separate visits table.
  return { success: true, data: { id: `visit_${Date.now()}` } };
}

// ==================== Settings ====================

/**
 * Get a setting value.
 * @param {string} key
 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
 */
export async function getSetting(key) {
  try {
    const result = await data.getSetting(key);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Set a setting value.
 * @param {string} key
 * @param {string} value
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function setSetting(key, value) {
  try {
    await data.setSetting(key, value);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== Stats ====================

/**
 * Get datastore statistics.
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function getStats() {
  try {
    const result = await data.getStats();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
