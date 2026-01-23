// app/drag.js
// Click-and-hold window dragging utility

const HOLD_DELAY = 300; // ms before drag starts
const MOVE_THRESHOLD = 5; // px - cancel hold if mouse moves more than this

let isDragging = false;
let holdTimer = null;
let startMouse = null;
let startWindowPos = null;
let windowId = null;

// Elements that should not trigger drag
const isInteractive = (el) => {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (['input', 'textarea', 'button', 'a', 'select', 'label'].includes(tag)) return true;
  if (el.isContentEditable) return true;
  if (el.hasAttribute('data-no-drag')) return true;
  if (el.closest('[data-no-drag]')) return true;
  // Check for -webkit-app-region: no-drag
  try {
    const style = getComputedStyle(el);
    if (style.webkitAppRegion === 'no-drag') return true;
  } catch (e) {
    // Ignore errors from pseudo-elements
  }
  return false;
};

const cancelHold = () => {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
};

const endDrag = () => {
  cancelHold();
  if (isDragging) {
    isDragging = false;
    document.body.style.cursor = '';
    document.body.classList.remove('is-dragging');
  }
  startMouse = null;
  startWindowPos = null;
  windowId = null;
};

const onMouseDown = async (e) => {
  // Only left click, not on interactive elements
  if (e.button !== 0) return;
  if (isInteractive(e.target)) return;

  startMouse = { x: e.screenX, y: e.screenY };

  holdTimer = setTimeout(async () => {
    try {
      // Check if window is draggable (API option can disable this)
      const draggableResult = await window.app.invoke('window-is-draggable');
      if (!draggableResult?.draggable) return;

      // Get window ID and position
      windowId = await window.app.invoke('get-window-id');
      if (!windowId) return;

      const pos = await window.app.window.getPosition();
      if (!pos.success) return;

      startWindowPos = { x: pos.x, y: pos.y };
      isDragging = true;
      document.body.style.cursor = 'grabbing';
      document.body.classList.add('is-dragging');
    } catch (err) {
      console.error('Failed to start drag:', err);
    }
  }, HOLD_DELAY);
};

const onMouseMove = (e) => {
  if (!startMouse) return;

  if (!isDragging) {
    // Cancel hold if mouse moves too much before delay
    const dx = Math.abs(e.screenX - startMouse.x);
    const dy = Math.abs(e.screenY - startMouse.y);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      cancelHold();
      startMouse = null;
    }
    return;
  }

  // Calculate and apply new position
  const deltaX = e.screenX - startMouse.x;
  const deltaY = e.screenY - startMouse.y;
  const newX = startWindowPos.x + deltaX;
  const newY = startWindowPos.y + deltaY;

  window.app.window.move(windowId, newX, newY);
};

const onMouseUp = () => {
  endDrag();
};

// Also end drag if window loses focus
const onBlur = () => {
  endDrag();
};

/**
 * Initialize click-and-hold window dragging
 * Call this once when the page loads
 */
export function initWindowDrag() {
  // Check if window.app is available
  if (!window.app?.window?.move || !window.app?.invoke) {
    console.warn('Window drag: app API not available');
    return;
  }

  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);

  console.log('Window drag initialized');
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWindowDrag);
} else {
  initWindowDrag();
}
