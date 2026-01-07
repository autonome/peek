/**
 * Extension Loader
 *
 * Manages extension lifecycle: loading, unloading, and reloading extensions.
 * Runs in the core background context (app/index.js).
 */

const api = window.app;
const debug = api.debug;

// Track running extensions: id -> { module, manifest }
const runningExtensions = new Map();

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

    // Dynamically import the extension's background script
    const backgroundUrl = `${path}/${backgroundScript}`;
    const module = await import(backgroundUrl);

    // Call init if it exists
    if (module.default && typeof module.default.init === 'function') {
      module.default.init();
    }

    runningExtensions.set(id, {
      module: module.default,
      extension
    });

    console.log(`[ext:loader] Extension loaded: ${id}`);
    return { success: true };

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

export default {
  builtinExtensions,
  loadExtension,
  unloadExtension,
  reloadExtension,
  getRunningExtensions,
  isExtensionRunning,
  loadBuiltinExtensions
};
