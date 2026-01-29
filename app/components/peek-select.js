/**
 * Peek Select Component
 *
 * A select/combobox component with two modes:
 * - 'native': Wraps native <select> for maximum accessibility
 * - 'custom': Uses Popover API + listbox for custom styling
 *
 * @element peek-select
 *
 * @prop {string} value - Current selected value
 * @prop {string} placeholder - Placeholder text when no selection
 * @prop {boolean} disabled - Disable the select
 * @prop {boolean} required - Mark as required
 * @prop {boolean} multiple - Allow multiple selection (native mode only)
 * @prop {string} mode - 'native' | 'custom' (default: 'native')
 * @prop {Array} options - Array of options: strings or { value, label, disabled }
 * @prop {string} name - Form field name
 *
 * @slot prefix - Content before select (custom mode)
 * @slot suffix - Content after select (custom mode)
 *
 * @csspart select - The native select element (native mode)
 * @csspart trigger - The trigger button (custom mode)
 * @csspart listbox - The options listbox (custom mode)
 * @csspart option - Individual option (custom mode)
 *
 * @fires change - When selection changes. Detail: { value, option }
 */

import { html, css, nothing } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

let selectIdCounter = 0;

export class PeekSelect extends PeekElement {
  static properties = {
    value: { type: String },
    placeholder: { type: String },
    disabled: { type: Boolean, reflect: true },
    required: { type: Boolean },
    multiple: { type: Boolean },
    mode: { type: String, reflect: true },
    options: { type: Array },
    name: { type: String },
    _open: { type: Boolean, state: true },
    _highlightedIndex: { type: Number, state: true }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: inline-block;
        min-width: 150px;
      }

      /* Native mode styles */
      .native-wrapper {
        position: relative;
        display: flex;
        align-items: center;
      }

      select {
        width: 100%;
        height: var(--peek-select-height, var(--peek-btn-height-md, 36px));
        padding: 0 var(--peek-space-xl) 0 var(--peek-space-md);
        font: inherit;
        font-size: var(--peek-font-md);
        color: var(--theme-text, #333);
        background: var(--peek-select-bg, var(--theme-bg-secondary, #fff));
        border: 1px solid var(--peek-select-border, var(--theme-border, #e0e0e0));
        border-radius: var(--peek-radius-md);
        cursor: pointer;
        appearance: none;
        outline: none;
        transition: border-color var(--peek-transition-fast), box-shadow var(--peek-transition-fast);
      }

      select:focus {
        border-color: var(--theme-accent, #007aff);
        box-shadow: var(--peek-focus-ring);
      }

      select:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: var(--theme-bg-tertiary, #f5f5f5);
      }

      .native-arrow {
        position: absolute;
        right: var(--peek-space-md);
        pointer-events: none;
        color: var(--theme-text-muted, #999);
      }

      /* Custom mode styles */
      .custom-wrapper {
        position: relative;
      }

      .trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--peek-space-sm);
        width: 100%;
        height: var(--peek-select-height, var(--peek-btn-height-md, 36px));
        padding: 0 var(--peek-space-md);
        font: inherit;
        font-size: var(--peek-font-md);
        color: var(--theme-text, #333);
        background: var(--peek-select-bg, var(--theme-bg-secondary, #fff));
        border: 1px solid var(--peek-select-border, var(--theme-border, #e0e0e0));
        border-radius: var(--peek-radius-md);
        cursor: pointer;
        outline: none;
        text-align: left;
        transition: border-color var(--peek-transition-fast), box-shadow var(--peek-transition-fast);
      }

      .trigger:focus {
        border-color: var(--theme-accent, #007aff);
        box-shadow: var(--peek-focus-ring);
      }

      .trigger:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: var(--theme-bg-tertiary, #f5f5f5);
      }

      .trigger-label {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .trigger-label.placeholder {
        color: var(--theme-text-muted, #999);
      }

      .trigger-arrow {
        flex-shrink: 0;
        transition: transform var(--peek-transition-fast);
      }

      .trigger[aria-expanded="true"] .trigger-arrow {
        transform: rotate(180deg);
      }

      .listbox {
        margin: 0;
        padding: var(--peek-space-xs) 0;
        border: 1px solid var(--peek-select-border, var(--theme-border, #e0e0e0));
        border-radius: var(--peek-radius-md);
        background: var(--peek-select-bg, var(--theme-bg-secondary, #fff));
        box-shadow: var(--peek-shadow-lg);
        max-height: 240px;
        overflow-y: auto;
        min-width: 100%;
        position: absolute;
        inset: unset;
        top: 100%;
        left: 0;
        margin-top: var(--peek-space-xs);
      }

      .listbox { opacity: 0; transform: translateY(-4px); transition: opacity var(--peek-transition-fast), transform var(--peek-transition-fast); }
      .listbox:popover-open { opacity: 1; transform: translateY(0); }
      @starting-style { .listbox:popover-open { opacity: 0; transform: translateY(-4px); } }

      .option {
        display: flex;
        align-items: center;
        padding: var(--peek-space-sm) var(--peek-space-md);
        cursor: pointer;
        font-size: var(--peek-font-md);
        color: var(--theme-text, #333);
        transition: background var(--peek-transition-fast);
      }

      .option:hover,
      .option.highlighted {
        background: var(--theme-bg-tertiary, #f5f5f5);
      }

      .option.selected {
        color: var(--theme-accent, #007aff);
        font-weight: var(--peek-font-medium);
      }

      .option.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .option-check {
        width: 16px;
        margin-right: var(--peek-space-sm);
        color: var(--theme-accent, #007aff);
      }

      .option:not(.selected) .option-check {
        visibility: hidden;
      }
    `
  ];

  constructor() {
    super();
    this._selectId = `peek-select-${++selectIdCounter}`;
    this.value = '';
    this.placeholder = 'Select...';
    this.disabled = false;
    this.required = false;
    this.multiple = false;
    this.mode = 'native';
    this.options = [];
    this.name = '';
    this._open = false;
    this._highlightedIndex = -1;
  }

  get listboxElement() { return this.shadowRoot?.querySelector('.listbox'); }
  get triggerElement() { return this.shadowRoot?.querySelector('.trigger'); }

  get selectedOption() {
    return this._normalizedOptions.find(opt => opt.value === this.value);
  }

  get _normalizedOptions() {
    return this.options.map(opt => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt, disabled: false };
      }
      return {
        value: opt.value ?? opt.label ?? '',
        label: opt.label ?? opt.value ?? '',
        disabled: opt.disabled ?? false
      };
    });
  }

  updated(changedProps) {
    if (changedProps.has('_open') && this._open) {
      this._highlightedIndex = this._normalizedOptions.findIndex(opt => opt.value === this.value);
      if (this._highlightedIndex === -1) this._highlightedIndex = 0;
    }
  }

  _handleNativeChange(e) {
    this.value = e.target.value;
    const option = this._normalizedOptions.find(opt => opt.value === this.value);
    this.emit('change', { value: this.value, option });
  }

  _handleTriggerClick() {
    if (this.disabled) return;
    this._open ? this._closeListbox() : this._openListbox();
  }

  _handleTriggerKeydown(e) {
    if (this.disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        this._open ? this._closeListbox() : this._openListbox();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!this._open) {
          this._openListbox();
        } else {
          this._highlightNext();
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!this._open) {
          this._openListbox();
        } else {
          this._highlightPrev();
        }
        break;
      case 'Home':
        if (this._open) {
          e.preventDefault();
          this._highlightedIndex = this._findFirstEnabled();
        }
        break;
      case 'End':
        if (this._open) {
          e.preventDefault();
          this._highlightedIndex = this._findLastEnabled();
        }
        break;
      case 'Escape':
        if (this._open) {
          e.preventDefault();
          this._closeListbox();
        }
        break;
      case 'Tab':
        if (this._open) {
          this._closeListbox();
        }
        break;
    }
  }

  _handleListboxToggle(e) {
    this._open = e.newState === 'open';
  }

  _openListbox() {
    this._open = true;
    try { this.listboxElement?.showPopover(); } catch (e) {}
  }

  _closeListbox() {
    this._open = false;
    try { this.listboxElement?.hidePopover(); } catch (e) {}
    this.triggerElement?.focus();
  }

  _highlightNext() {
    const opts = this._normalizedOptions;
    let idx = this._highlightedIndex;
    do {
      idx = (idx + 1) % opts.length;
    } while (opts[idx]?.disabled && idx !== this._highlightedIndex);
    this._highlightedIndex = idx;
    this._scrollHighlightedIntoView();
  }

  _highlightPrev() {
    const opts = this._normalizedOptions;
    let idx = this._highlightedIndex;
    do {
      idx = idx <= 0 ? opts.length - 1 : idx - 1;
    } while (opts[idx]?.disabled && idx !== this._highlightedIndex);
    this._highlightedIndex = idx;
    this._scrollHighlightedIntoView();
  }

  _findFirstEnabled() {
    return this._normalizedOptions.findIndex(opt => !opt.disabled);
  }

  _findLastEnabled() {
    for (let i = this._normalizedOptions.length - 1; i >= 0; i--) {
      if (!this._normalizedOptions[i].disabled) return i;
    }
    return -1;
  }

  _scrollHighlightedIntoView() {
    requestAnimationFrame(() => {
      const highlighted = this.shadowRoot?.querySelector('.option.highlighted');
      highlighted?.scrollIntoView({ block: 'nearest' });
    });
  }

  _selectOption(option, index) {
    if (option.disabled) return;
    this.value = option.value;
    this._closeListbox();
    this.emit('change', { value: this.value, option });
  }

  _renderNative() {
    return html`
      <div class="native-wrapper">
        <select
          part="select"
          name=${this.name || nothing}
          ?disabled=${this.disabled}
          ?required=${this.required}
          ?multiple=${this.multiple}
          @change=${this._handleNativeChange}
        >
          ${this.placeholder && !this.value ? html`
            <option value="" disabled selected>${this.placeholder}</option>
          ` : nothing}
          ${this._normalizedOptions.map(opt => html`
            <option
              value=${opt.value}
              ?disabled=${opt.disabled}
              ?selected=${opt.value === this.value}
            >${opt.label}</option>
          `)}
        </select>
        <svg class="native-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `;
  }

  _renderCustom() {
    const selectedLabel = this.selectedOption?.label || '';
    const opts = this._normalizedOptions;

    return html`
      <div class="custom-wrapper">
        <button
          part="trigger"
          class="trigger"
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded=${this._open}
          aria-controls="${this._selectId}-listbox"
          ?disabled=${this.disabled}
          @click=${this._handleTriggerClick}
          @keydown=${this._handleTriggerKeydown}
        >
          <slot name="prefix"></slot>
          <span class="trigger-label ${!selectedLabel ? 'placeholder' : ''}">
            ${selectedLabel || this.placeholder}
          </span>
          <svg class="trigger-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <slot name="suffix"></slot>
        </button>

        <div
          id="${this._selectId}-listbox"
          part="listbox"
          class="listbox"
          role="listbox"
          popover="auto"
          @toggle=${this._handleListboxToggle}
        >
          ${opts.map((opt, i) => html`
            <div
              part="option"
              class="option ${opt.value === this.value ? 'selected' : ''} ${i === this._highlightedIndex ? 'highlighted' : ''} ${opt.disabled ? 'disabled' : ''}"
              role="option"
              aria-selected=${opt.value === this.value}
              aria-disabled=${opt.disabled}
              @click=${() => this._selectOption(opt, i)}
              @mouseenter=${() => { if (!opt.disabled) this._highlightedIndex = i; }}
            >
              <svg class="option-check" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              ${opt.label}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  render() {
    return this.mode === 'native' ? this._renderNative() : this._renderCustom();
  }

  // Public API
  focus() {
    if (this.mode === 'native') {
      this.shadowRoot?.querySelector('select')?.focus();
    } else {
      this.triggerElement?.focus();
    }
  }

  open() {
    if (this.mode === 'custom') this._openListbox();
  }

  close() {
    if (this.mode === 'custom') this._closeListbox();
  }
}

customElements.define('peek-select', PeekSelect);
export default PeekSelect;
