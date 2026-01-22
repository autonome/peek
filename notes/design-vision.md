# Peek Design Vision

Design thinking, use cases, and research notes extracted from early README.

## Core Design Philosophy

Many user tasks on the web are either transient, chained or persistent, data oriented, or some mix of those. Neither the document-oriented nor application-centric web meets those needs. Traditional browser makers can't meet those needs well, for many reasons.

Characteristics of how we use the web, that are not addressed in contemporary web browsers:

- transient
- chained
- persistent
- data-centric
- archival / evidential

Some thoughts driving the design of Peek:

- Web user agents should be bounded by the user, not browser vendor business models
- Windows and tabs should have died a long time ago, a mixed metaphor constraining the ability of the web to grow/thrive/change and meet user needs
- Security user interface must be a clear articulation of risks and trade-offs, and users should own the decisions

## Escape IZUI

TODO: articulate the escape-to-leave aspect, eg you can peek from *other* applications and ESC to go back to exactly where you were without breaking the task flow.

Escape is an inverted zooming user interface (IZUI) design for a flexible window manager that makes possible a web user agent application than can have multiple entry points and a heterogeneous windowing ecosystem.

### IZUI vs ZUI

* ZUIs navigate by starting from a known root and user navigates by zooming ever further in, and then back out
* Escape can enter a window stack at any point, and via a variety of methods, often from outside the application
* Instead of navigating by zooming in, all interfaces can zoom out to go back, using the Escape key
* This design allows unbounded and diverse entry points, but with predictable behavior
* Regardless of the entry point, the user always has a consistent path to familiar ground

### Escape navigation model
* navigation base can start at any level in stack
* forward navigations are added on top of stack
* backwards navigations walk the stack in reverse up the tree to the root

## Architecture Principles

About this space:

- Web pages can themselves be navigators of the web
- Embrace the app-ness of the web platform, as a way to efficiently access the document-ness
- Decouple html+js+css from http+dns+ssl - not entirely, but that trust+security model is not a required starting point
- Javascript is ok here

Peek is designed to be modular and configurable around the idea that parts of it can run in different environments.

For example:
- Planning on a mobile app which syncs and runs your peeks/slides/scripts
- I'd like to have a decentralized compute option for running your scripts outside of your clients and syncing the data
- Want cloud storage for all config and data, esp infinite history, so can do fun things with it

## Feature Extensibility

An extensibility model for achieving "personal web workbench" requires a few things:
- UI extensibility requires OS-level window features beyond what the web allows today (also a baby step towards a minimal OS user interface)
- Data harvest/transform/process/publish requires a method of moving data between features (web apps) *locally*, cf Web Actions/Intents/Applets, MCP, pubsub, MQTT etc
- Portable ways of accessing network, storage and compute, which address

The current implementation has only a few sketches of that world implemented, and has gone through a few iterations:
- first proof of concept was all Electron - so, privileged JS
- second experiment moved each feature to a separate web app running in own window scope, with access to smallest possible custom API, with one main web app loading and orchestrating the others, using pubsub for cross-app communication
- third and current implementation bundles all features into one web app, with access to smallest possible custom API for platform-level capabilities

The web app is loaded into custom scheme of `peek`, which provides access to a few special apis noted in the next section, allows cross-origin network access and other things.

This is not ideal, as the extensibility vector is contributions to core, which too tightly bounds experimentation and innovation.

However it's pretty portable given the small custom API surface area.

It would be nice, but not required, to have some alignment with the WebExtension spec - blur your eyes and they're in a similar direction.

## Peek API Design

Initially the prototype was all Electron. But that's not interesting, and doesn't really tell us anything about constraints of the web itself.

So instead I asked this question: What's the minimum capability set that a web app would need to build the features I need?

The answer, so far, is giving `peek` apps the following APIs:

- window open/close
- global hotkey registration
- pubsub messaging

Custom window api might be able to away entirely, by passing window.open features, working on that.

## Desktop App Notes

Proof of concept is Electron. By far the best option today for cross-platform desktop apps which need a web rendering engine. There's really nothing else remotely suited (yet).

User interface:
- the built-in features are all modal chromeless web pages at this point
- settings UI uses custom sidebar navigation with dark mode support

TODO:
- Need to look at whether could library-ize some of what Agregore implemented for non-HTTP protocol support.
- Min browser might be interesting as a forkable base to work from and contribute to, if they're open to it. At least, should look more at the architecture.

## Mobile Vision

- Quick access to Script output and manual runs, as widgets (or output from cloud runners?)
- Peeks still totes useful here - on mobile is more like "quick dial" features
- some of the features don't make sense as-is on mobile
- but maybe quick access on mobile to slides/peeks would be nice
- and seeing output of content scripts, or ability to re-run locally on demand
- needs some sync facility (inevitable anyway)

## Cloud Vision

- Going full crypto payments for distributed compute on this one.

---

## Use Cases & Papercuts

### Core High Level Actions
- open a web page on top/bottom/left/right
- keep web pages persistent in the background
- quickly open a web page modally, and close it

### Specific Use Cases

- open bandcamp in a window, move over to 2nd display, accidently close it while moving around between other windows
- recent books or recipes from newsletters i subscribe to (but probably didn't read)
- extract a table from a page periodically, send it somewhere as csv or whatever (chained actions)
- collect microformats, metadata, events
- web page w/ some locations as an input to a map (creates overlay) "map this page"
- be able to see where a book/etc recommendation came from
- save a tweet, with URL / image / relevant text, but not whole page webrecorder style
- "watch local event listings, rate against my music listening patterns and send me shows i might be interested in going to"

### Content Scripts
- extract+log shazams
- extract+log spotify playlist

### Calculators (variant of script + cmd?)
- page -> table
- page -> summary
- page -> microsummaries
- page -> dates
- page -> events

### Workflow: Deconstructing a "why" Task Flavor of Bookmarking
- save https://www.criterionchannel.com/hong-kong-in-new-york
- extract the movies
- get reference metadata for each (?!)
- add to "to watch list", with pointer back to source url

---

## Groups Design

- panorama/tabcandy-ish
- all browser history
- smart groups vs curated groups
- autoclustering on topic/date
- escape from a new page enters default group?

### Groups + Cmds
- top/bottom inputs for filtering/grouping/etc
- implemented is a cmd input?
- cmds for opening/searching/finding/viewing/filtering/piping
- cmds for moving pages into groups
- groups -> {x} (eg export/pipe) could depend on the chaining/piping bit (see below)

### Architecture
- internally is tags?
- static vs dynamic groups tho?

### Publishing
- publishing groups as internal/public feeds?
- to pinboard?

---

## History View/Search

A lot of groups work depends on history being in place, and being accessable and annotate-able.

ideally use chromium history

### Storage+Access
- check out Agregore history viewing approach
- check out state of electron+webext
- other way of accessing underlying chromium history?

### Features
- awesomebar algo scoring
- adaptive matching

---

## Chaining / Piping

investigate: vague thought re chaining:
- dynamic interstitial representations
- mime type detection?
- eg image previews
- or a table of data
- previews of cmds?

### Interfaces
- horizontal vs vertical chains
- back/forward navigation?
- each step is a cmd+preview?
- dynamic cmd+previews?

### Import/Export/Undo/Redo
- record/replay?
- save a chain as a compound action (cmd)?

### Architecture
- look at web actions/intents/applets
- xml pipeline language

---

## Feature Use Cases

### Peeks
- translate
- calendar
- ai chat
- currency conversion
- everytimezone
- tldraw

### Slides
- music: Soundcloud, Hypem
- stock prices
- notepad
- todo list

### Scripts
- weather change, eg upcoming weather
- crypto prices

### Cmd - Web
- open url
- web search
- image search
- conversions?
- ddg !actions

### Cmd - System
- search browser history
- set peeks/slides
- open settings
- restart app
- llm prompts

### Future
- address something to switch between
- pipe from/to?

---

## Publishing

### High Level
- author web content
- pull in bits from the web
- share preview for feedback
- publish (or at least get output)

### Example: Event Recap Post
- make a new markdown doc
- sections titled for each video title
- each video's embed code in each section
- navigate around the document for review and updates
- need to easily preview rendered content
- share preview link
- publish (somewhere?)

### Music
- commands
- views
- last.fm of my own, to POSSE out

---

## Unfiled Ideas

### Markdown Hot Reload Previewer w/ TOC
- markdown support, with sidebar nav
- reader mode
- hot reload for file:// (other?)
- add side-by-side view
- once md and side-by-side, add side-by-side so the md is the nav, content is the preview
- what's the cmd chain for this?

### Content Types + Chaining
- cmd: view as… table, feed, markdown, data points, named entities
- chain: static archive, publish, save, share (os), mailto
- cmd params, eg {url}, which can themselves autocomplete (eg history)

### Multiprotocol
- at
- ipfs/ipns
- pragmatic addressing+rendering for data (r/d/masl + mime handlers)

### Broader Patterns (chatting w/ luke)
- why do we have to copy/paste?
- devtools and ide are divorced

### Chainframe/Framechain
- (web intents/applets/actions) + (webxdc/miniapps/tiles/farcasterframes)

### Small Examples of Agency
- users can move, resize, change things to their requirements
  - eg, browsers restrict min-height of a window, but i should be able make as short as i like

---

## Project History

In working on Firefox and related things at Mozilla from 2006 - 2019, there were a few specific initiatives which best aligned with my needs as a user on the web:

- **The Awesomebar**: infinite history + personalized local search index
- **Ubiquity**: Natural language commands + chaining
- **Jetpack**: The Mozilla Labs version - web-platfrom-centric extensibility
- **Panorama**: née TabCandy, web pages as groups instead of tabs in windows

A few others which were in the right direction but didn't achieve their optimal form:

- Greasemonkey
- Microsummaries
- Contacts extension

The first version of the Peek application has some bits of each of these, and the original Peek browser extension.

### Peek Browser Extension

Peek was a browser extension that let you quickly peek at your favorite web pages without breaking your flow - loading pages mapped to keyboard shortcuts into a modal window with no controls, closable via the `Escape` key.

However, as browser extension APIs became increasingly limited, it was not possible to create a decent user experience and I abandoned it. You can access the extension in this repo [in the extension directory](/autonome/peek/extension/).

The only way to create the ideal user experience for a web user agent that *Does What I Want* is to make it a browser-ish application, and that's what Peek is now.
