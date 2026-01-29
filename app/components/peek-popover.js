/**
 * Peek Popover Component
 *
 * Native Popover API wrapper for tooltips, dropdowns, and floating content.
 *
 * @element peek-popover
 *
 * @prop {string} mode - 'auto' (light-dismiss) | 'manual'
 * @prop {boolean} open - Whether popover is open
 * @prop {string} position - 'top' | 'bottom' | 'left' | 'right'
 * @prop {number} offset - Offset from anchor (px)
 *
 * @slot trigger - Trigger element (auto-wired with popovertarget)
 * @slot - Popover content
 *
 * @fires toggle - When open state changes
 */

import { html, css } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

let popoverIdCounter = 0;

export class PeekPopover extends PeekElement {
  static properties = {
    mode: { type: String, reflect: true },
    open: { type: Boolean, reflect: true },
    position: { type: String, reflect: true },
    offset: { type: Number }
  };

  static styles = [
    sharedStyles,
    css`
      :host { display: inline-block; position: relative; }
      .trigger-wrapper { display: contents; }
      .popover {
        margin: 0;
        padding: var(--peek-popover-padding, var(--peek-space-md));
        border: 1px solid var(--peek-popover-border, var(--theme-border, #e0e0e0));
        border-radius: var(--peek-radius-lg);
        background: var(--peek-popover-bg, var(--theme-bg-secondary, #fff));
        box-shadow: var(--peek-shadow-lg);
        max-width: var(--peek-popover-max-width, 320px);
        position: absolute;
        inset: unset;
      }
      .popover { opacity: 0; transform: scale(0.95); transition: opacity var(--peek-transition-fast), transform var(--peek-transition-fast); }
      .popover:popover-open { opacity: 1; transform: scale(1); }
      @starting-style { .popover:popover-open { opacity: 0; transform: scale(0.95); } }
    `
  ];

  constructor() {
    super();
    this._popoverId = `peek-popover-${++popoverIdCounter}`;
    this.mode = 'auto';
    this.open = false;
    this.position = 'bottom';
    this.offset = 8;
  }

  get popoverElement() { return this.shadowRoot?.querySelector('.popover'); }
  get triggerElement() {
    const slot = this.shadowRoot?.querySelector('slot[name="trigger"]');
    return slot?.assignedElements()?.[0] || null;
  }

  firstUpdated() { this._setupTrigger(); if (this.open) this.show(); }
  updated(changedProps) { if (changedProps.has('open')) this.open ? this.show() : this.hide(); }

  _setupTrigger() {
    const trigger = this.triggerElement;
    if (trigger) {
      trigger.setAttribute('popovertarget', this._popoverId);
      trigger.setAttribute('popovertargetaction', 'toggle');
    }
  }

  _handleToggle(e) {
    const isOpen = e.newState === 'open';
    this.open = isOpen;
    if (isOpen) this._updatePosition();
    this.emit('toggle', { open: isOpen });
  }

  _updatePosition() {
    const popover = this.popoverElement;
    const anchorEl = this.triggerElement || this;
    if (!popover || !anchorEl) return;
    const anchorRect = anchorEl.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    let top, left;
    switch (this.position) {
      case 'top': top = anchorRect.top - popoverRect.height - this.offset; left = anchorRect.left + (anchorRect.width - popoverRect.width) / 2; break;
      case 'bottom': top = anchorRect.bottom + this.offset; left = anchorRect.left + (anchorRect.width - popoverRect.width) / 2; break;
      case 'left': top = anchorRect.top + (anchorRect.height - popoverRect.height) / 2; left = anchorRect.left - popoverRect.width - this.offset; break;
      case 'right': top = anchorRect.top + (anchorRect.height - popoverRect.height) / 2; left = anchorRect.right + this.offset; break;
      default: top = anchorRect.bottom + this.offset; left = anchorRect.left;
    }
    const vw = window.innerWidth, vh = window.innerHeight;
    left = Math.max(8, Math.min(left, vw - popoverRect.width - 8));
    top = Math.max(8, Math.min(top, vh - popoverRect.height - 8));
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  render() {
    return html`
      <div class="trigger-wrapper"><slot name="trigger" @slotchange=${this._setupTrigger}></slot></div>
      <div id="${this._popoverId}" part="popover" class="popover" popover=${this.mode} @toggle=${this._handleToggle}><slot></slot></div>
    `;
  }

  show() { try { this.popoverElement?.showPopover(); } catch (e) {} }
  hide() { try { this.popoverElement?.hidePopover(); } catch (e) {} }
  toggle() { try { this.popoverElement?.togglePopover(); } catch (e) {} }
}

customElements.define('peek-popover', PeekPopover);
export default PeekPopover;
