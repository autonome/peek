/**
 * Desktop App Fixture
 *
 * Provides a unified interface for launching and interacting with
 * desktop backends (Electron, Tauri) in Playwright tests.
 *
 * Usage:
 *   import { test, expect } from '../fixtures/desktop-app';
 *
 *   test('feature works', async ({ desktopApp }) => {
 *     const bg = await desktopApp.getBackgroundWindow();
 *     const result = await bg.evaluate(() => window.app.datastore.getStats());
 *     expect(result.success).toBe(true);
 *   });
 *
 * Environment:
 *   BACKEND=electron|tauri  - Select backend (default: electron)
 *   PROFILE=string          - Data isolation profile
 *   HEADLESS=1              - Run without visible windows
 *   DEBUG=1                 - Enable debug logging
 */

import { test as base, _electron as electron, ElectronApplication, Page, chromium, Browser, BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { fileURLToPath } from 'url';
import { waitForWindow as waitForWindowHelper, sleep, getTestProfile, waitForAppReady } from '../helpers/window-utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '../..');

export type Backend = 'electron' | 'tauri';

export interface DesktopApp {
  /** Which backend is running */
  backend: Backend;

  /** Get all windows/pages */
  windows(): Page[];

  /** Wait for a window matching URL pattern */
  getWindow(urlPattern: string | RegExp, timeout?: number): Promise<Page>;

  /** Get the main background window */
  getBackgroundWindow(): Promise<Page>;

  /** Get extension background windows */
  getExtensionWindows(): Page[];

  /** Close the app */
  close(): Promise<void>;
}

// Internal state for Electron
interface ElectronState {
  app: ElectronApplication;
  tempDir: string | null;  // Temp directory for test data (cleaned up on close)
  profile: string;         // Profile name for cleanup tracking
}

/**
 * Global map of profile → tempDir
 * Allows reusing the same temp directory when relaunching with the same profile
 * (needed for persistence tests that restart the app)
 */
const profileTempDirs = new Map<string, string>();

/**
 * Get or create a temp directory for a profile
 * Reuses existing temp dir if same profile is launched again (for restart tests)
 */
function getOrCreateTempDir(profile: string): string {
  // Reuse existing temp dir for same profile (enables persistence tests)
  if (profileTempDirs.has(profile)) {
    return profileTempDirs.get(profile)!;
  }

  const tempBase = os.tmpdir();
  const tempDir = path.join(tempBase, `peek-test-${profile}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  profileTempDirs.set(profile, tempDir);
  return tempDir;
}

/**
 * Recursively delete a directory
 */
function removeTempDir(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[test] Failed to clean up temp directory: ${dirPath}`, err);
  }
}

/**
 * Clean up a profile's temp directory
 * Removes from the tracking map and deletes the directory
 */
function cleanupProfile(profile: string): void {
  const tempDir = profileTempDirs.get(profile);
  if (tempDir) {
    profileTempDirs.delete(profile);
    removeTempDir(tempDir);
  }
}

/**
 * Clean up all remaining temp directories
 * Called on process exit to ensure no leftovers
 */
function cleanupAllTempDirs(): void {
  for (const [profile, tempDir] of profileTempDirs.entries()) {
    removeTempDir(tempDir);
  }
  profileTempDirs.clear();
}

// Register cleanup on process exit
process.on('exit', cleanupAllTempDirs);
process.on('SIGINT', () => { cleanupAllTempDirs(); process.exit(0); });
process.on('SIGTERM', () => { cleanupAllTempDirs(); process.exit(0); });

/**
 * Check if running in headless mode
 * Uses HEADLESS env var (unified across backends)
 */
function isHeadless(): boolean {
  const val = process.env.HEADLESS;
  return val === '1' || val === 'true';
}

/**
 * Options for launching desktop app
 */
export interface LaunchOptions {
  /** Legacy: force all extensions to separate windows (for testing) */
  legacyMode?: boolean;
}

/**
 * Check if running packaged build
 * Uses PACKAGED env var
 */
function isPackaged(): boolean {
  const val = process.env.PACKAGED;
  return val === '1' || val === 'true';
}

/**
 * Launch Electron backend
 *
 * Default is hybrid mode:
 * - Built-in extensions (cmd, groups, peeks, slides) → consolidated (iframes)
 * - External extensions (example, user-installed) → separate windows
 *
 * Supports packaged builds via PACKAGED=1 env var.
 *
 * Test data is stored in OS temp directory and cleaned up when test closes.
 */
async function launchElectron(profile: string, options: LaunchOptions = {}): Promise<DesktopApp> {
  // Translate unified HEADLESS to Electron's PEEK_HEADLESS
  const headless = isHeadless();
  const packaged = isPackaged();

  // Get or create temp directory for test data
  // Reuses same dir if same profile is relaunched (for persistence tests)
  const tempDir = getOrCreateTempDir(profile);

  // For packaged builds, use the executable path
  // For source builds, pass the project root as the first arg
  // Also add --user-data-dir to redirect data to temp directory
  const baseArgs = packaged
    ? []
    : [ROOT];

  const launchConfig = packaged
    ? {
        executablePath: path.join(ROOT, 'out/mac-arm64/Peek.app/Contents/MacOS/Peek'),
        args: [`--user-data-dir=${tempDir}`]
      }
    : {
        args: [...baseArgs, `--user-data-dir=${tempDir}`]
      };

  const electronApp = await electron.launch({
    ...launchConfig,
    env: {
      ...process.env,
      PROFILE: profile,
      DEBUG: process.env.DEBUG || '1',
      // Electron uses PEEK_HEADLESS for headless mode
      ...(headless ? { PEEK_HEADLESS: '1' } : {})
    }
  });

  // Wait for background window to be ready (API loaded)
  const bgWindow = await waitForWindowHelper(() => electronApp.windows(), 'app/background.html', 15000);
  await waitForAppReady(bgWindow, 10000);

  // Hybrid mode: wait for extension host (built-in) AND separate windows (external like 'example')
  const waitForHybridExtensions = async (timeout: number): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      // Check for extension host window (consolidated built-ins)
      const hostWindow = electronApp.windows().find(w =>
        w.url().includes('peek://app/extension-host.html')
      );
      // Check for at least one external extension window (example)
      const extWindows = electronApp.windows().filter(w =>
        w.url().includes('peek://ext/') && w.url().includes('background.html')
      );
      // Ready when we have both host and at least one external
      if (hostWindow && extWindows.length >= 1) return;
      await sleep(100);
    }
  };
  await waitForHybridExtensions(10000);

  const state: ElectronState = { app: electronApp, tempDir, profile };

  return {
    backend: 'electron',

    windows: () => electronApp.windows(),

    getWindow: async (pattern, timeout = 10000) => {
      return waitForWindowHelper(() => electronApp.windows(), pattern, timeout);
    },

    getBackgroundWindow: async () => {
      return waitForWindowHelper(() => electronApp.windows(), 'app/background.html');
    },

    getExtensionWindows: () => {
      return electronApp.windows().filter(w =>
        w.url().includes('peek://ext/') && w.url().includes('background.html')
      );
    },

    close: async () => {
      await electronApp.close();
      // Note: Temp directory cleanup happens via process exit handlers
      // This allows persistence tests to relaunch with same profile
    }
  };
}

/**
 * Tauri Frontend Mock
 *
 * Tests the frontend in isolation using a mocked backend.
 * Serves the app/ directory via HTTP and injects a mock window.app API.
 *
 * This allows reusing the same Playwright tests for both backends,
 * though only the frontend behavior is tested (backend is mocked).
 */

// Track HTTP server and browser for cleanup
let httpServer: http.Server | null = null;
let tauriBrowser: Browser | null = null;

const MOCK_PORT = 5199;

/**
 * Simple HTTP server to serve app/ and extensions/ directories
 */
function startHttpServer(): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = req.url || '/';
      let filePath: string;

      // Route based on URL prefix
      if (url.startsWith('/ext/')) {
        // Serve from extensions directory
        filePath = path.join(ROOT, 'extensions', url.replace('/ext/', ''));
      } else {
        // Serve from app directory
        filePath = path.join(ROOT, 'app', url);
      }

      // Default to index.html for directories
      if (filePath.endsWith('/')) {
        filePath += 'index.html';
      }

      // Handle .html extension
      if (!path.extname(filePath) && !filePath.endsWith('.html')) {
        // Try adding .html
        if (fs.existsSync(filePath + '.html')) {
          filePath += '.html';
        }
      }

      // Read and serve the file
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found: ' + filePath);
          return;
        }

        // Set content type
        const ext = path.extname(filePath);
        const contentType = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml'
        }[ext] || 'text/plain';

        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
      });
    });

    server.listen(MOCK_PORT, () => {
      console.log(`[tauri-mock] HTTP server running on port ${MOCK_PORT}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

/**
 * Launch Tauri Frontend Mock
 */
async function launchTauriFrontend(profile: string): Promise<DesktopApp> {
  const headless = isHeadless();

  // Start HTTP server if not already running
  if (!httpServer) {
    httpServer = await startHttpServer();
  }

  // Launch browser
  tauriBrowser = await chromium.launch({
    headless,
    args: ['--disable-web-security'] // Allow cross-origin for local files
  });

  const context = await tauriBrowser.newContext();

  // Load mock backend script
  const mockScriptPath = path.join(__dirname, '../mocks/tauri-backend.js');
  const mockScript = fs.readFileSync(mockScriptPath, 'utf-8');

  // Track all pages (windows)
  const pages: Page[] = [];

  // Inject mock backend into all new pages
  await context.addInitScript(mockScript);

  // Create main background page
  const bgPage = await context.newPage();
  pages.push(bgPage);

  // Override window.app.window.open to actually open new pages
  await bgPage.exposeFunction('__mockWindowOpen', async (url: string, options: any) => {
    // Convert peek:// URLs to localhost
    let targetUrl = url;
    if (url.startsWith('peek://app/')) {
      targetUrl = `http://localhost:${MOCK_PORT}/${url.replace('peek://app/', '')}`;
    } else if (url.startsWith('peek://ext/')) {
      targetUrl = `http://localhost:${MOCK_PORT}/ext/${url.replace('peek://ext/', '')}`;
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      // External URLs - open as-is
      targetUrl = url;
    } else if (url.startsWith('about:')) {
      targetUrl = url;
    } else {
      // Relative URL - serve from app
      targetUrl = `http://localhost:${MOCK_PORT}/${url}`;
    }

    console.log(`[tauri-mock] Opening window: ${url} -> ${targetUrl}`);
    const newPage = await context.newPage();
    pages.push(newPage);
    await newPage.goto(targetUrl).catch((e) => {
      console.log(`[tauri-mock] Navigation failed: ${e.message}`);
    });
    return { success: true, id: pages.length - 1 };
  });

  // Navigate to background page and wait for API
  await bgPage.goto(`http://localhost:${MOCK_PORT}/background.html`);
  await waitForAppReady(bgPage, 10000);

  // Simulate extension windows by creating pages for each builtin extension
  const extensions = ['groups', 'peeks', 'slides'];
  for (const ext of extensions) {
    const extPage = await context.newPage();
    pages.push(extPage);
    const extUrl = `http://localhost:${MOCK_PORT}/ext/${ext}/background.html`;
    await extPage.goto(extUrl).catch(() => {
      console.log(`[tauri-mock] Failed to load extension: ${ext}`);
    });
  }

  return {
    backend: 'tauri',

    windows: () => pages.filter(p => !p.isClosed()),

    getWindow: async (pattern, timeout = 10000) => {
      // For Tauri mock, also check for localhost URLs
      const patternStr = typeof pattern === 'string' ? pattern : pattern.source;
      return waitForWindowHelper(() => pages.filter(p => !p.isClosed()), pattern, timeout);
    },

    getBackgroundWindow: async () => {
      return bgPage;
    },

    getExtensionWindows: () => {
      return pages.filter(p => {
        if (p.isClosed()) return false;
        const url = p.url();
        return url.includes('/ext/') && url.includes('background.html');
      });
    },

    close: async () => {
      // Close all pages
      for (const page of pages) {
        if (!page.isClosed()) {
          await page.close().catch(() => {});
        }
      }
      // Close browser
      if (tauriBrowser) {
        await tauriBrowser.close();
        tauriBrowser = null;
      }
      // Stop HTTP server
      if (httpServer) {
        httpServer.close();
        httpServer = null;
      }
    }
  };
}

/**
 * Launch desktop app based on BACKEND environment variable
 */
export async function launchDesktopApp(profile?: string, options: LaunchOptions = {}): Promise<DesktopApp> {
  const backend = (process.env.BACKEND || 'electron') as Backend;
  const testProfile = profile || getTestProfile();

  if (backend === 'electron') {
    return launchElectron(testProfile, options);
  } else if (backend === 'tauri') {
    return launchTauriFrontend(testProfile);
  } else {
    throw new Error(`Unknown backend: ${backend}. Use BACKEND=electron or BACKEND=tauri`);
  }
}

/**
 * Playwright test fixture that provides a desktop app instance
 *
 * The app is launched before each test and closed after.
 */
export const test = base.extend<{ desktopApp: DesktopApp }>({
  desktopApp: async ({}, use, testInfo) => {
    // Use test title as profile base for isolation
    const profile = `test-${testInfo.title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;
    const app = await launchDesktopApp(profile);
    await use(app);
    await app.close();
  },
});

export { expect } from '@playwright/test';
