import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { log as l, openStore, addToGUI } from "../utils.js";
import GUI from './../../node_modules/lil-gui/dist/lil-gui.esm.min.js';

const log = function(...args) { l(labels.name, args); };
const DEBUG = window.app.debug;

log('loading', labels.name, 'settings');

const store = openStore(id);
const container = document.querySelector('.houseofpane');
let prefs = store.get(storageKeys.PREFS);
let features = store.get(storageKeys.FEATURES);

const persistToStorage = () => {
  store.set(storageKeys.PREFS, prefs);
  store.set(storageKeys.FEATURES, features);
};

const init = () => {

  // Initialize settings UI
  const container = document.querySelector('.houseofpane');

  const gui = new GUI({
    touchStyles: false,
    container: container,
    title: labels.name
  });

  // anytime anything changes, persist to storage
  gui.onFinishChange(persistToStorage);

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
    });;
  });

  // Add features
  features.forEach((feature, i) => {
    const folder = gui.addFolder(feature.name);
    addToGUI(folder, 'Description', feature.description).disable();
    addToGUI(folder, 'Enabled', feature.enabled).onChange(e => {
      // TODO: validate new value against schema
      features[i].enabled = e;
      window.app.publish('core:feature:toggle', {
        featureId: feature.id,
        enabled: e
      });
    });
    addToGUI(folder, 'Settings', () => {
      const title = `${feature.name} - Settings`;
      openSettingsAddress(title, feature.settings_url);
    }).disable(!feature.enabled);
  });
};

const openSettingsAddress = (title, address) => {
  const params = {
    feature: title,
    address,
  };

  window.app.openWindow(params, () => window.app.log(title, 'settings win opened', address));
}

window.addEventListener('load', init);
