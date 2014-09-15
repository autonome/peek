//const {Cc, Ci, Cu, Cm} = require('chrome')
var { Hotkey } = require('sdk/hotkeys'),
    { Panel } = require('sdk/panel'),
    UI = require('sdk/ui'),
    { URL } = require('sdk/url'),
    Self = require('sdk/self'),
    Prefs = require('sdk/preferences/service'),
    AddonPrefs = require('sdk/simple-prefs'),
    TAB_PREF = 'browser.tabs.loadDivertedInBackground',
    COMBO_PREFIX = 'alt-shift-',
    lastPrefVal = null,
    hotkeys = [],
    windowHeight = null,
    windowWidth = null,
    BUTTON_TITLE = 'P'

let prefsPanel = Panel({
  contentURL: Self.data.url('prefs.html')
})

let button = UI.ActionButton({
  id: 'PeekPreferences',
  label: 'Peek Preferences',
  //contentURL: 'data:text/html,' + BUTTON_TITLE,
  icon: './icon.gif',
  onClick: function() {
    prefsPanel.show({
      position: button
    })
  }
})

// initialize
var savedText = AddonPrefs.prefs['urls']
processText(savedText)
prefsPanel.port.emit('text', savedText)

prefsPanel.port.on('text', function(text) {
  AddonPrefs.prefs['urls'] = text
  processText(text)
  prefsPanel.hide()
})

function processText(text) {
  var parts = text.split('\n'),
      urls = []

  parts.forEach(function(part) {
    try {
      var url = URL(part)
      urls.push(part)
    } catch(ex) {
      console.log('not a url', part)
    }
  })

  addHotkeys(urls)
}

function addHotkeys(urls) {
  hotkeys.forEach(function(entry) {
    entry.hotkey.destroy()
    entry.panel.destroy()
  })

  urls.forEach(function(url, i) {
    var panel = getPanel(url)
    hotkeys.push({
      hotkey: Hotkey({
        combo: COMBO_PREFIX + (i + 1),
        onPress: function() {
          panel.show()
        }
      }),
      panel: panel
    })
  })
}

function getPanel(url) {
  let panel = Panel({
    contentURL: url || 'about:blank',
    height: 600,
    width: 800,
    //height: getPanelDimension(windowHeight),
    //width: getPanelDimension(windowWidth),
    contentScriptFile: Self.data.url('panel.js'),
    contentScriptWhen: 'ready',
    onShow: function() {
      lastPrefVal = Prefs.get(TAB_PREF)
      if (lastPrefVal === false)
        Prefs.set(TAB_PREF, true)
    },
    onHide: function() {
      if (lastPrefVal !== undefined && lastPrefVal != Prefs.get(TAB_PREF))
        Prefs.set(TAB_PREF, lastPrefVal)
    }
  })
  panel.on('click-link', function() {
    panel.hide()
  })
  return panel;
}

function getPanelDimension(amount) Math.round(amount * 0.9)

//require('onWindowResize').windowSize()
