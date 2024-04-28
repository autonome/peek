# Peek

Please meet Peek, a web user agent application designed for using the web where, when and how you want it.

** WARNING: THIS IS VACATIONWARE **

- Peek is not a web browser! Yet! And likely never will be a browser as you would expect from browsers to date. There are no tabs, and no windows in the tabbed-browser-like sense of them. If that's what you're looking for, there are a few decent browsers for you to choose from.
- Peek is not safe for general use yet! It is a crude proof of concept I whipped up while on vacation. While I have thoughts on security model and user interface, I have not written it up into a proper security model yet.

<img width="969" alt="CleanShot 2023-04-03 at 18 50 22@2x" src="https://user-images.githubusercontent.com/50103/229501558-7084d66e-962a-4c0f-a10e-11787ef3ce68.png">

## Design

Many user tasks on the web are either transient, chained or persistent, data oriented, or some mix of those. The document-oriented web does not meet those needs. Major browser vendors can't meet those needs well, for many reasons.

- transient
- chained
- persistent
- data oriented

About this space:
- Embrace the app-ness aspect of the web platform, less about the document-ness
- Javascript is ok here
- Decouple html+js+css from http+dns+ssl - not entirely, but that trust+security model is not a required starting point

## Features

You can use Peek in a few ways, with more coming:

- Peeks - Keyboard activated modal chromeless web pages
- Slides - Keyboard or gesture activated modal chromeless web pages which slide in from any screen edges
- Scripts - Scripts periodically executed against a web page in the background which extract data and notify on changes

In progress:
- Commands
- Groups

Thinking about:
- "native" web apps

### Peeks

Peeks are keyboard activated modal chromeless web pages mapped to `Opt+0-9` and closed on blur, the `Escape` key or `cmd/ctrl+w`.

### Slides

Slides are gesture activated modal chromeless web pages which slide in from left/right/bottom/top, and closed on blur, the `Escape` key or `cmd/ctrl+w`.

### Scripts

Scripts periodically load a web page in the background and extract data matching a CSS selector, stores it, and notify the user when the resulting data changes.

Ok, so not really "scripts" yet. But safe and effective enough for now.

## Why

Some thoughts driving the design of Peek:

- Web user agents should be bounded by the user, not browser vendor business models
- Windows and tabs should have died a long time ago, a mixed metaphor constraining the ability of the web to grow/thrive/change and meet user needs
- Security user interface must be a clear articulation of risks and trade-offs, and users should own the decisions

## User values

- users can move, resize, change to their requirements
  - eg, browsers restrict minheight of a window, but i should be able make as short as i like

## Design patterns

Escape IZUI
* IZUI: inverse zooming user interface
* ZUIs navigate by starting from a known root and user navigates by zooming ever further in
* Escape starts anywhere, and instead of navigating by zooming in, all interfaces can zoom out to reset
* allows unbounded and diverse entry points with predictable behavior
* consistent path to familiar ground

Escape navigation model
* navigation base can start at any level in stack
* forward navigations are added on top of stack
* backwards navigations walk the stack in reverse 

## Architecture / Implementation

Peek is designed to be modular and configurable around the idea that parts of it can run in different environments.

For example:
- Definitely planning on a mobile app which syncs and runs your peeks/slides/scripts
- I'd like to have a decentralized compute option for running your scripts outside of your clients and syncing the data
- Want cloud storage for all config and data, esp infinite history, so can do fun things with it

### Desktop App

Proof of concept is Electron. By far the best option today for cross-platform desktop apps which need a web rendering engine. There's really nothing else remotely suited (yet).

The user interface is just Tweakpane panels and modal chromeless web pages rn.

TODO
- Need to look at whether could library-ize some of what Agregore implemented for non-HTTP protocol support.
- Min browser might be interesting as a forkable base to work from and contribute to, if they're open to it. At least, should look more at the architecture.

### Usage

- Settings
  * In app, `cmd/ctl+r,` or launch app to open settings, or click tray
  * Configure Peeks/Slides/Scripts in settings
- Peeks
  * `Opt+0-9` to open Peeks
- Slides
  * `Opt+←→↑↓` to open Slides

### Mobile

- Quick access to Script output and manual runs, as widgets (or output from cloud runners?)
- Peeks still totes useful here - on mobile is more like "quick dial" features

### Cloud

- Going full crypto payments for distributed compute on this one.

## Papercut / use-case log

core
- open a web page on top/bottom/left/right
- keep web pages persistent in the background
- quickly open a web page modally, and close it

- open bandcamp in a window, move over to 2nd display, accidently close it while moving around between other windows
- recent books or recipes from newsletters i subscribe to (but probably didn't read)
- extract a table from a page periodically, send it somewhere as csv or whatever (chained actions)
- collect microformats, metadata, events
- web page w/ some locations as an input to a map (creates overlay) "map this page"
- be able to see where a book/etc recommendation came from
- save a tweet, with URL / image / relevant text, but not whole page webrecorder style

Content scripts
- extract+log shazams
- extract+log spotify playlist

Workflow deconstructing a "why" task flavour of bookmarking
- save https://www.criterionchannel.com/hong-kong-in-new-york
- extract the movies
- get reference metadata for each (?!)
- add to "to watch list", with pointer back to source url

## Roadmap

## v0.1 - MVPOC

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

## v0.2 - MVCP (minimum viable concept preview)

minimum viable concept preview.

question: would others use this?

Windows/system
- [x] app showing in dock even tho disabled
- [x] app not showing in tray, even tho enabled
- [x] all api calls get source attached
- [x] window cache s/custom/map/
- [x] window cache all windows not just persistent
- [x] window cache - evaluate key approach (use-case: apps need to identify windows they open)
- [x] always return window id, so apps can manage it
- [ ] reimplement keys, so much easier for callers than managing ids

Feature lifecycle (un/install and reloads)
- [x] feature unload/reload - init/uninit whole feature and window
- [x] all api calls have address accessible by preload
- [ ] implement lifecycle events (eg webext or serviceworker?)
- [ ] close other windows of feature, not just background window
    - track windows in origin groups?
- [ ] unregister all shortcuts at shutdown

Figure out re-init/reload story when pref/feature change is saved
- eg: extension lifecycle events and sw lifecycle events
- can leave to the apps? eg document.reload()? likely not for OS level stuff
- could do a storage change listener, but all kinds of reasons why you *wouldn't* do full reload...
- preload could register window + thing (eg kb listener) and listen for feature-disable events
- ok so basically do at api level

Shortcut lifecycle
- [ ] main process should handle multiple registrations
- [ ] send feature id/origin w/ each registration
- [ ] unreg shortcuts on unload
- confirm sucessful registration
- send pubsub msgs on shortcut reg/unreg with feature id
- in core/bg, listen for regs and map to feature
- then on feature uninstall, unreg

Features clean themselves up for lifecycle events
- [ ] actually load/unload peeks when enabled/disabled
- [ ] actually load/unload slides when enabled/disabled
- [ ] actually load/unload scripts when enabled/disabled

Peeks/Slides
- [ ] only register shortcut and create window if a URL is configured
- [ ] ensure unreg/closure on unconfigure
- [ ] ensure unreg/closure on feature enable/disable

Cmd
- [ ] fix it

Settings
- [x] fix window size
- [x] transparency
- [ ] core settings re-render on feature toggle?
- [ ] default position (size to screen)

Daily driver blockers
- [x] debug vs profile(s) for app dir
- [x] fix ESC not working right
- [x] fix ESC not working in web content
- [x] fix ESC not working right over lil-gui

Deployment
- [ ] app updates
- [ ] icons
- [ ] about page

Demo scenario
- [ ] Peeks: translate, calendar, ai chat, currency conversion, everytimezone, tldraw
- [ ] Slides: soundcloud, crypto prices, notepad, todo list
- [ ] Scripts: eth price, weather change

### v0.2 - extensibility / remember shit

DX papercuts
- [ ] why crashing on reload main
- [ ] devtools stealing focus
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
- [ ] language: call them feature or apps? other?

Focus vs not focused app mode
- [ ] openWindow option to not close on escape (perma windows w/ controls)
- [ ] app focus detection in shortcuts
- [ ] separate global shortcuts from app shortcuts (eg quit)
- [ ] all-window show/hide when doing global shortcuts while app unfocused

Dev niceties
- [ ] figure out single devtools window if possible

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

## Contribution

- in proto stage
- all dragons, no promises

## Development

```
yarn install
yarn debug
```

## Mobile

- some of the features don't make sense as-is on mobile
- but maybe quick access on mobile to slides/peeks would be nice
- and seeing output of content scripts, or ability to re-run locally on demand
- needs some sync facility (inevitable anyway)

## Resources

Agregore ext protocol impl
- where all are registered: https://github.com/AgregoreWeb/agregore-browser/blob/master/app/protocols/index.js#L74
- how convert the fetch APIs to be compatible with the streaming protocol handler API in electron: https://github.com/AgregoreWeb/agregore-browser/blob/master/app/protocols/fetch-to-handler.js
- where register IPFS: https://github.com/AgregoreWeb/agregore-browser/blob/electron-23/app/protocols/ipfs-protocol.js

Browsers
- Min browser architecture - https://github.com/minbrowser/min/wiki/Architecture
- Dot browser https://www.dothq.org/en-US

Misc
- https://github.com/Rajaniraiyn/awesome-electron-browsers
- https://github.com/mawie81/electron-window-state
- https://antonfisher.com/posts/2020/12/27/how-to-animate-native-electron-window/
- https://stackoverflow.com/questions/44818508/how-do-i-move-a-frameless-window-in-electron-without-using-webkit-app-region

## History

In working on Firefox and related things at Mozilla from 2006 - 2019, there were a few specific initiatives which best aligned with my needs as a user on the web:

- The Awesomebar: infinite history + personalized local search index
- Ubiquity: Natural language commands + chaining
- Jetpack: The Mozilla Labs version - web-platfrom-centric extensibility
- Panorama: née TabCandy, web pages as groups instead of tabs in windows

A few others which were in the right direction but didn't achieve their optimal form:

- Greasemonkey
- Microsummaries
- Contacts extension

The first version of the Peek application has some bits of each of these, and the original Peek browser extension.

### Peek browser extension

Peek was a browser extension that let you quickly peek at your favorite web pages without breaking your flow - loading pages mapped to keyboard shortcuts into a modal window with no controls, closable via the `Escape` key.

However, as browser extension APIs became increasingly limited, it was not possible to create a decent user experience and I abandoned it. You can access the extension in this repo [in the extension directory](/autonome/peek/extension/).

The only way to create the ideal user experience for a web user agent that *Does What I Want* is to make it a browser-ish application, and that's what Peek is now.



## Testcase: Authoring Flows

- author web content
- pull in bits from the web
- share preview for feedback
- publish (or at least get output)

writing the recap of the web track at ipfs thing 2023

- make a new markdown doc
- sections titled for each video title
- each video's embed code in each section
- navigate around the document for review and updates
- need to easily preview rendered content
- share preview link
- publish somewhere
