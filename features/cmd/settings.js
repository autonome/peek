import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { log as l, openStore, addToGUI } from "../utils.js";
import GUI from './../../node_modules/lil-gui/dist/lil-gui.esm.min.js';

const log = function(...args) { l(id, args); };

log('background', id);

const debug = window.app.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);
const api = window.app;

const container = document.querySelector('.houseofpane');
let prefs = store.get(storageKeys.PREFS);

const persistToStorage = () => {
  store.set(storageKeys.PREFS, prefs);
};

const init = () => {

  /*
    pubsub.publish('open', {
      feature: msg.prefs.startupFeature
    });
  */

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
};

window.addEventListener('load', init);
