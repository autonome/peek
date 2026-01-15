/**
 * Hot Reload for Development
 *
 * Watches app/ and extensions/ directories and reloads windows when files change.
 * Uses Node.js native fs.watch (recursive support in Node 18+).
 */

import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow } from 'electron';

let watchers: fs.FSWatcher[] = [];
let debounceTimer: NodeJS.Timeout | null = null;
const DEBOUNCE_MS = 300;

/**
 * Start watching directories for changes
 */
export function startHotReload(rootDir: string): void {
  const appDir = path.join(rootDir, 'app');
  const extensionsDir = path.join(rootDir, 'extensions');

  console.log('[hotreload] Starting hot reload...');
  console.log('[hotreload] Watching:', appDir);
  console.log('[hotreload] Watching:', extensionsDir);

  // Watch app directory
  if (fs.existsSync(appDir)) {
    try {
      const watcher = fs.watch(appDir, { recursive: true }, (eventType, filename) => {
        if (filename && shouldReload(filename)) {
          scheduleReload(`app/${filename}`);
        }
      });
      watchers.push(watcher);
    } catch (err) {
      console.error('[hotreload] Failed to watch app/:', err);
    }
  }

  // Watch extensions directory
  if (fs.existsSync(extensionsDir)) {
    try {
      const watcher = fs.watch(extensionsDir, { recursive: true }, (eventType, filename) => {
        if (filename && shouldReload(filename)) {
          scheduleReload(`extensions/${filename}`);
        }
      });
      watchers.push(watcher);
    } catch (err) {
      console.error('[hotreload] Failed to watch extensions/:', err);
    }
  }

  console.log('[hotreload] Watching for changes (html, js, css)');
}

/**
 * Stop watching
 */
export function stopHotReload(): void {
  for (const watcher of watchers) {
    watcher.close();
  }
  watchers = [];
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  console.log('[hotreload] Stopped');
}

/**
 * Check if file change should trigger reload
 */
function shouldReload(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ['.html', '.js', '.css'].includes(ext);
}

/**
 * Schedule a reload (debounced)
 */
function scheduleReload(changedFile: string): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    reloadWindows(changedFile);
  }, DEBOUNCE_MS);
}

/**
 * Reload all peek:// windows
 */
function reloadWindows(changedFile: string): void {
  console.log(`[hotreload] File changed: ${changedFile}`);

  const windows = BrowserWindow.getAllWindows();
  let reloadedCount = 0;

  for (const win of windows) {
    if (win.isDestroyed()) continue;

    const url = win.webContents.getURL();

    // Only reload peek:// windows (our app windows)
    if (url.startsWith('peek://')) {
      win.webContents.reloadIgnoringCache();
      reloadedCount++;
    }
  }

  console.log(`[hotreload] Reloaded ${reloadedCount} window(s)`);
}
