/**
 * Zero-cost logging module
 *
 * When DEBUG is off, log calls return immediately with no work done.
 * When DEBUG is on, logs can be filtered by category.
 *
 * Usage:
 *   import { log } from 'peek://app/log.js';
 *   log('ext:cmd', 'Command registered:', name);
 *   log.error('ext:cmd', 'Failed:', err);  // Always shown
 *   log.warn('datastore', 'Parse failed'); // Always shown
 *
 * Environment:
 *   DEBUG=1              - Enable all debug logs
 *   DEBUG=ext:cmd,pubsub - Enable only specific categories
 *   (no DEBUG)           - No debug logs, only errors/warnings
 */

// Get debug config from preload API
const api = window.app;
const DEBUG = api?.debug || false;
const DEBUG_CATEGORIES = parseCategories(api?.debugCategories || '');

/**
 * Parse comma-separated categories into a Set
 */
function parseCategories(str) {
  if (!str || str === '1' || str === 'true') return new Set();
  return new Set(str.split(',').map(c => c.trim()).filter(Boolean));
}

/**
 * Check if a category is enabled
 */
function isEnabled(category) {
  if (!DEBUG) return false;
  if (DEBUG_CATEGORIES.size === 0) return true; // All enabled
  return DEBUG_CATEGORIES.has(category);
}

/**
 * Main log function - zero-cost when DEBUG is off
 */
function log(category, ...args) {
  if (!isEnabled(category)) return;
  console.log(`[${category}]`, ...args);
}

/**
 * Error log - always shown regardless of DEBUG
 */
log.error = function(category, ...args) {
  console.error(`[${category}]`, ...args);
};

/**
 * Warning log - always shown regardless of DEBUG
 */
log.warn = function(category, ...args) {
  console.warn(`[${category}]`, ...args);
};

/**
 * Check if debug is enabled (for conditional expensive operations)
 */
log.enabled = isEnabled;

/**
 * Check if any debug logging is active
 */
log.debug = DEBUG;

export { log };
export default log;
