const {
  contextBridge,
  ipcRenderer
} = require('electron');

const src = 'preload';

const log = (source, text) => {
  ipcRenderer.send('console', {
    source,
    text
  });
};

/*
ipcRenderer.on('window', (ev, msg) => {
  console.log('preload: onwindow', msg);
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
  log(src, ['openwindow', JSON.stringify(params), 'for', window.location].join(', '));
  // TODO: won't work for features that open multiple windows
  const replyTopic = `${params.feature}${params.address}`;

  ipcRenderer.send('openwindow', {
    params,
    replyTopic
  });

  if (callback) {
    ipcRenderer.once(replyTopic, (ev, msg) => {
      log(src, 'resp from main');
      log(src, msg);
      callback(msg);
    });
  }
};

api.log = log;

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
