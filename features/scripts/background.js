// scripts/background.js
//(async () => {

const log = (...args) => {
  console.log(labels.featureType, window.app.shortcuts);
  window.app.log(labels.featureType, args.join(', '));
};

log('scripts/background');

//import { labels, schemas, ui, defaults } from './config.js';

//const debug = window.location.search.indexOf('debug') > 0;
const debug = 1;

if (debug) {
  log('clearing storage')
  localStorage.clear();
}

const _store = localStorage;
const _api = window.app;

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

  _api.openWindow(params, cb);
};

const initStore = (data) => {
  const sp = _store.getItem('prefs');
  if (!sp) {
    _store.setItem('prefs', JSON.stringify(data.prefs));
  }

  const items = _store.getItem('items');
  if (!items) {
    _store.setItem('items', JSON.stringify(data.items));
  }
};

const initItems = (prefs, items) => {
  // blow it all away for now
  // someday make it right proper just cancel/update changed and add new
  _intervals.forEach(clearInterval);

  // debounce me somehow so not shooting em all off
  // at once every time app starts
  items.forEach(item => {
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
  });
};

const updateItem = (item) => {
  let items = _store.get('items');
  const idx = items.findIndex(el => el.id == item.id);
  items[idx] = item;
  _store.set('items', items);
};

const init = () => {
  log('init');

  initStore(defaults);

  const prefs = () => JSON.parse(_store.getItem('prefs'));
  const items = () => JSON.parse(_store.getItem('items'));

  // initialize slides
  if (items().length > 0) {
    initItems(prefs(), items());
  }
};

const onChange = (changed, old) => {
  log('onChange', changed);

  // TODO only update store if changed
  // and re-init
  if (changed.prefs) {
    _store.setItem('prefs', JSON.stringify(changed.prefs));
  }

  if (changed.items) {
    _store.setItem('items', JSON.stringif(changed.items));
  }
};

window.addEventListener('load', init);

//})();
