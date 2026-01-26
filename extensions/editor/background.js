/**
 * Editor Extension - View, add, and edit saved items
 *
 * Provides:
 * - Full item CRUD (URLs, text notes, tagsets, images)
 * - Tag editing on items
 * - Type filtering and search
 * - Pubsub integration (editor:open, editor:add, editor:changed)
 */

// Feature detection
const hasPeekAPI = typeof window.app !== 'undefined';
const api = hasPeekAPI ? window.app : null;

/**
 * Open the editor home window
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
      width: 900,
      height: 700,
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
      description: 'Open the item editor',
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

    // Subscribe to editor:open — other extensions request item editing
    api.subscribe('editor:open', (msg) => {
      if (msg && msg.itemId) {
        openEditor({ itemId: msg.itemId });
      } else {
        openEditor();
      }
    }, api.scopes.GLOBAL);

    // Subscribe to editor:add — other extensions request add mode
    api.subscribe('editor:add', (msg) => {
      const params = {};
      if (msg) {
        if (msg.type) params.addType = msg.type;
        if (msg.content) params.addContent = msg.content;
        if (msg.url) params.addUrl = msg.url;
      }
      params.mode = 'add';
      openEditor(params);
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
