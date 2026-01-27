import 'fake-indexeddb/auto';

// In-memory store backing chrome.storage.local
let storageData = {};

const chromeStorageLocal = {
  get: (keys) => {
    return new Promise((resolve) => {
      if (keys === null || keys === undefined) {
        resolve({ ...storageData });
        return;
      }
      const keyList = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
      const result = {};
      for (const key of keyList) {
        if (key in storageData) {
          result[key] = storageData[key];
        } else if (typeof keys === 'object' && !Array.isArray(keys) && key in keys) {
          result[key] = keys[key];
        }
      }
      resolve(result);
    });
  },
  set: (items) => {
    return new Promise((resolve) => {
      Object.assign(storageData, items);
      resolve();
    });
  },
  remove: (keys) => {
    return new Promise((resolve) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        delete storageData[key];
      }
      resolve();
    });
  },
};

const alarms = [];
const chromeAlarms = {
  create: (name, options) => {
    alarms.push({ name, ...options });
  },
  onAlarm: {
    _listeners: [],
    addListener: (cb) => {
      chromeAlarms.onAlarm._listeners.push(cb);
    },
  },
};

const chromeRuntime = {
  onInstalled: {
    _listeners: [],
    addListener: (cb) => {
      chromeRuntime.onInstalled._listeners.push(cb);
    },
  },
  onMessage: {
    _listeners: [],
    addListener: (cb) => {
      chromeRuntime.onMessage._listeners.push(cb);
    },
  },
  openOptionsPage: () => {},
};

globalThis.chrome = {
  storage: { local: chromeStorageLocal },
  alarms: chromeAlarms,
  runtime: chromeRuntime,
};

export function resetMocks() {
  storageData = {};
  alarms.length = 0;
  chromeAlarms.onAlarm._listeners.length = 0;
  chromeRuntime.onInstalled._listeners.length = 0;
  chromeRuntime.onMessage._listeners.length = 0;

  // Reset IndexedDB
  const req = indexedDB.deleteDatabase('peek-datastore');
  return new Promise((resolve) => {
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

export function getStorageData() {
  return storageData;
}

export function getAlarms() {
  return alarms;
}
