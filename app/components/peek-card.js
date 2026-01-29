/**
 * Peek Card Component
 *
 * A flexible card container with header, body, and footer slots.
 * Supports interactive (clickable) and static modes.
 *
 * @element peek-card
 *
 * @prop {boolean} interactive - Make card clickable/focusable
 * @prop {boolean} selected - Visual selected state
 * @prop {boolean} elevated - Add elevation shadow
 * @prop {boolean} bordered - Show border (default true)
 *
 * @slot - Default slot for card body content
 * @slot header - Card header content
 * @slot footer - Card footer content
 * @slot media - Media content (images, etc.) displayed edge-to-edge
 *
 * @csspart card - The card container
 * @csspart header - The header section
 * @csspart body - The body section
 * @csspart footer - The footer section
 * @csspart media - The media section
 *
 * @cssprop --peek-card-bg - Card background color
 * @cssprop --peek-card-border - Card border color
 * @cssprop --peek-card-radius - Card border radius
 * @cssprop --peek-card-padding - Card content padding
 * @cssprop --peek-card-gap - Gap between card sections
 *
 * @fires card-click - When interactive card is clicked
 *
 * @example
 * <peek-card>
 *   <span slot="header">Title</span>
 *   <p>Card content goes here</p>
 *   <span slot="footer">Footer text</span>
 * </peek-card>
 *
 * @example
 * <peek-card interactive elevated>
 *   <img slot="media" src="image.jpg" alt="Card image">
 *   <h3 slot="header">Clickable Card</h3>
 *   <p>Click anywhere on this card</p>
 * </peek-card>
 */

import { html, css, nothing } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

export class PeekCard extends PeekElement {
  static properties = {
    interactive: { type: Boolean, reflect: true },
    selected: { type: Boolean, reflect: true },
    elevated: { type: Boolean, reflect: true },
    bordered: { type: Boolean, reflect: true }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .card {
        display: flex;
        flex-direction: column;
        background: var(--peek-card-bg, var(--theme-bg-secondary, #fff));
        border-radius: var(--peek-card-radius, var(--peek-radius-lg));
        overflow: hidden;
        transition: box-shadow var(--peek-transition-normal),
                    border-color var(--peek-transition-normal),
                    transform var(--peek-transition-fast);
      }

      /* Bordered (default) */
      :host([bordered]) .card,
      :host(:not([bordered])) .card {
        border: 1px solid var(--peek-card-border, var(--theme-border, #e0e0e0));
      }

      :host([bordered="false"]) .card {
        border: none;
      }

      /* Elevated */
      :host([elevated]) .card {
        box-shadow: var(--peek-shadow-md);
        border-color: transparent;
      }

      /* Selected */
      :host([selected]) .card {
        border-color: var(--theme-accent, #007aff);
        box-shadow: 0 0 0 1px var(--theme-accent, #007aff);
      }

      /* Interactive */
      :host([interactive]) .card {
        cursor: pointer;
      }

      :host([interactive]) .card:hover {
        border-color: var(--theme-accent, #007aff);
      }

      :host([interactive][elevated]) .card:hover {
        box-shadow: var(--peek-shadow-lg);
        transform: translateY(-1px);
      }

      :host([interactive]) .card:active {
        transform: scale(0.99);
      }

      :host([interactive]) .card:focus-visible {
        outline: none;
        box-shadow: var(--peek-focus-ring);
      }

      /* Sections */
      .header {
        padding: var(--peek-card-padding, var(--peek-space-lg));
        padding-bottom: 0;
        font-weight: var(--peek-font-semibold);
        font-size: var(--peek-font-lg);
        color: var(--theme-text, #333);
      }

      .header:empty {
        display: none;
      }

      .body {
        padding: var(--peek-card-padding, var(--peek-space-lg));
        flex: 1;
        color: var(--theme-text-secondary, #666);
        font-size: var(--peek-font-md);
        line-height: var(--peek-leading-normal);
      }

      .body:empty {
        display: none;
      }

      /* Adjust body padding when header exists */
      .header + .body {
        padding-top: var(--peek-card-gap, var(--peek-space-md));
      }

      .footer {
        padding: var(--peek-card-padding, var(--peek-space-lg));
        padding-top: 0;
        border-top: 1px solid var(--peek-card-border, var(--theme-border, #e0e0e0));
        margin-top: auto;
        padding-top: var(--peek-card-gap, var(--peek-space-md));
        font-size: var(--peek-font-sm);
        color: var(--theme-text-muted, #999);
      }

      .footer:empty {
        display: none;
      }

      /* Remove border-top when footer directly follows header (no body) */
      .header + .footer {
        border-top: none;
      }

      .media {
        margin: 0;
        line-height: 0;
      }

      .media:empty {
        display: none;
      }

      ::slotted([slot="media"]) {
        width: 100%;
        height: auto;
        display: block;
      }

      /* Media at top - no top radius padding needed */
      .media:first-child ::slotted([slot="media"]) {
        border-radius: var(--peek-card-radius, var(--peek-radius-lg))
                       var(--peek-card-radius, var(--peek-radius-lg))
                       0 0;
      }
    `
  ];

  constructor() {
    super();
    this.interactive = false;
    this.selected = false;
    this.elevated = false;
    this.bordered = true;
  }

  render() {
    return html`
      <div
        part="card"
        class="card"
        role=${this.interactive ? 'button' : nothing}
        tabindex=${this.interactive ? '0' : nothing}
        @click=${this._handleClick}
        @keydown=${this._handleKeydown}
      >
        <div part="media" class="media">
          <slot name="media"></slot>
        </div>
        <div part="header" class="header">
          <slot name="header"></slot>
        </div>
        <div part="body" class="body">
          <slot></slot>
        </div>
        <div part="footer" class="footer">
          <slot name="footer"></slot>
        </div>
      </div>
    `;
  }

  _handleClick(e) {
    if (this.interactive) {
      this.emit('card-click', { originalEvent: e });
    }
  }

  _handleKeydown(e) {
    if (this.interactive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.emit('card-click', { originalEvent: e });
    }
  }

  /**
   * Focus the card (only works when interactive)
   */
  focus() {
    if (this.interactive) {
      this.shadowRoot?.querySelector('.card')?.focus();
    }
  }
}

customElements.define('peek-card', PeekCard);

export default PeekCard;
