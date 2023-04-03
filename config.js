const Store = require('electron-store');

const store = new Store();
store.clear();

store.set('prefs', {
  globalKeyCmd: 'CommandOrControl+Escape',
  peekKeyPrefix: 'Option+'
});

store.set('peeks', [
]);

store.set('scripts', [
]);

module.exports = store;
