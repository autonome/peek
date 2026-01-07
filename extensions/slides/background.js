/**
 * Slides Extension Background Script
 *
 * Edge-anchored slide-in panels triggered by keyboard shortcuts (Option+Arrow)
 */

import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore } from 'peek://app/utils.js';
import windows from 'peek://app/windows.js';

const api = window.app;
const debug = api.debug;

console.log('[ext:slides] background', labels.name);

const clear = false;
const store = openStore(id, defaults, clear /* clear storage */);

// Map to track opened slides - key is slide key, value is window ID
const slideWindows = new Map();

// Track registered shortcuts for cleanup
let registeredShortcuts = [];

const executeItem = (item) => {
  const height = item.height || 600;
  const width = item.width || 800;

  const screen = {
    height: window.screen.height,
    width: window.screen.width
  };

  let x, y, center = null;

  switch(item.screenEdge) {
    case 'Up':
      // horizontally center
      x = (screen.width - width) / 2;

      // y starts at screen top and stays there
      y = 0;

      //width = item.width;
      //height = 1;
      break;
    case 'Down':
      // horizonally center
      x = (screen.width - item.width) / 2;

      // y ends up at window height from bottom
      //
      // eg: y = screen.height - item.height;
      //
      // but starts at screen bottom
      y = screen.height;

      //width = item.width;
      //height = 1;
      break;
    case 'Left':
      // x starts and ends at at left screen edge
      // at left edge
      x = 0;

      // vertically center
      y = (screen.height - item.height) / 2;

      //width = 1;
      //height = item.height;
      break;
    case 'Right':
      // x ends at at right screen edge - window size
      //
      // eg: x = screen.width - item.width;
      //
      // but starts at screen right edge, will animate in
      x = screen.width;

      // vertically center
      y = (screen.height - item.height) / 2;

      //width = 1;
      //height = item.height;
      break;
    default:
      center = true;
      console.log('[ext:slides] unknown screen edge');
  }

  console.log('[ext:slides] execute slide', item.screenEdge, x, y);

  const key = `${item.address}:${item.screenEdge}`;

  // Check if this slide is already open
  if (slideWindows.has(key)) {
    // Get the window ID for the existing slide
    const windowId = slideWindows.get(key);
    console.log('[ext:slides] Slide already open, verifying window exists with ID:', windowId);

    // First check if window exists
    api.window.exists({ id: windowId }).then(existsResult => {
      if (existsResult.exists) {
        // Window exists, try to show it
        api.window.show({ id: windowId }).then(result => {
          if (result.success) {
            console.log('[ext:slides] Successfully showed existing slide:', key);
          } else {
            console.error('[ext:slides] Failed to show existing slide:', result.error);
            slideWindows.delete(key);
            openNewSlide();
          }
        }).catch(err => {
          console.error('[ext:slides] Error showing window:', err);
          slideWindows.delete(key);
          openNewSlide();
        });
      } else {
        console.log('[ext:slides] Window no longer exists, creating new one');
        slideWindows.delete(key);
        openNewSlide();
      }
    }).catch(err => {
      console.error('[ext:slides] Error checking if window exists:', err);
      slideWindows.delete(key);
      openNewSlide();
    });
  } else {
    openNewSlide();
  }

  function openNewSlide() {
    const params = {
      address: item.address,
      height,
      width,
      key,

      feature: labels.name,
      keepLive: item.keepLive || false,
      persistState: item.persistState || false,

      x,
      y,

      // tracking (handled automatically by windows API)
      trackingSource: 'slide',
      trackingSourceId: item.screenEdge ? `slide_${item.screenEdge}` : 'slide',
      title: item.title || ''
    };

    // Open the window
    windows.openModalWindow(item.address, params).then(result => {
      if (result.success) {
        console.log('[ext:slides] Successfully opened slide with ID:', result.id);
        // Store the window ID for future reference
        slideWindows.set(key, result.id);
      } else {
        console.error('[ext:slides] Failed to open slide:', result.error);
      }
    });
  }

};

const initItems = (prefs, items) => {
  const cmdPrefix = prefs.shortcutKeyPrefix;

  items.forEach(item => {
    if (item.enabled == true && item.address.length > 0) {
      const shortcut = `${cmdPrefix}${item.screenEdge}`;

      api.shortcuts.register(shortcut, () => {
        executeItem(item);
      }, { global: true });

      registeredShortcuts.push(shortcut);
    }
  });
};

/**
 * Unregister all shortcuts and clean up windows
 */
const uninit = () => {
  console.log('[ext:slides] uninit - unregistering', registeredShortcuts.length, 'shortcuts');

  // Unregister all shortcuts
  registeredShortcuts.forEach(shortcut => {
    api.shortcuts.unregister(shortcut, { global: true });
  });
  registeredShortcuts = [];

  // Close or hide all slide windows
  for (const [key, windowId] of slideWindows.entries()) {
    console.log('[ext:slides] Closing slide window:', key);
    api.window.hide({ id: windowId }).catch(err => {
      console.error('[ext:slides] Error hiding slide window:', err);
      api.window.close({ id: windowId }).catch(err => {
        console.error('[ext:slides] Error closing slide window:', err);
      });
    });
  }
  slideWindows.clear();
};

/**
 * Reinitialize slides (called when settings change)
 *
 * TODO: This is inefficient - reinitializes all slides when any single
 * property changes. A better approach would be to diff the old and new
 * settings and only update the shortcuts that actually changed.
 */
const reinit = () => {
  console.log('[ext:slides] reinit');
  uninit();

  const prefs = store.get(storageKeys.PREFS);
  const items = store.get(storageKeys.ITEMS);

  if (items && items.length > 0) {
    initItems(prefs, items);
  }
};

const init = () => {
  console.log('[ext:slides] init');

  const prefs = () => store.get(storageKeys.PREFS);
  const items = () => store.get(storageKeys.ITEMS);

  // Add global window closed handler
  api.subscribe('window:closed', (data) => {
    // Check all slide windows to see if any match the closed window ID
    for (const [key, windowId] of slideWindows.entries()) {
      if (data.id === windowId) {
        console.log('[ext:slides] Slide window was closed externally:', key);
        slideWindows.delete(key);
      }
    }
  });

  // Initialize slides
  if (items().length > 0) {
    initItems(prefs(), items());
  }

  // Listen for settings changes to hot-reload
  api.subscribe('slides:settings-changed', () => {
    console.log('[ext:slides] settings changed, reinitializing');
    reinit();
  });

  // Set up listener for app shutdown to clean up windows
  api.subscribe('app:shutdown', uninit);
};

export default {
  defaults,
  id,
  init,
  uninit,
  labels,
  schemas,
  storageKeys
};
