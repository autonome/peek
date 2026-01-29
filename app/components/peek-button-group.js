/**
 * Peek Button Group Component
 *
 * Segmented controls and tag sets with single/multiple selection.
 *
 * @element peek-button-group
 *
 * @prop {string} value - Selected value (single selection)
 * @prop {Array} values - Selected values (multiple selection)
 * @prop {string} selection - 'none' | 'single' | 'multiple'
 * @prop {string} variant - 'default' | 'outline' | 'ghost'
 * @prop {string} size - 'sm' | 'md' | 'lg'
 * @prop {boolean} disabled - Disable all buttons
 *
 * @slot - peek-button-group-item elements
 *
 * @csspart group - The button group container
 *
 * @fires change - When selection changes. Detail: { value, values }
 */

import { html, css } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

export class PeekButtonGroup extends PeekElement {
  static properties = {
    value: { type: String },
    values: { type: Array },
    selection: { type: String, reflect: true },
    variant: { type: String, reflect: true },
    size: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: inline-flex;
      }

      .group {
        display: inline-flex;
        border-radius: var(--peek-radius-md);
        overflow: hidden;
      }

      /* Outline variant - connected buttons */
      :host([variant="outline"]) .group,
      :host(:not([variant])) .group {
        border: 1px solid var(--peek-btn-group-border, var(--theme-border, #e0e0e0));
      }

      /* Ghost variant - separated buttons */
      :host([variant="ghost"]) .group {
        gap: var(--peek-space-xs);
      }

      :host([disabled]) {
        opacity: 0.5;
        pointer-events: none;
      }
    `
  ];

  constructor() {
    super();
    this.value = '';
    this.values = [];
    this.selection = 'single';
    this.variant = 'outline';
    this.size = 'md';
    this.disabled = false;
  }

  get items() {
    return Array.from(this.querySelectorAll('peek-button-group-item'));
  }

  firstUpdated() {
    this._updateItems();
  }

  updated(changedProps) {
    if (changedProps.has('value') || changedProps.has('values') || changedProps.has('disabled') || changedProps.has('size') || changedProps.has('variant')) {
      this._updateItems();
    }
  }

  _updateItems() {
    const items = this.items;
    items.forEach((item, index) => {
      item._groupElement = this;
      item._index = index;
      item._first = index === 0;
      item._last = index === items.length - 1;
      item._variant = this.variant;
      item._size = this.size;
      item._groupDisabled = this.disabled;

      // Update selection state
      if (this.selection === 'single') {
        item._selected = item.value === this.value;
      } else if (this.selection === 'multiple') {
        item._selected = this.values.includes(item.value);
      } else {
        item._selected = false;
      }
    });
  }

  _handleSlotChange() {
    this._updateItems();
  }

  _selectItem(item) {
    if (this.disabled || item.disabled) return;

    if (this.selection === 'single') {
      this.value = item.value;
      this.emit('change', { value: this.value, values: [this.value] });
    } else if (this.selection === 'multiple') {
      const idx = this.values.indexOf(item.value);
      if (idx >= 0) {
        this.values = this.values.filter(v => v !== item.value);
      } else {
        this.values = [...this.values, item.value];
      }
      this.emit('change', { value: this.values[0] || '', values: this.values });
    }

    this._updateItems();
  }

  _handleKeydown(e) {
    const items = this.items.filter(item => !item.disabled);
    if (!items.length) return;

    const currentIndex = items.findIndex(item => item === document.activeElement || item.contains(document.activeElement));
    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        newIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        newIndex = currentIndex >= items.length - 1 ? 0 : currentIndex + 1;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = items.length - 1;
        break;
      default:
        return;
    }

    items[newIndex]?.focus();
  }

  render() {
    return html`
      <div
        part="group"
        class="group"
        role="group"
        @keydown=${this._handleKeydown}
      >
        <slot @slotchange=${this._handleSlotChange}></slot>
      </div>
    `;
  }

  // Public API
  select(value) {
    if (this.selection === 'single') {
      this.value = value;
    } else if (this.selection === 'multiple') {
      if (!this.values.includes(value)) {
        this.values = [...this.values, value];
      }
    }
    this._updateItems();
  }

  deselect(value) {
    if (this.selection === 'single' && this.value === value) {
      this.value = '';
    } else if (this.selection === 'multiple') {
      this.values = this.values.filter(v => v !== value);
    }
    this._updateItems();
  }

  clear() {
    this.value = '';
    this.values = [];
    this._updateItems();
  }
}

/**
 * Peek Button Group Item
 *
 * @element peek-button-group-item
 *
 * @prop {string} value - Item value
 * @prop {boolean} disabled - Disable this item
 *
 * @slot prefix - Content before label
 * @slot - Item label
 * @slot suffix - Content after label
 *
 * @csspart button - The button element
 */
export class PeekButtonGroupItem extends PeekElement {
  static properties = {
    value: { type: String },
    disabled: { type: Boolean, reflect: true },
    _selected: { type: Boolean, state: true },
    _first: { type: Boolean, state: true },
    _last: { type: Boolean, state: true },
    _variant: { type: String, state: true },
    _size: { type: String, state: true },
    _groupDisabled: { type: Boolean, state: true }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: contents;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--peek-space-xs);
        padding: 0 var(--peek-space-md);
        height: var(--peek-btn-height-md, 36px);
        border: none;
        background: var(--peek-btn-group-bg, var(--theme-bg-secondary, #fff));
        color: var(--peek-btn-group-text, var(--theme-text, #333));
        font: inherit;
        font-size: var(--peek-font-md);
        font-weight: var(--peek-font-medium);
        cursor: pointer;
        outline: none;
        transition: background var(--peek-transition-fast), color var(--peek-transition-fast);
        white-space: nowrap;
      }

      /* Size variants */
      :host([data-size="sm"]) .button {
        height: var(--peek-btn-height-sm, 28px);
        padding: 0 var(--peek-space-sm);
        font-size: var(--peek-font-sm);
      }

      :host([data-size="lg"]) .button {
        height: var(--peek-btn-height-lg, 44px);
        padding: 0 var(--peek-space-lg);
        font-size: var(--peek-font-lg);
      }

      /* Hover state */
      .button:hover:not(:disabled) {
        background: var(--theme-bg-tertiary, #f5f5f5);
      }

      /* Focus state */
      .button:focus-visible {
        outline: 2px solid var(--theme-accent, #007aff);
        outline-offset: -2px;
        z-index: 1;
      }

      /* Selected state */
      :host([data-selected]) .button {
        background: var(--theme-accent, #007aff);
        color: #fff;
      }

      :host([data-selected]) .button:hover:not(:disabled) {
        background: var(--theme-accent-hover, #0056b3);
      }

      /* Disabled state */
      .button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Outline variant borders */
      :host([data-variant="outline"]) .button,
      :host(:not([data-variant])) .button {
        border-right: 1px solid var(--peek-btn-group-border, var(--theme-border, #e0e0e0));
      }

      :host([data-variant="outline"][data-last]) .button,
      :host(:not([data-variant])[data-last]) .button {
        border-right: none;
      }

      /* Ghost variant */
      :host([data-variant="ghost"]) .button {
        border-radius: var(--peek-radius-sm);
        background: transparent;
      }

      :host([data-variant="ghost"]) .button:hover:not(:disabled) {
        background: var(--theme-bg-tertiary, #f5f5f5);
      }

      :host([data-variant="ghost"][data-selected]) .button {
        background: var(--theme-accent, #007aff);
      }

      /* Border radius for first/last in connected variants */
      :host([data-first][data-variant="outline"]) .button,
      :host([data-first]:not([data-variant])) .button {
        border-top-left-radius: calc(var(--peek-radius-md) - 1px);
        border-bottom-left-radius: calc(var(--peek-radius-md) - 1px);
      }

      :host([data-last][data-variant="outline"]) .button,
      :host([data-last]:not([data-variant])) .button {
        border-top-right-radius: calc(var(--peek-radius-md) - 1px);
        border-bottom-right-radius: calc(var(--peek-radius-md) - 1px);
      }

      ::slotted([slot="prefix"]),
      ::slotted([slot="suffix"]) {
        display: flex;
      }
    `
  ];

  constructor() {
    super();
    this.value = '';
    this.disabled = false;
    this._selected = false;
    this._first = false;
    this._last = false;
    this._variant = 'outline';
    this._size = 'md';
    this._groupDisabled = false;
    this._groupElement = null;
  }

  updated(changedProps) {
    // Update data attributes for CSS
    this.dataset.selected = this._selected ? '' : undefined;
    if (!this._selected) delete this.dataset.selected;
    else this.dataset.selected = '';

    this.dataset.first = this._first ? '' : undefined;
    if (!this._first) delete this.dataset.first;
    else this.dataset.first = '';

    this.dataset.last = this._last ? '' : undefined;
    if (!this._last) delete this.dataset.last;
    else this.dataset.last = '';

    this.dataset.variant = this._variant;
    this.dataset.size = this._size;
  }

  _handleClick() {
    if (this.disabled || this._groupDisabled) return;
    this._groupElement?._selectItem(this);
  }

  render() {
    return html`
      <button
        part="button"
        class="button"
        type="button"
        role="radio"
        aria-checked=${this._selected}
        ?disabled=${this.disabled || this._groupDisabled}
        tabindex=${this._selected ? 0 : -1}
        @click=${this._handleClick}
      >
        <slot name="prefix"></slot>
        <slot></slot>
        <slot name="suffix"></slot>
      </button>
    `;
  }

  focus() {
    this.shadowRoot?.querySelector('.button')?.focus();
  }
}

customElements.define('peek-button-group', PeekButtonGroup);
customElements.define('peek-button-group-item', PeekButtonGroupItem);

export default PeekButtonGroup;
