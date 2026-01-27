/**
 * Overlay Navbar
 *
 * Display-only layer in a separate BrowserWindow above the web page.
 * Show/hide is driven by the overlay extension via pubsub events.
 * Navigation uses standard web-nav-* IPC handlers.
 */

const api = window.app;
const pageWindowId = parseInt(new URL(location.href).searchParams.get('pageWindowId'));

const navbar = document.getElementById('navbar');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const urlText = document.getElementById('url-text');

// --- State display ---

function updateState(data) {
  if (!data) return;
  btnBack.disabled = !data.canGoBack;
  btnForward.disabled = !data.canGoForward;
  if (data.url) urlText.textContent = data.url;
}

async function refreshState() {
  try {
    const result = await api.invoke('web-nav-state', { windowId: pageWindowId });
    if (result?.success) updateState(result.data);
  } catch (e) {
    // ignore
  }
}

// --- Show / Hide (driven by extension via pubsub) ---

function show(opts) {
  const wasHidden = !navbar.classList.contains('visible');
  navbar.classList.add('visible');
  api.invoke('window-set-ignore-mouse-events', { ignore: false });
  if (wasHidden) refreshState();
  if (opts?.focusUrl) {
    requestAnimationFrame(() => {
      const range = document.createRange();
      range.selectNodeContents(urlText);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }
}

function hide() {
  navbar.classList.remove('visible');
  window.getSelection().removeAllRanges();
  api.invoke('window-set-ignore-mouse-events', { ignore: true, forward: true });
}

// --- Extension commands ---

api.subscribe('overlay:expand', (data) => {
  if (data.pageWindowId === pageWindowId) show({});
}, api.scopes.GLOBAL);

api.subscribe('overlay:collapse', (data) => {
  if (data.pageWindowId === pageWindowId) hide();
}, api.scopes.GLOBAL);

// Cmd+L: show with URL focus
api.subscribe('overlay:show', (data) => {
  if (data.windowId === pageWindowId) show({ focusUrl: true });
}, api.scopes.GLOBAL);

// Nav state updates on page navigation
api.subscribe('window:navigated', (data) => {
  if (data.id === pageWindowId) refreshState();
}, api.scopes.GLOBAL);

// --- Nav button actions ---

btnBack.addEventListener('click', (e) => {
  e.stopPropagation();
  api.invoke('web-nav-back', { windowId: pageWindowId }).then(refreshState);
});

btnForward.addEventListener('click', (e) => {
  e.stopPropagation();
  api.invoke('web-nav-forward', { windowId: pageWindowId }).then(refreshState);
});

btnReload.addEventListener('click', (e) => {
  e.stopPropagation();
  api.invoke('web-nav-reload', { windowId: pageWindowId }).then(refreshState);
});

// URL text click-to-select
urlText.addEventListener('click', (e) => {
  e.stopPropagation();
  const range = document.createRange();
  range.selectNodeContents(urlText);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});

// Initial state: click-through with forwarding
api.invoke('window-set-ignore-mouse-events', { ignore: true, forward: true });
