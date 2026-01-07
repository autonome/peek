import appConfig from './config.js';
import { openStore } from "./utils.js";
import windowManager from "./windows.js";
import api from './api.js';
import fc from './features.js';
import extensionLoader from './extensions/loader.js';

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

  // Fixed size for settings window - content doesn't need to scale with screen
  const width = 900;
  const height = 650;

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

  // Skip extension-based features (they're loaded by the extension loader)
  if (f.extension) {
    debug && console.log('skipping extension-based feature:', f.name);
    return;
  }

  // Check if feature exists in the features collection
  if (!fc[f.id]) {
    console.log('feature not found in collection:', f.name, f.id);
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

// Register extension management commands for cmd palette
const registerExtensionCommands = () => {
  // Reload extension command
  api.commands.register({
    name: 'extension reload',
    description: 'Reload an extension by name',
    execute: async (ctx) => {
      const extName = ctx.search?.trim();
      if (!extName) {
        console.log('extension reload: no extension name provided');
        return;
      }

      // Find extension by name or id (case-insensitive)
      const extensions = extensionLoader.getRunningExtensions();
      const ext = extensions.find(e =>
        e.id.toLowerCase() === extName.toLowerCase() ||
        (e.manifest?.name || '').toLowerCase() === extName.toLowerCase()
      );

      if (!ext) {
        console.log(`extension reload: extension not found: ${extName}`);
        return;
      }

      console.log(`Reloading extension: ${ext.id}`);
      const result = await extensionLoader.reloadExtension(ext.id);
      if (result.success) {
        console.log(`Extension reloaded: ${ext.id}`);
      } else {
        console.error(`Failed to reload extension: ${result.error}`);
      }
    }
  });

  // List extensions command
  api.commands.register({
    name: 'extensions',
    description: 'List running extensions',
    execute: async (ctx) => {
      const extensions = extensionLoader.getRunningExtensions();
      console.log('Running extensions:');
      extensions.forEach(ext => {
        const manifest = ext.manifest || {};
        console.log(`  - ${manifest.name || ext.id} (${ext.id}) v${manifest.version || '?'}`);
      });

      // Open settings to Extensions section
      const p = prefs();
      await openSettingsWindow(p);
    }
  });

  console.log('Extension commands registered');
};

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

  // Handle URLs opened from external apps (e.g., when Peek is default browser)
  api.subscribe('external:open-url', async (msg) => {
    console.log('external:open-url', msg);
    const { url, trackingSource, trackingSourceId } = msg;

    try {
      // Use URL as key to reuse existing windows
      await windowManager.createWindow(url, {
        key: url,
        trackingSource,
        trackingSourceId
      });
    } catch (error) {
      console.error('Error opening external URL:', error);
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
  api.subscribe(topicFeatureToggle, async msg => {
    console.log('feature toggle', msg)

    const f = features().find(f => f.id == msg.featureId);
    if (f) {
      console.log('feature toggle', f);

      // Check if this feature is backed by an extension
      const extId = f.name.toLowerCase();
      const isExtension = extensionLoader.builtinExtensions.some(e => e.id === extId);

      if (msg.enabled == false) {
        console.log('disabling', f.name);
        if (isExtension) {
          await extensionLoader.unloadExtension(extId);
        } else {
          uninitFeature(f);
        }
      }
      else if (msg.enabled == true) {
        console.log('enabling', f.name);
        if (isExtension) {
          const ext = extensionLoader.builtinExtensions.find(e => e.id === extId);
          if (ext) {
            await extensionLoader.loadExtension(ext);
          }
        } else {
          initFeature(f);
        }
      }
    }
    else {
      console.log('feature toggle - no feature found for', msg.featureId);
    }
  });

  initSettingsShortcut(p);

  features().forEach(initFeature);

  // Load extensions
  // Helper to check if an extension (by name) is enabled in features
  const isExtensionEnabled = (extId) => {
    const featureList = features();
    // Match extension ID to feature name (case-insensitive)
    const feature = featureList.find(f =>
      f.name.toLowerCase() === extId.toLowerCase()
    );
    return feature ? feature.enabled : false;
  };

  await extensionLoader.loadBuiltinExtensions(isExtensionEnabled);

  // Register extension dev commands
  registerExtensionCommands();

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
