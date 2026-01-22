# Peek

A web user agent for using the web where, when, and how you want.

Peek is not a browser. It's a workbench for experimenting with task-aligned interfaces for the web - making it easy to create new UI shapes for the web that fit your needs in the moment.

**Status:** Concept preview. Not safe for daily use. No security audit.

<img width="969" alt="settings screenshot" src="settings-screenshot.png">

## Features

- **Peeks** - Keyboard-activated modal web pages (`Opt+0-9`)
- **Slides** - Gesture-activated pages that slide in from screen edges (`Opt+arrows`)
- **Scripts** - Background page monitors that extract and track data
- **Commands** - Command palette for opening pages and executing actions
- **Groups** - Tag-based page organization (like Firefox Panorama)
- **Sync** - Cross-device sync between desktop, mobile, and server

## Quick Start

```bash
# Requirements: Node.js 24+
nvm use 24

# Install and run
yarn install
yarn debug        # Development mode with devtools
yarn start        # Normal mode
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for full development guide.

## Architecture

Peek supports multiple backends sharing the same renderer code:

```
peek/
├── app/                    # Renderer (backend-agnostic)
├── extensions/             # Built-in extensions
├── backend/
│   ├── electron/           # Desktop (primary)
│   ├── tauri/              # Desktop (Rust alternative)
│   ├── tauri-mobile/       # iOS/Android
│   └── server/             # Sync server (Node.js/Hono)
└── docs/                   # Documentation
```

## Documentation

| Doc | Description |
|-----|-------------|
| [DEVELOPMENT.md](DEVELOPMENT.md) | Development setup, commands, architecture |
| [docs/api.md](docs/api.md) | Peek API reference (`window.app`) |
| [docs/extensions.md](docs/extensions.md) | Extension development |
| [docs/datastore.md](docs/datastore.md) | Data storage and schema |
| [docs/sync.md](docs/sync.md) | Cross-device sync |
| [docs/MOBILE.md](docs/MOBILE.md) | Mobile development |

## Design Philosophy

- Web pages can be navigators of the web
- User tasks on the web are transient, chained, persistent, or data-oriented - none well-served by tabbed browsers
- The "Escape IZUI" pattern: enter at any point, ESC always returns to familiar ground
- Minimum viable API surface for web apps to access platform capabilities

See [notes/extensibility.md](notes/extensibility.md) for detailed design notes.

## Contributing

Concept stage - contributions welcome but expect dragons.

## License

MIT
