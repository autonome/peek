# Peek TODO

How we work:
- We track actionable items in this file
- This file is not for notes or description - link to documents in ./notes for that
- Checkbox states: `- [ ]` pending, `- [~]` in-progress, `- [x]` done
- We move completed items into the Done section at the bottom, grouped by week of year the items were completed

## Prioritization

Be able to use the app on mobile and desktop with the safety of knowing there's also at least one remote copy.

Today
- [~][desktop] fix better-sqlite3 node vs electron version mismatch
- [~][sync] investigate remaining sync edge cases
- [ ][mobile] pull-to-refresh triggers sync
- [ ][mobile] fix big bottom bar showing again
- [ ][sync] e2e sync test: desktop + mobile in prod, verify via railway logs
- [ ][desktop] daily data snapshots saved to compress archives in ~/sync/peek-backups

Later
- [ ][dekstop] first real look at the web page experience - see Page loading experience section
- [ ] tags on desktop
- [ ][desktop] access to notes on filesystem, syncing them as markdown files in ~/sync/Notes/peek
- [ ] profile/account switching in desktop and iOS 

## To process

Unclear / needs context:
- [ ] demo script (see use-case sticky)
- [ ] consolidate peek notes in signal to a peek note (copy all, have the robots format it)
- [ ] implement old context plan eg https://www.reddit.com/r/hackernews/comments/1qddidm/sun_position_calculator/
- [ ] step counter: app level interaction tracing/counting. when is reset? when does action end and new one start?
- [ ] tabstats for peek
- [ ] peeks/slides as tagged addresses with metadata properties?
- [ ] edgeworkernode/server vs what we got now (both?)

## Ready for triage

### Data Model & Multi-platform Unification

- [x] merge peek-node into peek repo (now at backend/server/)
- [x] resolve differences between mobile, node and desktop data models
- [ ] prepare for multi-user, in the data model and at the filesystem level
- [x] update peek-node to support multi-user and the core types (already supports multi-user with API keys)

### Sync Infrastructure

- [ ] get desktop sync working
- [ ] sync
- [ ] mobile notes, server notes, desktop notes (make sync server dumber)
- [ ] url+tag sync means groups on mobile/web/desktop
- [ ] pull in from server node, configure in settings (pull from peek mobile and peek node)

### Notes & Editor

Editor
- [ ] support for paste operations
- [ ] todo/done tags get special checkbox rendering

A Peek for local notes using editor
- [ ] how to address a specific note in the editor?
- [ ] maybe we need path or name-based ways of addressing "docs" in datastore?

- [ ] using for notes (md dir sync, import stickies)

Editor extensibility/bundling
- [ ] we probably want it included by default
- [ ] how - path/url in manifest for now
- [ ] need a notes app, with ability to "pin" like stickies, noted as documents in the store, w/ tags eg #sticky

### Groups & Tags UX

- [ ] tags on desktop
- [ ] tag buttons (tag + down arrow?)
- [ ] tag buttons as standalone submissions - componentize, then make extension? or just notes without text?
- [ ] figure out group mode (maybe needs cmd+l)
- [ ] groups header overhaul
- [ ] filtering search
- [ ] space vs group (language)
- [ ] groups == tags == cross-platform

### UI Components & Rendering

- [ ] ui rendering primitives: card, cards, button, button set, list, grid, chat, carousel, image viewer
- [ ] cards + json schema

### Commands Enhancement

- [ ] command tags {str} to load tag in group view
- [ ] peek addresses as cmds by title (http too?)
- [ ] cmd/peek history (they don't show up in cmd!)
- [ ] map cmd using OSM
- [ ] open kagi via cmd
- [ ] search history via cmd
- [ ] all commands as a button board

### Desktop Window UX

- [ ] if url open in a window already, switch to it (for now)
- [ ] history views (again using groups ui, maybe plug that into an extension itself?)
- [ ] extension: explode windows using groups ui with transparent background and vi directionals, enter opens
- [ ] click-to-drag on any window

### Server & Peek-Node Backend

- [x] update peek-node to support text/urls/tagsets (already supports urls, texts, tagsets, images)
- [ ] headless sync server that's a "back-end" of Peek API… or just peek running headless?
- [ ] route all external urls to peek node webhook, eg every bsky like, reddit save, oauthwonderwall?
- [ ] diagnostic/status API: resource usage, overall disk usage, per-user disk stats

### Mobile

- [ ] show oembed, or at least page title
- [ ] api key should be optional (for local-only use)
- [ ] sync now button in settings
- [ ] save images to server (look at how binaries are stored)

### Privacy & Archival

- [ ] private links and private mode pages
- [ ] private section altogether (eg gift ideas)
- [ ] archived entries (lower score, hidden by default)

### Session & State Management

- [ ] restorable snapshots, export/import
- [ ] session restore

### Sharing & Publishing

- [ ] share system
- [ ] publish pages/apps?

### Chaining & Compound Commands

- [ ] execute a command which executes a userScript against a loaded page, detects list/table-ish things (with previews), lets you select one, which it exports as a "list" out (CSV? JSON?)
- [ ] links on page -> list -> button cloud -> kb activate (then shorten to "link cloud" cmd)
- [ ] compound cmds (like "link cloud". uses chaining? like a chain package?)

### Extensions Architecture

- [ ] extensions as *web* pages/tiles accessing injected api
- [ ] start at boot?
- [ ] app+browser history swiss army knife for querying and generating url lists via chaining, saving for offline (->txt) etc, maybe using connectors
- [ ] cf: https://github.com/AgregoreWeb/agregore-browser
- [ ] cf: https://github.com/samuelmaddock/electron-browser-shell

### NER & Entity Extraction

- [ ] get people, places, dates/times/events
- [ ] get meaningful numbers, and their label
- [ ] extract a table as csv
- [ ] layer outside of web page, and in between pages (eg event page -> event -> any calendar page)

### WebExtensions Support

- [ ] ubo
- [ ] proton pass
- [ ] bpc

### Feeds & Time-series

- [ ] tag streaks -> atproto streaks (feeds + daytum)
- [ ] hud for system data (number of windows, etc - using timeseries/feeds in datastore + page metadata / daytum / widgets framework) (widget sheets? kinda like window manager views/templates?)

### Misc

- [ ] click modifier to one-off peek a link
- [ ] option to flash keyboard shortcuts on screen
- [ ] pop up a board of built-in shortcuts/actions
- [ ] pop up a board of common shortcuts/actions you use
- [ ] back/forward shortcuts for web pages

## Desktop Performance

- [ ] Reduce startup time (currently ~550ms build)
- [ ] Pre-compiled TypeScript: skip tsc during dev if no changes
- [ ] Lazy extension loading: load on first access instead of startup
- [ ] Suspend inactive tabs (reduce memory for background pages)
- [ ] Performant BrowserWindow unloading (fully release resources when not needed)

## Groups

- [ ] Define relationship between page groups and tags (are they the same? different views?)
- [ ] Searchable/indexable command API for dynamic content (e.g., group names, bookmarks)
- [ ] Refresh dynamic group commands when groups change (after tagging)

## Commands

- [ ] Add commands for settings nav sections: core, extensions, themes, datastore, diagnostic
- [ ] Add commands to open specific extension settings

## Window-Targeted Commands UX

Commands like "theme dark here" operate on the "target window" - the window the user was looking at before opening the cmd palette. Currently this works but there's no visual indication.

UX improvements:
- [ ] Commands declare `scope: 'window' | 'page' | 'global'` in registration?
- [ ] Cmd panel shows "Target: [window title]" header when window-scoped command is selected

## Devtools

- [ ] Devtools button in extension settings cards (open devtools for extension window)
- [ ] Devtools command to open devtools for a specific extension or window
- [ ] Fix `api.extensions.devtools()` - currently not working for consolidated extensions

## Entity centrism (NER streams)

- [ ] Entity catalog definition (eg Wikidata defs, or custom to start?)
- [ ] Datastore support
- [ ] Basic NER testing (regex, etc)
- [ ] Page metadata viz
- [ ] Entity search/browse
- [ ] ML NER

## Browser status quo extensibility

Status quo
- [ ] Browser extensions (limited, to get a couple of popular ones working)
- [ ] Opensearch plugins
- [ ] Quicksearch
- [ ] Bookmark keywords (equivalent)
- [ ] Bookmarklets (equivalent)
- [ ] Userscripts (cf general approach to content/user scripts)
- [ ] Language packs (cf general approach to i18n/l10n)

Search
- [ ] Local
- [ ] OpenSearch

Web extensions
- [ ] WebExtension integration for priority only, on some platforms

## Minimum viable web workbench

- [ ] Design philosophy write-up w/ driving principles and characteristics
- [ ] Multi-protocol architecture
- [ ] Content publishing
- [ ] Event model
- [ ] Chaining
- [ ] Images
- [ ] Lists/feeds

## Editor & Notes

Requires chaining and "activities"

- [ ] Notes in datastore
- [ ] Editor app (in/out datastore)
- [ ] Vim mode
- [ ] List editor

## Theming

- [ ] customizable theme(s)
  - [ ] portable/packageable system
  - [ ] extension variant, or is there a standard/convention?
  - [ ] extensions can import/use in their web content
  - [ ] review agregore/peersky approach
    - https://github.com/AgregoreWeb/agregore-browser/issues/289
    - https://github.com/AgregoreWeb/agregore-browser/pull/291
    - https://github.com/p2plabsxyz/peersky-browser/pull/43
- [ ] update default theme in peek
  - [ ] start with styles in ~/misc/peek-mobile
- [ ] look at applying/changing default theme for http web pages
  - [ ] reflect system theme (eg about:blank should not be always a white flash before page load)
  - [ ] reflect peek configured theme

## UI Componentry

- [ ] popup system
  - [ ] see ~/sync/Sites/base/hud.html/css/js
  - [ ] design for pagestream, eg vertical up/down chat-style history of pages/actions, w/ left/right for page-specific stuff (maybe uses window template?)
  - [ ] port cmd chaining and previews
- [ ] window templates?
  - [ ] eg page overlay
- [ ] button groups
  - [ ] add/remove/both modes
  - [ ] on/off mode
- [ ] tag input field
- [ ] reactive schema+card+data framework

## Feeds, time-series, scripts

- [ ] API for logging outputs to datastore (time series data, feeds)
- [ ] Command support for blocking on a content script running
- [ ] Extension api for executing arbitrary scripts against a page
- [ ] Timeouts for page scripts in commands
- [ ] Support for scheduling scripts (or maybe that's just in the extension... harder to manage tho)
- [ ] Page load triggers for background scripts

## Page loading experience

Core
- [ ] determine how we load pages - raw browserwindow (what we do now), webview in an html page?
- [ ] overlay infrastructure for showing metadata, security info, extension widgets etc
  - [ ] (maybe this requires window templates, but not for first take)
- [ ] Page metadata
- [ ] Interaction with cmd actions

Page model & metadata
- [ ] Basic overlay
- [ ] Page embedding

Web Platform
- [ ] need a web loader that's not full BrowserWindow maybe?
- [ ] sandboxing

Later
- [ ] pageinfo widgets - defaults, scripts, metadata, media, actions

## v? - Chaining / Connecting

Now that we have commands, we need to be able to chain them together for more complex "workbench-y" interactions. Chaining reqs inputs/outputs (eg activities/intents/applets), so that API unlocks the rest.

Example flow:
- open a web page
- cmd: show lists -> shows list of lists detected in the page
- arrow up/down and choose one -> shows preview of the selected list
- cmd: csv -> shows preview of csv
- cmd: save file -> prompts to download

- [ ] Connector API: Chaining reqs inputs/outputs (eg activities/intents/applets)
  - [ ] Determine if this should be a new API or reuses command registration
  - [ ] Extension API to register as a connector handler for a set of mime/types
  - [ ] Extension API to emit data to handlers for the specified mime type output (or maybe we allow multiple like the web clipboard API does)
- [ ] Cmd support for chaining flow using "connectors"
  - [ ] Add Connector Handler support, so data can move one-way from a command to another
  - [ ] Filter first on mime type matches
  - [ ] Policy for determing best matching command order (using frecency + adaptive matching)
- [ ] Support previewing of the data in between steps
  - [ ] Modular system for plugging renderers in for generating previews/editors of mime types
  - [ ] Doesn't need to be an extension API yet, but we'll need a way for that later maybe
  - [ ] Preview panel is visually connected to the cmd panel, which should stay visible or visually connected somehow
- [ ] Cmd UI updates
  - [ ] Cmd panel can show dropdown listing matching commands
  - [ ] User can navigate list w/ arrow up/down, j/k and tab/shift-tab
  - [ ] If cmd response has a previewAddress property, show a preview pane w/ that address

## v? - Publishing, Provenance, Remote Extensions?

- [ ] poke at remote loading + provenance

## Portability

- [ ] Back-end implementations
  - [ ] Mobile (webview) back-end
  - [ ] Extension back-end
- [ ] Define subset of core API for portability

## Tagging & Groups

Groups
- [ ] Visually communicate group-active
- [ ] Determine which new-page routes qualify for staying in group vs not
- [ ] When group-active, qualifying new pages are automatically tagged as in the group
- [ ] Determine how/when to exit group for new pages opened (eg from external app)

## v? Windowing model

- [ ] active vs transient modality
- [ ] configurable escape behavior per-window

## Window features

Window features
- [ ] add draggable as pref, eg an opener can specify undraggable (draggable is default)
- [ ] same for resize (but user can override?)

## Demos / Tutorials / Comms

Demo reel
- [ ] Define demo reel
- [ ] Peeks: translate, calendar, ai chat, currency conversion, everytimezone, tldraw
- [ ] Slides: soundcloud, crypto prices, notepad, todo list
- [ ] Scripts: stock price, weather change

## Unprioritized future

App mgmt
- [ ] uniform policy for feature id creation (lean on web/extensions)
- [ ] deal with collisions

App dev
- [ ] app model - web? extension? P/IWA? other?
- [ ] shared libs, eg utils
- [ ] language: call them feature or apps? other? extensions? mods?

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
- [ ] cmds for all of this

History
- [ ] store central app action history

Window layout
- [ ] tile/untile

After that
- [ ] Tray
- [ ] Identity
- [ ] Contacts
- [ ] Collaboration

Further
- [ ] Implement the Firefox "awesomebar" scoring and search algorithm so that Peek *learns* you
- [ ] Infinite lossless personal encrypted archive of web history

## Done

Newly done items go here, grouped under third-level headings by week of year.

### 2026-W04

- [x][server] document Railway deployment info so agents don't have to relearn each time
- [x][sync] fix duplicates: add sync_id parameter for server-side deduplication
- [x][mobile] update to full bidirectional sync (pull + push, not just webhook push)
- [x][sync] E2E integration tests for desktop-server sync

### 2026-W03

- [x][desktop] settings UI for sync
- [x][desktop] test sync and package
- [x] merge peek-node into peek repo (now at backend/server/)
- [x] update peek-node to support multi-user and the core types (already done)
- [x] unify data model across mobile/desktop/server
- [x] sync working between all three
- [x][mobile] test and deploy ios to prod

### Old completed items

### Base Extensions
- [x] see notes/extensibility.md
- [x] window manager views (bad name, but what Peek "features" are now)
- [x] commands (eg Quicksilver, Ubiquity, Raycast style)

### Portability
- [x] Abstract back-end system
- [x] Electron back-end
- [x] Tauri back-end

### Pages, Tagging & Groups
- [x] Open page by default in cmd
- [x] Open page from OS, other apps
- [x] Cmd to tag current page
- [x] Groups based on tags, for now
- [x] Untagged -> default group
- [x] Cmd to open groups home
- [x] Escape for navigating back up the group views, not closing window
- [x] adaptive matching
- [x] frecency

### V.0.3 - Datastore
- [x] Datastore

### v0.2 - MVCP
- [x] app showing in dock even tho disabled
- [x] app not showing in tray, even tho enabled
- [x] all api calls get source attached
- [x] window cache s/custom/map/
- [x] window cache all windows not just persistent
- [x] window cache - evaluate key approach (use-case: apps need to identify windows they open)
- [x] always return window id, so apps can manage it
- [x] reimplement keys, so much easier for callers than managing ids
- [x] account for number of renderer processes (seems double?)
- [x] prototype window.open
- [x] evaluate webContents.setWindowOpenHandler
- [x] stop using openWindow to show pre-existing hidden windows?
  - [x] can track web windows locally
  - [x] can identify web windows on both sides (key/name)
  - [x] add new custom api for windows superpowers
- [x] collapse window opening to span both approaches
- [x] finish converting all openWindow to window.open
- [x] figure out single devtools window if possible

### ✅ v0.1 - MVPOC

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


