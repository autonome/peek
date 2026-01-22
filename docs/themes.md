# Peek Themes

Themes control the visual appearance of Peek, including colors and typography. They use a Base16 color scheme that supports light and dark variants.

## Theme Structure

Each theme lives in its own directory under `themes/`:

```
themes/
  basic/
    manifest.json       # Theme metadata
    variables.css       # CSS custom properties
  peek/
    manifest.json
    variables.css
    fonts/              # Optional custom fonts
      ServerMono-Regular.woff2
```

### manifest.json

Required fields:
```json
{
  "id": "basic",
  "name": "Basic",
  "version": "1.0.0"
}
```

Optional fields:
```json
{
  "description": "Clean minimal theme",
  "author": "Peek Team",
  "colorSchemes": ["light", "dark"]
}
```

### variables.css

Defines CSS custom properties using the Base16 color scheme. The file must define:

1. **Base colors (base00-base0F)** - 16 colors following Base16 conventions
2. **Semantic aliases** - Mapped to base colors for easier use
3. **Typography** - Font families for sans and mono text

```css
/* Light mode (default) */
:root {
  /* Base16 Grayscale */
  --base00: #ffffff;  /* Default Background */
  --base01: #f5f5f5;  /* Lighter Background */
  --base02: #e0e0e0;  /* Selection Background */
  --base03: #b0b0b0;  /* Comments, Muted */
  --base04: #666666;  /* Dark Foreground */
  --base05: #333333;  /* Default Foreground */
  --base06: #1a1a1a;  /* Light Foreground */
  --base07: #0f0f0f;  /* Lightest */

  /* Base16 Accent Colors */
  --base08: #d73a49;  /* Red - Errors */
  --base09: #e36209;  /* Orange */
  --base0A: #c08b00;  /* Yellow */
  --base0B: #22863a;  /* Green - Success */
  --base0C: #1b7c83;  /* Cyan */
  --base0D: #0066cc;  /* Blue - Primary Accent */
  --base0E: #6f42c1;  /* Purple */
  --base0F: #8b4513;  /* Brown */

  /* Semantic Aliases */
  --theme-bg: var(--base00);
  --theme-text: var(--base05);
  --theme-accent: var(--base0D);

  /* Typography */
  --theme-font-sans: -apple-system, BlinkMacSystemFont, sans-serif;
  --theme-font-mono: "SF Mono", monospace;
}

/* Dark mode (system preference) */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --base00: #1c1c1e;
    /* ... dark variants ... */
  }
}

/* Forced light mode */
[data-theme="light"] {
  --base00: #ffffff;
  /* ... light variants ... */
}

/* Forced dark mode */
[data-theme="dark"] {
  --base00: #1c1c1e;
  /* ... dark variants ... */
}
```

### Custom Fonts

Themes can include custom fonts. Reference them using `peek://theme/{themeId}/` URLs:

```css
@font-face {
  font-family: "ServerMono";
  src: url("peek://theme/peek/fonts/ServerMono-Regular.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
}
```

## Using Theme Variables

CSS files should import the active theme and use its variables:

```css
/* Import active theme */
@import url('peek://theme/variables.css');

body {
  background: var(--base00);
  color: var(--base05);
  font-family: var(--theme-font-sans);
}

.button {
  background: var(--base0D);
  color: var(--base00);
}

.error {
  color: var(--base08);
}
```

## Theme Protocol

The `peek://theme/` protocol serves theme files:

- `peek://theme/variables.css` - Active theme's variables.css
- `peek://theme/manifest.json` - Active theme's manifest
- `peek://theme/{themeId}/variables.css` - Specific theme's variables
- `peek://theme/{themeId}/fonts/file.woff2` - Theme font files

Theme CSS and font files are served with `Cache-Control: no-store` headers to ensure theme changes take effect immediately.

## Theme API

The Peek API exposes theme functionality via `window.app.theme`:

```javascript
// Get current theme state
const state = await api.theme.get();
// Returns: { themeId, colorScheme, isDark, effectiveScheme }

// Set active theme
await api.theme.setTheme('peek');

// Set color scheme preference
await api.theme.setColorScheme('dark');  // 'system', 'light', or 'dark'

// List available themes
const result = await api.theme.getAll();
// Returns: { success: true, data: [{ id, name, version, ... }] }

// Listen for theme changes (CSS will auto-reload)
// This is handled automatically by the Peek API
```

## Color Scheme Modes

Themes support three color scheme modes:

1. **System** (default) - Follows OS light/dark preference
2. **Light** - Forces light mode
3. **Dark** - Forces dark mode

The mode is controlled via the `data-theme` attribute on `<html>`:
- No attribute: follows `prefers-color-scheme` media query
- `data-theme="light"`: forces light mode
- `data-theme="dark"`: forces dark mode

## Built-in Themes

### Basic
Clean, minimal theme using system fonts and neutral colors.

### Peek
Monospace aesthetic using ServerMono font with iOS-inspired accent colors.

## Theme Settings Storage

Theme settings are stored in the `extension_settings` datastore table:

- `extensionId`: `'core'`
- `key`: `'theme.id'` or `'theme.colorScheme'`
- `value`: JSON-encoded string (e.g., `"peek"`, `"system"`)

## Creating a New Theme

1. Create a new directory under `themes/`:
   ```
   themes/mytheme/
     manifest.json
     variables.css
   ```

2. Define the manifest:
   ```json
   {
     "id": "mytheme",
     "name": "My Theme",
     "version": "1.0.0",
     "description": "My custom theme"
   }
   ```

3. Define CSS variables following the Base16 scheme

4. Restart Peek - the theme will be auto-discovered

## Debugging

Check theme loading in console:
```
Registered theme path: basic /path/to/themes/basic
Discovered theme: basic
```

Run with `DEBUG=1 yarn start` for verbose logging.
