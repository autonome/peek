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

// Configurable bookmark tree for tests
let bookmarkTree = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'Bookmarks Toolbar',
        children: [],
      },
    ],
  },
];

const chromeBookmarks = {
  getTree: () => Promise.resolve(bookmarkTree),
  onCreated: {
    _listeners: [],
    addListener: (cb) => {
      chromeBookmarks.onCreated._listeners.push(cb);
    },
    removeListener: (cb) => {
      const idx = chromeBookmarks.onCreated._listeners.indexOf(cb);
      if (idx !== -1) chromeBookmarks.onCreated._listeners.splice(idx, 1);
    },
  },
};

export function setBookmarkTree(tree) {
  bookmarkTree = tree;
}

export function simulateBookmarkCreated(id, bookmark) {
  for (const cb of chromeBookmarks.onCreated._listeners) {
    cb(id, bookmark);
  }
}

// Configurable tab list for tests
let mockTabs = [];
let mockTabGroups = {};

const chromeTabs = {
  query: () => Promise.resolve([...mockTabs]),
  onUpdated: {
    _listeners: [],
    addListener: (cb) => {
      chromeTabs.onUpdated._listeners.push(cb);
    },
    removeListener: (cb) => {
      const idx = chromeTabs.onUpdated._listeners.indexOf(cb);
      if (idx !== -1) chromeTabs.onUpdated._listeners.splice(idx, 1);
    },
  },
};

const chromeTabGroups = {
  TAB_GROUP_ID_NONE: -1,
  get: (groupId) => {
    return new Promise((resolve, reject) => {
      if (groupId in mockTabGroups) {
        resolve(mockTabGroups[groupId]);
      } else {
        reject(new Error(`No group with id: ${groupId}`));
      }
    });
  },
};

export function setMockTabs(tabs) {
  mockTabs = tabs;
}

export function setMockTabGroups(groups) {
  mockTabGroups = groups;
}

export function simulateTabUpdated(tabId, changeInfo, tab) {
  for (const cb of chromeTabs.onUpdated._listeners) {
    cb(tabId, changeInfo, tab);
  }
}

// Configurable history data for tests
let mockHistoryItems = [];
let mockVisitsByUrl = {};

const chromeHistory = {
  search: () => Promise.resolve([...mockHistoryItems]),
  getVisits: ({ url }) => Promise.resolve(mockVisitsByUrl[url] || []),
  onVisited: {
    _listeners: [],
    addListener: (cb) => {
      chromeHistory.onVisited._listeners.push(cb);
    },
    removeListener: (cb) => {
      const idx = chromeHistory.onVisited._listeners.indexOf(cb);
      if (idx !== -1) chromeHistory.onVisited._listeners.splice(idx, 1);
    },
  },
};

export function setMockHistoryItems(items) {
  mockHistoryItems = items;
}

export function setMockVisitsByUrl(visits) {
  mockVisitsByUrl = visits;
}

export function simulateHistoryVisited(historyItem) {
  for (const cb of chromeHistory.onVisited._listeners) {
    cb(historyItem);
  }
}

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
  getManifest: () => ({ version: '1.0.0' }),
  getPlatformInfo: () => Promise.resolve({ os: 'mac', arch: 'arm64' }),
};

globalThis.chrome = {
  storage: { local: chromeStorageLocal },
  alarms: chromeAlarms,
  runtime: chromeRuntime,
  bookmarks: chromeBookmarks,
  tabs: chromeTabs,
  tabGroups: chromeTabGroups,
  history: chromeHistory,
};

// Mock navigator.userAgent for environment detection tests
// Node.js 24+ has a built-in navigator but with a Node UA string
Object.defineProperty(globalThis, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  writable: true,
  configurable: true,
});

export function resetMocks() {
  storageData = {};
  alarms.length = 0;
  chromeAlarms.onAlarm._listeners.length = 0;
  chromeRuntime.onInstalled._listeners.length = 0;
  chromeRuntime.onMessage._listeners.length = 0;
  chromeBookmarks.onCreated._listeners.length = 0;
  chromeTabs.onUpdated._listeners.length = 0;
  chromeHistory.onVisited._listeners.length = 0;
  mockTabs = [];
  mockTabGroups = {};
  mockHistoryItems = [];
  mockVisitsByUrl = {};
  bookmarkTree = [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          title: 'Bookmarks Toolbar',
          children: [],
        },
      ],
    },
  ];

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
