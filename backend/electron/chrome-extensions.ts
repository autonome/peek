/**
 * Chrome Extension Manager for Electron
 *
 * Provides infrastructure for loading bundled Chrome/MV3 web extensions.
 * Extensions are loaded from a bundled directory using Electron's native
 * session.loadExtension() API.
 *
 * Features:
 * - Load unpacked Chrome extensions from bundled directory
 * - Enable/disable extensions via settings (persisted in datastore)
 * - Compatible with electron-chrome-extensions for enhanced API support
 */

import { session, Extension } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import { getDb } from './datastore.js';

const DEBUG = !!process.env.DEBUG;

/**
 * Chrome extension manifest.json structure (MV3)
 */
export interface ChromeManifest {
  manifest_version: number;
  name: string;
  version: string;
  description?: string;
  icons?: Record<string, string>;
  permissions?: string[];
  host_permissions?: string[];
  background?: {
    service_worker?: string;
    scripts?: string[];
    type?: string;
  };
  content_scripts?: Array<{
    matches: string[];
    js?: string[];
    css?: string[];
    run_at?: string;
  }>;
  action?: {
    default_popup?: string;
    default_icon?: string | Record<string, string>;
    default_title?: string;
  };
}

/**
 * Discovered extension info (before loading)
 */
export interface ChromeExtensionInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  path: string;
  manifest: ChromeManifest;
}

/**
 * Loaded extension state
 */
export interface LoadedChromeExtension {
  id: string;
  name: string;
  version: string;
  path: string;
  electronExtension: Extension;
}

/**
 * Extension enable/disable setting (persisted)
 */
export interface ChromeExtensionSetting {
  extensionId: string;
  enabled: boolean;
  updatedAt: number;
}

// Module state
let extensionsDir: string | null = null;
const discoveredExtensions: Map<string, ChromeExtensionInfo> = new Map();
const loadedExtensions: Map<string, LoadedChromeExtension> = new Map();

/**
 * Initialize the chrome_extensions table in the database
 */
function initChromeExtensionsTable(): void {
  const db = getDb();
  if (!db) {
    console.error('[chrome-ext] Database not initialized');
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS chrome_extensions (
      extensionId TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      updatedAt INTEGER NOT NULL
    )
  `);

  DEBUG && console.log('[chrome-ext] Database table initialized');
}

/**
 * Get extension setting from database
 */
function getExtensionSetting(extensionId: string): ChromeExtensionSetting | null {
  const db = getDb();
  if (!db) return null;

  const row = db.prepare(
    'SELECT extensionId, enabled, updatedAt FROM chrome_extensions WHERE extensionId = ?'
  ).get(extensionId) as { extensionId: string; enabled: number; updatedAt: number } | undefined;

  if (!row) return null;

  return {
    extensionId: row.extensionId,
    enabled: row.enabled === 1,
    updatedAt: row.updatedAt,
  };
}

/**
 * Save extension setting to database
 */
function saveExtensionSetting(extensionId: string, enabled: boolean): void {
  const db = getDb();
  if (!db) return;

  const now = Date.now();
  db.prepare(`
    INSERT INTO chrome_extensions (extensionId, enabled, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(extensionId) DO UPDATE SET
      enabled = excluded.enabled,
      updatedAt = excluded.updatedAt
  `).run(extensionId, enabled ? 1 : 0, now);

  DEBUG && console.log(`[chrome-ext] Saved setting: ${extensionId} = ${enabled}`);
}

/**
 * Initialize the chrome extension manager
 * @param bundledExtensionsDir Path to the bundled extensions directory
 */
export function initChromeExtensionManager(bundledExtensionsDir: string): void {
  extensionsDir = bundledExtensionsDir;

  // Initialize database table
  initChromeExtensionsTable();

  // Discover extensions in the directory
  discoverExtensions();

  DEBUG && console.log(`[chrome-ext] Manager initialized with ${discoveredExtensions.size} extensions`);
}

/**
 * Discover extensions in the bundled directory
 */
function discoverExtensions(): void {
  if (!extensionsDir) return;

  if (!fs.existsSync(extensionsDir)) {
    DEBUG && console.log(`[chrome-ext] Extensions directory does not exist: ${extensionsDir}`);
    return;
  }

  const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const extPath = path.join(extensionsDir, entry.name);
    const manifestPath = path.join(extPath, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      DEBUG && console.log(`[chrome-ext] Skipping ${entry.name}: no manifest.json`);
      continue;
    }

    try {
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent) as ChromeManifest;

      // Use directory name as ID (standard for unpacked extensions)
      const extId = entry.name;

      const extInfo: ChromeExtensionInfo = {
        id: extId,
        name: manifest.name || extId,
        version: manifest.version || '0.0.0',
        description: manifest.description || '',
        path: extPath,
        manifest,
      };

      discoveredExtensions.set(extId, extInfo);
      DEBUG && console.log(`[chrome-ext] Discovered: ${extInfo.name} v${extInfo.version}`);
    } catch (error) {
      console.error(`[chrome-ext] Failed to read manifest for ${entry.name}:`, error);
    }
  }
}

/**
 * Load a chrome extension into the session
 */
async function loadExtension(extInfo: ChromeExtensionInfo): Promise<LoadedChromeExtension | null> {
  if (loadedExtensions.has(extInfo.id)) {
    DEBUG && console.log(`[chrome-ext] Extension already loaded: ${extInfo.id}`);
    return loadedExtensions.get(extInfo.id) || null;
  }

  try {
    const ext = await session.defaultSession.loadExtension(extInfo.path, {
      allowFileAccess: true,
    });

    const loaded: LoadedChromeExtension = {
      id: extInfo.id,
      name: extInfo.name,
      version: extInfo.version,
      path: extInfo.path,
      electronExtension: ext,
    };

    loadedExtensions.set(extInfo.id, loaded);
    DEBUG && console.log(`[chrome-ext] Loaded: ${extInfo.name}`);

    return loaded;
  } catch (error) {
    console.error(`[chrome-ext] Failed to load ${extInfo.id}:`, error);
    return null;
  }
}

/**
 * Unload a chrome extension from the session
 */
async function unloadExtension(extId: string): Promise<boolean> {
  const loaded = loadedExtensions.get(extId);
  if (!loaded) {
    DEBUG && console.log(`[chrome-ext] Extension not loaded: ${extId}`);
    return false;
  }

  try {
    await session.defaultSession.removeExtension(loaded.electronExtension.id);
    loadedExtensions.delete(extId);
    DEBUG && console.log(`[chrome-ext] Unloaded: ${loaded.name}`);
    return true;
  } catch (error) {
    console.error(`[chrome-ext] Failed to unload ${extId}:`, error);
    return false;
  }
}

/**
 * Load all enabled chrome extensions
 */
export async function loadEnabledChromeExtensions(): Promise<void> {
  DEBUG && console.log('[chrome-ext] Loading enabled extensions...');

  for (const [extId, extInfo] of discoveredExtensions) {
    const setting = getExtensionSetting(extId);

    // Default to enabled if no setting exists
    const enabled = setting ? setting.enabled : true;

    if (enabled) {
      await loadExtension(extInfo);
    }
  }

  DEBUG && console.log(`[chrome-ext] Loaded ${loadedExtensions.size} extensions`);
}

/**
 * Get list of all chrome extensions with their status
 */
export function getChromeExtensions(): Array<{
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  loaded: boolean;
}> {
  const result: Array<{
    id: string;
    name: string;
    version: string;
    description: string;
    enabled: boolean;
    loaded: boolean;
  }> = [];

  for (const [extId, extInfo] of discoveredExtensions) {
    const setting = getExtensionSetting(extId);
    const enabled = setting ? setting.enabled : true;
    const loaded = loadedExtensions.has(extId);

    result.push({
      id: extId,
      name: extInfo.name,
      version: extInfo.version,
      description: extInfo.description,
      enabled,
      loaded,
    });
  }

  return result;
}

/**
 * Enable a chrome extension
 */
export async function enableChromeExtension(extId: string): Promise<boolean> {
  const extInfo = discoveredExtensions.get(extId);
  if (!extInfo) {
    console.error(`[chrome-ext] Unknown extension: ${extId}`);
    return false;
  }

  saveExtensionSetting(extId, true);

  const loaded = await loadExtension(extInfo);
  return loaded !== null;
}

/**
 * Disable a chrome extension
 */
export async function disableChromeExtension(extId: string): Promise<boolean> {
  saveExtensionSetting(extId, false);
  return await unloadExtension(extId);
}

/**
 * Check if a chrome extension is enabled
 */
export function isChromeExtensionEnabled(extId: string): boolean {
  const setting = getExtensionSetting(extId);
  return setting ? setting.enabled : true; // Default to enabled
}

/**
 * Check if a chrome extension is loaded
 */
export function isChromeExtensionLoaded(extId: string): boolean {
  return loadedExtensions.has(extId);
}

/**
 * Get chrome extension manager status
 */
export function getChromeExtensionStatus(): {
  initialized: boolean;
  extensionsDir: string | null;
  discoveredCount: number;
  loadedCount: number;
} {
  return {
    initialized: extensionsDir !== null,
    extensionsDir,
    discoveredCount: discoveredExtensions.size,
    loadedCount: loadedExtensions.size,
  };
}

/**
 * Clean up chrome extension manager
 */
export async function cleanupChromeExtensions(): Promise<void> {
  DEBUG && console.log('[chrome-ext] Cleaning up...');

  for (const extId of loadedExtensions.keys()) {
    await unloadExtension(extId);
  }

  discoveredExtensions.clear();
  loadedExtensions.clear();
  extensionsDir = null;
}
