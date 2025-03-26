import appConfig from '../config.js';
import { openStore } from '../utils.js';
import GUI from '../../node_modules/lil-gui/dist/lil-gui.esm.min.js';
import api from '../api.js';
import fc from '../features.js';

const DEBUG = api.debug;
const clear = false;

console.log('loading', 'settings');

// Generic gui generator+filler
const addToGUI = (gui, label, value, disabled = false, step = null, max = null) => {
  const params = {};
  params[label] = value;

  const ctr = gui.add(params, label);

  /*
  if (disabled == true) {
    ctr.disable();
  }

  if (max != null) {
    ctr.max(max);
  }

  if (step != null) {
    ctr.step(step);
  }
  */

  return ctr;
}

// Generic settings gui for a feature component
const settingsGUI = (container, feature, itemGUI) => {
	const { id, labels, schemas, storageKeys, defaults } = feature;

  console.log('settingsgui', labels.name, itemGUI);

	const store = openStore(id, defaults, clear /* clear storage */);

	let prefs = store.get(storageKeys.PREFS);
	let items = store.get(storageKeys.ITEMS);

  const gui = new GUI({
    touchStyles: false,
    container: container,
    title: labels.name
  });

  // anytime anything changes, persist to storage
  gui.onFinishChange(() => {
  	store.set(storageKeys.PREFS, prefs);
  	store.set(storageKeys.ITEMS, items);
	});

  // Add prefs
  const prefsFolder = gui.addFolder(
    schemas.prefs.title
  );

	const pProps = schemas.prefs.properties;
  const data = prefs;

  Object.keys(pProps).forEach(k => {
    // schema for property
    const s = pProps[k];

    // value (or default)
    const v =
      (data && data.hasOwnProperty(k))
      ? data[k]
      : pProps[k].default;

    const disabled = false;
    const step = pProps[k].type == 'integer' ? 1 : null;

    addToGUI(prefsFolder, k, v, disabled, step).onChange(e => {
      // TODO: validate new value against schema
      prefs[k] = e;
    });
  });

  // Add items, if any
  if (items) {
    items.forEach((item, i) => {
      itemGUI(items, item, i, gui);
    });
  }

  return gui;
};

const panels = {};

const guiFeature = (features, feature, i, gui) => {
  const folder = gui.addFolder(feature.name);
  addToGUI(folder, 'Description', feature.description).disable();
  addToGUI(folder, 'Enabled', feature.enabled).onChange(e => {
    // TODO: validate new value against schema
    features[i].enabled = e;
    api.publish('core:feature:toggle', {
      featureId: feature.id,
      enabled: e
    });
  });
  addToGUI(folder, 'Settings', () => {
    const title = `${feature.name} - Settings`;
    openSettingsAddress(title, feature.settings_url);
  }).disable(!feature.enabled);
};

const guiCmd = (items, item, i, gui) => {};
panels['Cmd'] = guiCmd;

const guiGroups = (items, item, i, gui) => {};
panels['Groups'] = guiGroups;

const guiPeeks = (items, item, i, gui) => {
  const folder = gui.addFolder(item.title);

  addToGUI(folder, 'Key mapping', item.keyNum).disable();
  addToGUI(folder, 'Address to load', item.address).onChange(e => {
    items[i].address = e;
  });
  addToGUI(folder, 'Persist state (not supported)', item.persistState).disable();
  addToGUI(folder, 'Keep live', item.keepLive).onChange(e => {
    items[i].keepLive = e;
  });
  addToGUI(folder, 'Allow sound (not supported)', item.allowSound).disable();
  addToGUI(folder, 'Window height', item.height).onChange(e => {
    items[i].height = e;
  });
  addToGUI(folder, 'Window width', item.width).onChange(e => {
    items[i].width = e;
  });
  addToGUI(folder, 'Enabled', item.enabled).onChange(e => {
    items[i].enabled = e;
  });
};
panels['Peeks'] = guiPeeks;

const guiScripts = (items, item, i, gui) => {
  const folder = gui.addFolder(item.title);

  addToGUI(folder, 'Id', item.id).onChange(e => {
    items[i].id = e;
  });
  addToGUI(folder, 'Script title', item.address).onChange(e => {
    items[i].title = e;
  });
  addToGUI(folder, 'Version', item.version).onChange(e => {
    items[i].version = e;
  });
  addToGUI(folder, 'Address to load', item.address).onChange(e => {
    items[i].address = e;
  });
  addToGUI(folder, 'Selector', item.selector).onChange(e => {
    items[i].selector = e;
  });
  // TODO: make options
  addToGUI(folder, 'Property', item.property).onChange(e => {
    items[i].property = e;
  });
  addToGUI(folder, 'Interval', item.interval).onChange(e => {
    items[i].interval = e;
  });
  addToGUI(folder, 'Store history (not supported)', item.storeHistory).disable();
  addToGUI(folder, 'Notify on changed value', item.notifyOnChange).disable();
  addToGUI(folder, 'Enabled', item.enabled).onChange(e => {
    items[i].enabled = e;
  });
};
panels['Scripts'] = guiScripts;

const guiSlides = (items, item, i, gui) => {
  console.log('adding slide', item);
  const folder = gui.addFolder(item.title);

  addToGUI(folder, 'Screen edge', item.screenEdge).disable();
  addToGUI(folder, 'Address to load', item.address).onChange(e => {
    items[i].address = e;
  });
  addToGUI(folder, 'Persist state (not supported)', item.persistState).disable();
  addToGUI(folder, 'Keep live', item.keepLive).onChange(e => {
    items[i].keepLive = e;
  });
  addToGUI(folder, 'Allow sound (not supported)', item.allowSound).disable();
  addToGUI(folder, 'Window height', item.height).onChange(e => {
    items[i].height = e;
  });
  addToGUI(folder, 'Window width', item.width).onChange(e => {
    items[i].width = e;
  });
  addToGUI(folder, 'Enabled', item.enabled).onChange(e => {
    items[i].enabled = e;
  });
};
panels['Slides'] = guiSlides;

const init = () => {
  const container = document.querySelector('.houseofpane');

  settingsGUI(container, appConfig, guiFeature);

  for (const i in fc) {
    const name = fc[i].labels.name;
    console.log('NAME', name);
    settingsGUI(container, fc[i], panels[name]);
  }
};

window.addEventListener('load', init);

window.addEventListener('blur', () => {
  console.log('core settings blur');
});
