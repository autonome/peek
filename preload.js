const d = msg => {
  ipcRenderer.send('console', msg);
};

const {
  contextBridge,
  globalShortcut,
  ipcRenderer
} = require('electron')

/*
const EventEmitter = require('node:events');
class LocalEmitter extends EventEmitter {};
const pubsub = new LocalEmitter();
*/

/*
ipcRenderer.on('window', (ev, msg) => {
  d('preload: onwindow', msg);
  const { type, id, data } = msg;
  if (type == 'main') {
    handleMainWindow();
  }
});
*/


// all visible window types close on escape
window.addEventListener('keyup', e => {
  if (e.key == 'Escape') {
    ipcRenderer.send('esc', '');
  }
});

let api = {};

api.shortcuts = {
  register: (shortcut, cb) => {
    console.log('registering', shortcut, 'for', window.location)
    const replyTopic = `${shortcut}`
    ipcRenderer.send('registershortcut', {
      shortcut,
      replyTopic
    });
    ipcRenderer.on(replyTopic, cb);
  },
  unregister: shortcut => {
    console.log('unregistering', shortcut, 'for', window.location)
    ipcRenderer.send('registershortcut', {
      shortcut
    });
  }
};

api.openWindow = (params, callback) => {
  console.log('openwindow', params, 'for', window.location)
  const replyTopic = 'huh';
  ipcRenderer.send('openwindow', {
    params,
    replyTopic
  });
  if (callback) {
    ipcRenderer.on(replyTopic, params.callback);
  }
};

/*
api.onConfigChange = callback => {
  // noop if not an internal app file
  const isMain = window.location.protocol == 'file:';
  if (!isMain) {
    return;
  }

  ipcRenderer.on('configchange', (ev, msg) => {
    callback(msg);
  });
};

api.getConfig = new Promise((resolve, reject) => {
  // noop if not an internal app file
  const isMain = window.location.protocol == 'file:';
  if (!isMain) {
    return;
  }

  // TODO: race potential
  ipcRenderer.once('config', (ev, msg) => {
    resolve(msg);
  });
  ipcRenderer.send('getconfig', {isMain});
});

api.setConfig = cfg => {
  // noop if not an internal app file
  const isMain = window.location.protocol == 'file:';
  if (!isMain) {
    return;
  }

  ipcRenderer.send('setconfig', cfg);
};

api.sendMessage = msg => {
  // noop if not an internal app file
  const isMain = window.location.protocol == 'file:';
  if (!isMain) {
    return;
  }

  ipcRenderer.send('sendmessage', msg);
};
*/

contextBridge.exposeInMainWorld('app', api);

window.addEventListener('load', () => {
  console.log('preloaded');
  d('preload loaded');
});


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
