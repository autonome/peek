// slides/slides.js
(async () => {

console.log('slides/slides');

const labels = {
  featureType: 'slides',
  featureDisplay: 'Slides',
  itemType: 'slide',
  itemDisplay: 'Slide',
  prefs: {
    keyPrefix: 'Slide shortcut prefix',
  }
};

const {
  BrowserWindow,
  globalShortcut,
  screen,
} = require('electron');

const path = require('path');

let _store = null;

const prefsSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.slides.prefs.schema.json",
  "title": "Peek - Slides prefs",
  "description": "Peek app Slides prefs",
  "type": "object",
  "properties": {
    "shortcutKeyPrefix": {
      "description": "Global OS hotkey prefix to trigger slides - will be followed by up/down/left/right arrows",
      "type": "string",
      "default": "Option+"
    },
  },
  "required": [ "shortcutKeyPrefix"]
};

const itemSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "peek.slides.slide.schema.json",
  "title": "Peek - page slide",
  "description": "Peek page slide",
  "type": "object",
  "properties": {
    "screenEdge": {
      "description": "Edge of screen or arrow key to open this slide, up/down/left/right",
      "type": "string",
      "oneOf": [
        { "format": "Up" },
        { "format": "Down" },
        { "format": "Left" },
        { "format": "Right" }
      ],
      "default": "Right"
    },
    "title": {
      "description": "Name of the slide - user defined label",
      "type": "string",
      "default": "New Slide"
    },
    "address": {
      "description": "URL to load",
      "type": "string",
      "default": "https://example.com"
    },
    "persistState": {
      "description": "Whether to persist local state or load page into empty container - defaults to false",
      "type": "boolean",
      "default": false
    },
    "keepLive": {
      "description": "Whether to keep page alive in background or load fresh when triggered - defaults to false",
      "type": "boolean",
      "default": false
    },
    "allowSound": {
      "description": "Whether to allow the page to emit sound or not (eg for background music player slides - defaults to false",
      "type": "boolean",
      "default": false
    },
    "height": {
      "description": "User-defined height of slide page",
      "type": "integer",
      "default": 600
    },
    "width": {
      "description": "User-defined width of slide page",
      "type": "integer",
      "default": 800
    },
  },
  "required": [ "screenEdge", "title", "address", "persistState", "keepLive", "allowSound",
                "height", "width" ]
};

const listSchema = {
  type: 'array',
  items: { "$ref": "#/$defs/slide" }
};

// TODO: schemaize 0-9 constraints for peeks
const schemas = {
  prefs: prefsSchema,
  item: itemSchema,
  items: listSchema
};

const _defaults = {
  prefs: {
    shortcutKeyPrefix: 'Option+'
  },
  items: [
    {
      screenEdge: 'Up',
      title: 'Slide from top',
      address: 'http://localhost/',
      persistState: false,
      keepLive: false,
      allowSound: false,
      height: 600,
      width: 800,
    },
    {
      screenEdge: 'Down',
      title: 'Slide from bottom',
      address: 'http://localhost/',
      persistState: false,
      keepLive: false,
      allowSound: false,
      height: 600,
      width: 800,
    },
    {
      screenEdge: 'Left',
      title: 'Slide from left',
      address: 'http://localhost/',
      persistState: false,
      keepLive: false,
      allowSound: false,
      height: 600,
      width: 800,
    },
    {
      screenEdge: 'Right',
      title: 'Slide from right',
      address: 'http://localhost/',
      persistState: false,
      keepLive: false,
      allowSound: false,
      height: 600,
      width: 800,
    },
  ]
};

let _windows = {};

const executeItem = (api, item) => {
  let win = null;

  const windowKey = labels.featureType + item.screenEdge;

  // TODO: fix stored+live windows
  if (_windows[windowKey]) {
    console.log(labels.featureType, slide.screenEdge, 'using stored window');
    win = _windows[windowKey];
    win.show();
  }
  else {
    const { size, bounds } = screen.getPrimaryDisplay();

    let x, y, height, width, center = null;

    switch(item.screenEdge) {
      case 'Up':
        // horizontally center
        x = (size.width - item.width) / 2;

        // y starts at screen top and stays there
        y = 0;

        width = item.width;
        height = 1;
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
        height = 1;
        break;
      case 'Left':
        // x starts and ends at at left screen edge
        // at left edge
        x = 0;

        // vertically center
        y = (size.height - item.height) / 2;

        width = 1;
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

        width = 1;
        height = item.height;
        break;
      default:
        center = true;
        console.log('waddafa');
    }

    win = new BrowserWindow({
      height,
      width,
      x,
      y,
      skipTaskbar: true,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      // maybe worth doing instead of animating width
      //enableLargerThanScreen: true,
      webPreferences: {
        preload: api.preloadPath,
        // isolate content and do not persist it
        partition: Date.now()
      }
    });

    //_windows[windowKey] = win;
  }

  animateSlide(win, item).then();

  const onGoAway = () => {
    /*
    if (item.keepLive) {
      _windows[key] = win;
      win.hide();
    }
    else {
      win.destroy();
    }
    */
    win.destroy();
  }
  win.on('blur', onGoAway);
  win.on('close', onGoAway);

  /*
  const str = `
    window.addEventListener('keyup', e => {
      if (e.key == 'Escape') {
        console.log('peek script esc');
      }
    });
    1;
  `;

  win.webContents.on('dom-ready', async () => {
    try {
      const r = await win.webContents.executeJavaScript(str);
      console.log(r);
    } catch(ex) {
      console.error('cs exec error', ex);
    }
  });
  */

  win.webContents.send('window', { type: labels.featureType, id: win.id, data: item });

  win.loadURL(item.address);
};

const initStore = (store, data) => {
  const sp = store.get('prefs');
  if (!sp) {
    store.set('prefs', data.prefs);
  }

  const items = store.get('items');
  if (!items) {
    store.set('items', data.items);
  }
};

const initItems = (api, prefs, items) => {
  const cmdPrefix = prefs.shortcutKeyPrefix;

  items.forEach(item => {
    const shortcut = `${cmdPrefix}${item.screenEdge}`;

    if (globalShortcut.isRegistered(shortcut)) {
      globalShortcut.unregister(shortcut);
    }

    const ret = globalShortcut.register(shortcut, () => {
      executeItem(api, item);
    });

    if (!ret) {
      console.error('Unable to register shortcut', shortcut);
    }
  });
};

const init = (api, store) => {
  _store = store;
  _api = api;

  initStore(_store, _defaults);

  _data = {
    get prefs() { return _store.get('prefs'); },
    get items() { return _store.get('items'); },
  };

  // initialize peeks
  if (_data.items.length > 0) {
    initItems(api, _data.prefs, _data.items);
  }
};

const onChange = (changed, old) => {
  console.log(labels.featureType, 'onChange', changed);

  // TODO only update store if changed
  // and re-init
  if (changed.prefs) {
    _store.set('prefs', changed.prefs);
  }

  if (changed.items) {
    _store.set('items', changed.items);
  }
};

// ui config
const config = {
  // allow user to create new items
  allowNew: false,
  // fields that are view only
  disabled: ['screenEdge'],
};

module.exports = {
  init: init,
  config,
  labels,
  schemas,
  data: {
    get prefs() { return _store.get('prefs'); },
    get items() { return _store.get('items'); },
  },
  onChange
};

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

})();
