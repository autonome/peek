/**
 * Groups - Tag-based grouping of addresses
 *
 * Groups are implemented using tags:
 * - Each "group" is a tag
 * - Addresses in a group are addresses tagged with that tag
 * - Creating a new group creates a new tag
 * - Viewing a group shows all addresses with that tag
 */

const api = window.app;
const debug = api.debug;

// View states
const VIEW_GROUPS = 'groups';
const VIEW_ADDRESSES = 'addresses';

// Special pseudo-tag for untagged addresses
const UNTAGGED_GROUP = {
  id: '__untagged__',
  name: 'Untagged',
  color: '#666666',
  frequency: 0,
  isSpecial: true
};

let state = {
  view: VIEW_GROUPS,
  tags: [],
  currentTag: null,
  addresses: [],
  untaggedCount: 0,
  selectedIndex: 0,
  searchQuery: ''
};

// Expose state for debugging in tests
window._groupsState = state;

// Handle ESC - cooperative escape handling with window manager
// Returns { handled: true } if we navigated internally
// Returns { handled: false } if at root (groups list) and window should close
api.escape.onEscape(() => {
  // If search has content, clear it first
  const searchInput = document.querySelector('.search-input');
  if (state.searchQuery) {
    state.searchQuery = '';
    searchInput.value = '';
    renderCurrentView();
    return { handled: true };
  }

  if (state.view === VIEW_ADDRESSES) {
    // Navigate back to groups list
    // Use setTimeout to ensure handler returns before async work starts
    setTimeout(() => {
      showGroups().catch(err => {
        console.error('[groups] Error navigating back to groups:', err);
      });
    }, 0);
    return { handled: true };
  }
  // At root (groups list) - let window close
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
 * Activate the currently selected card
 */
const activateSelected = () => {
  const cards = getCards();
  const selected = cards[state.selectedIndex];
  if (selected) {
    selected.click();
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

const init = async () => {
  debug && console.log('Groups init');

  // Load tags from datastore
  await loadTags();

  // Set up search input
  const searchInput = document.querySelector('.search-input');
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderCurrentView();
  });

  // Keyboard navigation
  document.addEventListener('keydown', handleKeydown);

  // Show groups view
  showGroups();
};

/**
 * Render the current view (used after search filtering)
 */
const renderCurrentView = () => {
  if (state.view === VIEW_GROUPS) {
    renderGroups();
  } else {
    renderAddresses();
  }
};

/**
 * Load all tags sorted by frecency, and count untagged addresses
 */
const loadTags = async () => {
  const result = await api.datastore.getTagsByFrecency();
  if (result.success) {
    state.tags = result.data;
    debug && console.log('Loaded tags:', state.tags.length);

    // Fetch URL item count for each tag (only URLs for now)
    for (const tag of state.tags) {
      const itemsResult = await api.datastore.getItemsByTag(tag.id);
      if (itemsResult.success) {
        tag.addressCount = itemsResult.data.filter(item => item.type === 'url').length;
      } else {
        tag.addressCount = 0;
      }
    }
  } else {
    console.error('Failed to load tags:', result.error);
    state.tags = [];
  }

  // Get count of untagged URL items (only URLs for now)
  // Query all items and filter out those with tags
  const allItemsResult = await api.datastore.queryItems({});
  if (allItemsResult.success) {
    const untaggedItems = [];
    for (const item of allItemsResult.data) {
      // Only include URL items
      if (item.type !== 'url') continue;
      const tagsResult = await api.datastore.getItemTags(item.id);
      if (tagsResult.success && tagsResult.data.length === 0) {
        untaggedItems.push(item);
      }
    }
    state.untaggedCount = untaggedItems.length;
    debug && console.log('Untagged URL items:', state.untaggedCount);
  } else {
    state.untaggedCount = 0;
  }
};

/**
 * Load URL items for a specific tag (only URLs for now)
 */
const loadAddressesForTag = async (tagId) => {
  const result = await api.datastore.getItemsByTag(tagId);
  if (result.success) {
    // Only include URL items
    state.addresses = result.data.filter(item => item.type === 'url');
    debug && console.log('Loaded URL items for tag:', state.addresses.length);
  } else {
    console.error('Failed to load addresses:', result.error);
    state.addresses = [];
  }
};

/**
 * Filter groups by search query
 */
const filterGroups = (groups) => {
  if (!state.searchQuery) return groups;
  const q = state.searchQuery.toLowerCase();
  return groups.filter(tag => tag.name.toLowerCase().includes(q));
};

/**
 * Filter addresses by search query (title or URL)
 * Handles both Address (uri) and Item (content) objects
 */
const filterAddresses = (addresses) => {
  if (!state.searchQuery) return addresses;
  const q = state.searchQuery.toLowerCase();
  return addresses.filter(addr => {
    const url = addr.uri || addr.content || '';
    return (addr.title || '').toLowerCase().includes(q) ||
      url.toLowerCase().includes(q);
  });
};

/**
 * Show the groups (tags) view
 */
const showGroups = async () => {
  state.view = VIEW_GROUPS;
  state.currentTag = null;
  state.searchQuery = '';

  // Refresh tags
  await loadTags();

  // Update search placeholder
  const searchInput = document.querySelector('.search-input');
  searchInput.value = '';
  searchInput.placeholder = 'Search groups...';

  renderGroups();
};

// Expose for testing (Playwright escape doesn't trigger Electron before-input-event)
window.showGroups = showGroups;

/**
 * Render groups cards (separate from showGroups for filtering)
 */
const renderGroups = () => {
  const container = document.querySelector('.cards');
  container.innerHTML = '';

  // Build list of all groups (untagged first if it has items)
  let allGroups = [];
  if (state.untaggedCount > 0) {
    allGroups.push({ ...UNTAGGED_GROUP, frequency: state.untaggedCount });
  }

  // Add non-empty tags
  const nonEmptyTags = state.tags.filter(tag => tag.addressCount > 0);
  allGroups = allGroups.concat(nonEmptyTags);

  // Apply search filter
  const filteredGroups = filterGroups(allGroups);

  if (filteredGroups.length === 0) {
    const message = state.searchQuery
      ? 'No groups match your search.'
      : 'No groups yet. Tag some pages to create groups.';
    container.innerHTML = `<div class="empty-state">${message}</div>`;
    return;
  }

  filteredGroups.forEach(tag => {
    const card = createGroupCard(tag);
    container.appendChild(card);
  });

  // Reset selection
  state.selectedIndex = 0;
  updateSelection();
};

/**
 * Show addresses in a group (tag)
 */
const showAddresses = async (tag) => {
  state.view = VIEW_ADDRESSES;
  state.currentTag = tag;
  state.searchQuery = '';

  // Load URL items - handle special untagged group (only URLs for now)
  if (tag.isSpecial && tag.id === '__untagged__') {
    const allItemsResult = await api.datastore.queryItems({});
    if (allItemsResult.success) {
      const untaggedItems = [];
      for (const item of allItemsResult.data) {
        // Only include URL items
        if (item.type !== 'url') continue;
        const tagsResult = await api.datastore.getItemTags(item.id);
        if (tagsResult.success && tagsResult.data.length === 0) {
          untaggedItems.push(item);
        }
      }
      state.addresses = untaggedItems;
    } else {
      state.addresses = [];
    }
  } else {
    await loadAddressesForTag(tag.id);
  }

  // Update search placeholder with group name
  const searchInput = document.querySelector('.search-input');
  searchInput.value = '';
  searchInput.placeholder = `Search in ${tag.name}...`;

  renderAddresses();
};

/**
 * Render address cards (separate from showAddresses for filtering)
 */
const renderAddresses = () => {
  const container = document.querySelector('.cards');
  container.innerHTML = '';

  // Apply search filter
  const filteredAddresses = filterAddresses(state.addresses);

  if (filteredAddresses.length === 0) {
    const message = state.searchQuery
      ? 'No pages match your search.'
      : 'No pages in this group yet.';
    container.innerHTML = `<div class="empty-state">${message}</div>`;
    return;
  }

  filteredAddresses.forEach(address => {
    const card = createAddressCard(address);
    container.appendChild(card);
  });

  // Reset selection
  state.selectedIndex = 0;
  updateSelection();
};

/**
 * Create a card element for a group (tag)
 */
const createGroupCard = (tag) => {
  const card = document.createElement('div');
  card.className = 'card group-card';
  if (tag.isSpecial) {
    card.classList.add('special-group');
  }
  card.dataset.tagId = tag.id;

  const colorDot = document.createElement('div');
  colorDot.className = 'color-dot';
  colorDot.style.backgroundColor = tag.color || '#999';

  const content = document.createElement('div');
  content.className = 'card-content';

  const title = document.createElement('h2');
  title.className = 'card-title';
  title.textContent = tag.name;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const count = tag.isSpecial ? (tag.frequency || 0) : (tag.addressCount || 0);
  meta.textContent = `${count} ${count === 1 ? 'page' : 'pages'}`;

  content.appendChild(title);
  content.appendChild(meta);

  card.appendChild(colorDot);
  card.appendChild(content);

  // Click to view addresses in this group
  card.addEventListener('click', () => showAddresses(tag));

  return card;
};

/**
 * Create a card element for an address
 * Handles both Address (uri) and Item (content) objects
 */
const createAddressCard = (address) => {
  const card = document.createElement('div');
  card.className = 'card address-card';
  card.dataset.addressId = address.id;

  // Get URL from either uri (Address) or content (Item)
  const addressUrl = address.uri || address.content;

  // Get title - Items store title in metadata, Addresses have it directly
  let displayTitle = address.title;
  if (!displayTitle && address.metadata) {
    try {
      const meta = typeof address.metadata === 'string' ? JSON.parse(address.metadata) : address.metadata;
      displayTitle = meta.title;
    } catch (e) {
      // Ignore parse errors
    }
  }
  displayTitle = displayTitle || addressUrl;

  const favicon = document.createElement('img');
  favicon.className = 'card-favicon';
  favicon.src = address.favicon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌐</text></svg>';
  favicon.onerror = () => {
    favicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌐</text></svg>';
  };

  const content = document.createElement('div');
  content.className = 'card-content';

  const title = document.createElement('h2');
  title.className = 'card-title';
  title.textContent = displayTitle;

  const url = document.createElement('div');
  url.className = 'card-url';
  url.textContent = addressUrl;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const lastVisit = address.lastVisitAt ? new Date(address.lastVisitAt).toLocaleDateString() : 'Never';
  meta.textContent = `${address.visitCount || 0} visits · Last: ${lastVisit}`;

  content.appendChild(title);
  content.appendChild(url);
  content.appendChild(meta);

  card.appendChild(favicon);
  card.appendChild(content);

  // Click to open address
  card.addEventListener('click', async () => {
    debug && console.log('Opening address:', addressUrl);
    const result = await api.window.open(addressUrl, {
      width: 800,
      height: 600
    });
    debug && console.log('Window opened:', result);
  });

  return card;
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
