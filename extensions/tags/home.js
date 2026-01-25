/**
 * Tags Home - Tag visualization and management UI
 *
 * Features:
 * - View all saved items (addresses) filtered by type
 * - Tag-based filtering via clickable tag buttons
 * - Tag editing on items (add/remove tags)
 * - Search across items and tags
 */

const api = window.app;
const debug = api?.debug;

// State
let state = {
  activeFilter: 'all',  // 'all' | 'page' | 'text' | 'tagset' | 'image'
  activeTags: [],       // Array of tag objects for filtering (AND logic)
  items: [],            // All addresses
  tags: [],             // All tags sorted by frecency
  itemTags: new Map(),  // Map of addressId -> [tags]
  selectedIndex: 0,
  searchQuery: '',
  editingItem: null     // Item being edited in modal
};

// Expose state for debugging
window._tagsState = state;

// DOM elements
let searchInput;
let cardsContainer;
let tagList;
let modalOverlay;

/**
 * Initialize the UI
 */
const init = async () => {
  debug && console.log('[tags] Home init');

  // Cache DOM elements
  searchInput = document.querySelector('.search-input');
  cardsContainer = document.querySelector('.cards');
  tagList = document.querySelector('.tag-list');
  modalOverlay = document.getElementById('editModal');

  // Load data
  await loadData();

  // Set up event listeners
  setupEventListeners();

  // Initial render
  render();
};

/**
 * Load all data from datastore
 */
const loadData = async () => {
  // Load all items (unified: addresses, texts, tagsets, images)
  console.log('[tags] Loading items...');
  const itemsResult = await api.datastore.queryItems({});
  console.log('[tags] queryItems result:', itemsResult.success, 'count:', itemsResult.data?.length);
  if (itemsResult.success) {
    state.items = itemsResult.data;
    console.log('[tags] Loaded items:', state.items.length);
    // Log first few items for debugging
    state.items.slice(0, 3).forEach((item, i) => {
      console.log(`[tags] Item ${i}:`, item.id, item.type, item.content?.substring(0, 50));
    });
  } else {
    console.error('[tags] Failed to load items:', itemsResult.error);
    state.items = [];
  }

  // Load tags for each item
  console.log('[tags] Loading tags for', state.items.length, 'items...');
  for (const item of state.items) {
    const tagsResult = await api.datastore.getItemTags(item.id);
    if (tagsResult.success) {
      state.itemTags.set(item.id, tagsResult.data);
      if (tagsResult.data.length > 0) {
        console.log('[tags] Item', item.id, 'has tags:', tagsResult.data.map(t => t.name).join(', '));
      }
    }
  }

  // Load all tags by frecency
  const tagsResult = await api.datastore.getTagsByFrecency();
  if (tagsResult.success) {
    state.tags = tagsResult.data;
    debug && console.log('[tags] Loaded tags:', state.tags.length);
  } else {
    console.error('[tags] Failed to load tags:', tagsResult.error);
    state.tags = [];
  }

  // Update filter counts
  updateFilterCounts();
};

/**
 * Set up all event listeners
 */
const setupEventListeners = () => {
  // Search input
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    render();
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      if (state.activeFilter === filter) {
        // Toggle off - return to 'all'
        state.activeFilter = 'all';
      } else {
        state.activeFilter = filter;
      }
      state.selectedIndex = 0;
      render();
    });
  });

  // Modal close
  document.querySelector('.modal-close').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // New tag input
  const newTagInput = document.querySelector('.new-tag-input');
  const addTagBtn = document.querySelector('.add-tag-btn');

  addTagBtn.addEventListener('click', () => addNewTag(newTagInput.value));
  newTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addNewTag(newTagInput.value);
    }
  });

  // Keyboard navigation
  document.addEventListener('keydown', handleKeydown);

  // Escape handling
  if (api.escape) {
    api.escape.onEscape(() => {
      // If modal is open, close it
      if (modalOverlay.classList.contains('visible')) {
        closeModal();
        return { handled: true };
      }

      // If search has content, clear it
      if (state.searchQuery) {
        state.searchQuery = '';
        searchInput.value = '';
        render();
        return { handled: true };
      }

      // If tag filter is active, clear it
      if (state.activeTags.length > 0) {
        clearTagFilter();
        return { handled: true };
      }

      // If type filter is active, clear it
      if (state.activeFilter !== 'all') {
        state.activeFilter = 'all';
        state.selectedIndex = 0;
        render();
        return { handled: true };
      }

      // Nothing to clear, let window close
      return { handled: false };
    });
  }
};

/**
 * Handle keyboard navigation
 */
const handleKeydown = (e) => {
  // Ignore if modal is open and not in an input
  if (modalOverlay.classList.contains('visible')) {
    if (e.key === 'Escape') {
      closeModal();
    }
    return;
  }

  const isSearchFocused = document.activeElement === searchInput;

  // Focus search with / or Cmd+F
  if ((e.key === '/' || (e.key === 'f' && (e.metaKey || e.ctrlKey))) && !isSearchFocused) {
    e.preventDefault();
    searchInput.focus();
    return;
  }

  // Don't intercept when typing in search (except navigation keys)
  if (isSearchFocused && !['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
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
      if (isSearchFocused) return;
      e.preventDefault();
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        updateSelection();
      }
      break;
    case 'l':
    case 'ArrowRight':
      if (isSearchFocused) return;
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
    case 'Escape':
      if (isSearchFocused) {
        searchInput.blur();
      }
      break;
  }
};

/**
 * Get all cards in the current view
 */
const getCards = () => Array.from(document.querySelectorAll('.cards .card'));

/**
 * Get number of columns in the grid
 */
const getGridColumns = (cards) => {
  if (cards.length < 2) return 1;
  const firstTop = cards[0].getBoundingClientRect().top;
  for (let i = 1; i < cards.length; i++) {
    if (cards[i].getBoundingClientRect().top !== firstTop) {
      return i;
    }
  }
  return cards.length;
};

/**
 * Update visual selection on cards
 */
const updateSelection = () => {
  const cards = getCards();
  cards.forEach((card, i) => {
    card.classList.toggle('selected', i === state.selectedIndex);
  });

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
 * Update filter button counts
 */
const updateFilterCounts = () => {
  const pageCount = state.items.filter(item => !item.type || item.type === 'url' || item.uri).length;
  const textCount = state.items.filter(item => item.type === 'text').length;
  const tagsetCount = state.items.filter(item => item.type === 'tagset').length;
  const imageCount = state.items.filter(item => item.type === 'image').length;

  document.querySelector('[data-count="page"]').textContent = pageCount;
  document.querySelector('[data-count="text"]').textContent = textCount;
  document.querySelector('[data-count="tagset"]').textContent = tagsetCount;
  document.querySelector('[data-count="image"]').textContent = imageCount;
};

/**
 * Filter items based on current state
 */
const getFilteredItems = () => {
  let items = [...state.items];

  // Filter by type
  if (state.activeFilter !== 'all') {
    items = items.filter(item => {
      const itemType = item.type || (item.uri ? 'url' : null);
      if (state.activeFilter === 'page') {
        return itemType === 'url' || !itemType;
      }
      return itemType === state.activeFilter;
    });
  }

  // Filter by active tags (AND logic - item must have ALL selected tags)
  if (state.activeTags.length > 0) {
    items = items.filter(item => {
      const tags = state.itemTags.get(item.id) || [];
      const tagIds = new Set(tags.map(t => t.id));
      return state.activeTags.every(activeTag => tagIds.has(activeTag.id));
    });
  }

  // Filter by search query - match tag names (supports multiple tags separated by comma or space)
  if (state.searchQuery) {
    // Split by comma or space, filter empty strings
    const searchTerms = state.searchQuery.toLowerCase()
      .split(/[,\s]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);

    if (searchTerms.length > 0) {
      items = items.filter(item => {
        const tags = state.itemTags.get(item.id) || [];
        const tagNames = tags.map(t => t.name.toLowerCase());
        // Item must have tags matching ALL search terms (AND logic)
        return searchTerms.every(term =>
          tagNames.some(tagName => tagName.includes(term))
        );
      });
    }
  }

  return items;
};

/**
 * Filter tags based on search query
 */
const getFilteredTags = () => {
  if (!state.searchQuery) return state.tags;
  const q = state.searchQuery.toLowerCase();
  return state.tags.filter(tag => tag.name.toLowerCase().includes(q));
};

/**
 * Main render function
 */
const render = () => {
  renderFilterButtons();
  renderTagSidebar();
  renderCards();
  renderActiveTagIndicator();
};

/**
 * Render filter button active states
 */
const renderFilterButtons = () => {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const filter = btn.dataset.filter;
    btn.classList.toggle('active', state.activeFilter === filter);
  });
};

/**
 * Render active tag indicator in header
 */
const renderActiveTagIndicator = () => {
  const indicator = document.querySelector('.active-tag-indicator');

  if (state.activeTags.length > 0) {
    indicator.innerHTML = state.activeTags.map(tag => `
      <span class="active-tag-chip" data-tag-id="${tag.id}">
        ${escapeHtml(tag.name)}
        <button class="clear-tag" title="Remove tag">&times;</button>
      </span>
    `).join('') + `
      <button class="clear-all-tags" title="Clear all filters">&times; All</button>
    `;
    indicator.classList.add('visible');

    indicator.querySelectorAll('.active-tag-chip .clear-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tagId = parseInt(btn.parentElement.dataset.tagId, 10);
        removeActiveTag(tagId);
      });
    });

    indicator.querySelector('.clear-all-tags').addEventListener('click', clearTagFilter);
  } else {
    indicator.classList.remove('visible');
    indicator.innerHTML = '';
  }
};

/**
 * Remove a single tag from active filters
 */
const removeActiveTag = (tagId) => {
  state.activeTags = state.activeTags.filter(t => t.id !== tagId);
  state.selectedIndex = 0;
  render();
};

/**
 * Clear all active tag filters
 */
const clearTagFilter = () => {
  state.activeTags = [];
  state.selectedIndex = 0;
  render();
};

/**
 * Render the tag sidebar
 */
const renderTagSidebar = () => {
  const tags = getFilteredTags();

  if (tags.length === 0) {
    tagList.innerHTML = '<div class="empty-state">No tags yet</div>';
    return;
  }

  tagList.innerHTML = '';

  tags.forEach(tag => {
    // Count items with this tag
    let count = 0;
    state.itemTags.forEach(itemTags => {
      if (itemTags.some(t => t.id === tag.id)) count++;
    });

    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    const isSelected = state.activeTags.some(t => t.id === tag.id);
    if (isSelected) {
      chip.classList.add('selected');
    }

    chip.innerHTML = `
      <span class="tag-name">${escapeHtml(tag.name)}</span>
      <span class="tag-count">${count}</span>
    `;

    chip.addEventListener('click', () => {
      const existingIndex = state.activeTags.findIndex(t => t.id === tag.id);
      if (existingIndex >= 0) {
        state.activeTags = state.activeTags.filter(t => t.id !== tag.id);
      } else {
        state.activeTags = [...state.activeTags, tag];
      }
      state.selectedIndex = 0;
      render();
    });

    tagList.appendChild(chip);
  });
};

/**
 * Render item cards
 */
const renderCards = () => {
  const items = getFilteredItems();

  if (items.length === 0) {
    const message = state.searchQuery
      ? 'No items match your search.'
      : state.activeTags.length > 0
        ? `No items with all selected tags.`
        : 'No saved items yet.';
    cardsContainer.innerHTML = `<div class="empty-state">${message}</div>`;
    return;
  }

  cardsContainer.innerHTML = '';

  items.forEach(item => {
    const card = createItemCard(item);
    cardsContainer.appendChild(card);
  });

  state.selectedIndex = Math.min(state.selectedIndex, items.length - 1);
  updateSelection();
};

/**
 * Create a card element for an item
 */
const createItemCard = (item) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.itemId = item.id;

  const tags = state.itemTags.get(item.id) || [];

  // Handle both old address schema and new item schema
  const isAddress = !!item.uri;
  const itemType = item.type || 'url';

  let title, subtitle, faviconUrl;

  if (isAddress) {
    // Old address schema
    title = item.title || item.uri;
    subtitle = item.uri;
    faviconUrl = item.favicon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌐</text></svg>';
  } else {
    // New item schema
    if (itemType === 'url') {
      title = item.content;
      subtitle = item.content;
      faviconUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌐</text></svg>';
    } else if (itemType === 'text') {
      title = item.content.substring(0, 100) + (item.content.length > 100 ? '...' : '');
      subtitle = 'Text';
      faviconUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📝</text></svg>';
    } else if (itemType === 'tagset') {
      title = 'Tag Set';
      subtitle = tags.length > 0 ? tags.map(t => t.name).join(', ') : 'Empty tagset';
      faviconUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏷️</text></svg>';
    } else if (itemType === 'image') {
      title = item.content || 'Image';
      subtitle = 'Image';
      faviconUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🖼️</text></svg>';
    }
  }

  card.innerHTML = `
    <div class="card-header">
      <img class="card-favicon" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>'">
      <div class="card-content">
        <div class="card-title">${escapeHtml(title)}</div>
        <div class="card-url">${escapeHtml(subtitle)}</div>
      </div>
    </div>
    <div class="card-tags">
      ${tags.map(tag => `<span class="card-tag" data-tag-id="${tag.id}">${escapeHtml(tag.name)}</span>`).join('')}
    </div>
  `;

  // Click on card to open edit modal
  card.addEventListener('click', (e) => {
    // If clicking a tag, add it to filter (toggle behavior)
    if (e.target.classList.contains('card-tag')) {
      const tagId = parseInt(e.target.dataset.tagId, 10);
      const tag = state.tags.find(t => t.id === tagId);
      if (tag) {
        const existingIndex = state.activeTags.findIndex(t => t.id === tagId);
        if (existingIndex >= 0) {
          state.activeTags = state.activeTags.filter(t => t.id !== tagId);
        } else {
          state.activeTags = [...state.activeTags, tag];
        }
        state.selectedIndex = 0;
        render();
      }
      return;
    }

    // Open edit modal
    openEditModal(item);
  });

  return card;
};

/**
 * Open the edit modal for an item
 */
const openEditModal = (item) => {
  state.editingItem = item;

  const modal = document.querySelector('.modal');
  const tags = state.itemTags.get(item.id) || [];

  // Handle both old address schema and new item schema
  const isAddress = !!item.uri;
  const itemType = item.type || 'url';

  let title, subtitle, faviconUrl;

  if (isAddress) {
    // Old address schema
    title = item.title || item.uri;
    subtitle = item.uri;
    faviconUrl = item.favicon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌐</text></svg>';
  } else {
    // New item schema
    if (itemType === 'url') {
      title = item.content;
      subtitle = item.content;
      faviconUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌐</text></svg>';
    } else if (itemType === 'text') {
      title = item.content.substring(0, 100) + (item.content.length > 100 ? '...' : '');
      subtitle = 'Text';
      faviconUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📝</text></svg>';
    } else if (itemType === 'tagset') {
      title = 'Tag Set';
      subtitle = tags.length > 0 ? tags.map(t => t.name).join(', ') : 'Empty tagset';
      faviconUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏷️</text></svg>';
    } else if (itemType === 'image') {
      title = item.content || 'Image';
      subtitle = 'Image';
      faviconUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🖼️</text></svg>';
    }
  }

  // Set item info
  modal.querySelector('.modal-favicon').src = faviconUrl;
  modal.querySelector('.modal-item-title').textContent = title;
  modal.querySelector('.modal-item-url').textContent = subtitle;

  // Render current tags
  renderCurrentTags(tags);

  // Render available tags
  renderAvailableTags(tags);

  // Clear new tag input
  document.querySelector('.new-tag-input').value = '';

  // Show modal
  modalOverlay.classList.add('visible');
};

/**
 * Close the edit modal
 */
const closeModal = () => {
  modalOverlay.classList.remove('visible');
  state.editingItem = null;
};

/**
 * Render current tags in modal
 */
const renderCurrentTags = (tags) => {
  const container = document.querySelector('.current-tags');

  if (tags.length === 0) {
    container.innerHTML = '<span class="no-tags">No tags</span>';
    return;
  }

  container.innerHTML = '';

  tags.forEach(tag => {
    const tagEl = document.createElement('span');
    tagEl.className = 'current-tag';
    tagEl.innerHTML = `
      ${escapeHtml(tag.name)}
      <button class="remove-tag" data-tag-id="${tag.id}">&times;</button>
    `;

    tagEl.querySelector('.remove-tag').addEventListener('click', () => removeTag(tag));

    container.appendChild(tagEl);
  });
};

/**
 * Render available tags in modal
 */
const renderAvailableTags = (currentTags) => {
  const container = document.querySelector('.available-tags');
  const currentTagIds = new Set(currentTags.map(t => t.id));

  container.innerHTML = '';

  state.tags.forEach(tag => {
    const tagEl = document.createElement('span');
    tagEl.className = 'available-tag';
    if (currentTagIds.has(tag.id)) {
      tagEl.classList.add('already-added');
    }
    tagEl.textContent = tag.name;

    if (!currentTagIds.has(tag.id)) {
      tagEl.addEventListener('click', () => addTag(tag));
    }

    container.appendChild(tagEl);
  });

  if (state.tags.length === 0) {
    container.innerHTML = '<span class="no-tags">No tags available</span>';
  }
};

/**
 * Add a tag to the current item
 */
const addTag = async (tag) => {
  if (!state.editingItem) return;

  const result = await api.datastore.tagItem(state.editingItem.id, tag.id);
  if (result.success) {
    // Update local state
    const tags = state.itemTags.get(state.editingItem.id) || [];
    if (!tags.some(t => t.id === tag.id)) {
      tags.push(tag);
      state.itemTags.set(state.editingItem.id, tags);
    }

    // Re-render modal
    renderCurrentTags(tags);
    renderAvailableTags(tags);

    // Re-render cards to show updated tags
    renderCards();
  } else {
    console.error('[tags] Failed to add tag:', result.error);
  }
};

/**
 * Remove a tag from the current item
 */
const removeTag = async (tag) => {
  if (!state.editingItem) return;

  const result = await api.datastore.untagItem(state.editingItem.id, tag.id);
  if (result.success) {
    // Update local state
    let tags = state.itemTags.get(state.editingItem.id) || [];
    tags = tags.filter(t => t.id !== tag.id);
    state.itemTags.set(state.editingItem.id, tags);

    // Re-render modal
    renderCurrentTags(tags);
    renderAvailableTags(tags);

    // Re-render cards and sidebar
    renderCards();
    renderTagSidebar();
  } else {
    console.error('[tags] Failed to remove tag:', result.error);
  }
};

/**
 * Add a new tag (create if needed) to the current item
 */
const addNewTag = async (tagName) => {
  tagName = tagName.trim();
  if (!tagName || !state.editingItem) return;

  // Get or create tag
  const tagResult = await api.datastore.getOrCreateTag(tagName);
  if (!tagResult.success) {
    console.error('[tags] Failed to create tag:', tagResult.error);
    return;
  }

  const tag = tagResult.data.tag;

  // If it's a new tag, add to our tags list
  if (tagResult.data.created) {
    state.tags.unshift(tag); // Add to beginning (most recent)
  }

  // Add tag to item
  await addTag(tag);

  // Clear input
  document.querySelector('.new-tag-input').value = '';

  // Re-render sidebar to show new tag
  renderTagSidebar();
};

/**
 * Escape HTML special characters
 */
const escapeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
