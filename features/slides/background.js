// slides/slides.js

import { id, labels, schemas, ui, defaults } from './config.js';
import { log as l, openStore } from "../utils.js";

const log = function(...args) { l(id, args); };

log('background', id);

const debug = window.app.debug;

const store = openStore(id, defaults);
const api = window.app;

const storageKeys = {
  PREFS: 'prefs',
  ITEMS: 'items',
};

const executeItem = (item) => {
  let height = item.height || 600;
  let width = item.width || 800;

  const size = {
    height: window.screen.height,
    width: window.screen.width
  };

  let x, y, center = null;

  switch(item.screenEdge) {
    case 'Up':
      // horizontally center
      x = (size.width - item.width) / 2;

      // y starts at screen top and stays there
      y = 0;

      width = item.width;
      //height = 1;
      break;
    case 'Down':
      // horizonally center
      x = (size.width - item.width) / 2;

      // y ends up at window height from bottom
      //
      // eg: y = size.height - item.height;
      //
      // but starts at screen bottom
      y = size.height;

      width = item.width;
      //height = 1;
      break;
    case 'Left':
      // x starts and ends at at left screen edge
      // at left edge
      x = 0;

      // vertically center
      y = (size.height - item.height) / 2;

      //width = 1;
      height = item.height;
      break;
    case 'Right':
      // x ends at at right screen edge - window size
      //
      // eg: x = size.width - item.width;
      //
      // but starts at screen right edge, will animate in 
      x = size.width;

      // vertically center
      y = (size.height - item.height) / 2;

      //width = 1;
      height = item.height;
      break;
    default:
      center = true;
      console.log('waddafa');
  }

  log(item.screenEdge, x, y);

  const key = `${item.screenEdge}:${item.address}`;

  //animateSlide(win, item).then();

  const params = {
    // browserwindow
    address: item.address,
    height,
    width,

    // peek
    feature: labels.featureType,
    windowKey: `${labels.featureType}:${item.screenEdge}`,
    keepLive: item.keepLive || false,
    persistData: item.persistData || false,

    // slide
    x,
    y,
    key,
  };

  api.openWindow(params);
};

const initItems = (prefs, items) => {
  log('initItems');
  const cmdPrefix = prefs.shortcutKeyPrefix;

  items.forEach(item => {
    //if (item.enabled == true) {
      const shortcut = `${cmdPrefix}${item.screenEdge}`;

      api.shortcuts.register(shortcut, () => {
        executeItem(item);
      });
    //}
  });
};

const init = () => {
  log('init');

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
