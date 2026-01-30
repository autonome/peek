/**
 * Editor Extension - Markdown editor with sidebars
 *
 * Provides:
 * - Three-panel layout: outline | editor | preview
 * - CodeMirror-based markdown editing
 * - Optional vim mode
 * - Resizable panels
 * - Pubsub integration
 */

// Feature detection
const hasPeekAPI = typeof window.app !== 'undefined';
const api = hasPeekAPI ? window.app : null;

/**
 * Open the editor window
 */
function openEditor(params) {
  if (hasPeekAPI) {
    let url = 'peek://ext/editor/home.html';
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += '?' + qs;
    }
    api.window.open(url, {
      key: 'editor-home',
      width: 1200,
      height: 800,
      title: 'Editor'
    });
  } else {
    window.open('./home.html', '_blank');
  }
}

const extension = {
  id: 'editor',
  labels: {
    name: 'Editor'
  },

  /**
   * Register commands - called when cmd extension is ready
   */
  registerCommands() {
    api.commands.register({
      name: 'open editor',
      description: 'Open the markdown editor',
      execute: () => openEditor()
    });

    console.log('[editor] Commands registered');
  },

  init() {
    console.log('[editor] init - Peek API available:', hasPeekAPI);

    if (!hasPeekAPI) {
      console.log('[editor] Running without Peek API - limited functionality');
      return;
    }

    // Wait for cmd:ready before registering commands
    api.subscribe('cmd:ready', () => {
      this.registerCommands();
    }, api.scopes.GLOBAL);

    // Query in case cmd is already ready
    api.publish('cmd:query', {}, api.scopes.GLOBAL);

    // Register global shortcut Option+e
    api.shortcuts.register('Option+e', () => openEditor());

    // Subscribe to editor:open — open editor with optional content
    api.subscribe('editor:open', (msg) => {
      const params = {};
      if (msg?.content) {
        params.content = msg.content;
      }
      if (msg?.file) {
        params.file = msg.file;
      }
      openEditor(Object.keys(params).length > 0 ? params : undefined);
    }, api.scopes.GLOBAL);

    console.log('[editor] Extension loaded');
  },

  uninit() {
    console.log('[editor] Cleaning up...');

    if (hasPeekAPI) {
      api.commands.unregister('open editor');
      api.shortcuts.unregister('Option+e');
    }
  }
};

export default extension;
