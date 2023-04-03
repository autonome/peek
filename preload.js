console.log('preload');
const {app, contextBridge, ipcRenderer} = require('electron')

let api = {};

api.onConfigChange = callback => {
  ipcRenderer.on('configchange', (ev, msg) => {
    callback(msg);
  });
};

api.getConfig = new Promise((resolve, reject) => {
  // TODO: race potential
  ipcRenderer.once('config', (ev, msg) => {
    resolve(msg);
  });
  ipcRenderer.send('getconfig');
});

api.setConfig = cfg => {
  //console.log('preload: setConfig', cfg);
  ipcRenderer.send('setconfig', cfg);
};

contextBridge.exposeInMainWorld('app', api);

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency])
  }
});

window.addEventListener('keyup', e => {
  if (e.key == 'Escape') {
    ipcRenderer.send('esc', '');
  }
});

