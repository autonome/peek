/**
 * IPC Handler Registration
 *
 * Centralizes all IPC handlers for the main process.
 * Handlers are thin wrappers that delegate to backend functions.
 */

import { ipcMain, nativeTheme, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import {
  // Datastore operations
  addAddress,
  getAddress,
  updateAddress,
  queryAddresses,
  addVisit,
  queryVisits,
  addContent,
  queryContent,
  getOrCreateTag,
  tagAddress,
  untagAddress,
  getTagsByFrecency,
  getAddressTags,
  getAddressesByTag,
  getUntaggedAddresses,
  getTable,
  setRow,
  getRow,
  getStats,
  isValidTable,
  getDb,
} from './datastore.js';

import {
  loadExtensionManifest,
} from './extensions.js';

import {
  getExtensionPath,
  getRegisteredThemeIds,
  getThemePath,
  getActiveThemeId,
  setActiveThemeId,
} from './protocol.js';

import {
  createExtensionWindow,
  destroyExtensionWindow,
  getExtensionWindow,
  getRunningExtensions,
  registerWindow,
  getWindowInfo,
  removeWindow,
  findWindowByKey,
  getAllWindows,
} from './main.js';

import {
  APP_DEF_WIDTH,
  APP_DEF_HEIGHT,
  getPreloadPath,
  IPC_CHANNELS,
  isHeadless,
} from './config.js';

import {
  addEscHandler,
  winDevtoolsConfig,
  closeOrHideWindow,
  updateDockVisibility,
  closeWindow,
  modWindow,
  getSystemThemeBackgroundColor,
} from './windows.js';

import {
  registerGlobalShortcut,
  unregisterGlobalShortcut,
  registerLocalShortcut,
  unregisterLocalShortcut,
} from './shortcuts.js';

import {
  publish,
  subscribe,
} from './pubsub.js';

/**
 * Register datastore IPC handlers
 */
export function registerDatastoreHandlers(): void {
  ipcMain.handle('datastore-add-address', async (ev, data) => {
    try {
      const result = addAddress(data.uri, data.options);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-get-address', async (ev, data) => {
    try {
      const result = getAddress(data.id);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-update-address', async (ev, data) => {
    try {
      const result = updateAddress(data.id, data.updates);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-query-addresses', async (ev, data) => {
    try {
      const result = queryAddresses(data.filter);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-add-visit', async (ev, data) => {
    try {
      const result = addVisit(data.addressId, data.options);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-query-visits', async (ev, data) => {
    try {
      const result = queryVisits(data.filter);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-add-content', async (ev, data) => {
    try {
      const result = addContent(data.options);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-query-content', async (ev, data) => {
    try {
      const result = queryContent(data.filter);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-get-table', async (ev, data) => {
    try {
      const tableName = data.tableName || data.table;
      if (!isValidTable(tableName)) {
        return { success: false, error: `Invalid table: ${tableName}` };
      }
      const result = getTable(tableName);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-set-row', async (ev, data) => {
    try {
      const tableName = data.tableName || data.table;
      const rowId = data.rowId || data.id;
      const rowData = data.rowData || data.row;
      if (!isValidTable(tableName)) {
        return { success: false, error: `Invalid table: ${tableName}` };
      }
      const result = setRow(tableName, rowId, rowData);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-get-row', async (ev, data) => {
    try {
      const tableName = data.tableName || data.table;
      const rowId = data.rowId || data.id;
      if (!isValidTable(tableName)) {
        return { success: false, error: `Invalid table: ${tableName}` };
      }
      const result = getRow(tableName, rowId);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-get-stats', async () => {
    try {
      const result = getStats();
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Tag operations
  ipcMain.handle('datastore-get-or-create-tag', async (ev, data) => {
    try {
      const result = getOrCreateTag(data.name);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-tag-address', async (ev, data) => {
    try {
      const result = tagAddress(data.addressId, data.tagId);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-untag-address', async (ev, data) => {
    try {
      const result = untagAddress(data.addressId, data.tagId);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-get-tags-by-frecency', async (ev, data = {}) => {
    try {
      const result = getTagsByFrecency(data.limit);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-get-address-tags', async (ev, data) => {
    try {
      const result = getAddressTags(data.addressId);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-get-addresses-by-tag', async (ev, data) => {
    try {
      const result = getAddressesByTag(data.tagId);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('datastore-get-untagged-addresses', async (ev, data) => {
    try {
      const result = getUntaggedAddresses();
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });
}

/**
 * Register extension IPC handlers
 */
export function registerExtensionHandlers(): void {
  ipcMain.handle('extension-pick-folder', async (ev) => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'No folder selected' };
      }
      return { success: true, data: { path: result.filePaths[0] } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-validate-folder', async (ev, data) => {
    try {
      const extPath = data.folderPath || data.path;
      const manifestPath = path.join(extPath, 'manifest.json');

      if (!fs.existsSync(manifestPath)) {
        return { success: false, error: 'No manifest.json found in folder' };
      }

      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      if (!manifest.id && !manifest.shortname && !manifest.name) {
        return { success: false, error: 'Manifest must have id, shortname, or name' };
      }

      // Check for background.html
      const backgroundPath = path.join(extPath, 'background.html');
      if (!fs.existsSync(backgroundPath)) {
        return { success: false, error: 'No background.html found in folder' };
      }

      return {
        success: true,
        data: {
          manifest,
          path: extPath
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-add', async (ev, data) => {
    try {
      const db = getDb();
      const extPath = data.folderPath || data.path;
      const manifestPath = path.join(extPath, 'manifest.json');

      if (!fs.existsSync(manifestPath)) {
        return { success: false, error: 'No manifest.json found' };
      }

      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);
      const id = manifest.id || manifest.shortname || manifest.name || `ext_${Date.now()}`;

      // Check if already exists
      const existing = db.prepare('SELECT * FROM extensions WHERE id = ?').get(id);
      if (existing) {
        return { success: false, error: `Extension ${id} already installed` };
      }

      // Get lastError if provided
      const lastError = data.lastError || '';
      const lastErrorAt = lastError ? Date.now() : 0;

      // Insert into database
      db.prepare(`
        INSERT INTO extensions (id, name, description, version, path, enabled, builtin, status, installedAt, updatedAt, metadata, lastError, lastErrorAt)
        VALUES (?, ?, ?, ?, ?, 1, 0, 'installed', ?, ?, ?, ?, ?)
      `).run(
        id,
        manifest.name || id,
        manifest.description || '',
        manifest.version || '0.0.0',
        extPath,
        Date.now(),
        Date.now(),
        JSON.stringify(manifest),
        lastError,
        lastErrorAt
      );

      return { success: true, data: { id, manifest, path: extPath, lastError: lastError || null } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-remove', async (ev, data) => {
    try {
      const db = getDb();
      const extId = data.id;

      // Check if exists
      const existing = db.prepare('SELECT * FROM extensions WHERE id = ?').get(extId);
      if (!existing) {
        return { success: false, error: `Extension ${extId} not found` };
      }

      // Unload if running
      destroyExtensionWindow(extId);

      // Remove from database
      db.prepare('DELETE FROM extensions WHERE id = ?').run(extId);
      db.prepare('DELETE FROM extension_settings WHERE extensionId = ?').run(extId);

      return { success: true, data: { id: extId } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-update', async (ev, data) => {
    try {
      const db = getDb();
      const extId = data.id;
      const updates = data.updates || {};

      const existing = db.prepare('SELECT * FROM extensions WHERE id = ?').get(extId);
      if (!existing) {
        return { success: false, error: `Extension ${extId} not found` };
      }

      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.enabled !== undefined) {
        fields.push('enabled = ?');
        values.push(updates.enabled ? 1 : 0);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }
      if (updates.lastError !== undefined) {
        fields.push('lastError = ?');
        values.push(updates.lastError);
      }
      if (updates.lastErrorAt !== undefined) {
        fields.push('lastErrorAt = ?');
        values.push(updates.lastErrorAt);
      }

      if (fields.length > 0) {
        fields.push('updatedAt = ?');
        values.push(Date.now());
        values.push(extId);
        db.prepare(`UPDATE extensions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      }

      const updated = db.prepare('SELECT * FROM extensions WHERE id = ?').get(extId);
      return { success: true, data: updated };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-get-all', async () => {
    try {
      const db = getDb();
      const extensions = db.prepare('SELECT * FROM extensions').all();
      return { success: true, data: extensions };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-get', async (ev, data) => {
    try {
      const db = getDb();
      const ext = db.prepare('SELECT * FROM extensions WHERE id = ?').get(data.id);
      if (!ext) {
        return { success: false, error: `Extension ${data.id} not found` };
      }
      return { success: true, data: ext };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-window-load', async (ev, data) => {
    try {
      const extId = data.id;
      const win = await createExtensionWindow(extId);
      if (!win) {
        return { success: false, error: `Failed to load extension ${extId}` };
      }
      return { success: true, data: { id: extId, windowId: win.id } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-window-unload', async (ev, data) => {
    try {
      const extId = data.id;
      const result = destroyExtensionWindow(extId);
      return { success: result, data: { id: extId } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-window-reload', async (ev, data) => {
    try {
      const extId = data.id;
      destroyExtensionWindow(extId);
      // Small delay before reload
      await new Promise(resolve => setTimeout(resolve, 100));
      const win = await createExtensionWindow(extId);
      if (!win) {
        return { success: false, error: `Failed to reload extension ${extId}` };
      }
      return { success: true, data: { id: extId, windowId: win.id } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-window-list', async () => {
    try {
      const running = getRunningExtensions();
      return { success: true, data: running };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Extension settings handlers
  // Note: preload sends { extId } but we accept both extId and id for compatibility
  ipcMain.handle('extension-settings-get', async (ev, data) => {
    try {
      const db = getDb();
      const extId = data.extId || data.id;
      const settings = db.prepare(
        'SELECT * FROM extension_settings WHERE extensionId = ?'
      ).all(extId) as Array<{ key: string; value: string }>;

      const result: Record<string, unknown> = {};
      for (const s of settings) {
        try {
          result[s.key] = JSON.parse(s.value);
        } catch {
          result[s.key] = s.value;
        }
      }
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-settings-set', async (ev, data) => {
    try {
      const db = getDb();
      const extId = data.extId || data.id;
      const settings = data.settings || {};

      for (const [key, value] of Object.entries(settings)) {
        const jsonValue = JSON.stringify(value);
        db.prepare(`
          INSERT OR REPLACE INTO extension_settings (id, extensionId, key, value, updatedAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(`${extId}_${key}`, extId, key, jsonValue, Date.now());
      }

      return { success: true, data: settings };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-settings-get-key', async (ev, data) => {
    try {
      const db = getDb();
      const extId = data.extId || data.id;
      const setting = db.prepare(
        'SELECT * FROM extension_settings WHERE extensionId = ? AND key = ?'
      ).get(extId, data.key) as { value: string } | undefined;

      if (!setting) {
        return { success: true, data: null };
      }

      try {
        return { success: true, data: JSON.parse(setting.value) };
      } catch {
        return { success: true, data: setting.value };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-settings-set-key', async (ev, data) => {
    try {
      const db = getDb();
      const extId = data.extId || data.id;
      const jsonValue = JSON.stringify(data.value);
      db.prepare(`
        INSERT OR REPLACE INTO extension_settings (id, extensionId, key, value, updatedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(`${extId}_${data.key}`, extId, data.key, jsonValue, Date.now());

      return { success: true, data: { key: data.key, value: data.value } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-manifest-get', async (ev, data) => {
    try {
      const extPath = getExtensionPath(data.id);
      if (!extPath) {
        // Check database for external extensions
        const db = getDb();
        const ext = db.prepare('SELECT * FROM extensions WHERE id = ?').get(data.id) as { path?: string } | undefined;
        if (!ext || !ext.path) {
          return { success: false, error: `Extension ${data.id} not found` };
        }
        const manifest = loadExtensionManifest(ext.path);
        return { success: true, data: manifest };
      }
      const manifest = loadExtensionManifest(extPath);
      return { success: true, data: manifest };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('extension-settings-schema', async (ev, data) => {
    try {
      const extPath = getExtensionPath(data.id);
      if (!extPath) {
        return { success: false, error: `Extension ${data.id} not found` };
      }

      const manifest = loadExtensionManifest(extPath);
      if (!manifest || !manifest.settingsSchema) {
        return { success: true, data: null };
      }

      const schemaPath = path.join(extPath, manifest.settingsSchema);
      if (!fs.existsSync(schemaPath)) {
        return { success: true, data: null };
      }

      const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);
      return { success: true, data: schema };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });
}

/**
 * Theme settings storage keys
 */
const THEME_SETTINGS_KEY = 'core';
const THEME_ID_KEY = 'theme.id';
const THEME_COLOR_SCHEME_KEY = 'theme.colorScheme';

/**
 * Get theme setting from datastore
 * Note: value is JSON.parse'd to match how utils.js datastoreStore stores values
 */
function getThemeSetting(key: string): string | null {
  try {
    const db = getDb();
    const row = db.prepare(
      'SELECT value FROM extension_settings WHERE extensionId = ? AND key = ?'
    ).get(THEME_SETTINGS_KEY, key) as { value: string } | undefined;
    if (!row?.value) return null;
    // Parse JSON-encoded value, fall back to raw value for backwards compatibility
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  } catch {
    return null;
  }
}

/**
 * Set theme setting in datastore
 * Note: value is JSON.stringify'd to match how utils.js datastoreStore expects values
 */
function setThemeSetting(key: string, value: string): void {
  const db = getDb();
  const timestamp = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO extension_settings (id, extensionId, key, value, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(`${THEME_SETTINGS_KEY}_${key}`, THEME_SETTINGS_KEY, key, JSON.stringify(value), timestamp);
}

/**
 * Broadcast theme change to all windows
 */
function broadcastThemeChange(colorScheme: string): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send('theme:changed', { colorScheme });
  }
}

/**
 * Restore the saved theme preference
 * Call this AFTER themes have been discovered/registered
 */
export function restoreSavedTheme(): void {
  const savedThemeId = getThemeSetting(THEME_ID_KEY);
  if (savedThemeId) {
    const success = setActiveThemeId(savedThemeId);
    if (!success) {
      console.warn('[theme] Failed to restore theme:', savedThemeId, '- theme may not be registered yet');
    }
  }
}

/**
 * Register theme-related IPC handlers
 */
export function registerThemeHandlers(): void {
  // Get current theme settings
  ipcMain.handle('theme:get', () => {
    const themeId = getThemeSetting(THEME_ID_KEY) || getActiveThemeId();
    const colorScheme = getThemeSetting(THEME_COLOR_SCHEME_KEY) || 'system';
    const isDark = nativeTheme.shouldUseDarkColors;

    return {
      themeId,
      colorScheme,
      isDark,
      effectiveScheme: colorScheme === 'system' ? (isDark ? 'dark' : 'light') : colorScheme
    };
  });

  // Set color scheme preference (system/light/dark)
  ipcMain.handle('theme:setColorScheme', (_ev, colorScheme: string) => {
    if (!['system', 'light', 'dark'].includes(colorScheme)) {
      return { success: false, error: 'Invalid color scheme' };
    }

    setThemeSetting(THEME_COLOR_SCHEME_KEY, colorScheme);

    // Update nativeTheme to match (affects new windows)
    nativeTheme.themeSource = colorScheme as 'system' | 'light' | 'dark';

    // Broadcast to all windows
    broadcastThemeChange(colorScheme);

    return {
      success: true,
      colorScheme,
      effectiveScheme: colorScheme === 'system'
        ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
        : colorScheme
    };
  });

  // Set active theme
  ipcMain.handle('theme:setTheme', (_ev, themeId: string) => {
    if (!setActiveThemeId(themeId)) {
      return { success: false, error: 'Theme not found' };
    }
    setThemeSetting(THEME_ID_KEY, themeId);

    // Broadcast to all windows to reload their CSS
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('theme:themeChanged', { themeId });
    }

    return { success: true, themeId };
  });

  // List available themes
  ipcMain.handle('theme:list', () => {
    const themeIds = getRegisteredThemeIds();
    const themes = themeIds.map(id => {
      const themePath = getThemePath(id);
      if (!themePath) return null;

      try {
        const manifestPath = path.join(themePath, 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        return {
          id: manifest.id || id,
          name: manifest.name || id,
          version: manifest.version || '1.0.0',
          description: manifest.description || '',
          colorSchemes: manifest.colorSchemes || ['light', 'dark'],
        };
      } catch {
        return { id, name: id, version: '1.0.0', description: '', colorSchemes: ['light', 'dark'] };
      }
    }).filter(Boolean);

    return { themes };
  });

  // Legacy dark-mode handlers for backwards compatibility
  ipcMain.handle('dark-mode:toggle', () => {
    const newScheme = nativeTheme.shouldUseDarkColors ? 'light' : 'dark';
    setThemeSetting(THEME_COLOR_SCHEME_KEY, newScheme);
    nativeTheme.themeSource = newScheme;
    broadcastThemeChange(newScheme);
    return nativeTheme.shouldUseDarkColors;
  });

  ipcMain.handle('dark-mode:system', () => {
    setThemeSetting(THEME_COLOR_SCHEME_KEY, 'system');
    nativeTheme.themeSource = 'system';
    broadcastThemeChange('system');
    return nativeTheme.shouldUseDarkColors;
  });

  // Listen for system theme changes
  nativeTheme.on('updated', () => {
    const colorScheme = getThemeSetting(THEME_COLOR_SCHEME_KEY) || 'system';
    if (colorScheme === 'system') {
      broadcastThemeChange('system');
    }
  });

  // ===== Theme management (add/remove/reload) =====

  // Open folder picker for themes
  ipcMain.handle('theme:pickFolder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }
      return { success: true, data: { path: result.filePaths[0] } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Validate a theme folder
  ipcMain.handle('theme:validateFolder', async (_ev, data) => {
    try {
      const themePath = data.folderPath || data.path;
      const manifestPath = path.join(themePath, 'manifest.json');

      if (!fs.existsSync(manifestPath)) {
        return { success: false, error: 'No manifest.json found in folder' };
      }

      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      if (!manifest.id && !manifest.name) {
        return { success: false, error: 'Manifest must have id or name' };
      }

      // Check for variables.css (or whatever the manifest points to)
      const variablesFile = manifest.variables || 'variables.css';
      const variablesPath = path.join(themePath, variablesFile);
      if (!fs.existsSync(variablesPath)) {
        return { success: false, error: `Theme CSS file not found: ${variablesFile}` };
      }

      return {
        success: true,
        data: {
          manifest,
          path: themePath
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Add a theme
  ipcMain.handle('theme:add', async (_ev, data) => {
    try {
      const db = getDb();
      const themePath = data.folderPath || data.path;
      const manifestPath = path.join(themePath, 'manifest.json');

      if (!fs.existsSync(manifestPath)) {
        return { success: false, error: 'No manifest.json found' };
      }

      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);
      const id = manifest.id || manifest.name || `theme_${Date.now()}`;

      // Check if already exists
      const existing = db.prepare('SELECT * FROM themes WHERE id = ?').get(id);
      if (existing) {
        return { success: false, error: `Theme ${id} already installed` };
      }

      const lastError = data.lastError || '';
      const lastErrorAt = lastError ? Date.now() : 0;

      // Insert into database
      db.prepare(`
        INSERT INTO themes (id, name, description, version, author, path, builtin, enabled, installedAt, updatedAt, lastError, lastErrorAt, metadata)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?)
      `).run(
        id,
        manifest.name || id,
        manifest.description || '',
        manifest.version || '1.0.0',
        manifest.author || '',
        themePath,
        Date.now(),
        Date.now(),
        lastError,
        lastErrorAt,
        JSON.stringify(manifest)
      );

      // Register the theme path so it's available via peek://theme/
      const { registerThemePath } = await import('./protocol.js');
      registerThemePath(id, themePath);

      return { success: true, data: { id, manifest, path: themePath, lastError: lastError || null } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Remove a theme
  ipcMain.handle('theme:remove', async (_ev, data) => {
    try {
      const db = getDb();
      const themeId = data.id;

      // Check if exists
      const existing = db.prepare('SELECT * FROM themes WHERE id = ?').get(themeId) as { builtin?: number } | undefined;
      if (!existing) {
        return { success: false, error: `Theme ${themeId} not found` };
      }

      // Don't allow removing builtin themes
      if (existing.builtin === 1) {
        return { success: false, error: 'Cannot remove built-in theme' };
      }

      // Remove from database
      db.prepare('DELETE FROM themes WHERE id = ?').run(themeId);

      return { success: true, data: { id: themeId } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Get all themes (builtin + external)
  ipcMain.handle('theme:getAll', async () => {
    try {
      const db = getDb();

      // Get builtin themes from registry
      const builtinIds = getRegisteredThemeIds();
      const themes: Array<{
        id: string;
        name: string;
        description: string;
        version: string;
        author: string;
        path: string;
        builtin: boolean;
        colorSchemes: string[];
      }> = [];

      // Add builtin themes
      for (const id of builtinIds) {
        const themePath = getThemePath(id);
        if (!themePath) continue;

        try {
          const manifestPath = path.join(themePath, 'manifest.json');
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          themes.push({
            id: manifest.id || id,
            name: manifest.name || id,
            description: manifest.description || '',
            version: manifest.version || '1.0.0',
            author: manifest.author || '',
            path: themePath,
            builtin: true,
            colorSchemes: manifest.colorSchemes || ['light', 'dark'],
          });
        } catch {
          themes.push({
            id,
            name: id,
            description: '',
            version: '1.0.0',
            author: '',
            path: themePath,
            builtin: true,
            colorSchemes: ['light', 'dark'],
          });
        }
      }

      // Add external themes from database
      const externalThemes = db.prepare('SELECT * FROM themes WHERE builtin = 0').all() as Array<{
        id: string;
        name: string;
        description: string;
        version: string;
        author: string;
        path: string;
        metadata?: string;
      }>;

      for (const ext of externalThemes) {
        let colorSchemes = ['light', 'dark'];
        try {
          const metadata = JSON.parse(ext.metadata || '{}');
          colorSchemes = metadata.colorSchemes || colorSchemes;
        } catch { /* ignore */ }

        themes.push({
          id: ext.id,
          name: ext.name,
          description: ext.description,
          version: ext.version,
          author: ext.author,
          path: ext.path,
          builtin: false,
          colorSchemes,
        });
      }

      return { success: true, data: themes };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Reload a theme (re-read manifest, notify windows)
  ipcMain.handle('theme:reload', async (_ev, data) => {
    try {
      const themeId = data.id;
      const themePath = getThemePath(themeId);
      if (!themePath) {
        return { success: false, error: 'Theme not found' };
      }

      // Broadcast to all windows to reload their CSS
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.webContents.send('theme:reload', { themeId });
      }

      return { success: true, data: { id: themeId } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });
}

// Keep old function name for compatibility but call new one
export function registerDarkModeHandlers(): void {
  registerThemeHandlers();
}

/**
 * Register window management IPC handlers
 */
export function registerWindowHandlers(): void {
  ipcMain.handle('window-open', async (ev, msg) => {
    console.log('window-open', msg);

    const { url, options } = msg;

    // Check if window with this key already exists
    if (options.key) {
      const existingWindow = findWindowByKey(msg.source, options.key);
      if (existingWindow) {
        console.log('Reusing existing window with key:', options.key);
        if (!isHeadless()) {
          existingWindow.window.show();
        }
        return { success: true, id: existingWindow.id, reused: true };
      }
    }

    // Prepare browser window options
    const winOptions: Electron.BrowserWindowConstructorOptions = {
      ...options,
      width: parseInt(options.width) || APP_DEF_WIDTH,
      height: parseInt(options.height) || APP_DEF_HEIGHT,
      show: isHeadless() ? false : options.show !== false,
      // Don't set backgroundColor for transparent windows - it would show through
      backgroundColor: options.transparent ? undefined : getSystemThemeBackgroundColor(),
      webPreferences: {
        ...options.webPreferences,
        preload: getPreloadPath()
      }
    };

    // Make sure position parameters are correctly handled
    if (options.x !== undefined) {
      winOptions.x = parseInt(options.x);
    }
    if (options.y !== undefined) {
      winOptions.y = parseInt(options.y);
    }

    if (options.modal === true) {
      winOptions.frame = false;
      // Use panel type on macOS to improve focus restoration when closed
      if (process.platform === 'darwin') {
        winOptions.type = 'panel';
      }
    }

    console.log('Creating window with options:', winOptions);

    // Create new window
    const win = new BrowserWindow(winOptions);

    // Forward console logs from window to main process stdout (for debugging)
    win.webContents.on('console-message', (_event, _level, message) => {
      // Only forward for peek:// URLs to avoid noise
      if (url.startsWith('peek://')) {
        console.log(`[${url.replace('peek://', '')}] ${message}`);
      }
    });

    try {
      await win.loadURL(url);

      // Determine if this is a transient window (opened while no Peek window was focused)
      // Used for escapeMode: 'auto' to decide between navigate and close behavior
      const focusedWindow = BrowserWindow.getFocusedWindow();
      const isTransient = !focusedWindow || focusedWindow.isDestroyed();

      // Add to window manager with modal parameter
      const windowParams = {
        ...options,
        address: url,
        transient: isTransient
      };
      console.log('Adding window to manager:', win.id, 'modal:', windowParams.modal, 'keepLive:', windowParams.keepLive);
      registerWindow(win.id, msg.source, windowParams);

      // Add escape key handler to all windows
      addEscHandler(win);

      // Set up DevTools if requested
      winDevtoolsConfig(win);

      // Set up modal behavior if requested
      // Delay blur handler attachment to avoid race condition where focus events
      // are still settling after window creation (can cause immediate close)
      if (options.modal === true) {
        setTimeout(() => {
          if (!win.isDestroyed()) {
            win.on('blur', () => {
              console.log('window-open: blur for modal window', url);
              closeOrHideWindow(win.id);
            });
          }
        }, 100);
      }

      // Show dock when window opens
      updateDockVisibility();

      return { success: true, id: win.id };
    } catch (error) {
      console.error('Failed to open window:', error);
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('window-close', async (_ev, msg) => {
    console.log('window-close', msg);

    try {
      if (!msg.id) {
        return { success: false, error: 'Window ID is required' };
      }

      const win = BrowserWindow.fromId(msg.id);
      if (!win) {
        return { success: false, error: 'Window not found' };
      }

      win.close();
      return { success: true };
    } catch (error) {
      console.error('Failed to close window:', error);
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('window-hide', async (_ev, msg) => {
    console.log('window-hide', msg);

    try {
      if (!msg.id) {
        return { success: false, error: 'Window ID is required' };
      }

      const winData = getWindowInfo(msg.id);
      if (!winData) {
        return { success: false, error: 'Window not found in window manager' };
      }

      const win = BrowserWindow.fromId(msg.id);
      if (!win) {
        removeWindow(msg.id);
        return { success: false, error: 'Window not found' };
      }

      win.hide();
      return { success: true };
    } catch (error) {
      console.error('Failed to hide window:', error);
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('window-show', async (_ev, msg) => {
    console.log('window-show', msg);

    try {
      if (!msg.id) {
        return { success: false, error: 'Window ID is required' };
      }

      const winData = getWindowInfo(msg.id);
      if (!winData) {
        return { success: false, error: 'Window not found in window manager' };
      }

      const win = BrowserWindow.fromId(msg.id);
      if (!win) {
        removeWindow(msg.id);
        return { success: false, error: 'Window not found' };
      }

      win.show();
      updateDockVisibility();
      return { success: true };
    } catch (error) {
      console.error('Failed to show window:', error);
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('window-move', async (_ev, msg) => {
    console.log('window-move', msg);

    try {
      if (!msg.id) {
        return { success: false, error: 'Window ID is required' };
      }

      const winData = getWindowInfo(msg.id);
      if (!winData) {
        return { success: false, error: 'Window not found in window manager' };
      }

      const win = BrowserWindow.fromId(msg.id);
      if (!win) {
        removeWindow(msg.id);
        return { success: false, error: 'Window not found' };
      }

      if (typeof msg.x !== 'number' || typeof msg.y !== 'number') {
        return { success: false, error: 'Valid x and y coordinates are required' };
      }

      win.setPosition(msg.x, msg.y);
      return { success: true };
    } catch (error) {
      console.error('Failed to move window:', error);
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('window-focus', async (_ev, msg) => {
    console.log('window-focus', msg);

    try {
      if (!msg.id) {
        return { success: false, error: 'Window ID is required' };
      }

      const winData = getWindowInfo(msg.id);
      if (!winData) {
        return { success: false, error: 'Window not found in window manager' };
      }

      const win = BrowserWindow.fromId(msg.id);
      if (!win) {
        removeWindow(msg.id);
        return { success: false, error: 'Window not found' };
      }

      if (!isHeadless()) {
        win.focus();
      }
      return { success: true };
    } catch (error) {
      console.error('Failed to focus window:', error);
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('window-blur', async (_ev, msg) => {
    console.log('window-blur', msg);

    try {
      if (!msg.id) {
        return { success: false, error: 'Window ID is required' };
      }

      const winData = getWindowInfo(msg.id);
      if (!winData) {
        return { success: false, error: 'Window not found in window manager' };
      }

      const win = BrowserWindow.fromId(msg.id);
      if (!win) {
        removeWindow(msg.id);
        return { success: false, error: 'Window not found' };
      }

      win.blur();
      return { success: true };
    } catch (error) {
      console.error('Failed to blur window:', error);
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('window-exists', async (_ev, msg) => {
    console.log('window-exists', msg);

    try {
      if (!msg.id) {
        return { exists: false, error: 'Window ID is required' };
      }

      const winData = getWindowInfo(msg.id);
      if (!winData) {
        return { exists: false };
      }

      const win = BrowserWindow.fromId(msg.id);
      if (!win || win.isDestroyed()) {
        removeWindow(msg.id);
        return { exists: false };
      }

      return { exists: true };
    } catch (error) {
      console.error('Failed to check if window exists:', error);
      const message = error instanceof Error ? error.message : String(error);
      return { exists: false, error: message };
    }
  });

  ipcMain.handle('window-list', async (_ev, msg) => {
    console.log('window-list', msg);

    try {
      const windows: Array<{
        id: number;
        url: string;
        title: string;
        source: string;
        params: Record<string, unknown>;
      }> = [];

      for (const [id, winData] of getAllWindows()) {
        const win = BrowserWindow.fromId(id);
        if (win && !win.isDestroyed()) {
          const url = win.webContents.getURL();

          // Skip internal peek:// URLs unless requested
          if (!msg?.includeInternal && url.startsWith('peek://')) {
            continue;
          }

          windows.push({
            id,
            url,
            title: win.getTitle(),
            source: winData.source,
            params: winData.params
          });
        }
      }

      return { success: true, windows };
    } catch (error) {
      console.error('Failed to list windows:', error);
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, windows: [] };
    }
  });
}

/**
 * Register miscellaneous IPC handlers (shortcuts, pubsub, commands, etc.)
 */
export function registerMiscHandlers(onQuit: () => void): void {
  // Renderer log forwarding - prints renderer console.log to terminal
  ipcMain.on(IPC_CHANNELS.RENDERER_LOG, (_ev, msg) => {
    const shortSource = msg.source?.replace('peek://app/', '') || 'unknown';
    console.log(`[${shortSource}]`, ...(msg.args || []));
  });

  // Register shortcut
  ipcMain.on(IPC_CHANNELS.REGISTER_SHORTCUT, (ev, msg) => {
    const isGlobal = msg.global === true;
    console.log('ipc register shortcut', msg.shortcut, isGlobal ? '(global)' : '(local)');

    const callback = () => {
      console.log('on(registershortcut): shortcut executed', msg.shortcut, msg.replyTopic);
      ev.reply(msg.replyTopic, { foo: 'bar' });
    };

    if (isGlobal) {
      registerGlobalShortcut(msg.shortcut, msg.source, callback);
    } else {
      registerLocalShortcut(msg.shortcut, msg.source, callback);
    }
  });

  // Unregister shortcut
  ipcMain.on(IPC_CHANNELS.UNREGISTER_SHORTCUT, (_ev, msg) => {
    const isGlobal = msg.global === true;
    console.log('ipc unregister shortcut', msg.shortcut, isGlobal ? '(global)' : '(local)');

    if (isGlobal) {
      const err = unregisterGlobalShortcut(msg.shortcut);
      if (err) {
        console.log('ipc unregister global shortcut error:', err.message);
      }
    } else {
      unregisterLocalShortcut(msg.shortcut);
    }
  });

  // Close window
  ipcMain.on(IPC_CHANNELS.CLOSE_WINDOW, (ev, msg) => {
    closeWindow(msg.params, (output) => {
      console.log('main.closeWindow api callback, output:', output);
      if (msg && msg.replyTopic) {
        ev.reply(msg.replyTopic, output);
      }
    });
  });

  // PubSub publish
  ipcMain.on(IPC_CHANNELS.PUBLISH, (_ev, msg) => {
    console.log('ipc:publish', msg);
    publish(msg.source, msg.scope, msg.topic, msg.data);
  });

  // PubSub subscribe
  ipcMain.on(IPC_CHANNELS.SUBSCRIBE, (ev, msg) => {
    console.log('ipc:subscribe', msg);

    subscribe(msg.source, msg.scope, msg.topic, (data: unknown) => {
      console.log('ipc:subscribe:notification', msg);
      ev.reply(msg.replyTopic, data);
    });
  });

  // Console log from renderer
  ipcMain.on(IPC_CHANNELS.CONSOLE, (_ev, msg) => {
    console.log('r:', msg.source, msg.text);
  });

  // App quit request
  ipcMain.on(IPC_CHANNELS.APP_QUIT, (_ev, msg) => {
    console.log('app-quit requested from:', msg?.source);
    onQuit();
  });

  // Modify window
  ipcMain.on(IPC_CHANNELS.MODIFY_WINDOW, (ev, msg) => {
    console.log('modifywindow', msg);

    const key = Object.prototype.hasOwnProperty.call(msg, 'name') ? msg.name : null;

    if (key != null) {
      const existingWindow = findWindowByKey(msg.source, key);
      if (existingWindow) {
        console.log('FOUND WINDOW FOR KEY', key);
        const bw = existingWindow.window;
        let r = false;
        try {
          modWindow(bw, msg.params);
          r = true;
        } catch (ex) {
          console.error(ex);
        }
        ev.reply(msg.replyTopic, { output: r });
      }
    }
  });

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
      // This prevents the modal panel from blurring when dialog opens
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
}

/**
 * Register all IPC handlers
 */
export function registerAllHandlers(onQuit: () => void): void {
  registerDarkModeHandlers();
  registerDatastoreHandlers();
  registerExtensionHandlers();
  registerWindowHandlers();
  registerMiscHandlers(onQuit);
}
