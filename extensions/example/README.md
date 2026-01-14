# Example Extension - Image Gallery

This example extension demonstrates key patterns for building Peek extensions:

## Features

1. **Peek API Feature Detection** - Works as both a Peek extension and a standalone website
2. **Command Registration with Mime Types** - Accepts image data from other commands
3. **Data Storage** - Uses Peek datastore when available, falls back to in-memory
4. **Image Gallery UI** - Displays stored images with drag-and-drop support

## Feature Detection Pattern

```javascript
// Check if Peek API is available
const hasPeekAPI = typeof window.app !== 'undefined';
const api = hasPeekAPI ? window.app : null;

// Gate functionality based on API availability
if (hasPeekAPI) {
  // Full Peek extension functionality
  api.commands.register({ ... });
  // Access commands via the cmd palette (Option+Space)
} else {
  // Fallback for standalone website mode
  console.log('Running without Peek API');
}
```

## Command with Mime Type Acceptance

Commands can declare which data types they accept:

```javascript
api.commands.register({
  name: 'example:save-image',
  description: 'Save an image to the gallery',
  accepts: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/*'],
  execute: (ctx) => {
    // ctx.input contains: { data: base64, mimeType, name }
    const imageData = ctx.input;
    storeImage(generateId(), imageData);
  }
});
```

The `accepts` array tells Peek which mime types this command can handle. When data matching these types is available, Peek can automatically offer this command.

## Storage Abstraction

```javascript
async function storeImage(id, imageData) {
  if (hasPeekAPI) {
    // Persistent storage via Peek datastore
    await api.datastore.setRow('example_images', id, imageData);
  } else {
    // In-memory fallback for standalone mode
    localStore.set(id, imageData);
  }
}

async function getStoredImages() {
  if (hasPeekAPI) {
    const result = await api.datastore.getTable('example_images');
    return result.success ? result.data : {};
  } else {
    return Object.fromEntries(localStore);
  }
}
```

## Files

- `manifest.json` - Extension metadata
- `background.html` - Entry point with feature detection
- `background.js` - Main extension logic
- `gallery.html` - Image gallery UI
- `settings-schema.json` - Settings UI schema

## Commands

| Command | Description |
|---------|-------------|
| `example:save-image` | Save an image to the gallery (accepts image/*) |
| `example:gallery` | Open the image gallery window |

Access these commands via the cmd palette (`Option+Space`).

## Running Standalone

This extension can run as a regular website:

```bash
cd extensions/example
python3 -m http.server 8080
# Open http://localhost:8080/background.html
```

In standalone mode:
- Commands and shortcuts are not available (no Peek API)
- Images are stored in memory only (no persistence)
- Gallery drag-and-drop still works
