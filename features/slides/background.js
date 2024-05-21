// slides/slides.js

import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore, flattenObj } from "../utils.js";

console.log('background', labels.name);

const debug = window.app.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);
const api = window.app;

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

  console.log(item.screenEdge, x, y);

  const key = `${item.address}:${item.screenEdge}`;

  //animateSlide(win, item).then();

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
  };

  window.open(item.address, null, flattenObj(params));
};

const initItems = (prefs, items) => {
  console.log('initItems');
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

const init = () => {
  console.log('init');

  const prefs = () => store.get(storageKeys.PREFS);
  const items = () => store.get(storageKeys.ITEMS);

  // initialize slides
  if (items().length > 0) {
    initItems(prefs(), items());
  }
};

window.addEventListener('load', init);

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
