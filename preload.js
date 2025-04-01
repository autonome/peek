const {
  contextBridge,
  ipcRenderer
} = require('electron');

const src = 'preload';
console.log(src, 'init', window);

const DEBUG = process.env.DEBUG || false;
const DEBUG_LEVELS = {
  BASIC: 1,
  FIRST_RUN: 2
};

const DEBUG_LEVEL = DEBUG_LEVELS.BASIC;
//const DEBUG_LEVEL = DEBUG_LEVELS.FIRST_RUN;

const APP_SCHEME = 'peek';
const APP_PROTOCOL = `${APP_SCHEME}:`;

const sourceAddress = window.location.toString();

const rndm = () => Math.random().toString(16).slice(2);

let api = {};

api.debug = DEBUG;
api.debugLevels = DEBUG_LEVELS;
api.debugLevel = DEBUG_LEVEL;

api.shortcuts = {
  register: (shortcut, cb) => {
    console.log(src, 'registering ' + shortcut + ' for ' + window.location)

    //const replyTopic = `${shortcut}:${window.location}`;
    const replyTopic = `${shortcut}${rndm()}`;

    ipcRenderer.send('registershortcut', {
      source: sourceAddress,
      shortcut,
      replyTopic
    });

    ipcRenderer.on(replyTopic, (ev, msg) => {
      console.log(src, 'shortcut execution reply');
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

api.closeWindow = (id, callback) => {
  console.log(src, ['api.closewindow', id, 'for', window.location].join(', '));

  const replyTopic = `${id}${rndm()}`;

  const params = {
    source: sourceAddress,
    id
  };

  ipcRenderer.send('closewindow', {
    params,
    replyTopic
  });

  ipcRenderer.once(replyTopic, (ev, msg) => {
    console.log(src, 'api.closewindow', 'resp from main', msg);
    if (callback) {
      callback(msg);
    }
  });
};

api.scopes = {
  SYSTEM: 1,
  SELF: 2,
  GLOBAL: 3
};

api.publish = (topic, msg, scope = api.scopes.SELF) => {
  console.log(sourceAddress, 'publish', topic)

  // TODO: c'mon
  if (!topic) {
    return new Error('wtf');
  }

  ipcRenderer.send('publish', {
    source: sourceAddress,
    scope,
    topic,
    data: msg,
  });
};

api.subscribe = (topic, callback, scope = api.scopes.SELF) => {
  console.log(src, 'subscribe', topic)

  // TODO: c'mon
  if (!topic || !callback) {
    return new Error('wtf');
  }

  const replyTopic = `${topic}:${rndm()}`;

  ipcRenderer.send('subscribe', {
    source: sourceAddress,
    scope,
    topic,
    replyTopic
  });

  ipcRenderer.on(replyTopic, (ev, msg) => {
    console.log('topic', topic, msg);
    msg.source = sourceAddress;
    try {
      callback(msg);
    }
    catch(ex) {
      console.log('preload:subscribe subscriber callback errored for topic', topic, 'and source', sourceAddress, ex);
    }
  });
};

api.window = {
  open: (url, options = {}) => {
    console.log('window.open', url, options);
    return ipcRenderer.invoke('window-open', {
      source: sourceAddress,
      url,
      options
    });
  },
  close: (id = null) => {
    console.log('window.close', id);
    if (id === null) {
      window.close();
      return;
    }
    return ipcRenderer.invoke('window-close', {
      source: sourceAddress,
      id
    });
  },
  hide: (id) => {
    console.log('window.hide', id);
    return ipcRenderer.invoke('window-hide', {
      source: sourceAddress,
      id
    });
  },
  show: (id) => {
    console.log('window.show', id);
    return ipcRenderer.invoke('window-show', {
      source: sourceAddress,
      id
    });
  },
  move: (id, x, y) => {
    console.log('window.move', id, x, y);
    return ipcRenderer.invoke('window-move', {
      source: sourceAddress,
      id,
      x,
      y
    });
  },
  focus: (id) => {
    console.log('window.focus', id);
    return ipcRenderer.invoke('window-focus', {
      source: sourceAddress,
      id
    });
  },
  blur: (id) => {
    console.log('window.blur', id);
    return ipcRenderer.invoke('window-blur', {
      source: sourceAddress,
      id
    });
  }
};

api.modifyWindow = (winName, params) => {
  console.log('modifyWindow(): window', winName, params);
  //w.name = `${sourceAddress}:${rndm()}`;
  console.log('NAME', winName);
  ipcRenderer.send('modifywindow', {
    source: sourceAddress,
    name: winName,
    params
  });
};

// unused
/*
api.sendToWindow = (windowId, msg) => {
  ipcRenderer.send('sendToWindow', {
    source: sourceAddress,
    id,
    msg
  });
};

api.onMessage = callback => {
  // TODO: c'mon
  if (!topic || !callback) {
    return new Error('wtf');
  }

  const replyTopic = `${topic}:${rndm()}`;

  ipcRenderer.send('subscribe', {
    source: sourceAddress,
    topic,
    replyTopic
  });

  ipcRenderer.on(replyTopic, (ev, msg) => {
    msg.source = sourceAddress;
    callback(msg);
  });
};
*/

contextBridge.exposeInMainWorld('app', api);
console.log(src, 'api exposed');

window.addEventListener('load', () => {
  console.log(src, 'load', window);
});

/*
const handleMainWindow = () => {
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

/*
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency])
  }
})
*/
