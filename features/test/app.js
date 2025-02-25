console.log('test');

/*

- windows
  - open window / is open
  - close window / is closed
  - hide window / is hidden
  - show window / is visible
  - move window / is moved
  - open hidden window
  - open web child window / is open
  - close web child window is closed
  - test ESC to close
  - test blur to close (and optional)
  - target singleton

  - multiple windows
  - commands routed to correct window

  - test window names
*/

const api = window.app;
const debug = api.debug;
const clear = false;

// maps app id to BrowserWindow id (background)
const windows = new Map();

const testShortcut = () => {
  const shortcut = 'Opt+0';
  api.shortcuts.register(shortcut, () => {
    console.log('shortcut executed');
    api.shortcuts.unregister(shortcut, () => {
      console.log('shortcut unregistered');
    });
    console.log('shortcut registered');
  });
};

const testOpenCloseWindow = f => {
  console.log('test open/close window');

  const url = 'http://localhost/';
  const target = `prefix:${Date.now()}`;
  const params = {};

  const w = window.open(url, target, {});
  console.log('window is closed', w.closed);

  /*
  w.onload = () => { console.log('onload'); };
  w.onclose = () => { console.log('onclose'); };
  */

  //api.window.close('_self');
  api.window.close(target);
  console.log('window is closed', w.closed);

  /*
  // test hide/show window
  api.modifyWindow(target, {
    hide: true
  });
  */

  /*
  setTimeout(() => {
    w.close();
  }, 1000);
  */

  /*
  setTimeout(() => {
    window.app.closeWindow(target, r => {
      console.log('closeWindow() resp', r);
    });
  }, 3000);
  */

};

const testPubSub = () => {
  console.log('test pubsub');

  const topic = 'foo';
  const msg = { value: 'bar' };

  // Listen for system- or feature-level requests to open windows.
  window.app.subscribe(topic, msg => {
    console.log('received', msg.value === msg.value);
  });

  // main process uses these for initialization
  window.app.publish(topic, msg, window.app.scopes.SYSTEM);
  console.log('published');
};

// unused, worth testing more tho
const initIframeFeature = file => {
  const pathPrefix = 'file:///Users/dietrich/misc/peek/';
  console.log('initiframe');
  const i = document.createElement('iframe');
  const src = pathPrefix + file;
  console.log('iframe src', src);
  document.body.appendChild(i);
  i.src = src;
  console.log('iframe inited');
  i.addEventListener('load', () => {
    console.log('iframe loaded');
  });
};

const init = () => {
  console.log('init');
  
  testOpenCloseWindow();
};

window.addEventListener('load', init);

/*
const odiff = (a, b) => Object.entries(b).reduce((c, [k, v]) => Object.assign(c, a[k] ? {} : { [k]: v }), {});

const onStorageChange = (e) => {
  const old = JSON.parse(e.oldValue);
  const now = JSON.parse(e.newValue);

  const featureKey = `${id}+${storageKeys.FEATURES}`;
  //console.log('onStorageChane', e.key, featureKey)
  if (e.key == featureKey) {
    //console.log('STORAGE CHANGE', e.key, old[0].enabled, now[0].enabled);
    features().forEach((feat, i) => {
      console.log(feat.title, i, feat.enabled, old[i].enabled, now[i].enabled);
      // disabled, so unload
      if (old[i].enabled == true && now[i].enabled == false) {
        // TODO
        console.log('TODO: add unloading of features', feat)
      }
      // enabled, so load
      else if (old[i].enabled == false && now[i].enabled == true) {
        initFeature(feat);
      }
    });
  }
	//JSON.stringify(e.storageArea);
};

window.addEventListener('storage', onStorageChange);
*/
