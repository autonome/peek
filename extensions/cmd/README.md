# Cmd Extension

Command palette for quick command access via keyboard shortcut.

## Overview

The cmd extension provides a command palette interface accessible via a global keyboard shortcut (default: `Alt+Space`). Commands can be typed, selected from a dropdown, and executed. Commands from other extensions can be registered with the cmd system.

## Features

- Global keyboard shortcut for quick access
- Type-ahead filtering with adaptive matching
- Command chaining with typed data flow (MIME types)
- Preview pane for viewing command output
- Output selection mode for array results

## Command Chaining

Commands can be composed into pipelines where the output of one command becomes the input of the next. This enables powerful data transformation workflows.

### Example Flow

1. Run `lists` command → produces JSON array output
2. Select an item from the output list (arrow keys + Enter)
3. Run `csv` command → converts JSON to CSV format
4. Run `save` command → prompts to save the file

### How It Works

Commands declare what MIME types they accept and produce:

```javascript
export default {
  name: 'csv',
  description: 'Convert JSON to CSV format',
  accepts: ['application/json'],  // Input types this command handles
  produces: ['text/csv'],         // Output type this command generates

  execute: async (ctx) => {
    // ctx.input - data from previous command
    // ctx.inputMimeType - MIME type of input
    // ctx.inputTitle - human-readable title

    return {
      success: true,
      output: {
        data: csvString,
        mimeType: 'text/csv',
        title: 'CSV Output'
      }
    };
  }
};
```

### Command Types

**Producer Commands** - Start chains, produce output
- `accepts: []` (empty or omitted)
- `produces: ['application/json']`
- Example: `lists`

**Transformer Commands** - Accept input, produce output
- `accepts: ['application/json']`
- `produces: ['text/csv']`
- Example: `csv`

**Consumer Commands** - Accept input, end chains
- `accepts: ['*/*']` (or specific types)
- `produces: []` (empty or omitted)
- Example: `save`

### MIME Type Matching

The chaining system supports wildcards:
- `*/*` - matches any MIME type
- `text/*` - matches any text type (text/plain, text/csv, etc.)
- `application/json` - exact match

### Output Selection Mode

When a command produces an array of items, the panel enters "output selection mode":
- Items are displayed in the results dropdown
- Navigate with arrow keys (up/down)
- Select with Enter or Right Arrow
- The selected item becomes input for the next command
- ESC exits selection mode

### Chain Mode UI

When in chain mode:
- A chain indicator shows the current MIME type and title
- Only commands that accept the current MIME type are shown
- A preview pane displays the current data
- ESC exits chain mode first, then closes panel

## Available Commands

### lists

Produces sample list data for chaining demonstration.

```
lists           - produce sample list data
```

Output: `application/json` array

### csv

Converts JSON data to CSV format.

```
csv             - convert JSON input to CSV
```

Accepts: `application/json`
Produces: `text/csv`

### save

Saves data to a file using the native save dialog.

```
save            - save with auto-generated filename
save myfile.csv - save with specified filename
```

Accepts: `*/*` (any MIME type)
Produces: nothing (end of chain)

## Execution Context

Commands receive an execution context object:

```javascript
{
  typed: 'csv',           // Full typed string
  name: 'csv',            // Command name
  params: [],             // Array of parameters
  search: null,           // Text after command name

  // Chain mode only:
  input: {...},           // Input data from previous command
  inputMimeType: 'application/json',
  inputTitle: 'Sample list',
  inputSource: 'lists'    // Source command name
}
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Arrow Down | Show results / navigate down |
| Arrow Up | Navigate up in results |
| Enter | Execute selected command / select output item |
| Tab | Autocomplete command name |
| ESC | Exit chain mode → close panel |
| Right Arrow | Select output item (in selection mode) |

## Settings

Configure via Settings UI:

- **Shortcut Key**: Global shortcut to open cmd panel (default: `Alt+Space`)
- **Width**: Panel window width (default: 600)
- **Height**: Panel window height (default: 400)

## Registering Commands

Extensions can register commands by publishing to the `cmd:register` topic:

```javascript
api.publish('cmd:register', {
  name: 'my-command',
  description: 'Does something',
  source: 'my-extension',
  accepts: ['application/json'],
  produces: ['text/plain']
}, api.scopes.GLOBAL);
```

Or using the commands API:

```javascript
api.commands.register({
  name: 'my-command',
  description: 'Does something',
  execute: async (ctx) => { ... }
});
```

## Architecture

### Files

| File | Purpose |
|------|---------|
| `background.js` | Command registry, shortcut handling, save file coordination |
| `panel.js` | Panel UI, chain mode logic, output selection, preview rendering |
| `panel.html` | Panel layout and styles |
| `commands.js` | Command proxy/dispatch to background |
| `config.js` | Extension configuration and defaults |
| `download.html` | Save dialog window (non-modal for native dialog) |
| `commands/lists.js` | Lists command implementation |
| `commands/csv.js` | CSV converter command |
| `commands/save.js` | File save command |

### Provider Pattern

The cmd extension uses the Provider pattern:
- Owns the command registry
- Subscribes to `cmd:register`, `cmd:unregister` for command management
- Subscribes to `cmd:query` for late-arriving consumers
- Publishes `cmd:ready` when fully initialized

### Save Dialog Flow

The save command uses a separate window approach to avoid modal blur issues:

1. `save` command publishes `cmd:save-file` to background
2. Background stores data in `pendingDownloads` Map
3. Background opens `download.html` window with download ID
4. Download window subscribes to `cmd:download-data:{id}`
5. Download window publishes `cmd:download-ready`
6. Background sends data to download window
7. Download window calls `api.files.save()` for native dialog

This approach works because the download window is not modal and doesn't have a blur handler that would close it when the native dialog takes focus.
