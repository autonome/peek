console.log('preload');

const {
  contextBridge,
  ipcRenderer
} = require('electron')

ipcRenderer.on('window', (ev, msg) => {
  console.log('preload: onwindow', msg);
  const { type, id, data } = msg;
  if (type == 'main') {
    handleMainWindow();
  }
});


// all window types close on escape
window.addEventListener('keyup', e => {
  if (e.key == 'Escape') {
    ipcRenderer.send('esc', '');
  }
});

let api = {};

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

contextBridge.exposeInMainWorld('app', api);

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
