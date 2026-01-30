/**
 * IZUI: Inverted Zooming User Interface - Minimal Implementation
 *
 * Simple parent-child window tracking for focus restoration.
 * When a child window closes, focus returns to its parent.
 *
 * See notes/izui-model.md for the full design and future plans.
 */

import api from './api.js';

const DEBUG = false;

/**
 * Notify parent window to take focus.
 * Called when this window is about to close/hide.
 *
 * @param {string} parentAddress - The parent window's address (source)
 */
export function notifyParentFocus(parentAddress) {
  if (!parentAddress) return;

  DEBUG && console.log('[IZUI] Notifying parent to focus:', parentAddress);

  // Publish to the parent's address so it receives the message
  api.publish('izui:focus-request', {
    from: window.location.toString()
  }, api.scopes.GLOBAL);
}

/**
 * Set up focus listener for this window.
 * When a child window closes, this window will receive focus.
 *
 * Call this in windows that may have children (e.g., settings).
 */
export function setupFocusListener() {
  const myAddress = window.location.toString();

  api.subscribe('izui:focus-request', (msg) => {
    DEBUG && console.log('[IZUI] Received focus request from:', msg?.from);

    // Focus this window
    if (api.window && api.window.focus) {
      api.window.focus({});
    }
  }, api.scopes.GLOBAL);

  DEBUG && console.log('[IZUI] Focus listener set up for:', myAddress);
}

/**
 * Open a child window with IZUI tracking.
 * The child will notify this window to focus when it closes.
 *
 * @param {string} address - URL to open
 * @param {Object} params - Window parameters
 * @returns {Promise<Object>} Window controller
 */
export async function openChildWindow(address, params = {}) {
  const myAddress = window.location.toString();

  // Track this window as the parent
  const childParams = {
    ...params,
    izuiParent: myAddress
  };

  DEBUG && console.log('[IZUI] Opening child window:', address, 'parent:', myAddress);

  const result = await api.window.open(address, childParams);
  return result;
}

/**
 * Handle ESC key for IZUI navigation.
 * If the window has internal navigation, handle that first.
 * Otherwise, close and notify parent.
 *
 * @param {Function} [internalHandler] - Optional handler for internal navigation
 *   Should return { handled: true } if it handled the ESC internally
 * @returns {Function} Cleanup function
 */
export function setupEscapeHandler(internalHandler) {
  const handler = async () => {
    // First, try internal navigation
    if (internalHandler) {
      const result = await internalHandler();
      if (result && result.handled) {
        DEBUG && console.log('[IZUI] Internal handler handled ESC');
        return { handled: true };
      }
    }

    // No internal navigation, notify parent before closing
    // The parent address is passed via window params, but we need to get it
    // For now, we just publish globally - the parent will pick it up
    notifyParentFocus(null); // Global publish

    DEBUG && console.log('[IZUI] ESC at root, closing');
    return { handled: false };
  };

  // Register with the escape API
  if (api.escape && api.escape.onEscape) {
    api.escape.onEscape(handler);
  }

  return () => {
    // Cleanup - currently no way to unregister escape handler
  };
}

/**
 * Initialize IZUI for a window.
 * Sets up focus listening and escape handling.
 *
 * @param {Object} options
 * @param {Function} [options.onEscape] - Internal escape handler
 * @param {boolean} [options.canHaveChildren=true] - Whether this window may open children
 */
export function init(options = {}) {
  const { onEscape, canHaveChildren = true } = options;

  if (canHaveChildren) {
    setupFocusListener();
  }

  if (onEscape) {
    setupEscapeHandler(onEscape);
  }

  DEBUG && console.log('[IZUI] Initialized for:', window.location.toString());
}

export default {
  init,
  setupFocusListener,
  setupEscapeHandler,
  openChildWindow,
  notifyParentFocus
};
