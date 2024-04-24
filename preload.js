const {
  contextBridge,
  ipcRenderer
} = require('electron');

const src = 'preload';

const DEBUG = process.env.DEBUG || false;
const DEBUG_LEVELS = {
  BASIC: 1,
  FIRST_RUN: 2
};

const DEBUG_LEVEL = DEBUG_LEVELS.BASIC;
//const DEBUG_LEVEL = DEBUG_LEVELS.FIRST_RUN;

const APP_SCHEME = 'peek';
const APP_PROTOCOL = `${APP_SCHEME}:`;

const isApp = window.location.protocol == APP_PROTOCOL;
const sourceAddress = window.location.toString();

const log = (source, text) => {
  ipcRenderer.send('console', {
    source,
    text
  });
};

// all visible window types close on escape
window.addEventListener('keyup', e => {
  log('preload', 'keyup', e.key, window.location)
  if (e.key == 'Escape') {
    ipcRenderer.send('esc', '');
  }
});

const addEscListener = () => {
  window.addEventListener('keyup', e => {
    log('preload', 'keyup', e.key, window.location)
    if (e.key == 'Escape') {
      ipcRenderer.send('esc', '');
    }
  });
};

let api = {};

api.log = log;
api.debug = DEBUG;
api.debugLevels = DEBUG_LEVELS;
api.debugLevel = DEBUG_LEVEL;

api.shortcuts = {
  register: (shortcut, cb) => {
    log(src, 'registering ' + shortcut + ' for ' + window.location)

    const replyTopic = `${shortcut}${window.location}`;

    ipcRenderer.send('registershortcut', {
      source: sourceAddress,
      shortcut,
      replyTopic
    });

    ipcRenderer.on(replyTopic, (ev, msg) => {
      log(src, 'shortcut execution reply');
      cb();
    });
  },
  unregister: shortcut => {
    console.log('unregistering', shortcut, 'for', window.location)
    ipcRenderer.send('registershortcut', {
      source: sourceAddress,
      shortcut
    });
  }
};

api.openWindow = (params, callback) => {
  log(src, ['api.openwindow', JSON.stringify(params), 'for', window.location].join(', '));

  // TODO: won't work for features that open multiple windows
  const replyTopic = `${params.feature}${params.address}`;

  // add source address to params
  params.source = sourceAddress;

  ipcRenderer.send('openwindow', {
    params,
    replyTopic
  });

  ipcRenderer.once(replyTopic, (ev, msg) => {
    log(src, 'api.openwindow', 'resp from main', msg);
    if (callback) {
      callback(msg);
    }
  });
};

api.closeWindow = (key, callback) => {
  log(src, ['api.closewindow', key, 'for', window.location].join(', '));

  const replyTopic = `${key}${Math.random().toString(16).slice(2)}`;

  const params = {
    source: sourceAddress,
    key
  };

  ipcRenderer.send('closewindow', {
    params,
    replyTopic
  });

  ipcRenderer.once(replyTopic, (ev, msg) => {
    log(src, 'api.closewindow', 'resp from main', msg);
    if (callback) {
      callback(msg);
    }
  });
};

api.publish = (topic, msg) => {
  // noop if not an internal app file
  if (!isApp) {
    return;
  }

  ipcRenderer.send('publish', {
    source: sourceAddress,
    topic,
    data: msg,
  });
};

api.subscribe = (topic, callback) => {
  //log(src, 'subscribe', topic)

  // noop if not an internal app file
  if (!isApp) {
    // TODO: error
    return;
  }

  const replyTopic = `${topic}${Math.random().toString(16).slice(2)}`;

  ipcRenderer.send('subscribe', {
    source: sourceAddress,
    topic,
    replyTopic
  });

  ipcRenderer.on(replyTopic, (ev, msg) => {
    if (callback) {
      callback(msg);
    }
  });
};

contextBridge.exposeInMainWorld('app', api);

/*
window.addEventListener('load', () => {
  console.log('preload loaded');
  log(src, 'preload loaded');
});
*/

/*
const handleMainWindow = () => {
  d('handleMainWindow');
  window.addEventListener('load', () => {
    const replaceText = (selector, text) => {
      const element = document.getElementById(selector)
      if (element) element.innerText = text
    }

    for (const dependency of ['chrome', 'node', 'electron']) {
      replaceText(`${dependency}-version`, process.versions[dependency])
    }
  });
};
*/

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency])
  }
})
