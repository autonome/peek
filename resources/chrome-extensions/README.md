# Bundled Chrome Extensions

This directory contains unpacked Chrome extensions that are bundled with Peek.

## Adding an Extension

1. Download the extension source (unpacked format)
2. Create a subdirectory with a unique ID (e.g., `proton-pass`)
3. Place the extension files inside, including `manifest.json`

## Directory Structure

```
chrome-extensions/
├── README.md
├── proton-pass/          # Example extension
│   ├── manifest.json
│   ├── background.js
│   └── ...
└── other-extension/
    └── ...
```

## Notes

- Extensions must have a valid `manifest.json`
- The directory name is used as the extension ID
- MV2 and MV3 extensions are supported (via Electron's native API)
- Extensions are loaded on startup if enabled in Settings
