import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { log as l, openStore, addToGUI } from "../utils.js";
import GUI from './../../node_modules/lil-gui/dist/lil-gui.esm.min.js';

const log = function(...args) { l(labels.name, args); };

log('loading', labels.name, 'settings');

const debug = window.app.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);
const api = window.app;

const container = document.querySelector('.houseofpane');
let prefs = store.get(storageKeys.PREFS);
let items = store.get(storageKeys.ITEMS);

const persistToStorage = () => {
  store.set(storageKeys.PREFS, prefs);
  store.set(storageKeys.ITEMS, items);
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

  // Add items
  items.forEach((item, i) => {
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
  });
};

window.addEventListener('load', init);
