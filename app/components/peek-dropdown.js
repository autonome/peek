/**
 * Peek Dropdown Component
 *
 * Action menu / context menu using native Popover API.
 *
 * @element peek-dropdown
 *
 * @prop {boolean} open - Whether dropdown is open
 * @prop {string} position - 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
 * @prop {boolean} disabled - Disable the trigger
 *
 * @slot trigger - Element that triggers the dropdown
 * @slot - Menu content (typically peek-dropdown-item elements)
 *
 * @csspart dropdown - The dropdown container
 *
 * @fires open - When dropdown opens
 * @fires close - When dropdown closes
 * @fires select - When item is selected. Detail: { value, item }
 */

import { html, css } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

let dropdownIdCounter = 0;

export class PeekDropdown extends PeekElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    position: { type: String },
    disabled: { type: Boolean, reflect: true },
    _highlightedIndex: { type: Number, state: true }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: inline-block;
        position: relative;
      }

      .trigger-wrapper {
        display: contents;
      }

      .dropdown {
        margin: 0;
        padding: var(--peek-space-xs) 0;
        border: 1px solid var(--peek-dropdown-border, var(--theme-border, #e0e0e0));
        border-radius: var(--peek-radius-md);
        background: var(--peek-dropdown-bg, var(--theme-bg-secondary, #fff));
        box-shadow: var(--peek-shadow-lg);
        min-width: var(--peek-dropdown-min-width, 160px);
        max-height: var(--peek-dropdown-max-height, 320px);
        overflow-y: auto;
        position: absolute;
        inset: unset;
      }

      :host([position="bottom-start"]) .dropdown,
      :host(:not([position])) .dropdown {
        top: 100%;
        left: 0;
        margin-top: var(--peek-space-xs);
      }

      :host([position="bottom-end"]) .dropdown {
        top: 100%;
        right: 0;
        margin-top: var(--peek-space-xs);
      }

      :host([position="top-start"]) .dropdown {
        bottom: 100%;
        left: 0;
        margin-bottom: var(--peek-space-xs);
      }

      :host([position="top-end"]) .dropdown {
        bottom: 100%;
        right: 0;
        margin-bottom: var(--peek-space-xs);
      }

      .dropdown { opacity: 0; transform: scale(0.95); transition: opacity var(--peek-transition-fast), transform var(--peek-transition-fast); }
      .dropdown:popover-open { opacity: 1; transform: scale(1); }
      @starting-style { .dropdown:popover-open { opacity: 0; transform: scale(0.95); } }
    `
  ];

  constructor() {
    super();
    this._dropdownId = `peek-dropdown-${++dropdownIdCounter}`;
    this.open = false;
    this.position = 'bottom-start';
    this.disabled = false;
    this._highlightedIndex = -1;
  }

  get dropdownElement() { return this.shadowRoot?.querySelector('.dropdown'); }
  get triggerElement() {
    const slot = this.shadowRoot?.querySelector('slot[name="trigger"]');
    return slot?.assignedElements()?.[0] || null;
  }

  get items() {
    return Array.from(this.querySelectorAll('peek-dropdown-item:not([disabled])'));
  }

  firstUpdated() {
    this._setupTrigger();
  }

  updated(changedProps) {
    if (changedProps.has('open')) {
      this.open ? this._openDropdown() : this._closeDropdown();
    }
  }

  _setupTrigger() {
    const trigger = this.triggerElement;
    if (trigger) {
      trigger.setAttribute('aria-haspopup', 'menu');
      trigger.setAttribute('aria-expanded', String(this.open));
      trigger.setAttribute('aria-controls', this._dropdownId);
      trigger.addEventListener('click', () => this._handleTriggerClick());
      trigger.addEventListener('keydown', (e) => this._handleTriggerKeydown(e));
    }
  }

  _handleTriggerClick() {
    if (this.disabled) return;
    this.open = !this.open;
  }

  _handleTriggerKeydown(e) {
    if (this.disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
      case 'ArrowDown':
        e.preventDefault();
        if (!this.open) {
          this.open = true;
          requestAnimationFrame(() => {
            this._highlightedIndex = 0;
            this._focusHighlighted();
          });
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!this.open) {
          this.open = true;
          requestAnimationFrame(() => {
            this._highlightedIndex = this.items.length - 1;
            this._focusHighlighted();
          });
        }
        break;
    }
  }

  _handleDropdownKeydown(e) {
    const items = this.items;
    if (!items.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._highlightedIndex = (this._highlightedIndex + 1) % items.length;
        this._focusHighlighted();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._highlightedIndex = this._highlightedIndex <= 0 ? items.length - 1 : this._highlightedIndex - 1;
        this._focusHighlighted();
        break;
      case 'Home':
        e.preventDefault();
        this._highlightedIndex = 0;
        this._focusHighlighted();
        break;
      case 'End':
        e.preventDefault();
        this._highlightedIndex = items.length - 1;
        this._focusHighlighted();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (this._highlightedIndex >= 0 && items[this._highlightedIndex]) {
          this._selectItem(items[this._highlightedIndex]);
        }
        break;
      case 'Escape':
      case 'Tab':
        this.open = false;
        this.triggerElement?.focus();
        break;
    }
  }

  _focusHighlighted() {
    const items = this.items;
    if (this._highlightedIndex >= 0 && items[this._highlightedIndex]) {
      items[this._highlightedIndex].focus();
    }
  }

  _handleToggle(e) {
    const isOpen = e.newState === 'open';
    if (this.open !== isOpen) {
      this.open = isOpen;
    }
    if (isOpen) {
      this._highlightedIndex = 0;
      this.emit('open');
    } else {
      this._highlightedIndex = -1;
      this.emit('close');
    }
    // Update trigger aria
    this.triggerElement?.setAttribute('aria-expanded', String(isOpen));
  }

  _openDropdown() {
    try { this.dropdownElement?.showPopover(); } catch (e) {}
  }

  _closeDropdown() {
    try { this.dropdownElement?.hidePopover(); } catch (e) {}
  }

  _selectItem(item) {
    this.emit('select', { value: item.value, item });
    this.open = false;
    this.triggerElement?.focus();
  }

  _handleItemClick(e) {
    const item = e.target.closest('peek-dropdown-item');
    if (item && !item.disabled) {
      this._selectItem(item);
    }
  }

  render() {
    return html`
      <div class="trigger-wrapper">
        <slot name="trigger" @slotchange=${this._setupTrigger}></slot>
      </div>
      <div
        id="${this._dropdownId}"
        part="dropdown"
        class="dropdown"
        role="menu"
        popover="auto"
        @toggle=${this._handleToggle}
        @keydown=${this._handleDropdownKeydown}
        @click=${this._handleItemClick}
      >
        <slot></slot>
      </div>
    `;
  }

  // Public API
  show() { this.open = true; }
  hide() { this.open = false; }
  toggle() { this.open = !this.open; }
}

/**
 * Peek Dropdown Item
 *
 * @element peek-dropdown-item
 *
 * @prop {string} value - Item value
 * @prop {boolean} disabled - Disable the item
 * @prop {boolean} danger - Style as destructive action
 *
 * @slot prefix - Content before label (icon)
 * @slot - Item label
 * @slot suffix - Content after label (shortcut)
 */
export class PeekDropdownItem extends PeekElement {
  static properties = {
    value: { type: String },
    disabled: { type: Boolean, reflect: true },
    danger: { type: Boolean, reflect: true }
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
        padding: var(--peek-space-sm) var(--peek-space-md);
        cursor: pointer;
        font-size: var(--peek-font-md);
        color: var(--theme-text, #333);
        outline: none;
        transition: background var(--peek-transition-fast);
      }

      .item:hover,
      .item:focus {
        background: var(--theme-bg-tertiary, #f5f5f5);
      }

      .item:focus-visible {
        outline: 2px solid var(--theme-accent, #007aff);
        outline-offset: -2px;
      }

      :host([disabled]) .item {
        opacity: 0.5;
        cursor: not-allowed;
      }

      :host([disabled]) .item:hover {
        background: transparent;
      }

      :host([danger]) .item {
        color: var(--theme-danger, #dc3545);
      }

      .label {
        flex: 1;
      }

      ::slotted([slot="prefix"]) {
        display: flex;
        color: var(--theme-text-muted, #999);
      }

      :host([danger]) ::slotted([slot="prefix"]) {
        color: var(--theme-danger, #dc3545);
      }

      ::slotted([slot="suffix"]) {
        font-size: var(--peek-font-sm);
        color: var(--theme-text-muted, #999);
      }
    `
  ];

  constructor() {
    super();
    this.value = '';
    this.disabled = false;
    this.danger = false;
  }

  render() {
    return html`
      <div
        class="item"
        role="menuitem"
        tabindex=${this.disabled ? -1 : 0}
        aria-disabled=${this.disabled}
      >
        <slot name="prefix"></slot>
        <span class="label"><slot></slot></span>
        <slot name="suffix"></slot>
      </div>
    `;
  }

  focus() {
    this.shadowRoot?.querySelector('.item')?.focus();
  }
}

/**
 * Peek Dropdown Divider
 *
 * @element peek-dropdown-divider
 */
export class PeekDropdownDivider extends PeekElement {
  static styles = css`
    :host {
      display: block;
      height: 1px;
      margin: var(--peek-space-xs) 0;
      background: var(--theme-border, #e0e0e0);
    }
  `;

  render() {
    return html``;
  }
}

customElements.define('peek-dropdown', PeekDropdown);
customElements.define('peek-dropdown-item', PeekDropdownItem);
customElements.define('peek-dropdown-divider', PeekDropdownDivider);

export default PeekDropdown;
