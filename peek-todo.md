# Peek TODO

## How we work

- We track pending items in this file
- In-progress work and current focus goes in WIP.md
- Completed items go in CHANGELOG.md, grouped by week
- This file is not for notes or description - link to documents in ./notes for that
- Checkbox states: `- [ ]` pending, `- [~]` in-progress (move to WIP.md), `- [x]` done (move to CHANGELOG.md)

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

## Unfiled

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

## Addessibility / Core history / feeds

For record/replay, daily ribbon, state feedback loops and observability, etc we need a complete chained history.
All of those require addressibility of all primary actions, and connections to prev/next actions.
Includes any peek:// invocation and parameters passed.
May require the connector/parameter context for each invocation, tbd.
Requires explicit chaining.

Review against impl
- [ ] step counter: app level interaction tracing/counting. when is reset? when does action end and new one start?
- [ ] peeks/slides as tagged addresses with metadata properties? or urls?

## UI Componentry

Right now we're replicating/forking html and js across extensions.

problems
- messy, error prone, poor DRY practice
- also means we can't generatively and rapidly build out UIs without whole new piles of html/js/css to manage

What it is
- flexible / reusable system at the ./app layer
- extensions use for creating/generating interfaces
- can override/overlay/inject styling
- easy to make system-consistent ux and themed visual design
- loosely coupled system with deterministic management
- like a set of prebuilt controls
- designed for single-component, or sets
- binds to data source, is reactive to it (events, event-sources, streams, our feed system)

what it isn't
- designed for complex document hierarchies
- js components React-style

usage
- callers instanciate a control
- provide schema/data into a control which has a default template
- template can be replaced by caller

examples/use-cases
- groups, tag ui and windows viewer are all card grids
- chaining is command components + card popups with lists, editors, previews, etc
- after atproto support, this could be used to bind lexicons + data for generated viewing/CRUD interfaces.
- see the Window templates section of this file
- see the Pagestream section of this file
- see the Chaining section of this file
- see the Notes/Editor section of this file
- see the Web page experience section of this file
- see the Unfiled section of this file
- see the Commands section of this file

implementation
- use https://open-ui.org/ as much as possible, should cover a lot, eg, buttons, card/grid, cmd, carousels
- see ~/sync/Sites/base for experiments w/ hud etc

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
- [ ] column/columns

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

examples
- web page viewing has a mode w/ special actions and hotkeys
- when "in" a group, we need special mode optimized for working w/ the group's set of pages
- cmd might operate differently depending on if it's in a mode or not

- [ ] How to do page "mode" (for example) with conditional context/hotkeys/actions
- [ ] Should commands declare `scope: 'window' | 'page' | 'global'` in registration?
- [ ] How does cmd indicate scope/target?
   - [ ] eg "Target: [window title]" header when window-scoped command is selected?

## Web page experience (reviewme: partially done)

Page loading core
- [ ] how to load pages - raw browserwindow (what we do now), webview in a default transparent page that hosts overlay??
- [ ] overlay infrastructure for showing metadata, security info
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

## Metadata, QS and reflection

- [ ] tabstats for peek
- [ ] view: a page of different widgets showing this info, or a hud/dashboard

## Files-ness

- [ ] access to notes folder(s) on filesystem to import+sync
- [ ] syncing peek-only ontes as markdown files in specified dir (or library, boo)
- [ ] import signal note-to-self archive into peek notes

## Accounts/profiles/sync safety/fidelity

api key (accounts)
- [ ] how initiated (manually my operator only for now, just document it)

syncing history
- [ ] how to sync/merge frencency and adaptive matching?

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

- [ ] (already done?) if no api key set, sync settings are disabled, and pull-to-sync on mobile

## Window templates

- [ ] declarative sets of ui components?
- [ ] eg page info hud overlay (~/sync/Sites/base/)
- [ ] explode: windows using groups ui with transparent background and vi directionals, enter opens
- [ ] tile/untile, eg the Explode extension

## Pagestream

- a new peek web navigational system
- vertical up/down chat-style history of pages/actions
- left/right for page-specific stuff
- maybe uses carousels + window template from ui componentry?

## Notes & Editor

Description and core requirements 
- editor that can be used standalone or embedded
- markdown by default
- vim mode as global configuration option
- custom folding approach
- supports peek connectors (mime in -> edit -> mime out)

Used for
- editing notes
- editing in command chaining interstitials (edit cmd can apply to anything text-ish)
- OS level handler for editing files on filesystem

Implementation 
- [ ] import from ~/misc/peek-editor, put in ./extensions/editor for now
- [ ] evaluate using raw codemirror which is like “toolkit for an editor"
- [ ] evaluate using https://github.com/MarkEdit-app/MarkEdit or its approach

Features
- [ ] add support for paste operations
- [ ] settings option for url to external editor (expects peek connector support), defaults to built-in editor
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
- [ ] new page while in group mode adds to that group

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

agent mode
- [ ] agent mode: explore running application logic in a headless node

diagnostics
- [ ] diagnostic/status API: resource usage, overall disk usage, per-user disk stats, request volume and data types
- [ ] make widget on desktop

misc
- [ ] Add migration dry-run mode
- [ ] Add automatic backup cleanup after grace period

## harvester / hearts and stars

- [ ] push all services to peek node webhook, eg bsky like, reddit, oauthwonderwall?

## Mobile

- [ ] in url saves/views, show oembed, or at least page title
- [ ] for url saves, save title and any other metadata
- [ ] investigate detecting which app a share came from

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
- [ ] WebExtension integration for priority only, on some platforms, some back-ends
- [ ] Electron first, using https://github.com/samuelmaddock/electron-browser-shell/tree/master/packages/electron-chrome-extensions
- [ ] uBlock Origin
- [ ] Proton Pass
- [ ] Bypass Paywalls Clean

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

