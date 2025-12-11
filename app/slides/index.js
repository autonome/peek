import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore } from "../utils.js";
import windows from "../windows.js";
import api from '../api.js';

console.log('background', labels.name);

const debug = api.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);

// Map to track opened slides - key is slide key, value is window ID
const slideWindows = new Map();

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
      console.log('waddafa');
  }

  console.log('execute slide', item.screenEdge, x, y);

  const key = `${item.address}:${item.screenEdge}`;

  //animateSlide(win, item).then();

  // Check if this slide is already open
  if (slideWindows.has(key)) {
    // Get the window ID for the existing slide
    const windowId = slideWindows.get(key);
    console.log('Slide already open, verifying window exists with ID:', windowId);
    
    // First check if window exists
    api.window.exists({ id: windowId }).then(existsResult => {
      if (existsResult.exists) {
        // Window exists, try to show it
        api.window.show({ id: windowId }).then(result => {
          if (result.success) {
            console.log('Successfully showed existing slide:', key);
          } else {
            console.error('Failed to show existing slide:', result.error);
            slideWindows.delete(key);
            openNewSlide();
          }
        }).catch(err => {
          console.error('Error showing window:', err);
          slideWindows.delete(key);
          openNewSlide();
        });
      } else {
        console.log('Window no longer exists, creating new one');
        slideWindows.delete(key);
        openNewSlide();
      }
    }).catch(err => {
      console.error('Error checking if window exists:', err);
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
        console.log('Successfully opened slide with ID:', result.id);
        // Store the window ID for future reference
        slideWindows.set(key, result.id);
      } else {
        console.error('Failed to open slide:', result.error);
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
      });
    }
  });
};

/**
 * Handle cleanup when the module is unloaded
 */
const cleanup = () => {
  console.log('Cleaning up slides module');
  
  // Close or hide all slide windows
  for (const [key, windowId] of slideWindows.entries()) {
    console.log('Closing slide window:', key);
    api.window.hide({ id: windowId }).catch(err => {
      console.error('Error hiding slide window:', err);
      // Try to close it if hiding fails
      api.window.close({ id: windowId }).catch(err => {
        console.error('Error closing slide window:', err);
      });
    });
  }
  
  // Clear the map
  slideWindows.clear();
};

const init = () => {
  console.log('init');

  const prefs = () => store.get(storageKeys.PREFS);
  const items = () => store.get(storageKeys.ITEMS);

  // Add global window closed handler
  api.subscribe('window:closed', (data) => {
    // Check all slide windows to see if any match the closed window ID
    for (const [key, windowId] of slideWindows.entries()) {
      if (data.id === windowId) {
        console.log('Slide window was closed externally:', key);
        slideWindows.delete(key);
      }
    }
  });

  // initialize slides
  if (items().length > 0) {
    initItems(prefs(), items());
  }
  
  // Set up listener for app shutdown to clean up windows
  api.subscribe('app:shutdown', cleanup);
};

export default {
  defaults,
  id,
  init,
  cleanup,
  labels,
  schemas,
  storageKeys
}

/*
const animateSlide = (win, slide) => {
  return new Promise((res, rej) => {
    const { size, bounds } = screen.getPrimaryDisplay();

    // get x/y field
    const coord = slide.screenEdge == 'Left' || slide.screenEdge == 'Right' ? 'x' : 'y';

    const dim = coord == 'x' ? 'width' : 'height';

    const winBounds = win.getBounds();

    // created window at x/y taking animation into account
    let pos = winBounds[coord];

    const speedMs = 150;
    const timerInterval = 10;

    let tick = 0;
    const numTicks = parseInt(speedMs / timerInterval);

    const offset = slide[dim] / numTicks;

    //console.log('numTicks', numTicks, 'widthChunk', offset);

    const timer = setInterval(() => {
      tick++;

      if (tick >= numTicks) {
        clearInterval(timer);
        res();
      }

      const winBounds = win.getBounds();

      if (slide.screenEdge == 'Right' || slide.screenEdge == 'Down') {
        // new position is current position +/- offset
        pos = pos - offset;
      }

      const grownEnough = winBounds[dim] <= slide[dim];
      const newDim = grownEnough ?
        winBounds[dim] + offset
        : winBounds[dim];

      const newBounds = {};
      newBounds[coord] = parseInt(pos, 10);
      newBounds[dim] = parseInt(newDim, 10);

      // set new bounds
      win.setBounds(newBounds);

    }, timerInterval);
  });
};
*/
