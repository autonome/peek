import appConfig from './config.js';
import { openStore } from "./utils.js";
import windowManager from "./windows.js";
import api from './api.js';
import fc from './features.js';

const { id, labels, schemas, storageKeys, defaults } = appConfig;

console.log('core', id, labels.name);

const debug = api.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);

// Datastore is now initialized in main process and accessible via api.datastore
console.log('core', 'datastore available via api.datastore');

// Import and expose history tracking helpers
import historyTracking from './datastore/history.js';
window.datastoreHistory = historyTracking;

// maps app id to BrowserWindow id (background)
const windows = new Map();

const settingsAddress = 'peek://app/settings/settings.html';
const topicCorePrefs = 'topic:core:prefs';
const topicFeatureToggle = 'core:feature:toggle';

let _settingsWin = null;

const openSettingsWindow = async (prefs) => {
  console.log('openSettingsWindow()');

  // Get screen dimensions from window object
  const screenWidth = window.screen.availWidth;
  const screenHeight = window.screen.availHeight;

  // Calculate 80% of screen dimensions
  const width = Math.floor(screenWidth * 0.8);
  const height = Math.floor(screenHeight * 0.8);

  console.log(`Setting window size to ${width}x${height} (80% of ${screenWidth}x${screenHeight})`);

  const params = {
    debug,
    key: settingsAddress,
    transparent: true,
    height,
    width
  };

  console.log('Opening settings window with params:', params);
  
  try {
    // Use the window creation API from windows.js
    const windowController = await windowManager.createWindow(settingsAddress, params);
    
    console.log('Settings window opened successfully with controller:', windowController);
    _settingsWin = windowController;
    
    // Focus the window to bring it to front
    await windowController.focus();
  } catch (error) {
    console.error('Failed to open settings window:', error);
  }
};

const initSettingsShortcut = (prefs) => {
  api.shortcuts.register(prefs.shortcutKey, () => {
    console.log('settings shortcut executed');
    openSettingsWindow(prefs);
  });
};

const initFeature = f => {
  if (!f.enabled) {
    return;
  }

  console.log('initializing feature ', f);

  fc[f.id].init();
};

const uninitFeature = f => {
  console.log('TODO: uninitFeature', f);

  // TODO uninitialize each active feature and close its window
};

// unused, worth testing more tho
const initIframeFeature = file => {
  const pathPrefix = 'file:///Users/dietrich/misc/peek/';
  console.log('initiframe');
  const i = document.createElement('iframe');
  const src = pathPrefix + file;
  console.log('iframe src', src);
  document.body.appendChild(i);
  i.src = src;
  console.log('iframe inited');
  i.addEventListener('load', () => {
    console.log('iframe loaded');
  });
};

const prefs = () => store.get(storageKeys.PREFS);
const features = () => store.get(storageKeys.ITEMS);

const init = async () => {
  console.log('init');

  const p = prefs();

  console.log('prefs', p);

  // main process uses these for initialization
  api.publish(topicCorePrefs, {
    id: id,
    prefs: p
  }, api.scopes.SYSTEM);

  // Listen for system- or feature-level requests to open windows.
  api.subscribe('open', msg => {
    // eg from the tray icon.
    if (msg.address && msg.address == settingsAddress) {
      openSettingsWindow(p).catch(err => {
        console.error('Error opening settings window from open event:', err);
      });
    }
  });

  // Open settings window on startup if configured
  if (p.startupFeature == settingsAddress) {
    try {
      await openSettingsWindow(p);
    } catch (error) {
      console.error('Error opening startup settings window:', error);
    }
  }

  // feature enable/disable
  api.subscribe(topicFeatureToggle, msg => {
    console.log('feature toggle', msg)

    const f = features().find(f => f.id == msg.featureId);
    if (f) {
      console.log('feature toggle', f);
      if (msg.enabled == false) {
        console.log('disabling', f.name);
        uninitFeature(f);
      }
      else if (msg.enabled == true) {
        console.log('enabling', f.name);
        initFeature(f);
      }
    }
    else {
      console.log('feature toggle - no feature found for', f.name);
    }
  });

  initSettingsShortcut(p);

  features().forEach(initFeature);

  //features.forEach(initIframeFeature);

  /*
  // Example of using the new windows.js API:
  const addy = 'http://localhost';
  const params = {
    debug,
    key: addy,
    height: 300,
    width: 300
  };

  windowManager.createWindow(addy, params)
    .then(windowController => {
      // Can use windowController to interact with the window
      windowController.hide();
    })
    .catch(error => {
      console.error('Error opening example window:', error);
    });
  */
};

window.addEventListener('load', () => {
  init().catch(error => {
    console.error('Error during application initialization:', error);
  });
});

/*
const odiff = (a, b) => Object.entries(b).reduce((c, [k, v]) => Object.assign(c, a[k] ? {} : { [k]: v }), {});

const onStorageChange = (e) => {
  const old = JSON.parse(e.oldValue);
  const now = JSON.parse(e.newValue);

  const featureKey = `${id}+${storageKeys.ITEMS}`;
  //console.log('onStorageChane', e.key, featureKey)
  if (e.key == featureKey) {
    //console.log('STORAGE CHANGE', e.key, old[0].enabled, now[0].enabled);
    features().forEach((feat, i) => {
      console.log(feat.title, i, feat.enabled, old[i].enabled, now[i].enabled);
      // disabled, so unload
      if (old[i].enabled == true && now[i].enabled == false) {
        // TODO
        console.log('TODO: add unloading of features', feat)
      }
      // enabled, so load
      else if (old[i].enabled == false && now[i].enabled == true) {
        initFeature(feat);
      }
    });
  }
	//JSON.stringify(e.storageArea);
};

window.addEventListener('storage', onStorageChange);
*/
