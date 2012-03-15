/*

The new app tab feature in Firefox is great. I use it a lot... which has shown starkly how apps and tabs have completely different use-cases and usage patterns. Often I will check my Gmail app tab because I see the glowing notification that a new email has arrived, do something (or nothing), and then pop back to where I was browsing - in one of those 78 tabs I have open. Well, not "pop" really.

The windowing model in operating systems allows me to do this with ease. But app tabs do not:

* If I opened no new tabs while using Gmail, I can still see the last tab I was at, and click on it. But I'm force to use the mouse.
* Out of sheer muscle memory and mouse-averseness, sometimes I can traverse tabs via the next/previous-tab keyboard shortcuts to get back to where I was. Sometimes it's a *lot* of tabs, so either I'll hold the arrow key down, speeding past the tab I wanted, or I'll just hit that arrow key a bunch of times in quick succession. Both options are sub-optimal.
* Or I have to expend mental energy to search in the awesomebar and switch to that tab, which often looks like this: "hm, type 'bug' and then try to remember some words in the bug summary, but those words match a bunch of other bugs, and i don't know the bug number, and also I'm on an attachment page because I'm reviewing a patch on the bug, so the summary won't be in the page title..." and on and on.
* Then there's link opening. Links opened in app tabs are put at the beginning of the tab set, and the tab strip is animatedly scrolled there. Boom, already lost where I was before checking my email. We tried an experiment where they open at the end of the set of open tabs, but I found that to have serious "out of sight, out of mind" problems. That experiment was rolled back. Both approaches cause excess amounts of whizzing animations, either when you want to "go around the horn" to get to the tabs you just opened from app tabs, or when you want to go to them and then get back to where you were.
* And the biggest problem in my opinion: The user is not in control of where these links are opened. Part of me thinks that I actually might work best in a one-tab-group-per-app-tab world... but that's a vision for another day (and blog post and add-on!).


So I've tried to build a hybrid solution: Instead of making you go to your app tabs, your app tabs can come to you. Peek allows you to open your app tabs in a floating panel that opens on top of wherever you are in your tabs. Links open to the right of whatever your current active tab is, and in the background, so that when you're done peeking, you are exactly where you left off.

To use Peek, first create some app tabs. Then you can peek at them using the keyboard shortcut "ALT+SHIFT+1-9" where the number corresponds with the order your app tabs are in. To stop peeking, hit escape (or switch apps or anything else that takes focus away from the panel).

Features:
- be able to interact with your apps and go exactly back to where you left off browsing.
- links opened from app tabs are in context of... well, at least something! not at beginning or end of tabstrip, which gives you at least more control over where they end up.

*/

/*
TODO
- add a UI launcher somehow (drop button?)
- remove pinned tabs altogether!
*/

const {Cc, Ci, Cu, Cm} = require('chrome');
const { Hotkey } = require('hotkeys');
const { Panel } = require('panel-custom-frame');
const Data = require('self').data;
const Observers = require('observer-service');
const Prefs = require('preferences-service');
const Tabs = require('tabs');
const Timers = require('timer');
const Windows = require('windows').browserWindows;
const WinUtils = require("window-utils");

const TAB_PREF = 'browser.tabs.loadDivertedInBackground';
const COMBO = 'alt-shift-';

// 5 minutes
const INTERVAL = 1000 * 60 * 5; 

let inited,
    lastPrefVal,
    cache = [],
    windowHeight,
    windowWidth;

function getPanel() {
  let panel = Panel({
    contentURL: 'about:blank',
    height: getPanelDimension(windowHeight),
    width: getPanelDimension(windowWidth),
    contentScriptFile: Data.url('panel.js'),
    contentScriptWhen: 'ready',
    onShow: function() {
      lastPrefVal = Prefs.get(TAB_PREF);
      if (!lastPrefVal)
        Prefs.set(TAB_PREF, true);
    },
    onHide: function() {
      if (lastPrefVal != Prefs.get(TAB_PREF))
        Prefs.set(TAB_PREF, lastPrefVal);
    }
  });
  return panel;
}

function getPanelDimension(amount) Math.round(amount * 0.9)

// Build and cache hotkey+panels for each app tab
function setup() {
  // destroy existing hotkey+panel combos
  cache.forEach(function(hotkey) {
    hotkey.destroy();
  });
  cache = [];

  for (var i = 0; i < 10; i++) {
    var jetpackTab = Windows.activeWindow.tabs[i];
    if (jetpackTab && jetpackTab.isPinned) {
      let index = jetpackTab.index;
      let hotkeyNum = index == 9 ? 0 : (index + 1);
      let hotkey = Hotkey({
        // WTF - setting this to typo'd 'hotkeynum' doesn't throw!
        combo: (COMBO + hotkeyNum),
        onPress: function() {
          console.log('onPress(): index ', index);
          let panel = getPanel();
          //let oldFrame = panel.frame;
          //console.log('onPress(): oldFrame ', frame);
          let tabbrowser = WinUtils.activeBrowserWindow.gBrowser;
          let frame = tabbrowser.getBrowserAtIndex(index);
          console.log('onPress(): frame ', frame.currentURI.spec);
          panel.frame = frame;
          console.log('onPress(): new frame uri ', panel.frame.currentURI.spec);
          // need to support switching while panel is open
          panel.on('hide', function() {
            panel.frame = null;
            panel.destroy();
          });
          panel.show();
          console.log('onPress(): done');
        }
      });

      cache[i] = hotkey;
    }
  }
}

// Window resize event handler
function onResize(msg) {
  windowHeight = msg.height;
  windowWidth = msg.width;

  // Initializing on the first received resize event ensures
  // that it occurs for both running and startup installs.
  if (!inited) {
    setup();
    inited = true;
  }
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

// Handle current tab activation manually in case we're installed
// in a running instance. This gets us initial window size which
// triggers initial filling of cache.
onTabActivate(Tabs.activeTab);

// Listen for tab switching
Tabs.on('activate', onTabActivate);

let delegate = {
  onTrack: function (window) {
    if (window.document.documentElement.getAttribute('windowtype') == 'navigator:browser') {
      let container = window.gBrowser.tabContainer;
      container.addEventListener("TabPinned", setup, false);
      container.addEventListener("TabUnpinned", setup, false);
    }
  },
  onUntrack: function (window) {
    if (window.document.documentElement.getAttribute('windowtype') == 'navigator:browser') {
      let container = window.gBrowser.tabContainer;
      container.removeEventListener("TabPinned", setup, false);
      container.removeEventListener("TabUnpinned", setup, false);
    }
  }
};
new WinUtils.WindowTracker(delegate);
