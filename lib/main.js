//const {Cc, Ci, Cu, Cm} = require('chrome')
const { Hotkey } = require('hotkeys')
const { Panel } = require('panel')
const Data = require('self').data
const Prefs = require('preferences-service')
const Tabs = require('tabs')

const TAB_PREF = 'browser.tabs.loadDivertedInBackground'
const COMBO = 'alt-shift-'

let inited,
    lastPrefVal,
    windowHeight,
    windowWidth

let hotkey = Hotkey({
  combo: 'accel-shift-o',
  onPress: function() {
    getPanel(Data.url('panel.html')).show()
  }
})

function getPanel(url) {
  let panel = Panel({
    contentURL: url || 'about:blank',
    height: 600,
    width: 800,
    /*
    height: getPanelDimension(windowHeight),
    width: getPanelDimension(windowWidth),
    */
    contentScriptFile: Data.url('panel.js'),
    contentScriptWhen: 'ready',
    onShow: function() {
      lastPrefVal = Prefs.get(TAB_PREF)
      if (lastPrefVal === false)
        Prefs.set(TAB_PREF, true)
    },
    onHide: function() {
      if (lastPrefVal !== undefined && lastPrefVal != Prefs.get(TAB_PREF))
        Prefs.set(TAB_PREF, lastPrefVal)
      panel.destroy()
    }
  })
  return panel;
}

function getPanelDimension(amount) Math.round(amount * 0.9)

/*
// Window resize event handler
function onResize(msg) {
  windowHeight = msg.height;
  windowWidth = msg.width;

  // Initializing on the first received resize event ensures
  // that it occurs for both running and startup installs.
  if (!inited)
    inited = true;
}

// When a tab activates, attach our content script
// and remove when deactivated. Content script is for:
// - getting window size
function onTabActivate(tab) {
  let worker = tab.attach({
    contentScriptFile: Data.url('content.js'),
    contentScriptWhen: 'ready'
  });
  worker.port.on('resize', onResize);
  tab.on('deactivate', function(tab) {
    worker.destroy();
  });
}

// INITIALIZE
// Handle current tab activation manually in case we're installed
// in a running instance. This gets us initial window size which
// triggers initial filling of cache.
onTabActivate(Tabs.activeTab);

// Listen for tab switching so we always have a resize handler
// TODO: might be a window-level way of doing this nowadays
Tabs.on('activate', onTabActivate);
*/
