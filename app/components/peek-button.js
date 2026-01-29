/**
 * Peek Button Component
 *
 * A themeable button component built on native <button> for accessibility.
 *
 * @element peek-button
 *
 * @prop {string} variant - Button style: 'primary' | 'secondary' | 'ghost' | 'danger'
 * @prop {string} size - Button size: 'sm' | 'md' | 'lg'
 * @prop {boolean} disabled - Whether the button is disabled
 * @prop {boolean} loading - Show loading state
 * @prop {string} type - Button type: 'button' | 'submit' | 'reset'
 *
 * @slot - Default slot for button content
 * @slot prefix - Content before the main label (e.g., icon)
 * @slot suffix - Content after the main label (e.g., icon)
 *
 * @csspart button - The native button element
 *
 * @cssprop --peek-btn-bg - Button background color
 * @cssprop --peek-btn-text - Button text color
 * @cssprop --peek-btn-border - Button border color
 * @cssprop --peek-btn-hover-bg - Background on hover
 * @cssprop --peek-btn-active-bg - Background on active/press
 *
 * @fires click - When button is clicked (native event)
 *
 * @example
 * <peek-button variant="primary">Save</peek-button>
 * <peek-button variant="secondary" size="sm">Cancel</peek-button>
 * <peek-button variant="ghost" disabled>Disabled</peek-button>
 */

import { html, css } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

export class PeekButton extends PeekElement {
  static properties = {
    variant: { type: String, reflect: true },
    size: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true },
    loading: { type: Boolean, reflect: true },
    type: { type: String }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: inline-block;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--peek-space-sm);
        border: 1px solid transparent;
        border-radius: var(--peek-radius-md);
        font-family: inherit;
        font-size: var(--peek-font-md);
        font-weight: var(--peek-font-medium);
        line-height: var(--peek-leading-tight);
        cursor: pointer;
        transition: background var(--peek-transition-fast),
                    border-color var(--peek-transition-fast),
                    color var(--peek-transition-fast),
                    box-shadow var(--peek-transition-fast);
        user-select: none;
        white-space: nowrap;

        /* Default size (md) */
        height: var(--peek-btn-height-md);
        padding: 0 var(--peek-btn-padding-x);

        /* Default variant colors (secondary) */
        --_btn-bg: var(--peek-btn-bg, var(--theme-bg-secondary, #fff));
        --_btn-text: var(--peek-btn-text, var(--theme-text, #333));
        --_btn-border: var(--peek-btn-border, var(--theme-border, #e0e0e0));
        --_btn-hover-bg: var(--peek-btn-hover-bg, var(--theme-bg-tertiary, #f0f0f0));
        --_btn-active-bg: var(--peek-btn-active-bg, var(--theme-border, #e0e0e0));

        background: var(--_btn-bg);
        color: var(--_btn-text);
        border-color: var(--_btn-border);
      }

      .button:hover:not(:disabled) {
        background: var(--_btn-hover-bg);
      }

      .button:active:not(:disabled) {
        background: var(--_btn-active-bg);
      }

      .button:focus-visible {
        outline: none;
        box-shadow: var(--peek-focus-ring);
      }

      .button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      /* Size variants */
      :host([size="sm"]) .button {
        height: var(--peek-btn-height-sm);
        padding: 0 var(--peek-btn-padding-x-sm);
        font-size: var(--peek-font-sm);
        border-radius: var(--peek-radius-sm);
      }

      :host([size="lg"]) .button {
        height: var(--peek-btn-height-lg);
        padding: 0 var(--peek-btn-padding-x-lg);
        font-size: var(--peek-font-lg);
        border-radius: var(--peek-radius-lg);
      }

      /* Primary variant */
      :host([variant="primary"]) .button {
        --_btn-bg: var(--peek-btn-bg, var(--theme-accent, #007aff));
        --_btn-text: var(--peek-btn-text, #fff);
        --_btn-border: var(--peek-btn-border, var(--theme-accent, #007aff));
        --_btn-hover-bg: var(--peek-btn-hover-bg, color-mix(in srgb, var(--theme-accent, #007aff) 85%, #000));
        --_btn-active-bg: var(--peek-btn-active-bg, color-mix(in srgb, var(--theme-accent, #007aff) 75%, #000));
      }

      /* Ghost variant */
      :host([variant="ghost"]) .button {
        --_btn-bg: transparent;
        --_btn-text: var(--peek-btn-text, var(--theme-text, #333));
        --_btn-border: transparent;
        --_btn-hover-bg: var(--peek-btn-hover-bg, var(--theme-bg-tertiary, rgba(0, 0, 0, 0.05)));
        --_btn-active-bg: var(--peek-btn-active-bg, var(--theme-border, rgba(0, 0, 0, 0.1)));
      }

      /* Danger variant */
      :host([variant="danger"]) .button {
        --_btn-bg: var(--peek-btn-bg, var(--theme-danger, #ff3b30));
        --_btn-text: var(--peek-btn-text, #fff);
        --_btn-border: var(--peek-btn-border, var(--theme-danger, #ff3b30));
        --_btn-hover-bg: var(--peek-btn-hover-bg, color-mix(in srgb, var(--theme-danger, #ff3b30) 85%, #000));
        --_btn-active-bg: var(--peek-btn-active-bg, color-mix(in srgb, var(--theme-danger, #ff3b30) 75%, #000));
      }

      /* Loading state */
      :host([loading]) .button {
        pointer-events: none;
        position: relative;
      }

      :host([loading]) .button-content {
        visibility: hidden;
      }

      .spinner {
        display: none;
        position: absolute;
        width: 16px;
        height: 16px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      :host([loading]) .spinner {
        display: block;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* Slot styling */
      .button-content {
        display: inline-flex;
        align-items: center;
        gap: var(--peek-space-sm);
      }

      ::slotted([slot="prefix"]),
      ::slotted([slot="suffix"]) {
        display: flex;
        align-items: center;
      }
    `
  ];

  constructor() {
    super();
    this.variant = 'secondary';
    this.size = 'md';
    this.disabled = false;
    this.loading = false;
    this.type = 'button';
  }

  render() {
    return html`
      <button
        part="button"
        class="button"
        type=${this.type}
        ?disabled=${this.disabled || this.loading}
        aria-busy=${this.loading ? 'true' : 'false'}
      >
        <span class="spinner" aria-hidden="true"></span>
        <span class="button-content">
          <slot name="prefix"></slot>
          <slot></slot>
          <slot name="suffix"></slot>
        </span>
      </button>
    `;
  }

  /**
   * Focus the button element
   */
  focus() {
    this.shadowRoot?.querySelector('button')?.focus();
  }

  /**
   * Blur the button element
   */
  blur() {
    this.shadowRoot?.querySelector('button')?.blur();
  }

  /**
   * Simulate a click on the button
   */
  click() {
    this.shadowRoot?.querySelector('button')?.click();
  }
}

customElements.define('peek-button', PeekButton);

export default PeekButton;
