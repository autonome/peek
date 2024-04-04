const {
  contextBridge,
  ipcRenderer
} = require('electron');

const src = 'preload';

const DEBUG = process.env.DEBUG;
const DEBUG_LEVELS = {
  BASIC: 1,
  FIRST_RUN: 2
};

const DEBUG_LEVEL = DEBUG_LEVELS.BASIC;
//const DEBUG_LEVEL = DEBUG_LEVELS.FIRST_RUN;

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

api.shortcuts = {
  register: (shortcut, cb) => {
    log(src, 'registering ' + shortcut + ' for ' + window.location)

    const replyTopic = `${shortcut}${window.location}`;

    ipcRenderer.send('registershortcut', {
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
      shortcut
    });
  }
};

api.openWindow = (params, callback) => {
  log(src, ['api.openwindow', JSON.stringify(params), 'for', window.location].join(', '));

  // TODO: won't work for features that open multiple windows
  const replyTopic = `${params.feature}${params.address}`;

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

  const replyTopic = Date.now();

  ipcRenderer.send('closewindow', {
    params: { key },
    replyTopic
  });

  ipcRenderer.once(replyTopic, (ev, msg) => {
    log(src, 'api.closewindow', 'resp from main', msg);
    if (callback) {
      callback(msg);
    }
  });
};

api.log = log;
api.debug = DEBUG;
api.debugLevels = DEBUG_LEVELS;
api.debugLevel = DEBUG_LEVEL;

api.publish = (topic, msg) => {
  //log(src, 'publish', topic)

  // noop if not an internal app file
  // TODO: hmmm
  const isMain = window.location.protocol == 'file:';
  if (!isMain) {
    return;
  }

  ipcRenderer.send('publish', {
    topic,
    data: msg,
  });
};

api.subscribe = (topic, callback) => {
  //log(src, 'subscribe', topic)

  // noop if not an internal app file
  // TODO: hmmm
  const isMain = window.location.protocol == 'file:';

  if (!isMain) {
    // TODO: error
    return;
  }

  const replyTopic = `${Date.now()}`;

  ipcRenderer.send('subscribe', {
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
