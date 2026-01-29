/**
 * Peek Tooltip Component
 *
 * Hover-triggered tooltip using native Popover API.
 * Simpler than peek-popover - just displays text hints.
 *
 * @element peek-tooltip
 *
 * @prop {string} content - Tooltip text content
 * @prop {string} position - 'top' | 'bottom' | 'left' | 'right'
 * @prop {number} delay - Delay before showing (ms)
 * @prop {boolean} disabled - Disable the tooltip
 *
 * @slot - Target element to attach tooltip to
 *
 * @csspart tooltip - The tooltip container
 */

import { html, css } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

let tooltipIdCounter = 0;

export class PeekTooltip extends PeekElement {
  static properties = {
    content: { type: String },
    position: { type: String, reflect: true },
    delay: { type: Number },
    disabled: { type: Boolean },
    _visible: { type: Boolean, state: true }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: inline-block;
        position: relative;
      }

      .target {
        display: contents;
      }

      .tooltip {
        margin: 0;
        padding: var(--peek-tooltip-padding, var(--peek-space-xs) var(--peek-space-sm));
        border: none;
        border-radius: var(--peek-radius-sm);
        background: var(--peek-tooltip-bg, var(--theme-text, #333));
        color: var(--peek-tooltip-text, #fff);
        font-size: var(--peek-font-sm);
        line-height: 1.4;
        white-space: nowrap;
        max-width: var(--peek-tooltip-max-width, 250px);
        overflow-wrap: break-word;
        white-space: normal;
        box-shadow: var(--peek-shadow-md);
        z-index: 10000;
        position: absolute;
        inset: unset;
        pointer-events: none;
      }

      /* Arrow */
      .tooltip::after {
        content: '';
        position: absolute;
        border: 5px solid transparent;
      }

      /* Position: top (default) */
      :host([position="top"]) .tooltip,
      :host(:not([position])) .tooltip {
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-bottom: 8px;
      }

      :host([position="top"]) .tooltip::after,
      :host(:not([position])) .tooltip::after {
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border-top-color: var(--peek-tooltip-bg, var(--theme-text, #333));
      }

      /* Position: bottom */
      :host([position="bottom"]) .tooltip {
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-top: 8px;
      }

      :host([position="bottom"]) .tooltip::after {
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        border-bottom-color: var(--peek-tooltip-bg, var(--theme-text, #333));
      }

      /* Position: left */
      :host([position="left"]) .tooltip {
        right: 100%;
        top: 50%;
        transform: translateY(-50%);
        margin-right: 8px;
      }

      :host([position="left"]) .tooltip::after {
        left: 100%;
        top: 50%;
        transform: translateY(-50%);
        border-left-color: var(--peek-tooltip-bg, var(--theme-text, #333));
      }

      /* Position: right */
      :host([position="right"]) .tooltip {
        left: 100%;
        top: 50%;
        transform: translateY(-50%);
        margin-left: 8px;
      }

      :host([position="right"]) .tooltip::after {
        right: 100%;
        top: 50%;
        transform: translateY(-50%);
        border-right-color: var(--peek-tooltip-bg, var(--theme-text, #333));
      }

      /* Animation */
      .tooltip {
        opacity: 0;
        transition: opacity var(--peek-transition-fast);
      }

      .tooltip:popover-open {
        opacity: 1;
      }

      @starting-style {
        .tooltip:popover-open {
          opacity: 0;
        }
      }
    `
  ];

  constructor() {
    super();
    this._tooltipId = `peek-tooltip-${++tooltipIdCounter}`;
    this.content = '';
    this.position = 'top';
    this.delay = 200;
    this.disabled = false;
    this._visible = false;
    this._showTimeout = null;
    this._hideTimeout = null;
  }

  get tooltipElement() {
    return this.shadowRoot?.querySelector('.tooltip');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._clearTimeouts();
  }

  _clearTimeouts() {
    if (this._showTimeout) {
      clearTimeout(this._showTimeout);
      this._showTimeout = null;
    }
    if (this._hideTimeout) {
      clearTimeout(this._hideTimeout);
      this._hideTimeout = null;
    }
  }

  _handleMouseEnter() {
    if (this.disabled || !this.content) return;

    this._clearTimeouts();
    this._showTimeout = setTimeout(() => {
      this._show();
    }, this.delay);
  }

  _handleMouseLeave() {
    this._clearTimeouts();
    this._hideTimeout = setTimeout(() => {
      this._hide();
    }, 100);
  }

  _handleFocusIn() {
    if (this.disabled || !this.content) return;
    this._clearTimeouts();
    this._show();
  }

  _handleFocusOut() {
    this._clearTimeouts();
    this._hide();
  }

  _show() {
    this._visible = true;
    try {
      this.tooltipElement?.showPopover();
    } catch (e) {}
  }

  _hide() {
    this._visible = false;
    try {
      this.tooltipElement?.hidePopover();
    } catch (e) {}
  }

  _handleKeydown(e) {
    if (e.key === 'Escape' && this._visible) {
      this._hide();
    }
  }

  render() {
    return html`
      <div
        class="target"
        @mouseenter=${this._handleMouseEnter}
        @mouseleave=${this._handleMouseLeave}
        @focusin=${this._handleFocusIn}
        @focusout=${this._handleFocusOut}
        @keydown=${this._handleKeydown}
        aria-describedby=${this._tooltipId}
      >
        <slot></slot>
      </div>
      <div
        id=${this._tooltipId}
        part="tooltip"
        class="tooltip"
        role="tooltip"
        popover="manual"
      >${this.content}</div>
    `;
  }

  // Public API
  show() {
    this._clearTimeouts();
    this._show();
  }

  hide() {
    this._clearTimeouts();
    this._hide();
  }
}

customElements.define('peek-tooltip', PeekTooltip);
export default PeekTooltip;
