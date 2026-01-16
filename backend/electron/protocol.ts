/**
 * Electron protocol handling for peek:// scheme
 *
 * Handles:
 * - peek://app/{path} - Core app files
 * - peek://ext/{ext-id}/{path} - Extension content
 * - peek://extensions/{path} - Shared extension infrastructure
 * - peek://theme/{path} - Current theme files (vars.css, manifest.json)
 * - peek://theme/{themeId}/{path} - Specific theme files
 */

import { protocol, net } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb } from './datastore.js';
import { DEBUG } from './config.js';

export const APP_SCHEME = 'peek';
export const APP_PROTOCOL = `${APP_SCHEME}:`;

// Extension path cache: extensionId -> filesystem path
const extensionPaths = new Map<string, string>();

// Theme path cache: themeId -> filesystem path
const themePaths = new Map<string, string>();

// Active theme ID (defaults to basic)
let activeThemeId = 'basic';

// Root directory (set during init)
let rootDir: string;

/**
 * Register the peek:// scheme as privileged
 * MUST be called before app.ready
 */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
      allowServiceWorkers: false
    }
  }]);
}

/**
 * Register a built-in extension path
 */
export function registerExtensionPath(id: string, fsPath: string): void {
  extensionPaths.set(id, fsPath);
  DEBUG && console.log('Registered extension path:', id, fsPath);
}

/**
 * Get all registered built-in extension IDs
 */
export function getRegisteredExtensionIds(): string[] {
  return Array.from(extensionPaths.keys());
}

/**
 * Register a built-in theme path
 */
export function registerThemePath(id: string, fsPath: string): void {
  themePaths.set(id, fsPath);
  DEBUG && console.log('Registered theme path:', id, fsPath);
}

/**
 * Get all registered theme IDs
 */
export function getRegisteredThemeIds(): string[] {
  return Array.from(themePaths.keys());
}

/**
 * Get theme filesystem path by ID
 * First checks built-in themes, then could check datastore for custom themes
 */
export function getThemePath(id: string): string | null {
  // Check built-in themes first
  const builtinPath = themePaths.get(id);
  if (builtinPath) return builtinPath;

  // TODO: Check datastore for custom themes
  return null;
}

/**
 * Get the active theme ID
 */
export function getActiveThemeId(): string {
  return activeThemeId;
}

/**
 * Set the active theme ID
 */
export function setActiveThemeId(id: string): boolean {
  const themePath = getThemePath(id);
  if (!themePath) {
    console.error('Theme not found:', id);
    return false;
  }
  activeThemeId = id;
  DEBUG && console.log('Active theme set to:', id);
  return true;
}

/**
 * Get extension filesystem path by ID
 * First checks built-in extensions, then datastore for external extensions
 */
export function getExtensionPath(id: string): string | null {
  // Check built-in extensions first
  const builtinPath = extensionPaths.get(id);
  if (builtinPath) return builtinPath;

  // Check datastore for external extensions
  try {
    const db = getDb();
    const ext = db.prepare('SELECT * FROM extensions WHERE id = ?').get(id) as { path?: string } | undefined;
    if (ext && ext.path) {
      return ext.path;
    }

    // Also check by shortname (stored in metadata)
    const allExts = db.prepare('SELECT * FROM extensions').all() as Array<{ path?: string; metadata?: string }>;
    for (const extData of allExts) {
      try {
        const metadata = JSON.parse(extData.metadata || '{}');
        if (metadata.shortname === id && extData.path) {
          return extData.path;
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
  } catch {
    // Database not initialized yet
  }

  return null;
}

/**
 * Initialize the protocol handler
 * Must be called after app.ready
 */
export function initProtocol(appRootDir: string): void {
  rootDir = appRootDir;

  protocol.handle(APP_SCHEME, async (req) => {
    let { host, pathname } = new URL(req.url);

    // trim leading slash
    pathname = pathname.replace(/^\//, '');

    // Handle extension content: peek://ext/{ext-id}/{path}
    if (host === 'ext') {
      const parts = pathname.split('/');
      const extId = parts[0];
      const extPath = parts.slice(1).join('/') || 'index.html';

      const extBasePath = getExtensionPath(extId);
      if (!extBasePath) {
        DEBUG && console.log('Extension not found:', extId);
        return new Response('Extension not found', { status: 404 });
      }

      const absolutePath = path.resolve(extBasePath, extPath);

      // Security: ensure path stays within extension folder
      const normalizedBase = path.normalize(extBasePath);
      if (!absolutePath.startsWith(normalizedBase)) {
        console.error('Path traversal attempt blocked:', absolutePath);
        return new Response('Forbidden', { status: 403 });
      }

      DEBUG && console.log(`[protocol] ext ${extId}/${extPath} -> ${absolutePath}`);

      const fileURL = pathToFileURL(absolutePath).toString();
      return net.fetch(fileURL);
    }

    // Handle extensions infrastructure: peek://extensions/{path}
    // This serves the extension loader and other shared extension code
    if (host === 'extensions') {
      const absolutePath = path.resolve(rootDir, 'extensions', pathname);

      // Security: ensure path stays within extensions folder
      const extensionsBase = path.resolve(rootDir, 'extensions');
      if (!absolutePath.startsWith(extensionsBase)) {
        console.error('Path traversal attempt blocked:', absolutePath);
        return new Response('Forbidden', { status: 403 });
      }

      const fileURL = pathToFileURL(absolutePath).toString();
      return net.fetch(fileURL);
    }

    // Handle theme files: peek://theme/{path} or peek://theme/{themeId}/{path}
    if (host === 'theme') {
      const parts = pathname.split('/');
      let themeId: string;
      let themePath: string;

      // Check if first part is a known theme ID
      const possibleThemeId = parts[0];
      if (possibleThemeId && getThemePath(possibleThemeId)) {
        // peek://theme/{themeId}/{path} - specific theme
        themeId = possibleThemeId;
        themePath = parts.slice(1).join('/') || 'variables.css';
      } else {
        // peek://theme/{path} - active theme
        themeId = activeThemeId;
        themePath = pathname || 'variables.css';
      }

      const themeBasePath = getThemePath(themeId);
      if (!themeBasePath) {
        DEBUG && console.log('Theme not found:', themeId);
        return new Response('Theme not found', { status: 404 });
      }

      const absolutePath = path.resolve(themeBasePath, themePath);

      // Security: ensure path stays within theme folder
      const normalizedBase = path.normalize(themeBasePath);
      if (!absolutePath.startsWith(normalizedBase)) {
        console.error('Path traversal attempt blocked:', absolutePath);
        return new Response('Forbidden', { status: 403 });
      }

      const fileURL = pathToFileURL(absolutePath).toString();

      // For CSS and font files, add no-cache headers to ensure theme changes take effect
      if (themePath.endsWith('.css') || themePath.endsWith('.woff2') || themePath.endsWith('.woff')) {
        const response = await net.fetch(fileURL);
        const body = await response.arrayBuffer();
        return new Response(body, {
          status: response.status,
          headers: {
            'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      }

      return net.fetch(fileURL);
    }

    // Handle per-extension hosts: peek://{ext-id}/{path}
    // This gives each extension a unique origin for iframe isolation
    // Check if host matches a registered extension
    const extBasePath = getExtensionPath(host);
    if (extBasePath) {
      const extPath = pathname || 'background.html';
      const absolutePath = path.resolve(extBasePath, extPath);

      // Security: ensure path stays within extension folder
      const normalizedBase = path.normalize(extBasePath);
      if (!absolutePath.startsWith(normalizedBase)) {
        console.error('Path traversal attempt blocked:', absolutePath);
        return new Response('Forbidden', { status: 403 });
      }

      const fileURL = pathToFileURL(absolutePath).toString();
      return net.fetch(fileURL);
    }

    let relativePath = pathname;

    // Handle node_modules paths
    const isNode = pathname.indexOf('node_modules') > -1;

    if (!isNode) {
      relativePath = path.join(host, pathname);
    }

    const absolutePath = path.resolve(rootDir, relativePath);
    const fileURL = pathToFileURL(absolutePath).toString();

    return net.fetch(fileURL);
  });
}
