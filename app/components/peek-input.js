/**
 * Peek Input Component
 *
 * An input field with optional autocomplete suggestions dropdown.
 * Supports keyboard navigation and custom filtering.
 *
 * @element peek-input
 *
 * @prop {string} value - Current input value
 * @prop {string} placeholder - Placeholder text
 * @prop {string} type - Input type: 'text' | 'search' | 'email' | 'url' | 'password'
 * @prop {boolean} disabled - Disable the input
 * @prop {boolean} readonly - Make input read-only
 * @prop {boolean} autofocus - Focus on mount
 * @prop {Array} suggestions - Array of suggestion strings or objects
 * @prop {string} suggestionKey - Property name for suggestion label (if objects)
 * @prop {boolean} showSuggestions - Force show/hide suggestions
 * @prop {number} minChars - Minimum chars before showing suggestions (default: 1)
 *
 * @slot prefix - Content before input (e.g., icon)
 * @slot suffix - Content after input (e.g., clear button)
 *
 * @csspart input - The native input element
 * @csspart suggestions - The suggestions dropdown
 * @csspart suggestion - Individual suggestion item
 *
 * @cssprop --peek-input-height - Input height
 * @cssprop --peek-input-bg - Input background
 * @cssprop --peek-input-border - Input border color
 *
 * @fires input - When value changes (native event)
 * @fires change - When value is committed (native event)
 * @fires suggestion-select - When suggestion is selected. Detail: { value, item }
 *
 * @example
 * <peek-input
 *   placeholder="Search..."
 *   .suggestions=${['Apple', 'Banana', 'Cherry']}
 *   @suggestion-select=${(e) => console.log(e.detail.value)}
 * ></peek-input>
 */

import { html, css, nothing } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

export class PeekInput extends PeekElement {
  static properties = {
    value: { type: String },
    placeholder: { type: String },
    type: { type: String },
    disabled: { type: Boolean, reflect: true },
    readonly: { type: Boolean },
    autofocus: { type: Boolean },
    suggestions: { type: Array },
    suggestionKey: { type: String, attribute: 'suggestion-key' },
    showSuggestions: { type: Boolean, attribute: 'show-suggestions' },
    minChars: { type: Number, attribute: 'min-chars' },
    _open: { type: Boolean, state: true },
    _filteredSuggestions: { type: Array, state: true },
    _highlightedIndex: { type: Number, state: true }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        position: relative;
      }

      .input-wrapper {
        display: flex;
        align-items: center;
        gap: var(--peek-space-sm);
        height: var(--peek-input-height, var(--peek-btn-height-md));
        padding: 0 var(--peek-space-md);
        background: var(--peek-input-bg, var(--theme-bg-secondary, #fff));
        border: 1px solid var(--peek-input-border, var(--theme-border, #e0e0e0));
        border-radius: var(--peek-radius-md);
        transition: border-color var(--peek-transition-fast),
                    box-shadow var(--peek-transition-fast);
      }

      .input-wrapper:focus-within {
        border-color: var(--theme-accent, #007aff);
        box-shadow: var(--peek-focus-ring);
      }

      :host([disabled]) .input-wrapper {
        opacity: 0.5;
        cursor: not-allowed;
        background: var(--theme-bg-tertiary, #f5f5f5);
      }

      input {
        flex: 1;
        border: none;
        background: transparent;
        font: inherit;
        font-size: var(--peek-font-md);
        color: var(--theme-text, #333);
        outline: none;
        min-width: 0;
      }

      input::placeholder {
        color: var(--theme-text-muted, #999);
      }

      input:disabled {
        cursor: not-allowed;
      }

      ::slotted([slot="prefix"]),
      ::slotted([slot="suffix"]) {
        display: flex;
        align-items: center;
        color: var(--theme-text-muted, #999);
      }

      /* Suggestions dropdown */
      .suggestions {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        margin-top: var(--peek-space-xs);
        background: var(--theme-bg-secondary, #fff);
        border: 1px solid var(--theme-border, #e0e0e0);
        border-radius: var(--peek-radius-md);
        box-shadow: var(--peek-shadow-lg);
        max-height: 240px;
        overflow-y: auto;
        z-index: 1000;
      }

      .suggestions:empty {
        display: none;
      }

      .suggestion {
        display: flex;
        align-items: center;
        padding: var(--peek-space-sm) var(--peek-space-md);
        cursor: pointer;
        font-size: var(--peek-font-md);
        color: var(--theme-text, #333);
        transition: background var(--peek-transition-fast);
      }

      .suggestion:hover,
      .suggestion.highlighted {
        background: var(--theme-bg-tertiary, #f5f5f5);
      }

      .suggestion.highlighted {
        outline: 1px solid var(--theme-accent, #007aff);
        outline-offset: -1px;
      }

      .suggestion-text {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .match {
        font-weight: var(--peek-font-semibold);
        color: var(--theme-accent, #007aff);
      }

      .no-results {
        padding: var(--peek-space-md);
        color: var(--theme-text-muted, #999);
        text-align: center;
        font-size: var(--peek-font-sm);
      }
    `
  ];

  constructor() {
    super();
    this.value = '';
    this.placeholder = '';
    this.type = 'text';
    this.disabled = false;
    this.readonly = false;
    this.autofocus = false;
    this.suggestions = [];
    this.suggestionKey = null;
    this.showSuggestions = null;
    this.minChars = 1;
    this._open = false;
    this._filteredSuggestions = [];
    this._highlightedIndex = -1;
  }

  get inputElement() {
    return this.shadowRoot?.querySelector('input');
  }

  firstUpdated() {
    if (this.autofocus) {
      this.focus();
    }
  }

  updated(changedProps) {
    if (changedProps.has('suggestions') || changedProps.has('value')) {
      this._filterSuggestions();
    }
  }

  _getSuggestionLabel(item) {
    if (typeof item === 'string') return item;
    if (this.suggestionKey && item[this.suggestionKey]) {
      return item[this.suggestionKey];
    }
    return item.label || item.name || item.value || String(item);
  }

  _filterSuggestions() {
    if (!this.suggestions || this.suggestions.length === 0) {
      this._filteredSuggestions = [];
      return;
    }

    const query = this.value.toLowerCase().trim();

    if (query.length < this.minChars) {
      this._filteredSuggestions = [];
      return;
    }

    this._filteredSuggestions = this.suggestions.filter(item => {
      const label = this._getSuggestionLabel(item).toLowerCase();
      return label.includes(query);
    });

    this._highlightedIndex = this._filteredSuggestions.length > 0 ? 0 : -1;
  }

  _handleInput(e) {
    this.value = e.target.value;
    this._open = true;
    this._filterSuggestions();
  }

  _handleFocus() {
    if (this.value.length >= this.minChars && this._filteredSuggestions.length > 0) {
      this._open = true;
    }
  }

  _handleBlur() {
    // Delay to allow click on suggestion
    setTimeout(() => {
      this._open = false;
      this._highlightedIndex = -1;
    }, 150);
  }

  _handleKeydown(e) {
    if (!this._open || this._filteredSuggestions.length === 0) {
      if (e.key === 'ArrowDown' && this._filteredSuggestions.length > 0) {
        this._open = true;
        this._highlightedIndex = 0;
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._highlightedIndex = Math.min(
          this._highlightedIndex + 1,
          this._filteredSuggestions.length - 1
        );
        this._scrollHighlightedIntoView();
        break;

      case 'ArrowUp':
        e.preventDefault();
        this._highlightedIndex = Math.max(this._highlightedIndex - 1, 0);
        this._scrollHighlightedIntoView();
        break;

      case 'Enter':
        if (this._highlightedIndex >= 0) {
          e.preventDefault();
          this._selectSuggestion(this._filteredSuggestions[this._highlightedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        this._open = false;
        this._highlightedIndex = -1;
        break;

      case 'Tab':
        if (this._highlightedIndex >= 0) {
          this._selectSuggestion(this._filteredSuggestions[this._highlightedIndex]);
        }
        this._open = false;
        break;
    }
  }

  _scrollHighlightedIntoView() {
    requestAnimationFrame(() => {
      const highlighted = this.shadowRoot?.querySelector('.suggestion.highlighted');
      highlighted?.scrollIntoView({ block: 'nearest' });
    });
  }

  _selectSuggestion(item) {
    const label = this._getSuggestionLabel(item);
    this.value = label;
    this._open = false;
    this._highlightedIndex = -1;

    this.emit('suggestion-select', { value: label, item });

    // Trigger input change event
    this.inputElement?.dispatchEvent(new Event('change', { bubbles: true }));
  }

  _highlightMatch(text) {
    const query = this.value.toLowerCase().trim();
    if (!query) return text;

    const index = text.toLowerCase().indexOf(query);
    if (index === -1) return text;

    const before = text.slice(0, index);
    const match = text.slice(index, index + query.length);
    const after = text.slice(index + query.length);

    return html`${before}<span class="match">${match}</span>${after}`;
  }

  render() {
    const showDropdown = this.showSuggestions !== null
      ? this.showSuggestions
      : this._open && this._filteredSuggestions.length > 0;

    return html`
      <div class="input-wrapper">
        <slot name="prefix"></slot>
        <input
          part="input"
          type=${this.type}
          .value=${this.value}
          placeholder=${this.placeholder}
          ?disabled=${this.disabled}
          ?readonly=${this.readonly}
          role="combobox"
          aria-expanded=${showDropdown}
          aria-autocomplete="list"
          aria-controls="suggestions"
          @input=${this._handleInput}
          @focus=${this._handleFocus}
          @blur=${this._handleBlur}
          @keydown=${this._handleKeydown}
        >
        <slot name="suffix"></slot>
      </div>

      ${showDropdown ? html`
        <div
          id="suggestions"
          part="suggestions"
          class="suggestions"
          role="listbox"
        >
          ${this._filteredSuggestions.map((item, index) => {
            const label = this._getSuggestionLabel(item);
            return html`
              <div
                part="suggestion"
                class="suggestion ${index === this._highlightedIndex ? 'highlighted' : ''}"
                role="option"
                aria-selected=${index === this._highlightedIndex}
                @click=${() => this._selectSuggestion(item)}
                @mouseenter=${() => { this._highlightedIndex = index; }}
              >
                <span class="suggestion-text">${this._highlightMatch(label)}</span>
              </div>
            `;
          })}
        </div>
      ` : nothing}
    `;
  }

  /**
   * Focus the input element
   */
  focus() {
    this.inputElement?.focus();
  }

  /**
   * Blur the input element
   */
  blur() {
    this.inputElement?.blur();
  }

  /**
   * Select all text in the input
   */
  select() {
    this.inputElement?.select();
  }

  /**
   * Clear the input value
   */
  clear() {
    this.value = '';
    this._filteredSuggestions = [];
    this.emit('input', { value: '' });
  }
}

customElements.define('peek-input', PeekInput);

export default PeekInput;
