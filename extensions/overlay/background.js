/**
 * Overlay Extension — Background Script
 *
 * Orchestrates overlay lifecycle: creates overlay windows for web pages,
 * manages show/hide based on mouse events, and repositions on page move/resize.
 *
 * Event flow:
 *   cursor enters overlay → preload publishes overlay:cursor-enter
 *     → extension publishes overlay:expand → navbar shows bar
 *   cursor leaves overlay → preload publishes overlay:cursor-leave
 *     → extension starts 600ms timer → publishes overlay:collapse → navbar hides bar
 */

const api = window.app;

const overlays = new Map(); // pageWindowId → { overlayWindowId, hideTimer }
const BAR_HEIGHT = 48;
const GAP = 4;
const HIDE_DELAY = 600;

function init() {
  // Create overlay when a web window opens
  api.subscribe('window:web-opened', async (data) => {
    const { id: pageId } = data;
    if (overlays.has(pageId)) return;

    const result = await api.window.open(
      `peek://app/overlay/navbar.html?pageWindowId=${pageId}`, {
        key: `overlay-${pageId}`,
        parentId: pageId,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        skipTaskbar: true,
        show: false,
        width: 800,
        height: BAR_HEIGHT,
      }
    );

    if (result.success) {
      overlays.set(pageId, { overlayWindowId: result.id, hideTimer: null });
      // Initial positioning
      const pos = await api.window.getPosition(pageId);
      if (pos.success) {
        await api.window.move(result.id, pos.x, pos.y - BAR_HEIGHT - GAP);
      }
      // Size to match page width
      const bounds = await api.window.getBounds(pageId);
      if (bounds.success) {
        await api.window.resize(bounds.width, BAR_HEIGHT, result.id);
        await api.window.move(result.id, bounds.x, bounds.y - BAR_HEIGHT - GAP);
      }
      // Show the overlay window (initially click-through)
      await api.window.show(result.id);
    }
  }, api.scopes.GLOBAL);

  // Show overlay bar on cursor enter
  api.subscribe('overlay:cursor-enter', (data) => {
    for (const [pageId, state] of overlays) {
      if (state.overlayWindowId === data.windowId) {
        if (state.hideTimer) {
          clearTimeout(state.hideTimer);
          state.hideTimer = null;
        }
        api.publish('overlay:expand', {
          overlayWindowId: data.windowId,
          pageWindowId: pageId
        }, api.scopes.GLOBAL);
        break;
      }
    }
  }, api.scopes.GLOBAL);

  // Hide overlay bar on cursor leave (with delay)
  api.subscribe('overlay:cursor-leave', (data) => {
    for (const [pageId, state] of overlays) {
      if (state.overlayWindowId === data.windowId) {
        if (state.hideTimer) {
          clearTimeout(state.hideTimer);
        }
        state.hideTimer = setTimeout(() => {
          state.hideTimer = null;
          api.publish('overlay:collapse', {
            overlayWindowId: data.windowId,
            pageWindowId: pageId
          }, api.scopes.GLOBAL);
        }, HIDE_DELAY);
        break;
      }
    }
  }, api.scopes.GLOBAL);

  // Reposition overlay when page window moves/resizes
  api.subscribe('window:bounds-changed', (data) => {
    const state = overlays.get(data.id);
    if (!state) return;
    api.window.move(state.overlayWindowId, data.x, data.y - BAR_HEIGHT - GAP);
    api.window.resize(data.width, BAR_HEIGHT, state.overlayWindowId);
  }, api.scopes.GLOBAL);

  // Clean up when page window closes (overlay auto-closes via parentId)
  api.subscribe('window:closed', (data) => {
    if (overlays.has(data.id)) {
      const state = overlays.get(data.id);
      if (state.hideTimer) clearTimeout(state.hideTimer);
      overlays.delete(data.id);
    }
  }, api.scopes.GLOBAL);
}

function uninit() {
  // Clean up all timers
  for (const [, state] of overlays) {
    if (state.hideTimer) clearTimeout(state.hideTimer);
  }
  overlays.clear();
}

export default {
  id: 'overlay',
  labels: ['overlay', 'navigation'],
  init,
  uninit,
};
