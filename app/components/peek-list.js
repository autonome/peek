/**
 * Peek List Component
 *
 * A keyboard-navigable list supporting selection and custom item rendering.
 * Uses native listbox semantics for accessibility.
 *
 * @element peek-list
 *
 * @prop {string} selection - Selection mode: 'none' | 'single' | 'multiple'
 * @prop {number} selectedIndex - Currently selected index (single selection)
 * @prop {number[]} selectedIndices - Selected indices (multiple selection)
 * @prop {boolean} wrap - Wrap navigation at list ends
 *
 * @slot - Default slot for peek-list-item elements
 *
 * @csspart list - The list container
 *
 * @cssprop --peek-list-gap - Gap between items
 * @cssprop --peek-list-padding - List container padding
 *
 * @fires selection-change - When selection changes. Detail: { selectedIndex, selectedIndices, item }
 * @fires item-activate - When item is activated (Enter/click). Detail: { index, item }
 *
 * @example
 * <peek-list selection="single">
 *   <peek-list-item>Item 1</peek-list-item>
 *   <peek-list-item>Item 2</peek-list-item>
 *   <peek-list-item>Item 3</peek-list-item>
 * </peek-list>
 */

import { html, css } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

export class PeekList extends PeekElement {
  static properties = {
    selection: { type: String, reflect: true },
    selectedIndex: { type: Number, attribute: 'selected-index' },
    selectedIndices: { type: Array },
    wrap: { type: Boolean },
    _focusedIndex: { type: Number, state: true }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .list {
        display: flex;
        flex-direction: column;
        gap: var(--peek-list-gap, var(--peek-list-item-gap, 2px));
        padding: var(--peek-list-padding, 0);
        margin: 0;
        list-style: none;
        outline: none;
      }

      .list:focus-visible {
        box-shadow: var(--peek-focus-ring);
        border-radius: var(--peek-radius-md);
      }
    `
  ];

  constructor() {
    super();
    this.selection = 'none';
    this.selectedIndex = -1;
    this.selectedIndices = [];
    this.wrap = false;
    this._focusedIndex = -1;
  }

  get items() {
    const slot = this.shadowRoot?.querySelector('slot');
    if (!slot) return [];
    return slot.assignedElements().filter(el => el.tagName === 'PEEK-LIST-ITEM');
  }

  firstUpdated() {
    this._updateItemStates();
  }

  updated(changedProperties) {
    if (changedProperties.has('selectedIndex') || changedProperties.has('selectedIndices')) {
      this._updateItemStates();
    }
  }

  _updateItemStates() {
    const items = this.items;
    items.forEach((item, index) => {
      const isSelected = this.selection === 'multiple'
        ? this.selectedIndices.includes(index)
        : this.selectedIndex === index;
      item.selected = isSelected;
      item.focused = this._focusedIndex === index;
    });
  }

  render() {
    return html`
      <div
        part="list"
        class="list"
        role="listbox"
        tabindex="0"
        aria-multiselectable=${this.selection === 'multiple' ? 'true' : 'false'}
        @keydown=${this._handleKeydown}
        @click=${this._handleClick}
      >
        <slot @slotchange=${this._handleSlotChange}></slot>
      </div>
    `;
  }

  _handleSlotChange() {
    this._updateItemStates();
  }

  _handleKeydown(e) {
    const items = this.items;
    if (items.length === 0) return;

    let handled = false;
    let newIndex = this._focusedIndex;

    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        newIndex = this._getNextIndex(1);
        handled = true;
        break;

      case 'ArrowUp':
      case 'k':
        newIndex = this._getNextIndex(-1);
        handled = true;
        break;

      case 'Home':
      case 'g':
        if (e.key === 'g' && !e.shiftKey) break;
        newIndex = 0;
        handled = true;
        break;

      case 'End':
      case 'G':
        newIndex = items.length - 1;
        handled = true;
        break;

      case 'Enter':
      case ' ':
        if (this._focusedIndex >= 0) {
          this._activateItem(this._focusedIndex);
          handled = true;
        }
        break;

      case 'Escape':
        this._focusedIndex = -1;
        this._updateItemStates();
        handled = true;
        break;
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (newIndex !== this._focusedIndex && newIndex >= 0) {
      this._focusedIndex = newIndex;
      this._updateItemStates();

      // Scroll item into view
      const item = items[newIndex];
      item?.scrollIntoView({ block: 'nearest' });
    }
  }

  _getNextIndex(delta) {
    const items = this.items;
    const len = items.length;
    if (len === 0) return -1;

    let current = this._focusedIndex;
    if (current < 0) {
      return delta > 0 ? 0 : len - 1;
    }

    let next = current + delta;

    if (this.wrap) {
      next = ((next % len) + len) % len;
    } else {
      next = Math.max(0, Math.min(len - 1, next));
    }

    return next;
  }

  _handleClick(e) {
    const items = this.items;
    const item = e.target.closest('peek-list-item');
    if (!item) return;

    const index = items.indexOf(item);
    if (index < 0) return;

    this._focusedIndex = index;
    this._activateItem(index);
  }

  _activateItem(index) {
    const items = this.items;
    const item = items[index];

    if (this.selection === 'single') {
      this.selectedIndex = index;
      this.emit('selection-change', {
        selectedIndex: index,
        selectedIndices: [index],
        item
      });
    } else if (this.selection === 'multiple') {
      const newIndices = this.selectedIndices.includes(index)
        ? this.selectedIndices.filter(i => i !== index)
        : [...this.selectedIndices, index];
      this.selectedIndices = newIndices;
      this.emit('selection-change', {
        selectedIndex: index,
        selectedIndices: newIndices,
        item
      });
    }

    this._updateItemStates();
    this.emit('item-activate', { index, item });
  }

  /**
   * Focus the list container
   */
  focus() {
    this.shadowRoot?.querySelector('.list')?.focus();
  }

  /**
   * Select an item by index
   * @param {number} index - Index to select
   */
  select(index) {
    if (this.selection === 'single') {
      this.selectedIndex = index;
    } else if (this.selection === 'multiple') {
      if (!this.selectedIndices.includes(index)) {
        this.selectedIndices = [...this.selectedIndices, index];
      }
    }
    this._updateItemStates();
  }

  /**
   * Clear all selections
   */
  clearSelection() {
    this.selectedIndex = -1;
    this.selectedIndices = [];
    this._updateItemStates();
  }
}

/**
 * Peek List Item Component
 *
 * An item within a peek-list. Supports selection states and custom content.
 *
 * @element peek-list-item
 *
 * @prop {boolean} selected - Whether item is selected
 * @prop {boolean} disabled - Whether item is disabled
 * @prop {*} value - Optional value associated with this item
 *
 * @slot - Default slot for item content
 * @slot prefix - Content before main content (e.g., icon)
 * @slot suffix - Content after main content (e.g., badge)
 *
 * @csspart item - The item container
 *
 * @cssprop --peek-list-item-bg - Item background
 * @cssprop --peek-list-item-hover-bg - Item hover background
 * @cssprop --peek-list-item-selected-bg - Selected item background
 */
export class PeekListItem extends PeekElement {
  static properties = {
    selected: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    focused: { type: Boolean, reflect: true },
    value: { type: Object }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .item {
        display: flex;
        align-items: center;
        gap: var(--peek-space-sm);
        padding: var(--peek-list-item-padding-y, var(--peek-space-sm))
                 var(--peek-list-item-padding-x, var(--peek-space-md));
        background: var(--peek-list-item-bg, transparent);
        border-radius: var(--peek-radius-md);
        cursor: pointer;
        user-select: none;
        transition: background var(--peek-transition-fast);
        font-size: var(--peek-font-md);
        color: var(--theme-text, #333);
      }

      .item:hover:not([aria-disabled="true"]) {
        background: var(--peek-list-item-hover-bg, var(--theme-bg-tertiary, rgba(0, 0, 0, 0.05)));
      }

      :host([selected]) .item {
        background: var(--peek-list-item-selected-bg, var(--theme-accent, #007aff));
        color: #fff;
      }

      :host([selected]) .item:hover {
        background: var(--peek-list-item-selected-bg, color-mix(in srgb, var(--theme-accent, #007aff) 90%, #000));
      }

      :host([focused]:not([selected])) .item {
        background: var(--peek-list-item-hover-bg, var(--theme-bg-tertiary, rgba(0, 0, 0, 0.05)));
        outline: 1px solid var(--theme-accent, #007aff);
        outline-offset: -1px;
      }

      :host([disabled]) .item {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }

      .content {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      ::slotted([slot="prefix"]),
      ::slotted([slot="suffix"]) {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }
    `
  ];

  constructor() {
    super();
    this.selected = false;
    this.disabled = false;
    this.focused = false;
    this.value = null;
  }

  render() {
    return html`
      <div
        part="item"
        class="item"
        role="option"
        aria-selected=${this.selected ? 'true' : 'false'}
        aria-disabled=${this.disabled ? 'true' : 'false'}
      >
        <slot name="prefix"></slot>
        <span class="content">
          <slot></slot>
        </span>
        <slot name="suffix"></slot>
      </div>
    `;
  }
}

customElements.define('peek-list', PeekList);
customElements.define('peek-list-item', PeekListItem);

export default PeekList;
