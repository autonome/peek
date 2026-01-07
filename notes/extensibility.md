# Peek Extensibility Model

Balance minimal install/development/distribution barriers with web-level safety at runtime.

Key bits:

- Extensions are a folder with a PWA manifest and web content files
- They're opened under the peek:// protocol, each in a web content process
- Their main window is hidden, like the Peek background content process
- Extensions are run directly from their local folder (wherever the user selected)
- Extensions are managed in the main settings app, eg add/remove, enable/disable

Implementation

- New table in datastore for extensions
- New section in settings app, where users can:
  - Add/remove
  - Enable/disable
  - Activate/suspend/reload
  - Click to access settings

Note: The implementation will also instigate another shift, moving as much logic into the background web app as possible, vs in node.js space, so we can eventually move to other back-ends than Electron.

Capabilities via injected API:

- Window management
- Datastore access
- Command registration
- Hotkey registration
- Pubsub messaging

Dev workflow:

- User can open/close devtools for a given extension (via a cmd)
- User can reload a given extension (via a cmd)
- Hot reloading using node fs watcher to watch folder for changes, and reload

Open questions, for later:

- Dirty writes - add ext or sys as source. also ensure no direct writes, only api adds
- Sharded space, in/outbox style too maybe
- Trade off exfiltration-proof-ness for sensitive access, eg history?
- How to provide authorship verification? regular website + sigs
- How to provide tamper detection?
- How to do extension-specific settings? Manifest link to bundled settings UI? Or a api for placement into Settings app?
- How to allow for maximal unloading vs always persistent
- How to do remixes, eg take verified extension X, copy and hack
- figure out in-extension settings vs jamming in global settings
- syncable settings (extension decides)

Mobile, for later:
- open web pages
- if calls a registration api, user can choose to add
- permissions
- expose peek api upon approval
- also, preverification via sync


