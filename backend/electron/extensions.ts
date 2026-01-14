/**
 * Extension discovery and manifest management
 *
 * Handles:
 * - Discovering extensions from filesystem
 * - Loading and parsing manifest files
 * - Checking extension enabled state
 */

import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './datastore.js';

export interface ExtensionManifest {
  id?: string;
  shortname?: string;
  name?: string;
  description?: string;
  version?: string;
  background?: string;
  settingsSchema?: string;
  schemas?: {
    prefs?: unknown;
    item?: unknown;
  };
  storageKeys?: Record<string, string>;
  defaults?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DiscoveredExtension {
  id: string;
  path: string;
  manifest: ExtensionManifest;
}

/**
 * Discover extensions in a directory
 * Scans for subdirectories containing manifest.json
 */
export function discoverExtensions(basePath: string): DiscoveredExtension[] {
  const extensions: DiscoveredExtension[] = [];

  if (!fs.existsSync(basePath)) return extensions;

  const entries = fs.readdirSync(basePath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const extPath = path.join(basePath, entry.name);
    const manifestPath = path.join(extPath, 'manifest.json');

    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ExtensionManifest;

      // Use manifest.id or folder name as fallback
      const id = manifest.id || manifest.shortname || entry.name;

      extensions.push({ id, path: extPath, manifest });

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ext:discovery] Failed to load ${entry.name}:`, message);
    }
  }

  return extensions;
}

/**
 * Load extension manifest with settings schema
 * Returns null if manifest doesn't exist or is invalid
 */
export function loadExtensionManifest(extPath: string): ExtensionManifest | null {
  try {
    const manifestPath = path.join(extPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ExtensionManifest;

    // Load settings schema if specified
    if (manifest.settingsSchema) {
      const schemaPath = path.join(extPath, manifest.settingsSchema);
      if (fs.existsSync(schemaPath)) {
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
        // Merge schema fields into manifest for Settings UI
        manifest.schemas = { prefs: schema.prefs, item: schema.item };
        manifest.storageKeys = schema.storageKeys;
        manifest.defaults = schema.defaults;
      }
    }

    return manifest;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ext:manifest] Failed to load manifest from ${extPath}:`, message);
    return null;
  }
}

/**
 * Check if a built-in extension is enabled
 * Defaults to true for built-in extensions
 * Note: 'cmd' is always enabled - it's the command registry that other extensions depend on
 */
export function isBuiltinExtensionEnabled(extId: string): boolean {
  // cmd extension cannot be disabled - it's required for command registration
  if (extId === 'cmd') {
    return true;
  }

  try {
    const db = getDb();
    const setting = db.prepare(
      'SELECT * FROM extension_settings WHERE extensionId = ? AND key = ?'
    ).get(extId, 'enabled') as { value?: string } | undefined;

    if (setting) {
      try {
        return JSON.parse(setting.value || 'true') !== false;
      } catch {
        return true;
      }
    }
    return true; // Default to enabled for builtins
  } catch {
    return true; // Database not ready, default to enabled
  }
}

/**
 * Get all external extensions from datastore
 */
export function getExternalExtensions(): Array<{
  id: string;
  path: string | null;
  enabled: boolean;
}> {
  try {
    const db = getDb();
    const exts = db.prepare('SELECT * FROM extensions').all() as Array<{
      id: string;
      path?: string;
      enabled?: number;
    }>;

    return exts.map(ext => ({
      id: ext.id,
      path: ext.path || null,
      enabled: ext.enabled === 1
    }));
  } catch {
    return [];
  }
}
