/**
 * Electron Main Process Entry Point
 *
 * This module orchestrates the main process startup and provides
 * a unified API for managing the Electron application.
 */

import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

import { initDatabase, closeDatabase, getDb } from './datastore.js';
import { registerScheme, initProtocol, registerExtensionPath, getExtensionPath, getRegisteredExtensionIds, registerThemePath } from './protocol.js';
import { discoverExtensions, loadExtensionManifest, isBuiltinExtensionEnabled, getExternalExtensions } from './extensions.js';
import { initTray } from './tray.js';
import { registerLocalShortcut, unregisterLocalShortcut, handleLocalShortcut, registerGlobalShortcut, unregisterGlobalShortcut, unregisterShortcutsForAddress } from './shortcuts.js';
import { scopes, publish, subscribe, setExtensionBroadcaster, getSystemAddress } from './pubsub.js';
import { APP_DEF_WIDTH, APP_DEF_HEIGHT, WEB_CORE_ADDRESS, getPreloadPath, isTestProfile, isDevProfile, isHeadless, getProfile, DEBUG } from './config.js';
import { addEscHandler, winDevtoolsConfig, closeOrHideWindow, getSystemThemeBackgroundColor } from './windows.js';

// Configuration
export interface AppConfig {
  rootDir: string;
  preloadPath: string;
  userDataPath: string;
  profile: string;
  isDev: boolean;
  isTest: boolean;
}

// App state
let config: AppConfig;
let mainWindow: BrowserWindow | null = null;

// External URL handling state
let _appReady = false;
let _pendingUrls: Array<{ url: string; sourceId: string }> = [];

// Extension windows: extId -> { win, manifest, status }
const extensionWindows = new Map<string, {
  win: BrowserWindow;
  manifest: unknown;
  status: 'loading' | 'running' | 'crashed';
}>();

// Extension host window for built-in extensions (consolidated mode)
let extensionHostWindow: BrowserWindow | null = null;

// Built-in extensions that load in consolidated mode (iframes)
// External extensions (including 'example') load in separate windows
const CONSOLIDATED_EXTENSION_IDS = ['cmd', 'groups', 'peeks', 'slides'];

// Window manager: windowId -> { source, params }
const windowRegistry = new Map<number, {
  source: string;
  params: Record<string, unknown>;
}>();

/**
 * Initialize the application configuration
 * Must be called before app.ready
 */
export function configure(cfg: AppConfig): void {
  config = cfg;

  // Use system theme
  nativeTheme.themeSource = 'system';

  // Register custom protocol scheme (must be before app.ready)
  registerScheme();
}

/**
 * Initialize the application
 * Called after app.ready
 */
export async function initialize(): Promise<void> {
  if (!config) {
    throw new Error('App not configured. Call configure() first.');
  }

  // Initialize protocol handler
  initProtocol(config.rootDir);

  // Initialize database
  const dbPath = path.join(config.userDataPath, config.profile, 'datastore.sqlite');
  initDatabase(dbPath);

  // Set up extension broadcaster for pubsub
  // Hybrid mode: broadcast to BOTH consolidated (iframes) AND separate windows
  setExtensionBroadcaster((topic, msg, source) => {
    const sourceOrigin = source.startsWith('peek://') ? new URL(source).origin : source;

    // Broadcast to consolidated extension iframes (built-in extensions)
    if (extensionHostWindow && !extensionHostWindow.isDestroyed()) {
      const mainFrame = extensionHostWindow.webContents.mainFrame;
      for (const frame of mainFrame.framesInSubtree) {
        if (frame !== mainFrame && frame.url) {
          const frameOrigin = new URL(frame.url).origin;
          // Don't echo back to sender
          if (frameOrigin !== sourceOrigin) {
            frame.send(`pubsub:${topic}`, {
              ...(msg as object),
              source
            });
          }
        }
      }
    }

    // Broadcast to separate extension windows (external extensions)
    for (const [extId, entry] of extensionWindows) {
      if (entry.win && !entry.win.isDestroyed() && entry.status === 'running') {
        const extOrigin = `peek://ext/${extId}`;
        // Don't echo back to sender
        if (extOrigin !== sourceOrigin) {
          entry.win.webContents.send(`pubsub:${topic}`, {
            ...(msg as object),
            source
          });
        }
      }
    }
  });

  // Track window events globally
  app.on('browser-window-created', (_, window) => {
    // Handle window close
    window.on('closed', () => {
      const windowId = window.id;
      const windowData = windowRegistry.get(windowId);

      if (windowData) {
        publish(windowData.source, scopes.GLOBAL, 'window:closed', {
          id: windowId,
          source: windowData.source
        });
      }

      windowRegistry.delete(windowId);
    });

    // Handle local shortcuts
    window.webContents.on('before-input-event', (event, input) => {
      if (handleLocalShortcut(input)) {
        event.preventDefault();
      }
    });
  });
}

/**
 * Discover and register built-in extensions
 */
export function discoverBuiltinExtensions(extensionsDir: string): void {
  const discovered = discoverExtensions(extensionsDir);
  for (const ext of discovered) {
    registerExtensionPath(ext.id, ext.path);
  }
}

/**
 * Discover and register built-in themes
 */
export function discoverBuiltinThemes(themesDir: string): void {
  if (!fs.existsSync(themesDir)) {
    DEBUG && console.log('Themes directory not found:', themesDir);
    return;
  }

  const entries = fs.readdirSync(themesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const themePath = path.join(themesDir, entry.name);
    const manifestPath = path.join(themePath, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      DEBUG && console.log('Theme missing manifest.json:', entry.name);
      continue;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const themeId = manifest.id || entry.name;
      registerThemePath(themeId, themePath);
      DEBUG && console.log('Discovered theme:', themeId);
    } catch (err) {
      console.error('Failed to load theme manifest:', entry.name, err);
    }
  }
}

/**
 * Create an extension window
 */
export async function createExtensionWindow(extId: string): Promise<BrowserWindow | null> {
  if (extensionWindows.has(extId)) {
    DEBUG && console.log(`[ext:win] Extension ${extId} already has a window`);
    return extensionWindows.get(extId)!.win;
  }

  const extPath = getExtensionPath(extId);
  if (!extPath) {
    console.error(`[ext:win] Extension path not found: ${extId}`);
    return null;
  }

  const manifest = loadExtensionManifest(extPath);

  DEBUG && console.log(`[ext:win] Creating window for extension: ${extId}`);

  const win = new BrowserWindow({
    show: false,
    backgroundColor: getSystemThemeBackgroundColor(),
    webPreferences: {
      preload: config.preloadPath
    }
  });

  // Forward console logs
  win.webContents.on('console-message', (event) => {
    DEBUG && console.log(`[ext:${extId}] ${event.message}`);
  });

  // Track crashes
  win.webContents.on('render-process-gone', (event, details) => {
    console.error(`[ext:win] Extension ${extId} crashed (reason: ${details.reason})`);
    const entry = extensionWindows.get(extId);
    if (entry) {
      entry.status = 'crashed';
    }
  });

  // Track close
  win.on('closed', () => {
    DEBUG && console.log(`[ext:win] Extension ${extId} window closed`);
    extensionWindows.delete(extId);
  });

  extensionWindows.set(extId, { win, manifest, status: 'loading' });

  try {
    await win.loadURL(`peek://ext/${extId}/background.html`);
    DEBUG && console.log(`[ext:win] Extension ${extId} loaded successfully`);
    const entry = extensionWindows.get(extId);
    if (entry) {
      entry.status = 'running';
    }
    return win;
  } catch (error) {
    console.error(`[ext:win] Failed to load extension ${extId}:`, error);
    extensionWindows.delete(extId);
    win.destroy();
    return null;
  }
}

/**
 * Load all enabled extensions with startup phases for optimization
 *
 * Startup phases allow extensions to defer work:
 * - 'early': cmd loads first (it's the command registry)
 * - 'commands': other extensions load, should register commands
 * - 'ui': extensions can initialize UI elements
 * - 'complete': all extensions loaded
 */
export async function loadEnabledExtensions(): Promise<number> {
  const extStart = Date.now();
  const builtinExtIds = getRegisteredExtensionIds();

  // Phase 1: Early - load cmd first (it's the command registry)
  publish('system', scopes.GLOBAL, 'ext:startup:phase', { phase: 'early' });

  if (builtinExtIds.includes('cmd') && isBuiltinExtensionEnabled('cmd')) {
    const cmdStart = Date.now();
    await createExtensionWindow('cmd');
    DEBUG && console.log(`[ext:timing] cmd: ${Date.now() - cmdStart}ms`);
  }

  // Phase 2: Commands - other extensions should register commands
  publish('system', scopes.GLOBAL, 'ext:startup:phase', { phase: 'commands' });

  // Load remaining built-in extensions in parallel
  const otherBuiltinIds = builtinExtIds.filter(id => id !== 'cmd');
  const enabledBuiltinIds = otherBuiltinIds.filter(id => isBuiltinExtensionEnabled(id));

  const parallelStart = Date.now();
  await Promise.all(enabledBuiltinIds.map(id => createExtensionWindow(id)));
  DEBUG && console.log(`[ext:timing] parallel (${enabledBuiltinIds.join(',')}): ${Date.now() - parallelStart}ms`);

  // Load external extensions in parallel
  const externalExts = getExternalExtensions();
  const enabledExternalExts = externalExts.filter(ext => {
    if (extensionWindows.has(ext.id)) return false;
    if (!ext.enabled || !ext.path) return false;
    return true;
  });

  if (enabledExternalExts.length > 0) {
    const extExtStart = Date.now();
    await Promise.all(enabledExternalExts.map(ext => createExtensionWindow(ext.id)));
    DEBUG && console.log(`[ext:timing] external: ${Date.now() - extExtStart}ms`);
  }

  DEBUG && console.log(`[ext:timing] total: ${Date.now() - extStart}ms`);

  // Phase 3: UI - extensions can now initialize UI elements
  publish('system', scopes.GLOBAL, 'ext:startup:phase', { phase: 'ui' });

  // Phase 4: Complete - all extensions loaded
  publish('system', scopes.GLOBAL, 'ext:startup:phase', { phase: 'complete' });
  publish('system', scopes.GLOBAL, 'ext:all-loaded', {
    count: extensionWindows.size
  });

  return extensionWindows.size;
}

/**
 * Create the consolidated extension host window
 * All extensions load as iframes within this single window
 */
async function createExtensionHostWindow(): Promise<BrowserWindow> {
  DEBUG && console.log('[ext:host] Creating consolidated extension host window');

  const win = new BrowserWindow({
    show: false,
    backgroundColor: getSystemThemeBackgroundColor(),
    webPreferences: {
      preload: config.preloadPath,
      nodeIntegrationInSubFrames: true,  // Preload runs in iframes too
    }
  });

  // Forward console logs from extension host
  win.webContents.on('console-message', (event) => {
    DEBUG && console.log(`[ext:host] ${event.message}`);
  });

  // Log load errors
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[ext:host] Failed to load: ${errorCode} ${errorDescription}`);
  });

  await win.loadURL('peek://app/extension-host.html');

  extensionHostWindow = win;

  return win;
}

/**
 * Load extensions in consolidated mode (single window with iframes)
 */
async function loadExtensionsConsolidated(): Promise<number> {
  const extStart = Date.now();

  // Create the extension host window
  const host = await createExtensionHostWindow();

  // Get all extension IDs to load
  const builtinExtIds = getRegisteredExtensionIds();
  const enabledBuiltinIds = builtinExtIds.filter(id => isBuiltinExtensionEnabled(id));

  // Get external extensions
  const externalExts = getExternalExtensions();
  const enabledExternalIds = externalExts
    .filter(ext => ext.enabled && ext.path)
    .map(ext => ext.id);

  const allExtIds = [...enabledBuiltinIds, ...enabledExternalIds];

  DEBUG && console.log(`[ext:host] Loading ${allExtIds.length} extensions as iframes`);

  // Phase 1: Early
  publish('system', scopes.GLOBAL, 'ext:startup:phase', { phase: 'early' });

  // Send load commands to extension host
  // Load cmd first (it's the command registry)
  if (allExtIds.includes('cmd')) {
    host.webContents.send('ext:load', { id: 'cmd', url: `peek://cmd/background.html` });
    // Wait for cmd iframe to load
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Phase 2: Commands
  publish('system', scopes.GLOBAL, 'ext:startup:phase', { phase: 'commands' });

  // Load remaining extensions
  const otherIds = allExtIds.filter(id => id !== 'cmd');
  for (const extId of otherIds) {
    host.webContents.send('ext:load', { id: extId, url: `peek://${extId}/background.html` });
  }

  // Wait for iframes to load
  await new Promise(resolve => setTimeout(resolve, 200));

  DEBUG && console.log(`[ext:timing] consolidated total: ${Date.now() - extStart}ms`);

  // Phase 3: UI
  publish('system', scopes.GLOBAL, 'ext:startup:phase', { phase: 'ui' });

  // Phase 4: Complete
  publish('system', scopes.GLOBAL, 'ext:startup:phase', { phase: 'complete' });
  publish('system', scopes.GLOBAL, 'ext:all-loaded', { count: allExtIds.length });

  return allExtIds.length;
}

/**
 * Load all enabled extensions (hybrid mode)
 * - Built-in extensions (cmd, groups, peeks, slides) → consolidated (iframes)
 * - External extensions (including example) → separate windows
 */
export async function loadExtensions(): Promise<number> {
  const extStart = Date.now();

  // Get all registered extension IDs
  const registeredExtIds = getRegisteredExtensionIds();

  // Split into consolidated (built-in) and external
  const consolidatedIds = registeredExtIds.filter(id =>
    CONSOLIDATED_EXTENSION_IDS.includes(id) && isBuiltinExtensionEnabled(id)
  );
  const externalBuiltinIds = registeredExtIds.filter(id =>
    !CONSOLIDATED_EXTENSION_IDS.includes(id) && isBuiltinExtensionEnabled(id)
  );

  // Get external extensions from datastore
  const externalExts = getExternalExtensions();
  const enabledExternalExts = externalExts.filter(ext => ext.enabled && ext.path);

  DEBUG && console.log(`[ext] Hybrid mode: ${consolidatedIds.length} consolidated, ${externalBuiltinIds.length + enabledExternalExts.length} external`);

  // Phase 1: Early
  publish('system', scopes.GLOBAL, 'ext:startup:phase', { phase: 'early' });

  // Create extension host window for consolidated extensions
  if (consolidatedIds.length > 0) {
    const host = await createExtensionHostWindow();

    // Load cmd first (command registry)
    if (consolidatedIds.includes('cmd')) {
      host.webContents.send('ext:load', { id: 'cmd', url: 'peek://cmd/background.html' });
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Phase 2: Commands
    publish('system', scopes.GLOBAL, 'ext:startup:phase', { phase: 'commands' });

    // Load remaining consolidated extensions
    const otherConsolidatedIds = consolidatedIds.filter(id => id !== 'cmd');
    for (const extId of otherConsolidatedIds) {
      host.webContents.send('ext:load', { id: extId, url: `peek://${extId}/background.html` });
    }

    // Wait for consolidated extensions to load
    await new Promise(resolve => setTimeout(resolve, 200));
  } else {
    // Phase 2: Commands (even if no consolidated)
    publish('system', scopes.GLOBAL, 'ext:startup:phase', { phase: 'commands' });
  }

  // Load external built-in extensions (like 'example') as separate windows
  for (const extId of externalBuiltinIds) {
    await createExtensionWindow(extId);
  }

  // Load external extensions from datastore as separate windows
  for (const ext of enabledExternalExts) {
    if (!extensionWindows.has(ext.id)) {
      registerExtensionPath(ext.id, ext.path!);
      await createExtensionWindow(ext.id);
    }
  }

  const totalCount = consolidatedIds.length + externalBuiltinIds.length + enabledExternalExts.length;
  DEBUG && console.log(`[ext:timing] hybrid total: ${Date.now() - extStart}ms`);

  // Phase 3: UI
  publish('system', scopes.GLOBAL, 'ext:startup:phase', { phase: 'ui' });

  // Phase 4: Complete
  publish('system', scopes.GLOBAL, 'ext:startup:phase', { phase: 'complete' });
  publish('system', scopes.GLOBAL, 'ext:all-loaded', { count: totalCount });

  return totalCount;
}

/**
 * Get running extensions info
 * Includes both consolidated (iframe) and separate window extensions
 */
export function getRunningExtensions(): Array<{ id: string; manifest: unknown; status: string }> {
  const running: Array<{ id: string; manifest: unknown; status: string }> = [];

  // Add consolidated extensions (in extension host iframes)
  if (extensionHostWindow && !extensionHostWindow.isDestroyed()) {
    for (const extId of CONSOLIDATED_EXTENSION_IDS) {
      if (isBuiltinExtensionEnabled(extId)) {
        // loadExtensionManifest expects a path, not an ID
        const extPath = getExtensionPath(extId);
        const manifest = extPath ? loadExtensionManifest(extPath) : null;
        running.push({
          id: extId,
          manifest: manifest || { id: extId },
          status: 'running'
        });
      }
    }
  }

  // Add separate window extensions
  for (const [extId, entry] of extensionWindows) {
    if (entry.status === 'running') {
      running.push({
        id: extId,
        manifest: entry.manifest,
        status: entry.status
      });
    }
  }

  return running;
}

/**
 * Destroy an extension window
 */
export function destroyExtensionWindow(extId: string): boolean {
  const entry = extensionWindows.get(extId);
  if (!entry) {
    DEBUG && console.log(`[ext:win] No window to destroy for: ${extId}`);
    return false;
  }

  DEBUG && console.log(`[ext:win] Destroying window for: ${extId}`);

  if (entry.win && !entry.win.isDestroyed()) {
    entry.win.webContents.send('pubsub:app:shutdown', {});
    setTimeout(() => {
      if (!entry.win.isDestroyed()) {
        entry.win.destroy();
      }
    }, 100);
  }

  extensionWindows.delete(extId);
  return true;
}

/**
 * Get an extension window
 */
export function getExtensionWindow(extId: string): BrowserWindow | null {
  const entry = extensionWindows.get(extId);
  return entry ? entry.win : null;
}

/**
 * Register a window in the registry
 */
export function registerWindow(windowId: number, source: string, params: Record<string, unknown>): void {
  windowRegistry.set(windowId, { source, params });
}

/**
 * Get window info from registry
 */
export function getWindowInfo(windowId: number): { source: string; params: Record<string, unknown> } | undefined {
  return windowRegistry.get(windowId);
}

/**
 * Find a window by source and key
 */
export function findWindowByKey(source: string, key: string): { id: number; window: BrowserWindow; data: unknown } | null {
  if (!key) return null;

  for (const [id, win] of windowRegistry) {
    if (win.source === source && win.params && win.params.key === key) {
      const browserWindow = BrowserWindow.fromId(id);
      if (browserWindow) {
        return { id, window: browserWindow, data: win };
      }
    }
  }
  return null;
}

/**
 * Remove a window from the registry
 */
export function removeWindow(windowId: number): boolean {
  return windowRegistry.delete(windowId);
}

/**
 * Get all child windows for a source
 */
export function getChildWindows(source: string): Array<{ id: number; data: { source: string; params: Record<string, unknown> } }> {
  const children = [];
  for (const [id, win] of windowRegistry) {
    if (win.source === source) {
      children.push({ id, data: win });
    }
  }
  return children;
}

/**
 * Get all registered windows
 */
export function getAllWindows(): Array<[number, { source: string; params: Record<string, unknown> }]> {
  return Array.from(windowRegistry.entries());
}

/**
 * Shutdown the application
 */
export async function shutdown(): Promise<void> {
  // Publish shutdown event
  publish(getSystemAddress(), scopes.GLOBAL, 'app:shutdown', {
    timestamp: Date.now()
  });

  // Close database
  closeDatabase();
}

// ***** Background Window *****

let backgroundWindow: BrowserWindow | null = null;

/**
 * Create the core background window
 */
export function createBackgroundWindow(): BrowserWindow {
  const preloadPath = getPreloadPath();
  const systemAddress = getSystemAddress();

  const winPrefs = {
    show: false,
    backgroundColor: getSystemThemeBackgroundColor(),
    key: 'background-core',
    webPreferences: {
      preload: preloadPath,
    }
  };

  // Create the background window
  const win = new BrowserWindow(winPrefs);
  win.loadURL(WEB_CORE_ADDRESS);

  // Forward console logs from background window
  win.webContents.on('console-message', (event) => {
    DEBUG && console.log(`[core] ${event.message}`);
  });

  // Setup devtools for the background window (debug mode, but not in tests or headless)
  if (config.isDev && !isTestProfile() && !isHeadless()) {
    win.webContents.openDevTools({ mode: 'detach', activate: false });
  }

  // Add to window manager
  registerWindow(win.id, systemAddress, { ...winPrefs, address: WEB_CORE_ADDRESS });

  // NOTE: No ESC handler for background window - it should never be closed

  // Set up handlers for windows opened from the background window
  win.webContents.setWindowOpenHandler((details) => {
    DEBUG && console.log('Background window opening child window:', details.url);

    // Parse window features into options
    const featuresMap: Record<string, unknown> = {};
    if (details.features) {
      details.features.split(',')
        .map(entry => entry.split('='))
        .forEach(([key, value]) => {
          let parsedValue: unknown = value;
          // Convert string booleans to actual booleans
          if (value === 'true') parsedValue = true;
          else if (value === 'false') parsedValue = false;
          // Convert numeric values to numbers
          else if (!isNaN(Number(value)) && value.trim() !== '') {
            parsedValue = parseInt(value, 10);
          }
          featuresMap[key] = parsedValue;
        });
    }

    DEBUG && console.log('Parsed features map:', featuresMap);

    // Check if window with this key already exists
    if (featuresMap.key) {
      const existingWindow = findWindowByKey(WEB_CORE_ADDRESS, featuresMap.key as string);
      if (existingWindow) {
        DEBUG && console.log('Reusing existing window with key:', featuresMap.key);
        if (!isHeadless()) {
          existingWindow.window.show();
        }
        return { action: 'deny' as const };
      }
    }

    // Prepare browser window options
    const winOptions: Electron.BrowserWindowConstructorOptions = {
      ...(featuresMap as Electron.BrowserWindowConstructorOptions),
      width: parseInt(String(featuresMap.width)) || APP_DEF_WIDTH,
      height: parseInt(String(featuresMap.height)) || APP_DEF_HEIGHT,
      show: isHeadless() ? false : featuresMap.show !== false,
      // Don't set backgroundColor for transparent windows - it would show through
      backgroundColor: featuresMap.transparent ? undefined : getSystemThemeBackgroundColor(),
      webPreferences: {
        preload: preloadPath
      }
    };

    // Make sure position parameters are correctly handled
    if (featuresMap.x !== undefined) {
      winOptions.x = parseInt(String(featuresMap.x));
    }
    if (featuresMap.y !== undefined) {
      winOptions.y = parseInt(String(featuresMap.y));
    }

    DEBUG && console.log('Background window creating child with options:', winOptions);

    // Make sure we register browser window created handler to track the new window
    const onCreated = (_e: Electron.Event, newWin: BrowserWindow) => {
      // Check if this is the window we just created
      newWin.webContents.once('did-finish-load', () => {
        const loadedUrl = newWin.webContents.getURL();
        if (loadedUrl === details.url) {
          // Remove the listener
          app.removeListener('browser-window-created', onCreated);

          // Add the window to our manager with necessary parameters
          registerWindow(newWin.id, WEB_CORE_ADDRESS, {
            ...featuresMap,
            address: details.url,
            modal: featuresMap.modal
          });

          // Add escape key handler
          addEscHandler(newWin);

          // Set up DevTools if requested
          winDevtoolsConfig(newWin);

          // Set up modal behavior with delay to avoid focus race condition
          if (featuresMap.modal === true) {
            setTimeout(() => {
              if (!newWin.isDestroyed()) {
                newWin.on('blur', () => {
                  DEBUG && console.log('Modal window lost focus:', details.url);
                  closeOrHideWindow(newWin.id);
                });
              }
            }, 100);
          }
        }
      });
    };

    // Start listening for the window creation
    app.on('browser-window-created', onCreated);

    // Return allow with overridden options
    return {
      action: 'allow' as const,
      overrideBrowserWindowOptions: winOptions
    };
  });

  backgroundWindow = win;
  return win;
}

/**
 * Get the background window
 */
export function getBackgroundWindow(): BrowserWindow | null {
  return backgroundWindow;
}

// ***** External URL Handling *****

/**
 * Handle URLs opened from external apps (e.g., when Peek is default browser)
 */
export function handleExternalUrl(url: string, sourceId = 'os'): void {
  DEBUG && console.log('External URL received:', url, 'from:', sourceId);

  if (!_appReady) {
    _pendingUrls.push({ url, sourceId });
    return;
  }

  // Note: Using trackingSource/trackingSourceId because preload.js overwrites msg.source
  publish(getSystemAddress(), scopes.GLOBAL, 'external:open-url', {
    url,
    trackingSource: 'external',
    trackingSourceId: sourceId,
    timestamp: Date.now()
  });
}

/**
 * Process any URLs that arrived before app was ready
 */
export function processPendingUrls(): void {
  _pendingUrls.forEach(({ url, sourceId }) => {
    handleExternalUrl(url, sourceId);
  });
  _pendingUrls = [];
}

/**
 * Mark app as ready to handle external URLs
 */
export function setAppReady(): void {
  _appReady = true;
  processPendingUrls();
}

/**
 * Register external URL event handlers
 * Must be called before app.ready for open-url, and in onReady for second-instance
 */
export function registerExternalUrlHandlers(): void {
  // macOS: handle open-url event
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleExternalUrl(url, 'os');
  });
}

/**
 * Register second-instance handler (for Windows/Linux URL handling)
 * Call this inside onReady after acquiring single instance lock
 */
export function registerSecondInstanceHandler(): void {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find(arg =>
      arg.startsWith('http://') || arg.startsWith('https://')
    );
    if (url) {
      DEBUG && console.log('second-instance URL:', url);
      handleExternalUrl(url, 'os');
    }
  });
}

/**
 * Check for URL in CLI arguments and handle it
 */
export function handleCliUrl(): void {
  const urlArg = process.argv.find(arg =>
    arg.startsWith('http://') || arg.startsWith('https://')
  );
  if (urlArg) {
    DEBUG && console.log('CLI URL argument:', urlArg);
    // Defer until background app is ready
    setTimeout(() => handleExternalUrl(urlArg, 'cli'), 1000);
  }
}

// ***** App Lifecycle *****

/**
 * Register the window-all-closed handler
 */
export function registerWindowAllClosedHandler(onQuit: () => void): void {
  app.on('window-all-closed', () => {
    DEBUG && console.log('window-all-closed', process.platform);
    if (process.platform !== 'darwin') {
      onQuit();
    }
  });
}

/**
 * Register the activate handler (macOS dock click)
 */
export function registerActivateHandler(): void {
  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      // Could recreate window here if needed
    }
  });
}

/**
 * Request single instance lock
 * Returns true if lock acquired, false if another instance is running
 * Skips lock in dev/test profiles to allow running alongside production
 */
export function requestSingleInstance(): boolean {
  // Skip single-instance lock in dev/test profiles to allow running alongside production
  if (isDevProfile() || isTestProfile()) {
    DEBUG && console.log('Skipping single-instance lock for profile:', getProfile());
    return true;
  }

  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    console.error('APP INSTANCE ALREADY RUNNING, QUITTING');
    app.quit();
    return false;
  }
  return true;
}

/**
 * Quit the application gracefully
 */
export function quitApp(): void {
  DEBUG && console.log('quitApp');

  // Publish shutdown event and close database
  shutdown();

  // Give windows a moment to clean up before forcing quit
  setTimeout(() => {
    app.quit();
  }, 100);
}

// Re-export commonly used functions
export {
  scopes,
  publish,
  subscribe,
  getSystemAddress,
  registerLocalShortcut,
  unregisterLocalShortcut,
  registerGlobalShortcut,
  unregisterGlobalShortcut,
  unregisterShortcutsForAddress,
  handleLocalShortcut,
  initTray,
  getDb,
  getExtensionPath,
  getRegisteredExtensionIds,
  loadExtensionManifest,
};
