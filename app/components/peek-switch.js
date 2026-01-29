/**
 * Peek Switch Component
 *
 * Toggle switch built on native checkbox for accessibility.
 *
 * @element peek-switch
 *
 * @prop {boolean} checked - Whether switch is on
 * @prop {boolean} disabled - Disable the switch
 * @prop {string} name - Form field name
 * @prop {string} value - Form field value when checked
 * @prop {string} size - 'sm' | 'md' | 'lg'
 *
 * @slot - Label content
 * @slot on - Content shown when on (optional)
 * @slot off - Content shown when off (optional)
 *
 * @csspart switch - The switch track
 * @csspart thumb - The switch thumb/knob
 * @csspart label - The label wrapper
 *
 * @fires change - When checked state changes. Detail: { checked }
 */

import { html, css, nothing } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

export class PeekSwitch extends PeekElement {
  static properties = {
    checked: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    name: { type: String },
    value: { type: String },
    size: { type: String, reflect: true }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: inline-flex;
        align-items: center;
        gap: var(--peek-space-sm);
        cursor: pointer;
      }

      :host([disabled]) {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .wrapper {
        display: inline-flex;
        align-items: center;
        gap: var(--peek-space-sm);
      }

      /* Hidden native checkbox */
      input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
        margin: 0;
      }

      /* Switch track */
      .switch {
        position: relative;
        display: inline-flex;
        align-items: center;
        width: var(--peek-switch-width, 44px);
        height: var(--peek-switch-height, 24px);
        background: var(--peek-switch-bg, var(--theme-border, #ccc));
        border-radius: var(--peek-switch-radius, 999px);
        transition: background var(--peek-transition-normal);
        flex-shrink: 0;
      }

      /* Size variants */
      :host([size="sm"]) .switch {
        --peek-switch-width: 36px;
        --peek-switch-height: 20px;
        --peek-switch-thumb-size: 16px;
      }

      :host([size="lg"]) .switch {
        --peek-switch-width: 52px;
        --peek-switch-height: 28px;
        --peek-switch-thumb-size: 24px;
      }

      /* Checked state */
      :host([checked]) .switch {
        background: var(--peek-switch-checked-bg, var(--theme-accent, #007aff));
      }

      /* Focus state */
      input:focus-visible + .switch {
        outline: 2px solid var(--theme-accent, #007aff);
        outline-offset: 2px;
      }

      /* Thumb */
      .thumb {
        position: absolute;
        left: 2px;
        width: var(--peek-switch-thumb-size, 20px);
        height: var(--peek-switch-thumb-size, 20px);
        background: var(--peek-switch-thumb-bg, #fff);
        border-radius: 50%;
        box-shadow: var(--peek-shadow-sm);
        transition: transform var(--peek-transition-normal);
      }

      :host([checked]) .thumb {
        transform: translateX(calc(var(--peek-switch-width, 44px) - var(--peek-switch-thumb-size, 20px) - 4px));
      }

      /* Label */
      .label {
        font-size: var(--peek-font-md);
        color: var(--theme-text, #333);
        user-select: none;
      }

      :host([disabled]) .label {
        color: var(--theme-text-muted, #999);
      }

      /* On/Off slots inside switch */
      .switch-content {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: var(--peek-font-medium);
        color: #fff;
        opacity: 0;
        transition: opacity var(--peek-transition-fast);
      }

      .switch-on {
        left: 6px;
      }

      .switch-off {
        right: 6px;
        color: var(--theme-text-muted, #999);
      }

      :host([checked]) .switch-on {
        opacity: 1;
      }

      :host(:not([checked])) .switch-off {
        opacity: 1;
      }
    `
  ];

  constructor() {
    super();
    this.checked = false;
    this.disabled = false;
    this.name = '';
    this.value = 'on';
    this.size = 'md';
  }

  get inputElement() {
    return this.shadowRoot?.querySelector('input');
  }

  _handleChange(e) {
    if (this.disabled) return;
    this.checked = e.target.checked;
    this.emit('change', { checked: this.checked });
  }

  _handleClick(e) {
    // Allow clicking on the whole component
    if (this.disabled) return;
    if (e.target !== this.inputElement) {
      this.checked = !this.checked;
      this.emit('change', { checked: this.checked });
    }
  }

  _handleKeydown(e) {
    if (this.disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this.checked = !this.checked;
      this.emit('change', { checked: this.checked });
    }
  }

  render() {
    return html`
      <label class="wrapper" @click=${this._handleClick}>
        <input
          type="checkbox"
          role="switch"
          name=${this.name || nothing}
          value=${this.value}
          .checked=${this.checked}
          ?disabled=${this.disabled}
          aria-checked=${this.checked}
          @change=${this._handleChange}
          @keydown=${this._handleKeydown}
        >
        <span part="switch" class="switch">
          <span class="switch-content switch-on"><slot name="on"></slot></span>
          <span class="switch-content switch-off"><slot name="off"></slot></span>
          <span part="thumb" class="thumb"></span>
        </span>
        <span part="label" class="label"><slot></slot></span>
      </label>
    `;
  }

  // Public API
  focus() {
    this.inputElement?.focus();
  }

  toggle() {
    if (!this.disabled) {
      this.checked = !this.checked;
      this.emit('change', { checked: this.checked });
    }
  }
}

customElements.define('peek-switch', PeekSwitch);
export default PeekSwitch;
