# Peek Extensibility Model

Balance minimal install/development/distribution barriers with web-level safety at runtime.

- Extensions are a folder with a PWA manifest and web content files
- They're opened under the peek:// protocol, each in a web content process
- Their main window is hidden, like the Peek background content process
- Extensions are run directly from their local folder (wherever the user selected)
- Hot reloading, Peek watches folder for changes, and reloads
- Extensions are managed in the settings app, eg add/remove, enable/disable
- User can open/close devtools for a given extension

Capabilities:

- Window management
- Datastore access
- Command registration
- Hotkey registration
- Pubsub messaging


Open questions for later:

- Trade off exfiltration-proof-ness for sensitive access, eg history?
- How to provide authorship verification?
- How to provide tamper detection?
- How to do extension-specific settings? Manifest link to bundled settings UI? Or a api for placement into Settings app?
- How to allow for maximal unloading vs always persistent
- How to do remixes, eg take verified extension X, copy and hack
