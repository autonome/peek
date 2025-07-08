# Roadmap

## v0.2 - MVCP (minimum viable concept preview)

minimum viable concept preview.

question: can others try this?

Windows/system
- [x] app showing in dock even tho disabled
- [x] app not showing in tray, even tho enabled
- [x] all api calls get source attached
- [x] window cache s/custom/map/
- [x] window cache all windows not just persistent
- [x] window cache - evaluate key approach (use-case: apps need to identify windows they open)
- [x] always return window id, so apps can manage it
- [x] reimplement keys, so much easier for callers than managing ids
- [x] account for number of renderer processes (seems double?)

redo window system to be more webby
- [x] prototype window.open
- [x] evaluate webContents.setWindowOpenHandler
- [x] stop using openWindow to show pre-existing hidden windows?
  - [x] can track web windows locally
  - [x] can identify web windows on both sides (key/name)
  - [x] add new custom api for windows superpowers
- [x] collapse window opening to span both approaches
- [x] finish converting all openWindow to window.open

Feature lifecycle (un/install and reloads)
- [ ] feature unload/reload - init/uninit whole feature and window
- [ ] track shortcuts by source, remove when unloaded
- [ ] main: track window sources
- [ ] main: close child windows when (before) closing source window
- [ ] all features correctly load/unload from settings toggle

Shortcut lifecycle
- [x] main process should handle multiple registrations correctly
- [x] send/track feature id/origin w/ each registration
- [ ] unreg shortcuts on unload

Window features
- [x] add back in window features to window.open
  - [x] show/hide (keep alive)
  - [x] transparent
- [ ] enable global window resize
- [ ] add draggable as pref (draggable as default)

Features clean themselves up for lifecycle events
- [ ] load/unload peeks when enabled/disabled
- [ ] load/unload slides when enabled/disabled
- [ ] load/unload scripts when enabled/disabled

Peeks/Slides
- [x] only register shortcut and create window if a URL is configured
- [ ] unreg shortcuts and close windows on peek un/configure
- [ ] unreg shortcuts and close windows on slides un/configure

Cmd
- [ ] update to latest Cmd extension code
- [ ] app-scoped multi-window pages open

Settings
- [x] fix window size
- [x] transparency
- [ ] core settings re-render on feature toggle, eg feature-settings link enabled
- [ ] default position (size to screen)

Daily driver blockers
- [x] debug vs profile(s) for app dir
- [x] fix ESC not working right
- [x] fix ESC not working in web content
- [x] fix ESC not working right over lil-gui
- [ ] ESC not working when a page doesn't load for any reason

Dev stuff
- [x] figure out single devtools window if possible

Deployment
- [ ] app updates
- [ ] icons
- [ ] about page

Demo reel
- [ ] Peeks: translate, calendar, ai chat, currency conversion, everytimezone, tldraw
- [ ] Slides: soundcloud, crypto prices, notepad, todo list
- [ ] Scripts: eth price, weather change

Survival
- [ ] Settings feature to blow away local datastore
- [ ] Schema versioning
- [ ] Export config to file
- [ ] Import config from file

Tests
- [ ] stacked defaults file
- [ ] import file
- [ ] run app-specific test suites (in app sub dir)
- [ ] run full test suite

## Unprioritized future

Backburner wishlist
- [ ] window switching order algo

DX papercuts
- [ ] why crashing on reload main
- [ ] devtools stealing focus, put in backround
- [ ] unified floating devtools

Window features
- [x] add transparency support to api
- [ ] distentangle transparency and content-fit
- [ ] add the rest of that shit

App mgmt
- [ ] uniform policy for feature id creation (lean on web/extensions)
- [ ] collisions

App dev
- [ ] app model - web? extension? P/IWA? other?
- [ ] shared libs, eg utils
- [ ] language: call them feature or apps? other? extensions? mods?

Focus vs not focused app mode
- [ ] openWindow option to not close on escape (perma windows w/ controls)
- [ ] app focus detection in shortcuts
- [ ] separate global shortcuts from app shortcuts (eg quit)
- [ ] all-window show/hide when doing global shortcuts while app unfocused

Install/load/address features
- [x] built-in feature loading from origin not file
- [x] app protocol? webextension? pwa? wtf?
- [ ] combine settings and background in built-in features?
    - eg, features can have default ui + bg services?
- [ ] pull from manifest (load/install via manifest with special key?)
- [ ] manifests for feature metadata
- [ ] feature urls? eg peek://settings(/index.html)
- [ ] feature metadata in manifest
- [ ] move feature bg pages to iframes in core bg page?

Settings
- [ ] make it so start feature can be unset (eh)

Navigation
- [ ] make izui stack manager (part of window mgr?)
- [ ] esc stack: from feature settings back to core settings
- [ ] add to izui stack (and ix w/ history?)

Window animations
- [ ] add window open animation (to/from coords, time) to openWindow
- [ ] update slides impl to use animation again

Window controls/persistence/etc (after perma window)
- [ ] window position persistence where it makes sense (settings, groups, cmd) and make configurable?
- [ ] window size persistence where it makes sense (slides, peeks) and make configurable?
- [ ] window controls
- [ ] window resizers

History
- [ ] push navigations out through pubsub?
- [ ] add history listener + storage to cmd
- [ ] store central app action history
- [ ] store content script data

Feature level rpc?
- [ ] how can other features query history vs store and query locally?
- [ ] how to know what urls there are to open? publish paths in manifests?
- [ ] discover + execute cmds?
- [ ] need to be able to get/set properties from other "features"?

Window layout
- [ ] try with settings maybe?
- [ ] tile/untile

Web Platform
- [ ] need a web loader that's not full BrowserWindow?
- [ ] sandboxing
- [ ] blocklist

After that
- [ ] schema migration
- [ ] Extension model?
- [ ] Ubiquity-like
- [ ] Panorama-like
- [ ] Tray
- [ ] Scratchpad
- [ ] Identity
- [ ] Contacts
- [ ] Collaboration

Further
- [ ] Implement the Firefox "awesomebar" scoring and search algorithm so that Peek *learns* you
- [ ] Extension model designed for web user agent user interface experimentation
- [ ] Infinite lossless personal encrypted archive of web history

## ✅ v0.1 - MVPOC

minimum viable proof of concept.

question: would i use this?

Core moduluarization
- [x] Modularize feature types, eyeing the extensibility model
- [x] move settings window to features/settings

App cleanup
- [x] main window vs settings
- [x] change settings shortcut from global+esc to opt+comma

Window lifecycle
- [x] modularize window open/close + hidden/visible
- [x] update settings, peeks, slides, scripts
- [x] hide/show window vs create fresh
- [x] update slides impl to use openWindow (x, y)

Minimal Electron + Maximal Web
- [x] move features to all web code, with a couple special apis
- [x] make globalShortcut an api like openWindow

Create core app
- [x] core settings
- [x] registers other features

Move all features to web implementation
- [x] move all possible code from the electron file to the web app
- [x] move to web implemented globalShortcut
- [x] move to web implemented openWindow
- [x] move settings re-use code to utils lib
- [x] ability to add clickable links in settings panes
- [x] add links to Settings app
- [x] per-feature settings ui

Core+settings
- [x] move feature list and enablement to storage
- [x] merge core + settings
- [x] enable/disable features
- [x] configurable default feature to load on app open (default to settings)
- [x] wire up tray icon to pref
- [x] tray click opens default app

Core/Basic
- [x] basic command bar to open pages
- [x] fix setting layout wrapping issue

Commands/messaging
- [x] implement pubsub api
- [x] way to tell feature to open default ui (if there is one)
- [x] way tell feature to open its settings ui (if there is one)

Features cleanup
- [x] enable/disable individual slides, peeks
- [x] enable/disable individual scripts

Internal cleanup
- [x] s/guid/id/
- [x] fix label names, match to pwa manifest
- [x] put readable log labels back in

