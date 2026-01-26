# Peek TODO

How we work:
- We track actionable items in this file
- This file is not for notes or description - link to documents in ./notes for that
- Checkbox states: `- [ ]` pending, `- [~]` in-progress, `- [x]` done
- We move completed items into the Done section at the bottom, grouped by week of year the items were completed

## Design principles

core
- feels like home: trust, comfort, control
- continuous instances of magical mind-reading
- sleep at night because no idea or anything you saw is ever lost
- create, save, classify at the speed of thought

what makes a home
- everything is right where you need it, b/c you control what is where
- when you know what is where, you can make things without frustration

synthesis
- frecency + adaptive matching gives experience/feeling of magical mind-readingness
- ability to customize/create/generate interfaces gives the comfort of home

cf
- bulthaup - german kitchen company w/ designs based on carpentry workshops

the rules
- files > arcane/opaque boxes/formats
- metadata can be weird non-file, as long as consistent
- external systems require consent to touch my stuff (eg http caching rules)

## Prioritization

Be able to use the app on mobile and desktop with the safety of knowing there's also at least one remote copy.

Today
- [~] integrate app versioning changes, local end to end testing, deployment to server/mobile/desktop and test
- [ ][desktop] the items in the History section under the Addressability header

## unfiled

context
- [ ] implement old context plan eg https://www.reddit.com/r/hackernews/comments/1qddidm/sun_position_calculator/

server
- [ ] edgeworkernode/server vs what we got now? both? lite-version, or this it?

peeks on links
- [ ] click modifier to one-off peek a link
- [ ] anchored to cursor w/in window bounds
- [ ] as an extension? hotkey + page viewer

once we have cardinal ui
- [ ] option to flash keyboard shortcuts on screen
- [ ] pop up a board of built-in shortcuts/actions
- [ ] pop up a board of common shortcuts/actions you use

## Accounts/profiles/sync safety/fidelity

api key (accounts)
- [ ] how initiated (manually my operator only for now, just document it)

syncing history
- [ ] how to sync/merge frencency and adaptive matching?

## Addessibility / Core history / feeds

For record/replay, daily ribbon, state feedback loops and observability, etc we need a complete chained history.
All of those require addressibility of all primary actions, and connections to prev/next actions.
Includes any peek:// invocation and parameters passed.
May require the connector/parameter context for each invocation, tbd.
Requires explicit chaining.

History
- [ ] add peek:// loads to history table
- [ ] peek urls don't need params yet, but we'll need to do cmd params and connector data somehow maybe
- [ ] ensure all window/frame/webview loads of any kind are entered in history
- [ ] bug: some link clicks in web pages open in a window with a title bar that's clearly not entered in peek's window tracking, maybe js in the page opening windows?
- [ ] sync: don't sync peek addresses for now

History chaining
- [ ] not doing paths/forking yet - is just one single chain of actions
- [ ] add next/prev cols to history table, or maintain in new table?
- [ ] when a history record is added, set prevId pointing to previous history record
- [ ] each time a history record is added, set nextId to its prevId

API
- [ ] enumerate history
- [ ] filter on date ranges

Review against impl
- [ ] step counter: app level interaction tracing/counting. when is reset? when does action end and new one start?
- [ ] peeks/slides as tagged addresses with metadata properties? or urls?

## UI Componentry

Right now we're replicating/forking html and js across extensions.
This is messy, error prone, poor DRY practice.
It also makes it so we can't generatively and rapidly build out UIs without whole new piles of html/js/css.
We want a flexible and reusable system provided at the ./app layer which extensions can include and inject data/styling into.
this is a loosely coupled system with deterministic management.
Not just importing and writing js components w/ css, React-style.
This is more like a templating system injecting schema, a card (html fragment?), and data.
It's designed for single-component scoping, not complex document management. You'd insert these as smaller pieces into a larger system like React, etc.
Once we add atproto support, this same system could be used to bind lexicons + data for generated viewing/CRUD interfaces.

reactive schema+card+data system
- [ ] cards + json schema + data
- [ ] no hierarchy, just single component to start, renders to markup
- [ ] instantiatable with data
- [ ] receive updates to refresh

integration
- [ ] determine how extensions will import from core
- [ ] determine how consumers will apply styles
- [ ] explore node reuse/recycle approaches

ui
- [ ] button
- [ ] button set (eg for tag boards/sets)
- [ ] card
- [ ] list
- [ ] grid
- [ ] vertical carousel of cards (like a chat view w/ interactable focus card)
- [ ] horizontal carousel of cards (eg for command chaining, day ribbons)
- [ ] image viewer
- [ ] command input
- [ ] command suggestion
- [ ] command preview pane
- [ ] search/filters on enumerable items (list, grid)
- [ ] editor

initial porting
- [ ] groups -> card/cards
- [ ] tags -> card/cards
- [ ] tag sets -> button set
- [ ] cmd -> command input/suggestions
- [ ] cmd chaining -> horizontal carousel, list

popup carousel system
- [ ] horizontal and vertical carousel components
- [ ] see ~/sync/Sites/base/hud.html/css/js for basic ui system
- [ ] active item focused in popup
- [ ] arrow controls and vim directionals
- [ ] port cmd chaining to horizontal carousel popups
- [ ] port cmd previews to vertical carousel popups

button sets
- [ ] set of buttons
- [ ] up/depressed states
- [ ] x endcap option

tags
- [ ] all built on buttons and button sets
- [ ] tag input field
- [ ] combo of selected tags, input w/ filtering search, available tags

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

Titlebar
- [ ] show titlebar on hover at top edge of window for all pages

## server

- [ ] Add migration dry-run mode
- [ ] Add database integrity verification
- [ ] Add automatic backup cleanup after grace period

## Metadata, QS and reflection

- [ ] tabstats for peek

## Files-ness

- [ ] access to notes folder(s) on filesystem to import+sync
- [ ] syncing peek-only ontes as markdown files in specified dir (or library, boo)
- [ ] import signal note-to-self archive into peek notes

## Extension dev
- [ ] shared libs, eg utils
- [ ] language: call them feature or apps? other? extensions? mods?

## Izui

- [ ] formalize model
- [ ] make izui stack manager (part of window mgr?)
- [ ] esc stack: from feature settings back to core settings
- [ ] add to izui stack (and ix w/ history?)
- [ ] interactions/sec-policy between peek:// and other

## Polish

- [ ] if no api key set, sync settings are disabled, and pull-to-sync on mobile

## window templates

- [ ] declarative sets of ui components?
- [ ] eg page info hud overlay
- [ ] explode: windows using groups ui with transparent background and vi directionals, enter opens
- [ ] tile/untile, eg the Explode extension

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

## Media: images/videos, favicon/screenshot cache

Media storage architecture
- [ ] review use-cases for images/videos/favicons/screenshot
- [ ] files or other, hybrid?
- [ ] addressing scheme
- [ ] platform-specific integrations (eg mobile)

Image saving
- [ ] media storage for images
- [ ][mobile] complete image sharing/tag-editing/viewing support

- [ ] store screenshots and favicons for any page loaded through window system
- [ ] save on disk in profile
- [ ] investigate how media caches store/address for url-based high performance lookup
- [ ] store location of files as url metadata
- [ ] integrate lookups in groups, url cards, page info, etc

- [ ] per-profile favicon cache dir
- [ ] take and save favicon of any address loaded through window system
- [ ] store in profile favicon cache, and save location as metadata record on the address

- [ ] per-profile screenshot cache dir
- [ ] take and save screenshot of loaded windows for any new address
- [ ] store in profile screenshot cache, and save that as metadata record on the address

## Extension back-end

- [ ] tbd

## Server Backend

- [ ] headless sync server that's a "back-end" of Peek API… or just peek running headless?
- [ ] route all external urls to peek node webhook, eg every bsky like, reddit save, oauthwonderwall?
- [ ] diagnostic/status API: resource usage, overall disk usage, per-user disk stats

## Mobile

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

Generally default is based on the old Firefox "awesomebar" scoring/search algorithms.
Frecency + adaptive matching.
The app *learns* you, and what you want magically appears w/o AI as requirement.

## Desktop Performance

- [ ] Reduce startup time (currently ~550ms build)
- [ ] Pre-compiled TypeScript: skip tsc during dev if no changes
- [ ] Lazy extension loading: load on first access instead of startup
- [ ] Suspend inactive tabs (reduce memory for background pages)
- [ ] Performant BrowserWindow unloading (fully release resources when not needed)

## Identity and privacy

keys
- [ ] server-less identity system
- [ ] key backup/restore/rotation

encrypted storage
- [ ] account unlocks its profiles
- [ ] profile switching/opening screen

point-of-use privacy
- [ ] private items, eg gift ideas, cf archived - visible with magic tag (which itself doesn't show in history)
- [ ] private links - click not tracked, opens page in private mode
- [ ] private profiles

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

## Publishing, Provenance, Remote Extensions

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

storage backends
- [ ] try DuckDB as datastore storage backend instead of SQLite

- [ ] Identities system
- [ ] Contacts integration
- [ ] Collaboration

desktop
- [ ] Tray work

## Done

Newly done items go here, grouped under third-level headings by week of year.

### 2026-W04

- [x] add device ID tracking to item metadata
- [x] app version and datastore version as separate layers of compatibility
- [x] define compat detection system across desktop/server/mobile/other
- [x] define how sync works when incompatible (clients only sync w/ datastore-compatible nodes)
- [x] sync is not spoke server - all nodes equal participants
- [x] implement version compat in desktop/server (DATASTORE_VERSION + PROTOCOL_VERSION, exact match, 409 on mismatch)
- [x] implement version compat in mobile (add version headers to lib.rs sync) (rlrlqkqz)
- [x][mobile] fix sync re-pushing all items every time - per-item synced_at (nxszorty)
- [x][mobile] add version headers to mobile sync - DATASTORE_VERSION + PROTOCOL_VERSION (rlrlqkqz)
- [x][desktop] add new items - url/tagset/note commands (pwuyrstl)
- [x][desktop] editor extension with full note editing (rmztsrkr)
- [x][tauri] sync module, schema migrations, version compat to match Electron (zzyllzsk)
- [x] e2e sync & version test suite, fix sync profile resolution (rlrlqkqz)
- [x][mobile] fix share extension creating duplicate items per tag (yvumsuqr)
- [x][mobile] merge home and search into unified view, configurable archive tag (txzkumku)
- [x][mobile] fix big bottom bar showing again (tqnmowqm)
- [x][mobile] iOS profile support with build detection and per-profile databases (ylkwxtut)
- [x][mobile] UUID-based profile sync across mobile, desktop, and server (mlqntkvw)
- [x][mobile] iOS share extension fixes + tag input filtering (smuxwlzx)
- [x][mobile] consolidate editor views with shared components (wvvqrquo)
- [x][mobile] add clear buttons to all input fields and textareas (vyuwkrpy)
- [x][mobile] fix tags not persisting on text notes (qowppxlk)
- [x][mobile] add archive tag support to hide items from views (urmmzrvr)
- [x][mobile] add font size slider in settings with realtime preview (umqpnqto)
- [x][mobile] mobile editing ux - toasts, validation, draft persistence, spacing, bottom bar fix (rqwmmpnm)
- [x][mobile] pull-to-refresh gesture triggers sync (roqqsxyp)
- [x][desktop] window titlebar hide/show pref with settings UI (wpykxvrl)
- [x][desktop] windows movable and resizable by default with window.open API params (wpykxvrl)
- [x][desktop] persist keyed/url window position+size across app restarts (wpykxvrl)
- [x][desktop] pin window on top (app and OS level) with commands (wpykxvrl)
- [x][desktop] configurable escape behavior per-window via window.open API (wpykxvrl)
- [x][desktop] window animation API (to/from coords, time) + slides impl (wpykxvrl)
- [x][desktop] Desktop Windows - title bar, persistence, pin controls, animations (wpykxvrl)
- [x][desktop] migrate old addresses to items table, fix CHECK constraint (ltovmzon)
- [x][desktop] multi-tag search in tags UI (ltovmzon)
- [x][desktop] extension nav styling improvements (ltovmzon)
- [x][desktop] fix groups extension - add visit tracking, filter for URLs only (wuywuwyn)
- [x][desktop] fix sync status in settings UI - use correct field name for display (xxtpswys)
- [x][desktop] persist autoSync setting in extension_settings (vyvorvtq)
- [x][desktop+server] add sync version compatibility - DATASTORE_VERSION + PROTOCOL_VERSION (rltmkytv)
- [x][desktop+server] add user profiles and profile switching
- [x][desktop] add tags extension for tag visualization and management
- [x][desktop] click-and-hold window dragging for frameless windows
- [x][desktop] fix better-sqlite3 node/electron version mismatch with postinstall script
- [x][desktop] debug and stabilize build on new Electron (stale node_modules after upgrade)
- [x][desktop] upgrade Electron to 40 + pin Node to 24
- [x][desktop] e2e sync test infrastructure for production
- [x][desktop] daily data snapshots saved to compress archives in ~/sync/peek-backups
- [x][desktop] fix 5GB packaged build by adding exclusions to electron-builder.yml (~280MB now)
- [x][desktop] update release build and drive it
- [x][security] remove production server endpoint from source - require env config (rnxppwkx)
- [x][server] Add pre-migration backup to server migration
- [x][server] add daily snapshot backups on server, test locally, deploy, test and confirm working on railway
- [x][server] document Railway deployment info so agents don't have to relearn each time
- [x][sync] fix duplicates: add sync_id parameter for server-side deduplication
- [x][sync] investigate remaining sync edge cases
- [x][sync] E2E integration tests for desktop-server sync
- [x] data model: multi-user support (server full, desktop profile isolation)
- [x] desktop sync working (bidirectional in backend/electron/sync.ts)
- [x] sync config in settings UI
- [x] windows draggable/moveable (click-and-hold in app/drag.js)
- [x] notes in datastore (items table with type='text')
- [x] peek-node supports text/urls/tagsets/images
- [x] backup/restore snapshots (daily automated + manual)
- [x] action history storage (visits table)
- [x] update main README
- [x][mobile] shared iOS build cache to avoid Rust rebuilds across agent workspaces
- [x][mobile] update to full bidirectional sync (pull + push, not just webhook push)
- [x][workflow] agent workspace isolation - rules to stay in workspace, no parent repo access
- [x][workflow] fix divergent commits - mmerge uses jj new+restore pattern
- [x][workflow] Railway deploy scripts - npm/yarn scripts with --service flag
- [x][workflow] fix TODO archival - updated agent templates with clearer instructions
- [x][workflow] clarify ./app rule - now about respecting front-end/back-end architecture boundary (tkvzpvlu)
- [x][workflow] restore git/github push for Railway deploys
- [x][workflow] fix jj commit/merge strategy - agents no longer touch main bookmark

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


