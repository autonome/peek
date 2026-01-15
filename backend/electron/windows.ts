/**
 * Window Management Helpers
 *
 * Helper functions for managing BrowserWindow instances.
 */

import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import {
  WEB_CORE_ADDRESS,
  SETTINGS_ADDRESS,
  isTestProfile,
  isHeadless,
  DEBUG,
} from './config.js';

// Default background colors for light and dark system themes
// These are used to prevent the white flash when opening new windows
const DARK_BACKGROUND = '#1e1e1e';
const LIGHT_BACKGROUND = '#ffffff';

import {
  getWindowInfo,
  getChildWindows,
} from './main.js';

/**
 * Get the appropriate background color based on system theme
 * This helps prevent the "white flash" when opening windows in dark mode
 */
export function getSystemThemeBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? DARK_BACKGROUND : LIGHT_BACKGROUND;
}

// Preferences getter - set by index.js during initialization
let _getPrefs: () => Record<string, unknown> = () => ({});

/**
 * Set the preferences getter function
 */
export function setPrefsGetter(getter: () => Record<string, unknown>): void {
  _getPrefs = getter;
}

/**
 * Modify window state (close, hide, show)
 */
export function modWindow(bw: BrowserWindow, params: { action: string }): void {
  if (params.action === 'close') {
    bw.close();
  }
  if (params.action === 'hide') {
    bw.hide();
  }
  if (params.action === 'show') {
    bw.show();
  }
}

/**
 * Ask renderer to handle escape key
 * Returns Promise<{ handled: boolean }>
 */
export function askRendererToHandleEscape(bw: BrowserWindow): Promise<{ handled: boolean }> {
  return new Promise((resolve) => {
    const responseChannel = `escape-response-${bw.id}-${Date.now()}`;

    // Timeout after 100ms - if renderer doesn't respond, assume not handled
    const timeout = setTimeout(() => {
      ipcMain.removeAllListeners(responseChannel);
      resolve({ handled: false });
    }, 100);

    ipcMain.once(responseChannel, (_event, response) => {
      clearTimeout(timeout);
      resolve(response || { handled: false });
    });

    bw.webContents.send('escape-pressed', { responseChannel });
  });
}

/**
 * Add escape key handler to a window
 * Supports escapeMode: 'close' (default), 'navigate', 'auto'
 */
export function addEscHandler(bw: BrowserWindow): void {
  DEBUG && console.log('adding esc handler to window:', bw.id);
  bw.webContents.on('before-input-event', async (e, i) => {
    if (i.key === 'Escape' && i.type === 'keyUp') {
      // Get window info
      const entry = getWindowInfo(bw.id);
      const params = entry?.params || {};
      const escapeMode = (params.escapeMode as string) || 'close';

      DEBUG && console.log(`ESC pressed - window ${bw.id}, escapeMode: ${escapeMode}`);

      // For 'navigate' mode, ask renderer first
      if (escapeMode === 'navigate') {
        const response = await askRendererToHandleEscape(bw);
        DEBUG && console.log(`Renderer escape response:`, response);

        if (response.handled) {
          // Renderer handled the escape (internal navigation)
          DEBUG && console.log('Renderer handled escape, not closing');
          return;
        }
      }

      // For 'auto' mode, check if transient (no focused window when opened)
      if (escapeMode === 'auto') {
        if (params.transient) {
          // Transient mode - close immediately
          DEBUG && console.log('Auto mode (transient) - closing');
        } else {
          // Active mode - ask renderer first
          const response = await askRendererToHandleEscape(bw);
          DEBUG && console.log(`Renderer escape response (auto/active):`, response);

          if (response.handled) {
            DEBUG && console.log('Renderer handled escape, not closing');
            return;
          }
        }
      }

      // Close or hide the window
      DEBUG && console.log('Closing/hiding window');
      closeOrHideWindow(bw.id);
    }
  });
}

/**
 * Configure devtools for a window based on its parameters
 */
export function winDevtoolsConfig(bw: BrowserWindow): void {
  const windowData = getWindowInfo(bw.id);
  const params = windowData ? windowData.params : {};

  DEBUG && console.log('winDevtoolsConfig:', bw.id, 'openDevTools:', params.openDevTools, 'address:', params.address);

  // Check if devTools should be opened (never in test profiles or headless mode)
  if (params.openDevTools === true && !isTestProfile() && !isHeadless()) {
    const isDetached = params.detachedDevTools === true;
    // Determine if detached mode should be used
    // activate: false prevents devtools from stealing focus (only works with detach/undocked)
    const devToolsOptions: Electron.OpenDevToolsOptions = {
      mode: isDetached ? 'detach' : 'right',
      activate: false
    };

    DEBUG && console.log(`Opening DevTools for window ${bw.id} with options:`, devToolsOptions);

    // Open DevTools after a slight delay to let the main window settle
    setTimeout(() => {
      bw.webContents.openDevTools(devToolsOptions);

      // when devtools completely open, ensure content window has focus
      bw.webContents.once('devtools-opened', () => {
        // Re-focus the content window after devtools opens
        setTimeout(() => {
          if (bw.isVisible() && !bw.isDestroyed()) {
            bw.focus();
            bw.webContents.focus();
          }
        }, 100);
      });
    }, 50);
  }
}

/**
 * Close a window and its children
 * This will actually close the window regardless of "keep alive" opener params
 */
export function closeWindow(params: { id?: number }, callback?: (success: boolean) => void): void {
  DEBUG && console.log('closeWindow', params, callback != null);

  let retval = false;

  if (params.id !== undefined && getWindowInfo(params.id)) {
    DEBUG && console.log('closeWindow(): closing', params.id);

    const entry = getWindowInfo(params.id);
    if (!entry) {
      // wtf
      if (callback) callback(false);
      return;
    }

    closeChildWindows(entry.params.address as string);

    const win = BrowserWindow.fromId(params.id);
    if (win) {
      win.close();
    }

    retval = true;
  }

  if (callback) {
    callback(retval);
  }
}

/**
 * Get count of visible user windows (excluding background window)
 */
export function getVisibleWindowCount(excludeId: number | null = null): number {
  return BrowserWindow.getAllWindows().filter(win => {
    if (excludeId && win.id === excludeId) return false;
    if (win.isDestroyed()) return false;
    if (!win.isVisible()) return false;

    // Exclude the background window
    const entry = getWindowInfo(win.id);
    if (entry && entry.params.address === WEB_CORE_ADDRESS) return false;

    return true;
  }).length;
}

/**
 * Update dock visibility based on visible windows and pref
 * Show dock if: visible windows exist OR pref is enabled
 * Hide dock if: no visible windows AND pref is disabled
 */
export function updateDockVisibility(excludeId: number | null = null): void {
  if (process.platform !== 'darwin' || !app.dock) return;

  const visibleCount = getVisibleWindowCount(excludeId);
  const prefs = _getPrefs();
  const prefShowDock = prefs?.showInDockAndSwitcher === true;

  DEBUG && console.log('updateDockVisibility:', { visibleCount, prefShowDock, excludeId });

  if (visibleCount > 0 || prefShowDock) {
    DEBUG && console.log('Showing dock');
    app.dock.show();
  } else {
    DEBUG && console.log('Hiding dock');
    app.dock.hide();
  }
}

/**
 * Hide the app if there are no other visible windows
 */
export function maybeHideApp(excludeId: number): void {
  if (process.platform !== 'darwin') return;

  const visibleCount = getVisibleWindowCount(excludeId);
  DEBUG && console.log('maybeHideApp: visible windows (excluding', excludeId + '):', visibleCount);

  if (visibleCount === 0) {
    DEBUG && console.log('No other visible windows, hiding app');
    app.hide();
  } else {
    DEBUG && console.log('Other windows visible, not hiding app');
  }

  // Also update dock visibility
  updateDockVisibility(excludeId);
}

/**
 * Close or hide a window based on its parameters
 */
export function closeOrHideWindow(id: number): void {
  DEBUG && console.log('closeOrHideWindow called for ID:', id);

  try {
    const win = BrowserWindow.fromId(id);
    if (!win || win.isDestroyed()) {
      DEBUG && console.log('Window already destroyed or invalid');
      return;
    }

    const entry = getWindowInfo(id);
    DEBUG && console.log('Window entry from manager:', entry);

    if (!entry) {
      DEBUG && console.log('Window not found in window manager, closing directly');
      win.close();
      return;
    }

    const params = entry.params;
    DEBUG && console.log('Window parameters - modal:', params.modal, 'keepLive:', params.keepLive);

    // Never close the background window
    if (params.address === WEB_CORE_ADDRESS) {
      DEBUG && console.log('Refusing to close background window');
      return;
    }

    // Special case for settings window - always close it on ESC
    if (params.address === SETTINGS_ADDRESS) {
      DEBUG && console.log(`CLOSING settings window ${id}`);
      closeChildWindows(params.address as string);
      win.close();
      // Hide app to return focus to previous app (only if no other visible windows)
      maybeHideApp(id);
    }
    // Check if window should be hidden rather than closed
    // Either keepLive or modal parameter can trigger hiding behavior
    else if (params.keepLive === true || params.modal === true) {
      win.hide();
      // Hide app to return focus to previous app (only if no other visible windows)
      maybeHideApp(id);
    } else {
      // close any open windows this window opened
      closeChildWindows(params.address as string);
      DEBUG && console.log(`CLOSING window ${id} (${params.address})`);
      win.close();
      // Hide app to return focus to previous app (only if no other visible windows)
      maybeHideApp(id);
    }

    DEBUG && console.log('closeOrHideWindow completed');
  } catch (error) {
    console.error('Error in closeOrHideWindow:', error);
  }
}

/**
 * Close all child windows of a given address
 */
export function closeChildWindows(aAddress: string): void {
  DEBUG && console.log('closeChildWindows()', aAddress);

  if (aAddress === WEB_CORE_ADDRESS) {
    return;
  }

  // Get all child windows from the window manager
  const childWindows = getChildWindows(aAddress);

  for (const child of childWindows) {
    const address = child.data.params.address as string;
    DEBUG && console.log('closing child window', address, 'for', aAddress);

    // recurseme
    closeChildWindows(address);

    // close window
    const win = BrowserWindow.fromId(child.id);
    if (win) {
      win.close();
    }
  }
}
