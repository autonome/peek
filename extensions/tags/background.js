/**
 * Tags Extension - Tag visualization and management
 *
 * Provides:
 * - View all saved items filtered by type
 * - Tag-based filtering via clickable tag buttons
 * - Tag editing on items
 * - Search across items and tags
 */

// Feature detection - check if Peek API is available
const hasPeekAPI = typeof window.app !== 'undefined';
const api = hasPeekAPI ? window.app : null;

/**
 * Open the tags home window
 */
function openTags() {
  if (hasPeekAPI) {
    api.window.open('peek://ext/tags/home.html', {
      key: 'tags-home',
      width: 900,
      height: 700,
      title: 'Tags'
    });
  } else {
    window.open('./home.html', '_blank');
  }
}

/**
 * List all tags (console output)
 */
async function listTags() {
  if (!hasPeekAPI) {
    console.log('Peek API not available');
    return;
  }

  const result = await api.datastore.getTagsByFrecency();
  if (!result.success) {
    console.log('Failed to get tags');
    return { success: false };
  }

  if (result.data.length === 0) {
    console.log('No tags yet');
  } else {
    console.log('All tags (by frecency):');
    result.data.slice(0, 20).forEach(t => {
      console.log('  -', t.name, `(used ${t.frequency}x, frecency: ${t.frecencyScore?.toFixed(1) || 0})`);
    });
  }
  return { success: true, tags: result.data };
}

const extension = {
  id: 'tags',
  labels: {
    name: 'Tags'
  },

  /**
   * Register commands - called when cmd extension is ready
   */
  registerCommands() {
    // Command to open tags view
    api.commands.register({
      name: 'open tags',
      description: 'Open the tags browser',
      execute: openTags
    });

    // Command to list tags
    api.commands.register({
      name: 'list tags',
      description: 'List all tags by frecency',
      execute: listTags
    });

    console.log('[tags] Commands registered');
  },

  init() {
    console.log('[tags] init - Peek API available:', hasPeekAPI);

    if (!hasPeekAPI) {
      console.log('[tags] Running without Peek API - limited functionality');
      return;
    }

    // Wait for cmd:ready before registering commands
    api.subscribe('cmd:ready', () => {
      this.registerCommands();
    }, api.scopes.GLOBAL);

    // Query in case cmd is already ready
    api.publish('cmd:query', {}, api.scopes.GLOBAL);

    // Register global shortcut Option+t
    api.shortcuts.register('Option+t', openTags);

    console.log('[tags] Extension loaded');
  },

  uninit() {
    console.log('[tags] Cleaning up...');

    if (hasPeekAPI) {
      api.commands.unregister('open tags');
      api.commands.unregister('list tags');
      api.shortcuts.unregister('Option+t');
    }
  }
};

// Export for ES module usage (Peek extension)
export default extension;
