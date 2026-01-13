# Backend Implementation Notes for Command Chaining

This document describes backend-specific implementations required for the cmd extension's chaining feature. These notes are intended for implementing the same functionality in other backends (Tauri, etc.).

## Overview

The command chaining feature requires one new backend capability:
- **File Save Dialog**: A native save-as dialog that writes content to a user-selected path

## Electron Implementation

### 1. Preload API (`preload.js`)

The preload script exposes `api.files.save()` to renderer processes:

```javascript
api.files = {
  /**
   * Show native save dialog and write content to file
   * @param {string} content - Content to save
   * @param {object} options - Options { filename, mimeType }
   * @returns {Promise<{success: boolean, path?: string, canceled?: boolean, error?: string}>}
   */
  save: (content, options = {}) => {
    return ipcRenderer.invoke('file-save-dialog', {
      content,
      filename: options.filename,
      mimeType: options.mimeType
    });
  }
};
```

**Location**: `preload.js:785-799`

### 2. IPC Handler (`backend/electron/ipc.ts`)

The main process handles `file-save-dialog` IPC messages:

```typescript
// File save dialog - shows native save dialog and writes file
ipcMain.handle('file-save-dialog', async (ev, data: {
  content: string;
  filename?: string;
  mimeType?: string;
}) => {
  try {
    // Determine file filters based on MIME type
    const filters: Electron.FileFilter[] = [];
    if (data.mimeType) {
      const extMap: Record<string, { name: string; extensions: string[] }> = {
        'application/json': { name: 'JSON', extensions: ['json'] },
        'text/csv': { name: 'CSV', extensions: ['csv'] },
        'text/plain': { name: 'Text', extensions: ['txt'] },
        'text/html': { name: 'HTML', extensions: ['html', 'htm'] },
      };
      const filter = extMap[data.mimeType];
      if (filter) {
        filters.push(filter);
      }
    }
    filters.push({ name: 'All Files', extensions: ['*'] });

    // Get the sender's window to parent the dialog
    const senderWindow = BrowserWindow.fromWebContents(ev.sender);

    const result = await dialog.showSaveDialog(senderWindow!, {
      defaultPath: data.filename,
      filters,
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Write the file
    fs.writeFileSync(result.filePath, data.content, 'utf-8');

    return { success: true, path: result.filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
});
```

**Location**: `backend/electron/ipc.ts:1131-1174`

**Imports required**:
```typescript
import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
```

## Tauri Implementation Guide

### Rust Command

Create a command in `backend/tauri/src-tauri/src/commands/`:

```rust
use tauri::api::dialog::FileDialogBuilder;
use std::fs;

#[tauri::command]
pub async fn file_save_dialog(
    window: tauri::Window,
    content: String,
    filename: Option<String>,
    mime_type: Option<String>,
) -> Result<serde_json::Value, String> {
    // Determine file filter based on MIME type
    let (name, extensions) = match mime_type.as_deref() {
        Some("application/json") => ("JSON", vec!["json"]),
        Some("text/csv") => ("CSV", vec!["csv"]),
        Some("text/plain") => ("Text", vec!["txt"]),
        Some("text/html") => ("HTML", vec!["html", "htm"]),
        _ => ("All Files", vec!["*"]),
    };

    // Use FileDialogBuilder for async dialog
    let file_path = FileDialogBuilder::new()
        .add_filter(name, &extensions)
        .set_parent(&window)
        .set_file_name(filename.unwrap_or_default())
        .save_file()
        .await;

    match file_path {
        Some(path) => {
            match fs::write(&path, content) {
                Ok(_) => Ok(serde_json::json!({
                    "success": true,
                    "path": path.to_string_lossy()
                })),
                Err(e) => Ok(serde_json::json!({
                    "success": false,
                    "error": e.to_string()
                }))
            }
        }
        None => Ok(serde_json::json!({
            "success": false,
            "canceled": true
        }))
    }
}
```

### Preload Bridge

In `backend/tauri/preload.js`, add:

```javascript
api.files = {
  save: async (content, options = {}) => {
    return window.__TAURI__.invoke('file_save_dialog', {
      content,
      filename: options.filename,
      mimeType: options.mimeType
    });
  }
};
```

## API Contract

### Request

```typescript
interface FileSaveRequest {
  content: string;      // File content to save
  filename?: string;    // Suggested filename (e.g., "data.csv")
  mimeType?: string;    // MIME type for file filter (e.g., "text/csv")
}
```

### Response

```typescript
interface FileSaveResponse {
  success: boolean;     // True if file was saved
  path?: string;        // Path where file was saved (on success)
  canceled?: boolean;   // True if user canceled dialog
  error?: string;       // Error message (on failure)
}
```

### MIME Type to Extension Mapping

| MIME Type | Filter Name | Extensions |
|-----------|-------------|------------|
| `application/json` | JSON | `.json` |
| `text/csv` | CSV | `.csv` |
| `text/plain` | Text | `.txt` |
| `text/html` | HTML | `.html`, `.htm` |
| (other/none) | All Files | `*` |

## Architecture Note: Why a Separate Window?

The save command uses a separate download window (`download.html`) instead of calling `api.files.save()` directly from the cmd panel. This is because:

1. **Modal Blur Issue**: The cmd panel is a modal window with a blur handler that closes it when focus is lost
2. **Native Dialog Focus**: When a native save dialog opens, it takes focus, triggering the blur handler
3. **Result**: Panel closes before user can interact with save dialog

**Solution**: Use a non-modal download window that:
- Receives data via pubsub from background script
- Calls `api.files.save()` without blur concerns
- Closes itself after save completes

This pattern may need to be replicated in other backends if they have similar modal window behaviors.

## Build Notes

After modifying `backend/electron/ipc.ts`:
```bash
yarn build  # Compiles TypeScript
```

For Tauri:
```bash
yarn tauri:build  # Builds Rust backend
```

## Testing

The smoke tests in `tests/desktop/smoke.spec.ts` cover:
- Command chaining flow (lists → csv → save)
- Output selection mode
- Chain mode UI elements
- MIME type filtering

Run tests:
```bash
yarn test
```
