import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { openStore } from "../utils.js";
import windows from "../windows.js";
import api from '../api.js';

console.log('background', labels.name);

const debug = api.debug;
const clear = false;

const store = openStore(id, defaults, clear /* clear storage */);

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
    show: false,
    script: {
      script: str,
      domEvent: 'dom-ready',
      closeOnCompletion: true,
    }
  };

  // For script windows, we use createWindow for more control
  windows.createWindow(script.address, params)
    .then(window => {
      console.log('Script window opened and running');
      
      // Auto-close after execution
      setTimeout(() => {
        window.close().catch(err => {
          console.error('Error closing script window:', err);
        });
      }, 5000); // Give it 5 seconds to execute
    })
    .catch(error => {
      console.error('Failed to open script window:', error);
    });
};

const initItems = (prefs, items) => {
  // blow it all away for now at module start
  // someday make it right proper
  // just cancel/update changed and add new
  _intervals.forEach(clearInterval);

  // debounce me somehow so not shooting em all off
  // at once every time app starts
  items.forEach(item => {
    if (item.enabled == true) {
      const interval = setInterval(() => { 
        const r = executeItem(item, res => {

          console.log('script result for', item.title, JSON.stringify(res));
          console.log('script prev val', item.previousValue);

          if (item.previousValue != res) {

            console.log('result changed!', item.title, item.previousValue, res);
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
  console.log('init');

  const prefs = () => store.get(storageKeys.PREFS);
  const items = () => store.get(storageKeys.ITEMS);

  // initialize slides
  if (items().length > 0) {
    initItems(prefs(), items());
  }
};

export default {
  defaults,
  id,
  init,
  labels,
  schemas,
  storageKeys
}
