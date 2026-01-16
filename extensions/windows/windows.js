/**
 * Windows - Full-screen window switcher
 *
 * Shows all open windows as cards in a transparent overlay.
 * Uses vim-style navigation (hjkl) and enter to focus window.
 */

const api = window.app;
const debug = api.debug;

let state = {
  windows: [],
  selectedIndex: 0,
  searchQuery: ''
};

// Handle ESC - close the windows view
api.escape.onEscape(() => {
  // If search has content, clear it first
  const searchInput = document.querySelector('.search-input');
  if (state.searchQuery) {
    state.searchQuery = '';
    searchInput.value = '';
    renderWindows();
    return { handled: true };
  }
  // Notify background to restore windows, then close
  api.publish('windows:closing', {}, api.scopes.GLOBAL);
  // Let window close
  return { handled: false };
});

/**
 * Get all cards in the current view
 */
const getCards = () => {
  return Array.from(document.querySelectorAll('.cards .card'));
};

/**
 * Update visual selection on cards
 */
const updateSelection = () => {
  const cards = getCards();
  cards.forEach((card, i) => {
    card.classList.toggle('selected', i === state.selectedIndex);
  });

  // Scroll selected card into view
  const selected = cards[state.selectedIndex];
  if (selected) {
    selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
};

/**
 * Close windows view and restore hidden windows
 */
const closeWindowsView = () => {
  // Notify background to restore hidden windows
  api.publish('windows:closing', {}, api.scopes.GLOBAL);
  window.close();
};

/**
 * Activate the currently selected card (focus window and close windows view)
 */
const activateSelected = async () => {
  const filteredWindows = filterWindows(state.windows);
  const selectedWindow = filteredWindows[state.selectedIndex];

  if (selectedWindow) {
    debug && console.log('[windows] Focusing window:', selectedWindow.id, selectedWindow.title);

    // Focus the selected window
    await api.window.focus(selectedWindow.id);

    // Close windows view and restore windows
    closeWindowsView();
  }
};

/**
 * Get number of columns in the grid based on card positions
 */
const getGridColumns = (cards) => {
  if (cards.length < 2) return 1;
  const firstTop = cards[0].getBoundingClientRect().top;
  for (let i = 1; i < cards.length; i++) {
    if (cards[i].getBoundingClientRect().top !== firstTop) {
      return i;
    }
  }
  return cards.length; // All on one row
};

/**
 * Handle keyboard navigation (vim-style hjkl for grid movement)
 */
const handleKeydown = (e) => {
  const searchInput = document.querySelector('.search-input');
  const isSearchFocused = document.activeElement === searchInput;

  // Focus search with / or Cmd+F
  if ((e.key === '/' || (e.key === 'f' && (e.metaKey || e.ctrlKey))) && !isSearchFocused) {
    e.preventDefault();
    searchInput.focus();
    return;
  }

  // Don't intercept when typing in search (except arrow keys and enter)
  if (isSearchFocused && !['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
    return;
  }

  const cards = getCards();
  if (cards.length === 0) return;

  const cols = getGridColumns(cards);

  switch (e.key) {
    case 'j':
    case 'ArrowDown':
      e.preventDefault();
      if (state.selectedIndex + cols < cards.length) {
        state.selectedIndex += cols;
        updateSelection();
      }
      break;
    case 'k':
    case 'ArrowUp':
      e.preventDefault();
      if (state.selectedIndex - cols >= 0) {
        state.selectedIndex -= cols;
        updateSelection();
      }
      break;
    case 'h':
    case 'ArrowLeft':
      if (isSearchFocused) return; // Let cursor move in search
      e.preventDefault();
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        updateSelection();
      }
      break;
    case 'l':
    case 'ArrowRight':
      if (isSearchFocused) return; // Let cursor move in search
      e.preventDefault();
      if (state.selectedIndex < cards.length - 1) {
        state.selectedIndex++;
        updateSelection();
      }
      break;
    case 'Enter':
      e.preventDefault();
      activateSelected();
      break;
  }
};

/**
 * Load all visible windows
 */
const loadWindows = async () => {
  // Include internal peek:// windows so we can show them
  const result = await api.window.list({ includeInternal: true });

  if (result.success) {
    // Filter out windows we don't want to show:
    // - The windows view itself
    // - Background pages (extension background scripts)
    // - Extension host window
    // - Settings window (internal UI)
    state.windows = result.windows.filter(w => {
      const url = w.url || '';
      // Skip windows view
      if (url.includes('windows.html')) return false;
      // Skip background pages
      if (url.includes('background.html')) return false;
      // Skip extension host
      if (url.includes('extension-host.html')) return false;
      // Include everything else (content windows and peek:// UI pages)
      return true;
    });
    debug && console.log('[windows] Loaded windows:', state.windows.length);
  } else {
    console.error('[windows] Failed to load windows:', result.error);
    state.windows = [];
  }
};

/**
 * Filter windows by search query (title or URL)
 */
const filterWindows = (windows) => {
  if (!state.searchQuery) return windows;
  const q = state.searchQuery.toLowerCase();
  return windows.filter(w =>
    (w.title || '').toLowerCase().includes(q) ||
    (w.url || '').toLowerCase().includes(q)
  );
};

/**
 * Render window cards
 */
const renderWindows = () => {
  const container = document.querySelector('.cards');
  container.innerHTML = '';

  const filteredWindows = filterWindows(state.windows);

  if (filteredWindows.length === 0) {
    const message = state.searchQuery
      ? 'No windows match your search.'
      : 'No windows open.';
    container.innerHTML = `<div class="empty-state">${message}</div>`;
    return;
  }

  filteredWindows.forEach(win => {
    const card = createWindowCard(win);
    container.appendChild(card);
  });

  // Reset selection if out of bounds
  if (state.selectedIndex >= filteredWindows.length) {
    state.selectedIndex = Math.max(0, filteredWindows.length - 1);
  }
  updateSelection();
};

/**
 * Create a card element for a window
 */
const createWindowCard = (win) => {
  const card = document.createElement('div');
  card.className = 'card window-card';
  card.dataset.windowId = win.id;

  // Try to get favicon from URL
  let faviconUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🪟</text></svg>';
  if (win.url && !win.url.startsWith('peek://')) {
    try {
      const url = new URL(win.url);
      faviconUrl = `${url.origin}/favicon.ico`;
    } catch (e) {
      // Keep default favicon
    }
  }

  const favicon = document.createElement('img');
  favicon.className = 'card-favicon';
  favicon.src = faviconUrl;
  favicon.onerror = () => {
    favicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🪟</text></svg>';
  };

  const content = document.createElement('div');
  content.className = 'card-content';

  const title = document.createElement('h2');
  title.className = 'card-title';
  title.textContent = win.title || 'Untitled';

  const url = document.createElement('div');
  url.className = 'card-url';
  url.textContent = win.url || '';

  content.appendChild(title);
  content.appendChild(url);

  card.appendChild(favicon);
  card.appendChild(content);

  // Click to focus window and close windows view
  card.addEventListener('click', async () => {
    debug && console.log('[windows] Clicking window:', win.id, win.title);
    await api.window.focus(win.id);
    closeWindowsView();
  });

  return card;
};

const init = async () => {
  debug && console.log('[windows] init');

  // Load windows
  await loadWindows();

  // Set up search input
  const searchInput = document.querySelector('.search-input');
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    state.selectedIndex = 0;
    renderWindows();
  });

  // Keyboard navigation
  document.addEventListener('keydown', handleKeydown);

  // Render windows
  renderWindows();
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
