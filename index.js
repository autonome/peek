// main.js
(async () => {

console.log('main');

// Modules to control application life and create native browser window
const {
  electron,
  app,
  BrowserView,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  Notification,
  screen,
  Tray
} = require('electron');

const path = require('path');

const labels = {
  app: {
    title: 'Peek'
  },
  tray: {
    tooltip: 'Click to open Peek'
  }
};

// load data
let { data, schemas, set, watch } = require('./defaults');

const ICON_RELATIVE_PATH = 'assets/icons/AppIcon.appiconset/Icon-App-20x20@2x.png';
const ICON_PATH = path.join(__dirname, ICON_RELATIVE_PATH);

const isDev = require('electron-is-dev');

if (isDev) {
  // Enable live reload for Electron too
  require('electron-reload')(__dirname, {
    // Note that the path to electron may vary according to the main file
    electron: require(`${__dirname}/node_modules/electron`)
  });
  /*
  try {
	  require('electron-reloader')(module);
  } catch {}
  */
}

const unhandled = require('electron-unhandled');
unhandled();

// system dark mode handling
ipcMain.handle('dark-mode:toggle', () => {
  if (nativeTheme.shouldUseDarkColors) {
    nativeTheme.themeSource = 'light';
  } else {
    nativeTheme.themeSource = 'dark';
  }
  return nativeTheme.shouldUseDarkColors
});

ipcMain.handle('dark-mode:system', () => {
  nativeTheme.themeSource = 'system';
});

let _windows = [];
let _peekWins = {};
let _slideWins = {};

let _win = null;
const getMainWindow = () => {
  console.log('GMW', typeof _win);
  if (_win === null || !_win) {
    _win = createMainWindow();
  }
  return _win;
};

const createMainWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // and load the index.html of the app.
  mainWindow.loadFile('main.html');

  // Open the DevTools.
  mainWindow.webContents.openDevTools()

  return mainWindow;
};

// 
app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    getMainWindow().show();
  }
});

const initTray = () => {
  const tray = new Tray(ICON_PATH);
  tray.setToolTip(labels.tray.tooltip);
  tray.on('click', () => {
    getMainWindow().show();
  });
  return tray;
};

const execContentScript = (script, cb) => {
  const view = new BrowserView({
    webPreferences: {
      // isolate content and do not persist it
      partition: Date.now()
    }
  });

  view.webContents.loadURL(script.address);

  const str = `
    const s = "${script.selector}";
    const r = document.querySelector(s);
    const value = r ? r.textContent : null;
    value;
  `;

  view.webContents.on('dom-ready', async () => {
    try {
      const r = await view.webContents.executeJavaScript(str);
      cb(r);
    } catch(ex) {
      console.error('cs exec error', ex);
      cb(null);
    }
  });
};

let _intervals = [];

const initScripts = scripts => {
  console.log('initScripts', scripts);

  // blow it all away for now
  // someday make it right proper just cancel/update changed and add new
  _intervals.forEach(clearInterval);

  // debounce me somehow so not shooting em all off
  // at once every time app starts
  scripts.forEach(script => {
    setInterval(() => { 
      //console.log('interval hit', script.title);
      const r = execContentScript(script, (res) => {
        //console.log('cs r', res);

        if (script.previousValue != res) {
          // update stored value
          const previousValue = script.previousValue;
          script.previousValue = res;
          const idx = data.scripts.findIndex(el => el.id == script.id);
          if (idx >= 0) {
            data.scripts[idx] = script;
            set(data);
          }
          else {
            console.log('errrrr, wat');
          }

          // notification
          const title = `Peek :: Script :: ${script.title}`;
          const body = [
            `Script result changed for ${script.title}:`,
            `- Old: ${previousValue}`,
            `- New: ${res}`
          ].join('\n');

          new Notification({ title, body }).show();
        }
      });
    }, script.interval);
  });
};

const initGlobalShortcuts = prefs => {
  // register global activation shortcut
  if (!globalShortcut.isRegistered(prefs.globalKeyCmd)) {
    const onGlobalKeyCmd = () => {
      const win = getMainWindow();
      if (win) {
        win.show();
      }
      else {
        console.log('hrm')
      }
    };

    const ret = globalShortcut.register(prefs.globalKeyCmd, onGlobalKeyCmd);

    if (!ret) {
      console.error('Unable to register global key command.')
    }
  }
};

const showPeek = (peek) => {
  const height = peek.height || 600;
  const width = peek.width || 800;
  
  let win = null;

  const key = 'peek' + peek.keyNum;

  if (_peekWins[key]) {
    console.log('peek', peek.keyNum, 'using stored window');
    win = _peekWins[key];
    win.show();
  }
  else {
    console.log('peek', peek.keyNum, 'creating new window');
    win = new BrowserWindow({
      height,
      width,
      center: true,
      skipTaskbar: true,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      webPreferences: {
        preload: path.join(__dirname, 'peek-preload.js'),
        // isolate content and do not persist it
        partition: Date.now()
      }
    });
  }

  const onGoAway = () => {
    if (peek.keepLive) {
      _peekWins[key] = win;
      win.hide();
    }
    else {
      win.destroy();
    }
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

  //win.setBounds({ x: 0, y: 0, width, height })
  win.loadURL(peek.address);
};

const initPeeks = (cmdPrefix, peeks) => {
  peeks.forEach((p, i) => {
    if (globalShortcut.isRegistered(cmdPrefix + `${i}`)) {
      globalShortcut.unregister(cmdPrefix + `${i}`)
    }

    const ret = globalShortcut.register(cmdPrefix + `${i}`, () => {
      showPeek(p);
    });

    if (!ret) {
      console.error('Unable to register peek');
    }
  });
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

    const speedMs = 250;
    const timerInterval = 10;

    let tick = 0;
    const numTicks = parseInt(speedMs / timerInterval);

    const offset = slide[dim] / numTicks;

    console.log('numTicks', numTicks, 'widthChunk', offset);

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
      newBounds[coord] = pos;
      newBounds[dim] = newDim;

      // set new bounds
      win.setBounds(newBounds);

    }, timerInterval);
  });
};

const showSlide = (slide) => {
  let win = null;

  const key = 'slide' + slide.screenEdge;

  // TODO: fix stored+live windows
  if (_slideWins[key]) {
    console.log('slide', slide.screenEdge, 'using stored window');
    win = _slideWins[key];
    win.show();
  }
  else {

    const { size, bounds } = screen.getPrimaryDisplay();

    let x, y, height, width, center = null;

    switch(slide.screenEdge) {
      case 'Up':
        // horizontally center
        x = (size.width - slide.width) / 2;

        // y starts at screen top and stays there
        y = 0;

        width = slide.width;
        height = 1;
        break;
      case 'Down':
        // horizonally center
        x = (size.width - slide.width) / 2;

        // y ends up at window height from bottom
        //
        // eg: y = size.height - slide.height;
        //
        // but starts at screen bottom
        y = size.height;

        width = slide.width;
        height = 1;
        break;
      case 'Left':
        // x starts and ends at at left screen edge
        // at left edge
        x = 0;

        // vertically center
        y = (size.height - slide.height) / 2;

        width = 1;
        height = slide.height;
        break;
      case 'Right':
        // x ends at at right screen edge - window size
        //
        // eg: x = size.width - slide.width;
        //
        // but starts at screen right edge, will animate in 
        x = size.width;

        // vertically center
        y = (size.height - slide.height) / 2;

        width = 1;
        height = slide.height;
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
      webPreferences: {
        preload: path.join(__dirname, 'peek-preload.js'),
        // isolate content and do not persist it
        partition: Date.now()
      }
    });

    //_slideWins[key] = win;
  }

  animateSlide(win, slide).then();

  const onGoAway = () => {
    /*
    if (slide.keepLive) {
      _slideWins[key] = win;
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

  //win.setBounds({ x: 0, y: 0, width, height })
  win.loadURL(slide.address);
};

const initSlides = (cmdPrefix, slides) => {
  slides.forEach(s => {
    if (!globalShortcut.isRegistered(cmdPrefix + `${s.screenEdge}`)) {
      const ret = globalShortcut.register(cmdPrefix + `${s.screenEdge}`, () => {
        showSlide(s);
      });

      if (!ret) {
        console.error('Unable to register slide');
      }
    }
  });
};

// initialized all bits which need updating if the data changes
// can be called repeatedly to refresh on changes
const initData = data => {
  // initialize prefs
  const prefs = data.prefs;
  initGlobalShortcuts(prefs);

  // initialize peeks
  if (data.peeks.length > 0) {
    initPeeks(prefs.peekKeyPrefix, data.peeks);
  }

  // initialize slides
  if (data.slides.length > 0) {
    initSlides(prefs.slideKeyPrefix, data.slides);
  }

  // initialize scripts
  if (data.scripts.length > 0) {
    initScripts(data.scripts);
  }
};

// app load
const onReady = () => {
  // create main app window on app start
  const win = getMainWindow();

  initData(data);

  // keep app out of dock and tab switcher
  if (app.dock) {
    app.dock.hide();
  }

  initTray();

  watch(newData => {
    initData(newData);
    getMainWindow().webContents.send('configchange', {});
  });
};

app.whenReady().then(onReady);

// when renderer is ready, send over user data
ipcMain.on('getconfig', () => {
  getMainWindow().webContents.send('config', {
		data,
		schemas
  });
});

// listen for updates
ipcMain.on('setconfig', (event, newData) => {
  // TODO: if any shortcuts changed, unregister the old ones

  // write to datastore
  set(newData);
});

// ipc ESC handler
ipcMain.on('esc', (event, title) => {
  console.log('esc');
  const win = getMainWindow();
  if (win) {
    console.log('esc: killingit');
    win.close();
    win.destroy();
    _win = null;
  }
  /*
  if (win.isVisible()) {
    console.log('win is visible, hide it');
    win.hide();
  }
  */
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  console.log('window-all-closed', process.platform);
  const win = getMainWindow();
  if (win) {
    console.log('wac: killingit');
    win.close();
    win.destroy();
    _win = null;
  }
  if (process.platform !== 'darwin') {
    onQuit();
  }
});

const onQuit = () => {
  console.log('onquit');
  // Unregister all shortcuts on app close
  globalShortcut.unregisterAll();

  app.quit();
};

})();
