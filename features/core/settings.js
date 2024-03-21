import { id, labels, schemas, ui, defaults } from './config.js';
import { log as l, openStore, settingsPane } from "../utils.js";

const log = function(...args) { l(id, args); };
const DEBUG = window.app.debug;

log('loading', id);

const storageKeys = {
  PREFS: 'prefs',
  FEATURES: 'items',
};

const store = openStore(id);
const container = document.querySelector('.houseofpane');
const prefs = store.get(storageKeys.PREFS);
const items = store.get(storageKeys.FEATURES);

const onChange = newData => {
  log('onChange', JSON.stringify(newData));

  if (newData.prefs) {
    const key = 'prefs';
    store.set(storageKeys.PREFS, newData[key]);
    log('stored', key, store.get(storageKeys.PREFS));
  }
  
  if (newData.items) {
    const key = 'items';
    store.set(storageKeys.FEATURES, newData[key]);
    log('stored', key, store.get(storageKeys.FEATURES));
  }
};

const paneConfig = {
	
  label: labels.featureDisplay,

  children: [
    {
      label: schemas.prefs.title,

      // json schema to validate against
      schema: schemas.prefs,

      // data to populate
      data: defaults.prefs,
    },

    {
      label: schemas.items.title,

      // json schema to validate against
      schema: schemas.items,

      // data to populate
      data: defaults.items,

      // allow user to create new entries
      // adds an "add" button
      canAdd: true,

      // allow user to delete entries
      canDelete: true,

      // fields that are view only
      disabled: [
        'title', 'address'
      ],

      // field callbacks: function(pane, data)
      callbacks: [
        'settingsAddress',
      ],

      // non-schema fields to add
      addlFields: [
      ],
    },
  ]
};

const init = () => {

  /*
    pubsub.publish('open', {
      feature: msg.prefs.startupFeature
    });
  */

  /*
  items.forEach(item => {
    item.settings = 'button';
  });
  */

  settingsPane(container, ui, labels, schemas, prefs, items, onChange);

};

window.addEventListener('load', init);
