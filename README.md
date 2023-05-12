# Peek

Please meet Peek, a web user agent application designed for using the web where, when and how you want it.

** WARNING: THIS IS VACATIONWARE **

* Peek is not a web browser! Yet! And likely never will be a browser as you would expect from browsers to date. There are no tabs, and no windows in the tabbed-browser-like sense of them. If that's what you're looking for, there are a few decent browsers for you to choose from.
* Peek is not safe for general use yet! It is a crude proof of concept I whipped up while on vacation. While I have thoughts on security model and user interface, I have not written it up into a proper security model yet.

<img width="969" alt="CleanShot 2023-04-03 at 18 50 22@2x" src="https://user-images.githubusercontent.com/50103/229501558-7084d66e-962a-4c0f-a10e-11787ef3ce68.png">

## Design

Many user tasks on the web are either transient, chained or persistent, data oriented, or some mix of those. The document-oriented web does not meet those needs. Major browser vendors can't meet those needs well, for many reasons.

* transient
* chained
* persistent
* data oriented

About this space:
* Embrace the app-ness aspect of the web platform, less about the document-ness
* Javascript is ok here
* Decouple html+js+css from http+dns+ssl - not entirely, but that trust+security model is not a required starting point

## Features

You can use Peek in a few ways, with more coming:

* Peeks - Keyboard activated modal chromeless web pages
* Slides - Keyboard or gesture activated modal chromeless web pages which slide in from any screen edges
* Scripts - Scripts periodically executed against a web page in the background which extract data and notify on changes

In progress:
* Commands
* Groups

### Peeks

Peeks are keyboard activated modal chromeless web pages mapped to `Opt+0-9` and closed on blur, the `Escape` key or `cmd/ctrl+w`.

### Slides

Slides are gesture activated modal chromeless web pages which slide in from left/right/bottom/top, and closed on blur, the `Escape` key or `cmd/ctrl+w`.

### Scripts

Scripts periodically load a web page in the background and extract data matching a CSS selector, stores it, and notify the user when the resulting data changes.

Ok, so not really "scripts" yet. But safe and effective enough for now.

## Why

Some thoughts driving the design of Peek:

* Web user agents should be bounded by the user, not browser vendor business models
* Windows and tabs should have died a long time ago, a mixed metaphor constraining the ability of the web to grow/thrive/change and meet user needs
* Security user interface must be a clear articulation of risks and trade-offs, and users should own the decisions

## Design

* Escape IZUI
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
* Definitely planning on a mobile app which syncs and runs your peeks/slides/scripts
* I'd like to have a decentralized compute option for running your scripts outside of your clients and syncing the data
* Want cloud storage for all config and data, esp infinite history, so can do fun things with it

### Desktop App

Proof of concept is Electron. By far the best option today for cross-platform desktop apps which need a web rendering engine. There's really nothing else remotely suited (yet).

The user interface is just Tweakpane panels and modal chromeless web pages rn.

TODO
* Need to look at whether could library-ize some of what Agregore implemented for non-HTTP protocol support.
* Min browser might be interesting as a forkable base to work from and contribute to, if they're open to it. At least, should look more at the architecture.

### Usage

* Settings
  * In app, `cmd/ctl+r,` or launch app to open settings, or click tray
  * Configure Peeks/Slides/Scripts in settings
* Peeks
  * `Opt+0-9` to open Peeks
* Slides
  * `Opt+←→↑↓` to open Slides

### Mobile

* Quick access to Script output and manual runs, as widgets (or output from cloud runners?)
* Peeks still totes useful here - on mobile is more like "quick dial" features

### Cloud

* Going full crypto payments for distributed compute on this one.

## Roadmap

Core moduluarization
* ✅ Modularize feature types, eyeing the extensibility model
* ✅ move settings window to features/settings

App cleanup
* ✅ main window vs settings
* ✅ change settings shortcut from global+esc to opt+comma

Window lifecycle
* ✅ modularize window open/close + hidden/visible
* ✅ update settings, peeks, slides, scripts
* ✅ hide/show window vs create fresh
* ✅ update slides impl to use openWindow (x, y)
* add support for private properties
* figure out distinction for feature window explicit config vs settings window silent config
* add window position persistence where it makes sense (settings, groups, cmd)
* add window size persistence where it makes sense (slides, peeks)
* add window open animation (to/from coords, time) to openWindow
* update slides impl to use animation again

Minimal Electron + Maximal Web
* tl;dr: move features to all web code, with a couple special apis
* make globalShortcut an api like openWindow
* how to load/address features
  * manifests for feature metadata
  * feature urls
  * eg peek://settings(/index.html)
    * maybe fine to file urls for now?
    * would have to migrate storage etc later
  * hidden window calling preload web api
* create core app
  * core settings
  * registers other features
  * stores central app action history
* move all features to web implementation
  * move all code from the electron file to the web app
  * per-feature settings storage & ui
  * feature api to open settings window?
  * move to web implemented globalShortcut
  * move to web implemented openWindow
* history
  * implement pubsub api
  * push navigations out through pubsub
  * add history storage to cmd
* how can other features query history?
  * feature level rpc?

Core/Basic
* ✅ basic command bar to open pages
* ✅ fix setting layout wrapping issue
* log app action metadata, push out through pubsub
* enable/disable individual slides, peeks
* enable/disable individual scripts
* store content script data

Features cleanup
* enable/disable whole features
* move feature list and enablement to storage
* configurable default feature to load on app open (or none)
* re-enable label previews, eg "Peek {key} - {address}"

Deployment
* app updates
* profiles?
  * per build prob fine for now
  * switcher


-> mvp (minimum viable preview)

-------

Window layout
* try with settings maybe?

Web Platform
* need a web loader that's not full BrowserWindow?
* sandboxing
* blocklist

After that
* schema migration
* Extension model?
* Ubiquity-like
* Panorama-like
* Tray
* Scratchpad
* Identity
* Contacts
* Collaboration

Further
* Implement the Firefox "awesomebar" scoring and search algorithm so that Peek *learns* you
* Extension model designed for web user agent user interface experimentation
* Infinite lossless personal encrypted archive of web history

## Contribution

* in proto stage
* all dragons, no promises

## Development

```
yarn install
yarn start
```

## Resources

Agregore ext protocol impl
* where all are registered: https://github.com/AgregoreWeb/agregore-browser/blob/master/app/protocols/index.js#L74
* how convert the fetch APIs to be compatible with the streaming protocol handler API in electron: https://github.com/AgregoreWeb/agregore-browser/blob/master/app/protocols/fetch-to-handler.js
* where register IPFS: https://github.com/AgregoreWeb/agregore-browser/blob/electron-23/app/protocols/ipfs-protocol.js

Browsers
* Min browser architecture - https://github.com/minbrowser/min/wiki/Architecture
* Dot browser https://www.dothq.org/en-US

Misc
* https://github.com/Rajaniraiyn/awesome-electron-browsers
* https://github.com/mawie81/electron-window-state
* https://antonfisher.com/posts/2020/12/27/how-to-animate-native-electron-window/
* https://stackoverflow.com/questions/44818508/how-do-i-move-a-frameless-window-in-electron-without-using-webkit-app-region

## History

In working on Firefox and related things at Mozilla from 2006 - 2019, there were a few specific initiatives which best aligned with my needs as a user on the web:

* The Awesomebar: infinite history + personalized local search index
* Ubiquity: Natural language commands + chaining
* Jetpack: The Mozilla Labs version - web-platfrom-centric extensibility
* Panorama: née TabCandy, web pages as groups instead of tabs in windows

A few others which were in the right direction but didn't achieve their optimal form:

* Greasemonkey
* Microsummaries
* Contacts extension

The first version of the Peek application has some bits of each of these, and the original Peek browser extension.

### Peek browser extension

Peek was a browser extension that let you quickly peek at your favorite web pages without breaking your flow - loading pages mapped to keyboard shortcuts into a modal window with no controls, closable via the `Escape` key.

However, as browser extension APIs became increasingly limited, it was not possible to create a decent user experience and I abandoned it. You can access the extension in this repo [in the extension directory](/autonome/peek/extension/).

The only way to create the ideal user experience for a web user agent that *Does What I Want* is to make it a browser-ish application, and that's what Peek is now.



## Testcase: Authoring Flows

* author web content
* pull in bits from the web
* share preview for feedback
* publish (or at least get output)

writing the recap of the web track at ipfs thing 2023

- make a new markdown doc
- sections titled for each video title
- each video's embode code in each section
- navigate around the document for review and updates
- need to easily preview rendered content
- share preview link
- publish somewhere
