/**
 * Electron protocol handling for peek:// scheme
 *
 * Handles:
 * - peek://app/{path} - Core app files
 * - peek://ext/{ext-id}/{path} - Extension content
 * - peek://extensions/{path} - Shared extension infrastructure
 */

import { protocol, net } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb } from './datastore.js';

export const APP_SCHEME = 'peek';
export const APP_PROTOCOL = `${APP_SCHEME}:`;

// Extension path cache: extensionId -> filesystem path
const extensionPaths = new Map<string, string>();

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
  console.log('Registered extension path:', id, fsPath);
}

/**
 * Get all registered built-in extension IDs
 */
export function getRegisteredExtensionIds(): string[] {
  return Array.from(extensionPaths.keys());
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

  protocol.handle(APP_SCHEME, (req) => {
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
        console.log('Extension not found:', extId);
        return new Response('Extension not found', { status: 404 });
      }

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
