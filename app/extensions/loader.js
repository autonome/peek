/**
 * Extension Loader
 *
 * Manages extension lifecycle: loading, unloading, and reloading extensions.
 * Runs in the core background context (app/index.js).
 */

const api = window.app;
const debug = api.debug;

// Track running extensions: id -> { module, manifest, extension }
const runningExtensions = new Map();

// Track registered shortnames: shortname -> extension id
const registeredShortnames = new Map();

// Reserved shortnames that cannot be used by external extensions
const reservedShortnames = new Set(['app', 'ext', 'extensions', 'settings', 'system']);

/**
 * Fetch and parse an extension's manifest.json
 */
const fetchManifest = async (path) => {
  const manifestUrl = `${path}/manifest.json`;
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Failed to fetch manifest from ${manifestUrl}: ${error.message}`);
  }
};

/**
 * Validate an extension's manifest
 * Returns { valid: true } or { valid: false, error: string }
 */
const validateManifest = (manifest, isBuiltin = false) => {
  // Required fields
  if (!manifest.id) {
    return { valid: false, error: 'Missing required field: id' };
  }
  if (!manifest.shortname) {
    return { valid: false, error: 'Missing required field: shortname' };
  }
  if (!manifest.name) {
    return { valid: false, error: 'Missing required field: name' };
  }

  // Shortname format validation (alphanumeric, lowercase, hyphens allowed)
  if (!/^[a-z0-9-]+$/.test(manifest.shortname)) {
    return { valid: false, error: `Invalid shortname format: ${manifest.shortname}. Must be lowercase alphanumeric with hyphens.` };
  }

  // Check for reserved shortnames (only for non-builtin extensions)
  if (!isBuiltin && reservedShortnames.has(manifest.shortname)) {
    return { valid: false, error: `Shortname '${manifest.shortname}' is reserved and cannot be used.` };
  }

  // Check for shortname conflicts
  const existingOwner = registeredShortnames.get(manifest.shortname);
  if (existingOwner && existingOwner !== manifest.id) {
    return { valid: false, error: `Shortname '${manifest.shortname}' is already registered by extension '${existingOwner}'.` };
  }

  return { valid: true };
};

/**
 * List of built-in extensions bundled with the app.
 * External extensions will be loaded from the datastore.
 */
export const builtinExtensions = [
  {
    id: 'groups',
    path: 'peek://ext/groups',
    backgroundScript: 'background.js'
  },
  {
    id: 'peeks',
    path: 'peek://ext/peeks',
    backgroundScript: 'background.js'
  },
  {
    id: 'slides',
    path: 'peek://ext/slides',
    backgroundScript: 'background.js'
  }
];

/**
 * Load a single extension by dynamically importing its background script
 */
export const loadExtension = async (extension) => {
  const { id, path, backgroundScript } = extension;

  if (runningExtensions.has(id)) {
    debug && console.log(`[ext:loader] Extension ${id} already running`);
    return { success: true, alreadyRunning: true };
  }

  try {
    debug && console.log(`[ext:loader] Loading extension: ${id}`);

    // Fetch and validate manifest
    const manifest = await fetchManifest(path);
    const isBuiltin = manifest.builtin === true;
    const validation = validateManifest(manifest, isBuiltin);

    if (!validation.valid) {
      console.error(`[ext:loader] Invalid manifest for ${id}: ${validation.error}`);
      return { success: false, error: validation.error };
    }

    // Register shortname
    registeredShortnames.set(manifest.shortname, id);
    debug && console.log(`[ext:loader] Registered shortname '${manifest.shortname}' for ${id}`);

    // Dynamically import the extension's background script
    const backgroundUrl = `${path}/${backgroundScript}`;
    const module = await import(backgroundUrl);

    // Call init if it exists
    if (module.default && typeof module.default.init === 'function') {
      module.default.init();
    }

    runningExtensions.set(id, {
      module: module.default,
      manifest,
      extension
    });

    console.log(`[ext:loader] Extension loaded: ${id} (shortname: ${manifest.shortname}, builtin: ${isBuiltin})`);
    return { success: true, manifest };

  } catch (error) {
    console.error(`[ext:loader] Failed to load extension ${id}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Unload an extension
 */
export const unloadExtension = async (id) => {
  const running = runningExtensions.get(id);
  if (!running) {
    debug && console.log(`[ext:loader] Extension ${id} not running`);
    return { success: true, wasRunning: false };
  }

  try {
    debug && console.log(`[ext:loader] Unloading extension: ${id}`);

    // Call uninit if it exists
    if (running.module && typeof running.module.uninit === 'function') {
      running.module.uninit();
    }

    // Unregister shortname
    if (running.manifest && running.manifest.shortname) {
      registeredShortnames.delete(running.manifest.shortname);
      debug && console.log(`[ext:loader] Unregistered shortname '${running.manifest.shortname}'`);
    }

    runningExtensions.delete(id);
    console.log(`[ext:loader] Extension unloaded: ${id}`);
    return { success: true, wasRunning: true };

  } catch (error) {
    console.error(`[ext:loader] Failed to unload extension ${id}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Reload an extension (unload + load)
 */
export const reloadExtension = async (id) => {
  const running = runningExtensions.get(id);
  if (!running) {
    console.log(`[ext:loader] Extension ${id} not running, cannot reload`);
    return { success: false, error: 'Extension not running' };
  }

  await unloadExtension(id);
  return loadExtension(running.extension);
};

/**
 * Get list of running extensions
 */
export const getRunningExtensions = () => {
  return Array.from(runningExtensions.entries()).map(([id, data]) => ({
    id,
    manifest: data.manifest,
    ...data.extension
  }));
};

/**
 * Check if an extension is running
 */
export const isExtensionRunning = (id) => {
  return runningExtensions.has(id);
};

/**
 * Get extension by shortname
 */
export const getExtensionByShortname = (shortname) => {
  const extId = registeredShortnames.get(shortname);
  if (!extId) return null;
  return runningExtensions.get(extId) || null;
};

/**
 * Check if a shortname is registered
 */
export const isShortNameRegistered = (shortname) => {
  return registeredShortnames.has(shortname);
};

/**
 * Get manifest for a running extension
 */
export const getExtensionManifest = (id) => {
  const running = runningExtensions.get(id);
  return running ? running.manifest : null;
};

/**
 * Load all enabled built-in extensions.
 * Called during app initialization.
 *
 * @param {Function} isFeatureEnabled - Function to check if a feature is enabled
 */
export const loadBuiltinExtensions = async (isFeatureEnabled) => {
  console.log('[ext:loader] Loading built-in extensions...');

  for (const ext of builtinExtensions) {
    // Check if this extension's corresponding feature is enabled
    if (isFeatureEnabled && !isFeatureEnabled(ext.id)) {
      debug && console.log(`[ext:loader] Extension ${ext.id} is disabled, skipping`);
      continue;
    }

    await loadExtension(ext);
  }

  console.log(`[ext:loader] Loaded ${runningExtensions.size} extensions`);
};

/**
 * Set up pubsub handlers for extension management API.
 * This allows other contexts (e.g., settings UI) to manage extensions.
 */
const initApiHandlers = () => {
  // Handle ext:list requests
  api.subscribe('ext:list', (msg) => {
    const extensions = getRunningExtensions();
    api.publish(msg.replyTopic, {
      success: true,
      data: extensions
    }, api.scopes.SYSTEM);
  }, api.scopes.SYSTEM);

  // Handle ext:load requests
  api.subscribe('ext:load', async (msg) => {
    const { id, replyTopic } = msg;

    // Find extension config (check builtin first, then could check datastore for external)
    const extConfig = builtinExtensions.find(e => e.id === id);
    if (!extConfig) {
      api.publish(replyTopic, {
        success: false,
        error: `Extension not found: ${id}`
      }, api.scopes.SYSTEM);
      return;
    }

    const result = await loadExtension(extConfig);
    api.publish(replyTopic, result, api.scopes.SYSTEM);
  }, api.scopes.SYSTEM);

  // Handle ext:unload requests
  api.subscribe('ext:unload', async (msg) => {
    const { id, replyTopic } = msg;
    const result = await unloadExtension(id);
    api.publish(replyTopic, result, api.scopes.SYSTEM);
  }, api.scopes.SYSTEM);

  // Handle ext:reload requests
  api.subscribe('ext:reload', async (msg) => {
    const { id, replyTopic } = msg;
    const result = await reloadExtension(id);
    api.publish(replyTopic, result, api.scopes.SYSTEM);
  }, api.scopes.SYSTEM);

  // Handle ext:manifest requests
  api.subscribe('ext:manifest', (msg) => {
    const { id, replyTopic } = msg;
    const manifest = getExtensionManifest(id);
    if (manifest) {
      api.publish(replyTopic, {
        success: true,
        data: manifest
      }, api.scopes.SYSTEM);
    } else {
      api.publish(replyTopic, {
        success: false,
        error: `Extension not found or not running: ${id}`
      }, api.scopes.SYSTEM);
    }
  }, api.scopes.SYSTEM);

  console.log('[ext:loader] API handlers initialized');
};

// Initialize API handlers when loader is first imported
initApiHandlers();

export default {
  builtinExtensions,
  loadExtension,
  unloadExtension,
  reloadExtension,
  getRunningExtensions,
  isExtensionRunning,
  getExtensionByShortname,
  isShortNameRegistered,
  getExtensionManifest,
  loadBuiltinExtensions
};
