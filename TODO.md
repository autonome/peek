# Peek TODO

How we work:
- We track actionable items in this file
- This file is not for notes or description - link to documents in ./notes for that
- Checkbox states: `- [ ]` pending, `- [~]` in-progress, `- [x]` done
- We move completed items into the Done section at the bottom, grouped by week of year the items were completed

## Prioritization

Be able to use the app on mobile and desktop with the safety of knowing there's also at least one remote copy.

Today
- [ ] update main README
- [ ][desktop] update release build and drive it

Later
- [ ][desktop] access to notes on filesystem, syncing them as markdown files in ~/sync/Notes/peek

## To process

Unclear / needs context:
- [ ] import signal note-to-self archive into peek notes
- [ ] implement old context plan eg https://www.reddit.com/r/hackernews/comments/1qddidm/sun_position_calculator/
- [ ] step counter: app level interaction tracing/counting. when is reset? when does action end and new one start?
- [ ] tabstats for peek
- [ ] peeks/slides as tagged addresses with metadata properties?
- [ ] edgeworkernode/server vs what we got now (both?)

misc
- [ ] click modifier to one-off peek a link
- [ ] option to flash keyboard shortcuts on screen
- [ ] pop up a board of built-in shortcuts/actions
- [ ] pop up a board of common shortcuts/actions you use

App dev
- [ ] shared libs, eg utils
- [ ] language: call them feature or apps? other? extensions? mods?

Navigation
- [ ] make izui stack manager (part of window mgr?)
- [ ] esc stack: from feature settings back to core settings
- [ ] add to izui stack (and ix w/ history?)
- [ ] interactions between peek:// and other


## Profiles

data model and on-disk
- [ ][desktop] profile at OS level, eg the electron+chromium profile (and tauri)
- [ ][mobile] switches db
- [ ][server] switches db
- [ ] profiles across platform are connected by api key for now
  - [ ] each profile has key generated at creation time
  - [ ] get key from one to initialize sync with another
  - [ ] profile creation asks for optional api key from an existing profile

mobile/desktop
- [ ][desktop] settings app has profiles section
- [ ][mobile] settings pane has profiles section
- [ ] there's a default profile
- [ ] can add named profiles
- [ ] can switch profiles (reloads almost entirety of app)
- [ ] can delete profiles (prompt - no undo!)
  - [ ] profiles only deleted on device, does not sync
- [ ] must always have at least one profile

## Sync Infrastructure

- [ ] mobile notes, server notes, desktop notes (make sync server dumber)

## Commands - Settings Navigation

- [ ] Add commands for settings nav sections: core, extensions, themes, datastore, diagnostic
- [ ] Add commands to open specific extension settings

## Theming

Core theming is done (themes/, CSS variables, peek://theme/ protocol, light/dark/system modes).

Remaining:
- [ ] review agregore/peersky approach for improvements
- [ ] apply theme to http web pages (about:blank flash, user pref)

## Portability

Backend abstraction done (Electron, Tauri, Tauri Mobile, Server all share app/ code).

Remaining:
- [ ] Extension back-end (browser extension version)
- [ ] Define subset of core API for portability documentation

## Extensions Architecture

Core extension system done (web pages with injected window.app API, iframe/BrowserWindow hosting).

Remaining:
- [ ] configurable start-at-boot per extension
- [ ] cf: https://github.com/AgregoreWeb/agregore-browser
- [ ] cf: https://github.com/samuelmaddock/electron-browser-shell

## Chaining / Connecting

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

examples
- [ ] execute a command which executes a userScript against a loaded page, detects list/table-ish things (with previews), lets you select one, which it exports as a "list" out (CSV? JSON?)
- [ ] links on page -> list -> button cloud -> kb activate (then shorten to "link cloud" cmd)
- [ ] compound cmds (like "link cloud". uses chaining? like a chain package?)

## Modes/scopes

notes
- Pages have a specific mode, with specific hotkeys, etc.
- Commands like "theme dark here" operate on the "target window".
- Target window is usually what the user was looking at before opening cmd.
- Currently this works but there's no visual indication.

- [ ] How to do page "mode" (for example) with conditional context/hotkeys/actions
- [ ] Should commands declare `scope: 'window' | 'page' | 'global'` in registration?
- [ ] How does cmd indicate scope/target?
   - [ ] eg "Target: [window title]" header when window-scoped command is selected?


## Desktop windows

Window controls
- [ ] titlebar investigation and controls: why do some window.open links show titlebars?
- [ ] show titlebar on hover at top edge
- [ ] add universal hide/show pref (default hide)
- [ ] add pref to settings
- [ ] command flip default
- [ ] command to flip current

Window persistence
- [ ] window position persistence where it makes sense (settings, groups, cmd) and make configurable?
- [ ] window size persistence where it makes sense (slides, peeks) and make configurable?

Window size/move
- [ ] window are resizable
- [ ] pin window on top (app)
- [ ] pin window on top (os)
- [ ] window.open api param for draggable
- [ ] window.open api param for resize
- [ ] cmds for all of this

Window interaction/integration
- [ ] configurable escape behavior per-window

Window animations
- [ ] add window open animation (to/from coords, time) to openWindow
- [ ] update slides impl to use animation again

Window layout (depends on ui components)
- [ ] tile/untile, eg the Explode extension
- [ ] explode: windows using groups ui with transparent background and vi directionals, enter opens


## UI Componentry

reactive schema+card+data system
- [ ] cards + json schema + data?
- [ ] ui rendering primitives: card, cards, button, button set, list, grid, chat, carousel, image viewer

popup carousel system
- [ ] see ~/sync/Sites/base/hud.html/css/js for basic ui system
- [ ] horizontal and vertical carousel components
- [ ] active item focused in popup
- [ ] arrow controls and vim directionals
- [ ] port cmd chaining to horizontal carousel popups
- [ ] port cmd previews to vertical carousel popups

window templates
- [ ] eg page overlay

button groups
- [ ] add/remove/both modes
- [ ] on/off mode

tags
- [ ] tag input field

## Web page experience

Page loading core
- [ ] how to load pages - raw browserwindow (what we do now), webview in a default transparent page that hosts overlay??
- [ ] overlay infrastructure for showing metadata, security info
  - [ ] maybe this requires window templates?
- [ ] interaction with cmd actions (page mode again?)

Basic nav etc
- [ ] hotkey to select url
- [ ] back/forward
- [ ] reload
- [ ] undo last close
- [ ] if url selected in cmd is open in a window already, switch to it (for now)

Page info/metadata/action widgets (depends on window templates maybe?)
- [ ] defaults, eg sec ui
- [ ] metadata (og, whatnot)
- [ ] media (imgs, rss, etc)
- [ ] actions (new extension cmd type?)
- [ ] scripts (tbd)

## Pagestream

- a new peek web navigational system
- vertical up/down chat-style history of pages/actions
- left/right for page-specific stuff
- maybe uses carousels + window template from ui componentry?

## Notes & Editor

Editor
- [ ] include by default from ~/misc/peek-editor
- [ ] support for paste operations
- [ ] settings option for url to external editor (expects peek connector support), defaults to built-in address
- [ ] tags in content detected, added/removed from tag system

Notes app
- [ ] see all notes
- [ ] filtering search on notes
- [ ] click to edit
- [ ] how to address a specific note in the editor?
- [ ] maybe we need path or name-based ways of addressing "docs" in datastore?

Integrations
- [ ] local dir sync
- [ ] import macos stickies

Stickies
- [ ] cards layout primitive (requires UI componentry?)
- [ ] "pin" notes to stickies using a tag

Requires chaining and connectors
- [ ] List editor

## Groups & Tags UX

- [ ] Define relationship between page groups and tags (are they the same? different views?)

Groups
- [ ] Visually communicate group-active (a "mode"? see Mode/scope section)
- [ ] Determine which new-page routes qualify for staying in group vs not
- [ ] When group-active, qualifying new pages are automatically tagged as in the group
- [ ] Determine how/when to exit group for new pages opened (eg from external app)

mobile
- [ ] filtering search of tags in tag input box
- [ ] view tag groups

cmd
- [ ] port tagging ui from mobile, eg:
  - [ ] see and be able to remove already added tags
  - [ ] input box for typing new tags and filtering unselected tag list
  - [ ] unselected tag list, each as clickable button

tagsets
- [ ] 

general
- [ ] space vs group (language)

desktop
- [ ] figure out group mode (maybe needs cmd+l)
- [ ] groups header overhaul

## Commands

- [ ] detect URL input without http(s):// prefix, auto-add https:// and open
- [ ] command tags {str} to load tag in group view
- [ ] peek addresses as cmds by title (http too?)
- [ ] cmd/peek history (they don't show up in cmd!)
- [ ] map cmd using OSM
- [ ] open kagi via cmd
- [ ] search history via cmd
- [ ] all commands as a button board

- [ ] app+browser history swiss army knife for querying and generating url lists via chaining, saving for offline (->txt) etc, maybe using connectors


## Server Backend

- [ ] headless sync server that's a "back-end" of Peek API… or just peek running headless?
- [ ] route all external urls to peek node webhook, eg every bsky like, reddit save, oauthwonderwall?
- [ ] diagnostic/status API: resource usage, overall disk usage, per-user disk stats

## Mobile

- [ ] fix big bottom bar showing again
- [ ] show oembed, or at least page title
- [ ] save images to server (look at how binaries are stored, and across profiles)

## Session & State Management

- [ ] export/import
- [ ] session restore

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
- [ ] ubo
- [ ] proton pass
- [ ] bpc

## Feeds, time-series, scripts

- [ ] API for logging outputs to datastore (time series data, feeds)
- [ ] Command support for blocking on a content script running
- [ ] Extension api for executing arbitrary scripts against a page
- [ ] Timeouts for page scripts in commands
- [ ] Support for scheduling scripts (or maybe that's just in the extension... harder to manage tho)
- [ ] Page load triggers for background scripts

- [ ] tag streaks -> atproto streaks (feeds + daytum)
- [ ] hud for system data (number of windows, etc - using timeseries/feeds in datastore + page metadata / daytum / widgets framework) (widget sheets? kinda like window manager views/templates?)

## Entity centrism (NER streams)

- [ ] get people, places, dates/times/events
- [ ] get meaningful numbers, and their label
- [ ] extract a table as csv
- [ ] layer outside of web page, and in between pages (eg event page -> event -> any calendar page)


- [ ] Entity catalog definition (eg Wikidata defs, or custom to start?)
- [ ] Datastore support
- [ ] Basic NER testing (regex, etc)
- [ ] Page metadata viz
- [ ] Entity search/browse
- [ ] ML NER

## Archiving / expiration

- [ ] archived notes (lower score, hidden by default)

## Sorting/scoring/magic

- [ ] Implement the Firefox "awesomebar" scoring and search algorithm so that Peek *learns* you

## Desktop Performance

- [ ] Reduce startup time (currently ~550ms build)
- [ ] Pre-compiled TypeScript: skip tsc during dev if no changes
- [ ] Lazy extension loading: load on first access instead of startup
- [ ] Suspend inactive tabs (reduce memory for background pages)
- [ ] Performant BrowserWindow unloading (fully release resources when not needed)

## Private mode

- [ ] private links and private mode pages
- [ ] private section altogether (eg gift ideas)

## Demos / Tutorials / Comms

Demo reel
- [ ] Define demo reel
- [ ] Peeks: translate, calendar, ai chat, currency conversion, everytimezone, tldraw
- [ ] Slides: soundcloud, crypto prices, notepad, todo list
- [ ] Scripts: stock price, weather change

## History 

- [ ] history views (again using groups ui, maybe plug that into an extension itself?)

History (depends on ui primitives)
- [ ] history viewer
- [ ] history search
- [ ] Infinite lossless personal encrypted archive of web history

## Publishing, Provenance, Remote Extensions?

- [ ] share system
- [ ] poke at remote loading + provenance
- [ ] publish pages/apps?
- [ ] local publishing w/ Helia or something like this

## Minimum viable web workbench

- [ ] Design philosophy write-up w/ driving principles and characteristics
- [ ] Multi-protocol architecture
- [ ] Content publishing
- [ ] Event model
- [ ] Chaining
- [ ] Images
- [ ] Lists/feeds

## Devtools

- [ ] Devtools button in extension settings cards (open devtools for extension window)
- [ ] Devtools command to open devtools for a specific extension or window
- [ ] Fix `api.extensions.devtools()` - currently not working for consolidated extensions


## Later

- [ ] try DuckDB as datastore storage backend instead of SQLite

- [ ] Tray work
- [ ] Identities system?
- [ ] Contacts integration
- [ ] Collaboration

## Done

Newly done items go here, grouped under third-level headings by week of year.

### 2026-W04

- [x] data model: multi-user support (server full, desktop profile isolation)
- [x] desktop sync working (bidirectional in backend/electron/sync.ts)
- [x] sync config in settings UI
- [x] windows draggable/moveable (click-and-hold in app/drag.js)
- [x] notes in datastore (items table with type='text')
- [x] peek-node supports text/urls/tagsets/images
- [x] backup/restore snapshots (daily automated + manual)
- [x] action history storage (visits table)
- [x][mobile] shared iOS build cache to avoid Rust rebuilds across agent workspaces
- [x][desktop] debug and stabilize build on new Electron (stale node_modules after upgrade)
- [x][desktop] upgrade Electron to 40 + pin Node to 24 (ensure yarn start always runs with correct better-sqlite3)
- [x][mobile] pull-to-refresh gesture triggers sync
- [x][desktop] click-and-hold window dragging for frameless windows
- [x][desktop] fix better-sqlite3 node/electron version mismatch with postinstall script
- [x][desktop] e2e sync test infrastructure for production
- [x][desktop] daily data snapshots saved to compress archives in ~/sync/peek-backups
- [x][workflow] restore git/github push for Railway deploys
- [x][desktop] fix better-sqlite3 node vs electron version mismatch
- [x][sync] investigate remaining sync edge cases
- [x][workflow] fix jj commit/merge strategy - agents no longer touch main bookmark
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


