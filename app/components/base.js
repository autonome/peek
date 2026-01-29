/**
 * Base class for Peek UI components
 *
 * Provides:
 * - Shared styles (design tokens, theme integration)
 * - Common utilities
 * - Event helpers for composed custom events
 */

import { LitElement, css } from 'lit';

/**
 * Shared styles that all Peek components inherit.
 * Includes design tokens and theme variable integration.
 */
export const sharedStyles = css`
  :host {
    /* Spacing Scale */
    --peek-space-xs: 4px;
    --peek-space-sm: 8px;
    --peek-space-md: 12px;
    --peek-space-lg: 16px;
    --peek-space-xl: 24px;
    --peek-space-2xl: 32px;

    /* Border Radius */
    --peek-radius-sm: 4px;
    --peek-radius-md: 6px;
    --peek-radius-lg: 8px;
    --peek-radius-xl: 12px;
    --peek-radius-full: 9999px;

    /* Font Sizes */
    --peek-font-xs: 11px;
    --peek-font-sm: 13px;
    --peek-font-md: 14px;
    --peek-font-lg: 16px;
    --peek-font-xl: 18px;
    --peek-font-2xl: 24px;

    /* Font Weights */
    --peek-font-normal: 400;
    --peek-font-medium: 500;
    --peek-font-semibold: 600;
    --peek-font-bold: 700;

    /* Line Heights */
    --peek-leading-tight: 1.25;
    --peek-leading-normal: 1.5;
    --peek-leading-relaxed: 1.75;

    /* Shadows */
    --peek-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.1);
    --peek-shadow-md: 0 2px 4px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08);
    --peek-shadow-lg: 0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1);
    --peek-shadow-xl: 0 8px 24px rgba(0, 0, 0, 0.2), 0 4px 8px rgba(0, 0, 0, 0.12);

    /* Transitions */
    --peek-transition-fast: 100ms ease;
    --peek-transition-normal: 150ms ease;
    --peek-transition-slow: 250ms ease;

    /* Focus Ring */
    --peek-focus-ring: 0 0 0 2px var(--theme-accent, #007aff);

    /* Button */
    --peek-btn-height-sm: 28px;
    --peek-btn-height-md: 36px;
    --peek-btn-height-lg: 44px;
    --peek-btn-padding-x: var(--peek-space-md);
    --peek-btn-padding-x-sm: var(--peek-space-sm);
    --peek-btn-padding-x-lg: var(--peek-space-lg);

    /* Card */
    --peek-card-padding: var(--peek-space-lg);
    --peek-card-gap: var(--peek-space-md);
    --peek-card-radius: var(--peek-radius-lg);

    /* List */
    --peek-list-item-padding-x: var(--peek-space-md);
    --peek-list-item-padding-y: var(--peek-space-sm);
    --peek-list-item-gap: var(--peek-space-xs);

    /* Theme Integration */
    font-family: var(--theme-font-sans, system-ui, -apple-system, BlinkMacSystemFont, sans-serif);
    color: var(--theme-text, #333);
    box-sizing: border-box;
  }

  :host *,
  :host *::before,
  :host *::after {
    box-sizing: inherit;
  }

  :host([hidden]) {
    display: none !important;
  }
`;

/**
 * Base class for all Peek UI components.
 * Extends LitElement with shared styles and utilities.
 */
export class PeekElement extends LitElement {
  static styles = [sharedStyles];

  /**
   * Emit a custom event that crosses shadow DOM boundaries.
   * @param {string} name - Event name
   * @param {*} detail - Event detail payload
   * @param {CustomEventInit} [options] - Additional event options
   * @returns {boolean} - Whether the event was cancelled
   */
  emit(name, detail, options = {}) {
    const event = new CustomEvent(name, {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail,
      ...options
    });
    return this.dispatchEvent(event);
  }

  /**
   * Helper to conditionally join class names.
   * @param {Object<string, boolean>} classes - Map of class names to conditions
   * @returns {string} - Space-separated class string
   */
  classMap(classes) {
    return Object.entries(classes)
      .filter(([_, condition]) => condition)
      .map(([name]) => name)
      .join(' ');
  }
}

export default PeekElement;
