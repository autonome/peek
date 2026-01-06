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

let state = {
  view: VIEW_GROUPS,
  tags: [],
  currentTag: null,
  addresses: []
};

// Handle ESC - go back to groups view
document.onkeydown = (evt) => {
  if (evt.key === 'Escape') {
    if (state.view === VIEW_ADDRESSES) {
      showGroups();
    }
  }
};

const init = async () => {
  debug && console.log('Groups init');

  // Load tags from datastore
  await loadTags();

  // Set up event listeners
  document.querySelector('.new-group-btn').addEventListener('click', createNewGroup);
  document.querySelector('.back-btn').addEventListener('click', showGroups);

  // Show groups view
  showGroups();
};

/**
 * Load all tags sorted by frecency
 */
const loadTags = async () => {
  const result = await api.datastore.getTagsByFrecency();
  if (result.success) {
    state.tags = result.data;
    debug && console.log('Loaded tags:', state.tags.length);
  } else {
    console.error('Failed to load tags:', result.error);
    state.tags = [];
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

  if (state.tags.length === 0) {
    container.innerHTML = '<div class="empty-state">No groups yet. Create one to get started.</div>';
    return;
  }

  state.tags.forEach(tag => {
    const card = createGroupCard(tag);
    container.appendChild(card);
  });
};

/**
 * Show addresses in a group (tag)
 */
const showAddresses = async (tag) => {
  state.view = VIEW_ADDRESSES;
  state.currentTag = tag;

  // Load addresses for this tag
  await loadAddressesForTag(tag.id);

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
};

/**
 * Create a card element for a group (tag)
 */
const createGroupCard = (tag) => {
  const card = document.createElement('div');
  card.className = 'card group-card';
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
  meta.textContent = `Used ${tag.frequency || 0} times`;

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
