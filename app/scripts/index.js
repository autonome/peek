import { id, labels, schemas, storageKeys, defaults } from './config.js';
import { createDatastoreStore } from "../utils.js";
import windows from "../windows.js";
import api from '../api.js';

console.log('background', labels.name);

const debug = api.debug;

// Store is created asynchronously in init()
let store = null;

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

// Save script result to datastore
const saveScriptResult = async (script, result) => {
  try {
    // Get or create address for the script source
    let addressId = script.addressId;
    if (!addressId && script.address) {
      // Check if address exists
      const addressesResult = await api.datastore.queryAddresses({});
      if (addressesResult.success) {
        const existing = addressesResult.data.find(addr => addr.uri === script.address);

        if (existing) {
          addressId = existing.id;
        } else {
          // Create new address
          const addResult = await api.datastore.addAddress(script.address, {
            title: `Script: ${script.title}`
          });

          if (addResult.success) {
            addressId = addResult.id;
          }
        }

        // Store addressId back to script config for next time
        script.addressId = addressId;
      }
    }

    // Query previous result for this script
    const prevResultsResponse = await api.datastore.getTable('scripts_data');
    let previousValue = '';
    let changed = 0;

    if (prevResultsResponse.success) {
      const prevResults = prevResultsResponse.data;

      // Find most recent result for this script
      const scriptResults = Object.entries(prevResults)
        .filter(([id, row]) => row.scriptId === script.id)
        .sort((a, b) => b[1].extractedAt - a[1].extractedAt);

      if (scriptResults.length > 0) {
        previousValue = scriptResults[0][1].content;
        changed = (result !== previousValue) ? 1 : 0;
      } else {
        changed = 1; // First run is always "changed"
      }
    }

    // Add result to datastore
    await api.datastore.setRow('scripts_data',
      `script_data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      {
        scriptId: script.id || '',
        scriptName: script.title || 'Untitled Script',
        addressId: addressId || '',
        selector: script.selector || '',
        content: result || '',
        contentType: 'text',
        metadata: '{}',
        extractedAt: Date.now(),
        previousValue: previousValue,
        changed: changed
      }
    );

    console.log('Saved script result to datastore:', {
      script: script.title,
      changed,
      result
    });
  } catch (error) {
    console.error('Error saving script result to datastore:', error);
  }
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

          // Save result to datastore
          saveScriptResult(item, res);

          // Check if changed (now tracked in datastore)
          if (item.previousValue != res) {
            console.log('result changed!', item.title, item.previousValue, res);

            // Update local tracking
            item.previousValue = res;

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

const updateItem = async (item) => {
  let items = store.get('items');
  const idx = items.findIndex(el => el.id == item.id);
  items[idx] = item;
  await store.set('items', items);
};

const init = async () => {
  console.log('init');

  // Create datastore-backed store
  store = await createDatastoreStore('scripts', defaults);
  console.log('scripts store initialized from datastore');

  const prefs = () => store.get(storageKeys.PREFS);
  const items = () => store.get(storageKeys.ITEMS);

  // initialize scripts
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
