// scripts/background.js

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

let _intervals = [];

const executeItem = (script, cb) => {
  // limited script
  const str = `
    const s = "${script.selector}";
    const r = document.querySelector(s);
    const value = r ? r.textContent : null;
    value;
  `;

  const params = {
    feature: labels.featureType,
    address: script.address,
    show: false,
    script: {
      script: str,
      domEvent: 'dom-ready',
      closeOnCompletion: true,
    }
  };

  api.openWindow(params, cb);
};

const initItems = (prefs, items) => {
  // blow it all away for now
  // someday make it right proper just cancel/update changed and add new
  _intervals.forEach(clearInterval);

  // debounce me somehow so not shooting em all off
  // at once every time app starts
  items.forEach(item => {
    if (item.enabled == true) {
      const interval = setInterval(() => { 
        const r = executeItem(item, res => {

          //log('script result for', item.title, JSON.stringify(res));
          //log('script prev val', item.previousValue);

          if (item.previousValue != res) {

            log('result changed!', item.title, item.previousValue, res);
            // TODO: figure this out - it blows away all timers, which isn't great
            //
            // update stored value
            //item.previousValue = res;
            //updateItem(item);

            // notification
            // add to schema and support per script
            /*
            const title = `Peek :: Script :: ${item.title}`;
            const body = [
              `Script result changed for ${item.title}:`,
              `- Old: ${previousValue}`,
              `- New: ${res}`
            ].join('\n');

            new Notification({ title, body }).show();
            */
          }
        });
      }, item.interval);
      _intervals.push(interval);
    }
  });
};

const updateItem = (item) => {
  let items = store.get('items');
  const idx = items.findIndex(el => el.id == item.id);
  items[idx] = item;
  store.set('items', items);
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
