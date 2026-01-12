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
  selectedIndex: 0
};

// Handle ESC - cooperative escape handling with window manager
// Returns { handled: true } if we navigated internally
// Returns { handled: false } if at root (groups list) and window should close
api.escape.onEscape(() => {
  if (state.view === VIEW_ADDRESSES) {
    // Navigate back to groups list
    showGroups();
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
      e.preventDefault();
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        updateSelection();
      }
      break;
    case 'l':
    case 'ArrowRight':
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

  // Set up event listeners
  document.querySelector('.new-group-btn').addEventListener('click', createNewGroup);
  document.querySelector('.back-btn').addEventListener('click', showGroups);

  // Keyboard navigation
  document.addEventListener('keydown', handleKeydown);

  // Show groups view
  showGroups();
};

/**
 * Load all tags sorted by frecency, and count untagged addresses
 */
const loadTags = async () => {
  const result = await api.datastore.getTagsByFrecency();
  if (result.success) {
    state.tags = result.data;
    debug && console.log('Loaded tags:', state.tags.length);

    // Fetch address count for each tag
    for (const tag of state.tags) {
      const addressResult = await api.datastore.getAddressesByTag(tag.id);
      tag.addressCount = addressResult.success ? addressResult.data.length : 0;
    }
  } else {
    console.error('Failed to load tags:', result.error);
    state.tags = [];
  }

  // Get count of untagged addresses
  const untaggedResult = await api.datastore.getUntaggedAddresses();
  if (untaggedResult.success) {
    state.untaggedCount = untaggedResult.data.length;
    debug && console.log('Untagged addresses:', state.untaggedCount);
  } else {
    state.untaggedCount = 0;
  }
};

/**
 * Load addresses for a specific tag
 */
const loadAddressesForTag = async (tagId) => {
  const result = await api.datastore.getAddressesByTag(tagId);
  if (result.success) {
    state.addresses = result.data;
    debug && console.log('Loaded addresses for tag:', state.addresses.length);
  } else {
    console.error('Failed to load addresses:', result.error);
    state.addresses = [];
  }
};

/**
 * Create a new group (tag)
 */
const createNewGroup = async () => {
  const name = prompt('Enter group name:');
  if (!name || !name.trim()) return;

  const result = await api.datastore.getOrCreateTag(name.trim());
  if (result.success) {
    debug && console.log('Created tag:', result.data);
    await loadTags();
    showGroups();
  } else {
    console.error('Failed to create tag:', result.error);
  }
};

/**
 * Show the groups (tags) view
 */
const showGroups = async () => {
  state.view = VIEW_GROUPS;
  state.currentTag = null;

  // Refresh tags
  await loadTags();

  // Update UI
  document.querySelector('.header-title').textContent = 'Groups';
  document.querySelector('.back-btn').style.display = 'none';
  document.querySelector('.new-group-btn').style.display = 'block';

  // Clear and populate cards
  const container = document.querySelector('.cards');
  container.innerHTML = '';

  // Always show Untagged group first if there are untagged addresses
  if (state.untaggedCount > 0) {
    const untaggedCard = createGroupCard({ ...UNTAGGED_GROUP, frequency: state.untaggedCount });
    container.appendChild(untaggedCard);
  }

  // Filter out empty groups (tags with no addresses)
  const nonEmptyTags = state.tags.filter(tag => tag.addressCount > 0);

  if (nonEmptyTags.length === 0 && state.untaggedCount === 0) {
    container.innerHTML = '<div class="empty-state">No groups yet. Create one to get started.</div>';
    return;
  }

  nonEmptyTags.forEach(tag => {
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

  // Load addresses - handle special untagged group
  if (tag.isSpecial && tag.id === '__untagged__') {
    const result = await api.datastore.getUntaggedAddresses();
    if (result.success) {
      state.addresses = result.data;
    } else {
      state.addresses = [];
    }
  } else {
    await loadAddressesForTag(tag.id);
  }

  // Update UI
  document.querySelector('.header-title').textContent = tag.name;
  document.querySelector('.back-btn').style.display = 'block';
  document.querySelector('.new-group-btn').style.display = 'none';

  // Clear and populate cards
  const container = document.querySelector('.cards');
  container.innerHTML = '';

  if (state.addresses.length === 0) {
    container.innerHTML = '<div class="empty-state">No addresses in this group yet.</div>';
    return;
  }

  state.addresses.forEach(address => {
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
 */
const createAddressCard = (address) => {
  const card = document.createElement('div');
  card.className = 'card address-card';
  card.dataset.addressId = address.id;

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
  title.textContent = address.title || address.uri;

  const url = document.createElement('div');
  url.className = 'card-url';
  url.textContent = address.uri;

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
    debug && console.log('Opening address:', address.uri);
    const result = await api.window.open(address.uri, {
      width: 800,
      height: 600
    });
    debug && console.log('Window opened:', result);
  });

  return card;
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
