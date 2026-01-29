/**
 * Peek Details - Native <details>/<summary> wrapper
 *
 * @element peek-details
 * @prop {boolean} open - Whether expanded
 * @prop {string} name - Accordion group name (native exclusive)
 * @slot summary - Trigger content
 * @slot - Expandable content
 */

import { html, css } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

export class PeekDetails extends PeekElement {
  static properties = { open: { type: Boolean, reflect: true }, name: { type: String, reflect: true } };
  static styles = [sharedStyles, css`
    :host { display: block; }
    details { border: 1px solid var(--peek-details-border, var(--theme-border, #e0e0e0)); border-radius: var(--peek-details-radius, var(--peek-radius-md)); overflow: hidden; }
    summary { display: flex; align-items: center; gap: var(--peek-space-sm); padding: var(--peek-details-padding, var(--peek-space-md)); background: var(--theme-bg-secondary, #fff); cursor: pointer; user-select: none; font-weight: var(--peek-font-medium); list-style: none; }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: ''; width: 0; height: 0; border-left: 5px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; transition: transform var(--peek-transition-fast); }
    details[open] summary::before { transform: rotate(90deg); }
    summary:hover { background: var(--theme-bg-tertiary, #f5f5f5); }
    summary:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: -2px; }
    .content { padding: var(--peek-details-padding, var(--peek-space-md)); padding-top: 0; color: var(--theme-text-secondary, #666); }
    :host([name]) + :host([name]) { margin-top: -1px; }
    :host([name]) details { border-radius: 0; }
    :host([name]):first-of-type details { border-top-left-radius: var(--peek-details-radius, var(--peek-radius-md)); border-top-right-radius: var(--peek-details-radius, var(--peek-radius-md)); }
    :host([name]):last-of-type details { border-bottom-left-radius: var(--peek-details-radius, var(--peek-radius-md)); border-bottom-right-radius: var(--peek-details-radius, var(--peek-radius-md)); }
  `];

  constructor() { super(); this.open = false; this.name = null; }
  _handleToggle(e) { this.open = e.target.open; this.emit('toggle', { open: this.open }); }

  render() {
    return html`<details part="details" ?open=${this.open} name=${this.name || ''} @toggle=${this._handleToggle}>
      <summary part="summary"><slot name="summary">Details</slot></summary>
      <div part="content" class="content"><slot></slot></div>
    </details>`;
  }

  show() { this.open = true; }
  hide() { this.open = false; }
  toggle() { this.open = !this.open; }
}

customElements.define('peek-details', PeekDetails);
export default PeekDetails;
