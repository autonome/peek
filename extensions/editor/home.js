/**
 * Editor Home - Full item CRUD with tag editing
 *
 * Features:
 * - View all saved items with type filtering and search
 * - Add new items (URLs, text notes, tagsets) with smart type detection
 * - Edit items with type-specific UI
 * - Tag editing (add/remove) with frecency-sorted available tags
 * - Delete items with confirmation
 * - Publishes editor:changed after mutations
 */

const api = window.app;
const debug = api?.debug;

// State
let state = {
  activeFilter: 'all',   // 'all' | 'page' | 'text' | 'tagset' | 'image'
  items: [],              // All items
  tags: [],               // All tags sorted by frecency
  itemTags: new Map(),    // Map of itemId -> [tags]
  selectedIndex: 0,
  searchQuery: '',
  editingItem: null,      // Item being edited in modal
  editOriginal: null,     // Original content for dirty detection
  // Add mode
  addTags: [],            // Selected tags for new item
};

// DOM elements
let searchInput, cardsContainer, modalOverlay, deleteConfirmOverlay;
let addInput, addTypeBadge, addSaveBtn, addTagsSection;
let addSelectedTagsEl, addTagInput, addAvailableTagsEl;

/**
 * Detect item type from input text (same logic as mobile)
 */
const getAddInputType = (text) => {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return 'url';
  return 'text';
};

/**
 * Initialize the UI
 */
const init = async () => {
  debug && console.log('[editor] Home init');

  // Cache DOM elements
  searchInput = document.querySelector('.search-input');
  cardsContainer = document.querySelector('.cards');
  modalOverlay = document.getElementById('editModal');
  deleteConfirmOverlay = document.getElementById('deleteConfirm');
  addInput = document.querySelector('.add-input');
  addTypeBadge = document.querySelector('.add-type-badge');
  addSaveBtn = document.querySelector('.add-save-btn');
  addTagsSection = document.querySelector('.add-tags-section');
  addSelectedTagsEl = document.querySelector('.add-selected-tags');
  addTagInput = document.querySelector('.add-tag-input');
  addAvailableTagsEl = document.querySelector('.add-available-tags');

  // Check URL params for deep-link behavior
  const params = new URLSearchParams(window.location.search);
  const openItemId = params.get('itemId');
  const mode = params.get('mode');

  // Load data
  await loadData();

  // Set up event listeners
  setupEventListeners();

  // Initial render
  render();

  // Deep-link: open specific item for editing
  if (openItemId) {
    const item = state.items.find(i => i.id === openItemId || String(i.id) === openItemId);
    if (item) {
      openEditModal(item);
    }
  }

  // Deep-link: open in add mode
  if (mode === 'add') {
    const addContent = params.get('addContent') || params.get('addUrl') || '';
    if (addContent) {
      addInput.value = addContent;
      updateAddTypeBadge();
    }
    showAddTags();
    addInput.focus();
  }
};

/**
 * Load all data from datastore
 */
const loadData = async () => {
  // Load all items
  const itemsResult = await api.datastore.queryItems({});
  if (itemsResult.success) {
    state.items = itemsResult.data;
  } else {
    console.error('[editor] Failed to load items:', itemsResult.error);
    state.items = [];
  }

  // Load tags for each item
  for (const item of state.items) {
    const tagsResult = await api.datastore.getItemTags(item.id);
    if (tagsResult.success) {
      state.itemTags.set(item.id, tagsResult.data);
    }
  }

  // Load all tags by frecency
  const tagsResult = await api.datastore.getTagsByFrecency();
  if (tagsResult.success) {
    state.tags = tagsResult.data;
  } else {
    state.tags = [];
  }

  updateFilterCounts();
};

/**
 * Set up all event listeners
 */
const setupEventListeners = () => {
  // Search
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    render();
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      if (state.activeFilter === filter && filter !== 'all') {
        state.activeFilter = 'all';
      } else {
        state.activeFilter = filter;
      }
      state.selectedIndex = 0;
      render();
    });
  });

  // Add input — type detection
  addInput.addEventListener('input', updateAddTypeBadge);
  addInput.addEventListener('focus', showAddTags);
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSave();
    }
  });

  // Add save button
  addSaveBtn.addEventListener('click', handleAddSave);

  // Add tag input
  addTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTagInput();
    }
  });

  // Edit modal close
  document.querySelector('#editModal .modal-close').addEventListener('click', handleEditCancel);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) handleEditCancel();
  });

  // Edit modal buttons
  document.querySelector('.modal-save-btn').addEventListener('click', handleEditSave);
  document.querySelector('.modal-cancel-btn').addEventListener('click', handleEditCancel);
  document.querySelector('.modal-delete-btn').addEventListener('click', handleDeleteRequest);

  // Edit modal new tag
  const newTagInput = document.querySelector('.new-tag-input');
  const addTagBtn = document.querySelector('.add-tag-btn');
  addTagBtn.addEventListener('click', () => addNewTagToItem(newTagInput.value));
  newTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addNewTagToItem(newTagInput.value);
    }
  });

  // Delete confirm modal
  deleteConfirmOverlay.querySelectorAll('.delete-cancel-btn').forEach(btn => {
    btn.addEventListener('click', closeDeleteConfirm);
  });
  deleteConfirmOverlay.addEventListener('click', (e) => {
    if (e.target === deleteConfirmOverlay) closeDeleteConfirm();
  });
  document.querySelector('.delete-confirm-btn').addEventListener('click', handleDeleteConfirm);

  // Keyboard navigation
  document.addEventListener('keydown', handleKeydown);

  // Escape handling
  if (api.escape) {
    api.escape.onEscape(() => {
      if (deleteConfirmOverlay.classList.contains('visible')) {
        closeDeleteConfirm();
        return { handled: true };
      }
      if (modalOverlay.classList.contains('visible')) {
        handleEditCancel();
        return { handled: true };
      }
      if (state.searchQuery) {
        state.searchQuery = '';
        searchInput.value = '';
        render();
        return { handled: true };
      }
      if (state.activeFilter !== 'all') {
        state.activeFilter = 'all';
        state.selectedIndex = 0;
        render();
        return { handled: true };
      }
      return { handled: false };
    });
  }
};

/**
 * Handle keyboard navigation
 */
const handleKeydown = (e) => {
  if (modalOverlay.classList.contains('visible') || deleteConfirmOverlay.classList.contains('visible')) {
    if (e.key === 'Escape') {
      if (deleteConfirmOverlay.classList.contains('visible')) {
        closeDeleteConfirm();
      } else {
        handleEditCancel();
      }
    }
    return;
  }

  const isInputFocused = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

  if ((e.key === '/' || (e.key === 'f' && (e.metaKey || e.ctrlKey))) && !isInputFocused) {
    e.preventDefault();
    searchInput.focus();
    return;
  }

  if (isInputFocused && !['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
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
      if (isInputFocused) return;
      e.preventDefault();
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        updateSelection();
      }
      break;
    case 'l':
    case 'ArrowRight':
      if (isInputFocused) return;
      e.preventDefault();
      if (state.selectedIndex < cards.length - 1) {
        state.selectedIndex++;
        updateSelection();
      }
      break;
    case 'Enter':
      if (!isInputFocused) {
        e.preventDefault();
        activateSelected();
      }
      break;
    case 'Escape':
      if (isInputFocused) {
        document.activeElement.blur();
      }
      break;
  }
};

const getCards = () => Array.from(document.querySelectorAll('.cards .card'));

const getGridColumns = (cards) => {
  if (cards.length < 2) return 1;
  const firstTop = cards[0].getBoundingClientRect().top;
  for (let i = 1; i < cards.length; i++) {
    if (cards[i].getBoundingClientRect().top !== firstTop) return i;
  }
  return cards.length;
};

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

const activateSelected = () => {
  const cards = getCards();
  const selected = cards[state.selectedIndex];
  if (selected) selected.click();
};

// ───────────────────────── Add item ─────────────────────────

const updateAddTypeBadge = () => {
  const type = getAddInputType(addInput.value);
  if (!type) {
    addTypeBadge.textContent = '';
    addSaveBtn.disabled = true;
  } else {
    addTypeBadge.textContent = type === 'url' ? 'URL' : 'TEXT';
    addSaveBtn.disabled = false;
  }
};

const showAddTags = () => {
  addTagsSection.style.display = '';
  renderAddAvailableTags();
};

const renderAddSelectedTags = () => {
  addSelectedTagsEl.innerHTML = '';
  state.addTags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `${escapeHtml(tag.name)} <button class="remove-pill">&times;</button>`;
    pill.querySelector('.remove-pill').addEventListener('click', () => {
      state.addTags = state.addTags.filter(t => t.id !== tag.id);
      renderAddSelectedTags();
      renderAddAvailableTags();
    });
    addSelectedTagsEl.appendChild(pill);
  });
};

const renderAddAvailableTags = () => {
  const filterText = addTagInput.value.toLowerCase().trim();
  const selectedIds = new Set(state.addTags.map(t => t.id));
  let tags = state.tags;
  if (filterText) {
    tags = tags.filter(t => t.name.toLowerCase().includes(filterText));
  }

  addAvailableTagsEl.innerHTML = '';
  tags.forEach(tag => {
    const btn = document.createElement('span');
    btn.className = 'available-tag-btn';
    btn.textContent = tag.name;
    if (selectedIds.has(tag.id)) {
      btn.classList.add('already-added');
    } else {
      btn.addEventListener('click', () => {
        state.addTags.push(tag);
        renderAddSelectedTags();
        renderAddAvailableTags();
      });
    }
    addAvailableTagsEl.appendChild(btn);
  });
};

const handleAddTagInput = async () => {
  const raw = addTagInput.value.trim();
  if (!raw) return;

  // Support comma-separated tags
  const names = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
  for (const name of names) {
    const existing = state.addTags.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existing) continue;

    const result = await api.datastore.getOrCreateTag(name);
    if (result.success) {
      const tag = result.data.tag;
      if (result.data.created) {
        state.tags.unshift(tag);
      }
      if (!state.addTags.some(t => t.id === tag.id)) {
        state.addTags.push(tag);
      }
    }
  }

  addTagInput.value = '';
  renderAddSelectedTags();
  renderAddAvailableTags();
};

const handleAddSave = async () => {
  const text = addInput.value.trim();
  const type = getAddInputType(text);
  if (!type) return;

  // Determine if this should be a tagset (only tags, no content)
  // If input is empty but tags are selected, treat as tagset
  let itemType = type;
  let opts = {};

  if (itemType === 'url') {
    opts.url = text;
    opts.content = text;
  } else {
    opts.content = text;
  }

  const result = await api.datastore.addItem(itemType, opts);
  if (!result.success) {
    console.error('[editor] Failed to add item:', result.error);
    return;
  }

  const itemId = result.data.id;

  // Tag the new item
  for (const tag of state.addTags) {
    await api.datastore.tagItem(itemId, tag.id);
  }

  // Reset add state
  addInput.value = '';
  state.addTags = [];
  renderAddSelectedTags();
  updateAddTypeBadge();

  // Reload and re-render
  await loadData();
  render();

  // Publish change
  api.publish('editor:changed', { action: 'add', itemId }, api.scopes.GLOBAL);
};

// ───────────────────────── Filter & render ─────────────────────────

const updateFilterCounts = () => {
  const allCount = state.items.length;
  const pageCount = state.items.filter(i => !i.type || i.type === 'url' || i.uri).length;
  const textCount = state.items.filter(i => i.type === 'text').length;
  const tagsetCount = state.items.filter(i => i.type === 'tagset').length;
  const imageCount = state.items.filter(i => i.type === 'image').length;

  const setCount = (key, val) => {
    const el = document.querySelector(`[data-count="${key}"]`);
    if (el) el.textContent = val;
  };
  setCount('all', allCount);
  setCount('page', pageCount);
  setCount('text', textCount);
  setCount('tagset', tagsetCount);
  setCount('image', imageCount);
};

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

  // Filter by search query — match content + tag names
  if (state.searchQuery) {
    const terms = state.searchQuery.toLowerCase().split(/[,\s]+/).map(t => t.trim()).filter(t => t);
    if (terms.length > 0) {
      items = items.filter(item => {
        const content = (item.content || '').toLowerCase();
        const tags = state.itemTags.get(item.id) || [];
        const tagNames = tags.map(t => t.name.toLowerCase());
        return terms.every(term =>
          content.includes(term) || tagNames.some(n => n.includes(term))
        );
      });
    }
  }

  return items;
};

const render = () => {
  renderFilterButtons();
  renderCards();
};

const renderFilterButtons = () => {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', state.activeFilter === btn.dataset.filter);
  });
};

const renderCards = () => {
  const items = getFilteredItems();

  if (items.length === 0) {
    const msg = state.searchQuery
      ? 'No items match your search.'
      : 'No saved items yet.';
    cardsContainer.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  cardsContainer.innerHTML = '';
  items.forEach(item => {
    cardsContainer.appendChild(createItemCard(item));
  });

  state.selectedIndex = Math.min(state.selectedIndex, items.length - 1);
  updateSelection();
};

const TYPE_ICONS = {
  url: '\uD83C\uDF10',    // globe
  text: '\uD83D\uDCDD',   // memo
  tagset: '\uD83C\uDFF7\uFE0F', // label
  image: '\uD83D\uDDBC\uFE0F'   // framed picture
};

const createItemCard = (item) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.itemId = item.id;

  const tags = state.itemTags.get(item.id) || [];
  const itemType = item.type || 'url';

  let title, subtitle;
  if (itemType === 'url') {
    title = item.content;
    subtitle = item.content;
  } else if (itemType === 'text') {
    title = item.content.substring(0, 100) + (item.content.length > 100 ? '...' : '');
    subtitle = 'Text';
  } else if (itemType === 'tagset') {
    title = 'Tag Set';
    subtitle = tags.length > 0 ? tags.map(t => t.name).join(', ') : 'Empty tagset';
  } else if (itemType === 'image') {
    title = item.content || 'Image';
    subtitle = 'Image';
  } else {
    title = item.content || '(unknown)';
    subtitle = itemType;
  }

  const icon = TYPE_ICONS[itemType] || '\uD83D\uDCC4';
  const dateStr = item.createdAt ? formatDate(item.createdAt) : '';

  card.innerHTML = `
    <div class="card-header">
      <div class="card-icon">${icon}</div>
      <div class="card-content">
        <div class="card-title">${escapeHtml(title)}</div>
        <div class="card-subtitle">${escapeHtml(subtitle)}</div>
      </div>
    </div>
    <div class="card-tags">
      ${tags.map(tag => `<span class="card-tag" data-tag-id="${tag.id}">${escapeHtml(tag.name)}</span>`).join('')}
    </div>
    ${dateStr ? `<div class="card-date">${dateStr}</div>` : ''}
  `;

  card.addEventListener('click', (e) => {
    if (e.target.classList.contains('card-tag')) return;
    openEditModal(item);
  });

  return card;
};

const formatDate = (ts) => {
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  return d.toLocaleDateString();
};

// ───────────────────────── Edit modal ─────────────────────────

const openEditModal = (item) => {
  state.editingItem = item;
  const itemType = item.type || 'url';
  const tags = state.itemTags.get(item.id) || [];

  // Title
  document.querySelector('#editModal .modal-title').textContent = 'Edit ' + typeLabel(itemType);

  // Show/hide type-specific editors
  const urlInput = document.querySelector('.edit-url-input');
  const textInput = document.querySelector('.edit-text-input');
  const imagePreview = document.querySelector('.edit-image-preview');
  const tagsetNotice = document.querySelector('.edit-tagset-notice');

  urlInput.style.display = 'none';
  textInput.style.display = 'none';
  imagePreview.style.display = 'none';
  tagsetNotice.style.display = 'none';

  if (itemType === 'url') {
    urlInput.style.display = '';
    urlInput.value = item.content || '';
    state.editOriginal = item.content || '';
  } else if (itemType === 'text') {
    textInput.style.display = '';
    textInput.value = item.content || '';
    state.editOriginal = item.content || '';
  } else if (itemType === 'image') {
    imagePreview.style.display = '';
    imagePreview.innerHTML = item.content
      ? `<img src="${escapeHtml(item.content)}" alt="Image preview">`
      : '<p>No image preview available</p>';
    state.editOriginal = item.content || '';
  } else if (itemType === 'tagset') {
    tagsetNotice.style.display = '';
    state.editOriginal = null; // tagsets have no editable content
  }

  // Render tags
  renderCurrentTags(tags);
  renderAvailableTags(tags);
  document.querySelector('.new-tag-input').value = '';

  // Show
  modalOverlay.classList.add('visible');
};

const typeLabel = (type) => {
  switch (type) {
    case 'url': return 'URL';
    case 'text': return 'Note';
    case 'tagset': return 'Tag Set';
    case 'image': return 'Image';
    default: return 'Item';
  }
};

const handleEditSave = async () => {
  if (!state.editingItem) return;

  const item = state.editingItem;
  const itemType = item.type || 'url';

  let newContent = null;
  if (itemType === 'url') {
    newContent = document.querySelector('.edit-url-input').value.trim();
  } else if (itemType === 'text') {
    newContent = document.querySelector('.edit-text-input').value;
  }

  // Save content changes if applicable
  if (newContent !== null && newContent !== state.editOriginal) {
    const updateOpts = { content: newContent };
    if (itemType === 'url') updateOpts.url = newContent;
    const result = await api.datastore.updateItem(item.id, updateOpts);
    if (!result.success) {
      console.error('[editor] Failed to update item:', result.error);
    } else {
      // Update local state
      item.content = newContent;
    }
  }

  closeEditModal();
  await loadData();
  render();
  api.publish('editor:changed', { action: 'update', itemId: item.id }, api.scopes.GLOBAL);
};

const handleEditCancel = () => {
  if (!state.editingItem) {
    closeEditModal();
    return;
  }

  const item = state.editingItem;
  const itemType = item.type || 'url';

  // Dirty check
  let currentContent = null;
  if (itemType === 'url') {
    currentContent = document.querySelector('.edit-url-input').value.trim();
  } else if (itemType === 'text') {
    currentContent = document.querySelector('.edit-text-input').value;
  }

  if (currentContent !== null && state.editOriginal !== null && currentContent !== state.editOriginal) {
    if (!confirm('Discard unsaved changes?')) return;
  }

  closeEditModal();
};

const closeEditModal = () => {
  modalOverlay.classList.remove('visible');
  state.editingItem = null;
  state.editOriginal = null;
};

// ───────────────────────── Delete ─────────────────────────

const handleDeleteRequest = () => {
  deleteConfirmOverlay.classList.add('visible');
};

const closeDeleteConfirm = () => {
  deleteConfirmOverlay.classList.remove('visible');
};

const handleDeleteConfirm = async () => {
  if (!state.editingItem) return;

  const itemId = state.editingItem.id;
  const result = await api.datastore.deleteItem(itemId);
  if (!result.success) {
    console.error('[editor] Failed to delete item:', result.error);
    closeDeleteConfirm();
    return;
  }

  closeDeleteConfirm();
  closeEditModal();
  await loadData();
  render();
  api.publish('editor:changed', { action: 'delete', itemId }, api.scopes.GLOBAL);
};

// ───────────────────────── Tag editing (edit modal) ─────────────────────────

const renderCurrentTags = (tags) => {
  const container = document.querySelector('.current-tags');
  if (tags.length === 0) {
    container.innerHTML = '<span class="no-tags">No tags</span>';
    return;
  }
  container.innerHTML = '';
  tags.forEach(tag => {
    const el = document.createElement('span');
    el.className = 'current-tag';
    el.innerHTML = `${escapeHtml(tag.name)} <button class="remove-tag" data-tag-id="${tag.id}">&times;</button>`;
    el.querySelector('.remove-tag').addEventListener('click', () => removeTagFromItem(tag));
    container.appendChild(el);
  });
};

const renderAvailableTags = (currentTags) => {
  const container = document.querySelector('.available-tags');
  const currentIds = new Set(currentTags.map(t => t.id));
  container.innerHTML = '';

  state.tags.forEach(tag => {
    const el = document.createElement('span');
    el.className = 'available-tag';
    if (currentIds.has(tag.id)) {
      el.classList.add('already-added');
    }
    el.textContent = tag.name;
    if (!currentIds.has(tag.id)) {
      el.addEventListener('click', () => addTagToItem(tag));
    }
    container.appendChild(el);
  });

  if (state.tags.length === 0) {
    container.innerHTML = '<span class="no-tags">No tags available</span>';
  }
};

const addTagToItem = async (tag) => {
  if (!state.editingItem) return;
  const result = await api.datastore.tagItem(state.editingItem.id, tag.id);
  if (result.success) {
    const tags = state.itemTags.get(state.editingItem.id) || [];
    if (!tags.some(t => t.id === tag.id)) {
      tags.push(tag);
      state.itemTags.set(state.editingItem.id, tags);
    }
    renderCurrentTags(tags);
    renderAvailableTags(tags);
    renderCards();
  }
};

const removeTagFromItem = async (tag) => {
  if (!state.editingItem) return;
  const result = await api.datastore.untagItem(state.editingItem.id, tag.id);
  if (result.success) {
    let tags = state.itemTags.get(state.editingItem.id) || [];
    tags = tags.filter(t => t.id !== tag.id);
    state.itemTags.set(state.editingItem.id, tags);
    renderCurrentTags(tags);
    renderAvailableTags(tags);
    renderCards();
  }
};

const addNewTagToItem = async (input) => {
  const name = (input || '').trim();
  if (!name || !state.editingItem) return;

  const tagResult = await api.datastore.getOrCreateTag(name);
  if (!tagResult.success) return;

  const tag = tagResult.data.tag;
  if (tagResult.data.created) {
    state.tags.unshift(tag);
  }

  await addTagToItem(tag);
  document.querySelector('.new-tag-input').value = '';
};

// ───────────────────────── Helpers ─────────────────────────

const escapeHtml = (str) => {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
