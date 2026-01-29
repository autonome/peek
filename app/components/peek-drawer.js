/**
 * Peek Drawer Component
 *
 * Slide-out sidebar/panel using native <dialog> element.
 *
 * @element peek-drawer
 *
 * @prop {boolean} open - Whether drawer is open
 * @prop {string} position - 'left' | 'right' | 'top' | 'bottom'
 * @prop {string} size - Drawer size: 'sm' | 'md' | 'lg' | 'full' or CSS value
 * @prop {boolean} modal - Use modal mode (with backdrop)
 * @prop {boolean} closeOnBackdrop - Close when clicking backdrop
 * @prop {boolean} closeOnEscape - Close on Escape key
 * @prop {boolean} contained - Constrain to parent container instead of viewport
 *
 * @slot - Drawer content
 * @slot header - Drawer header
 * @slot footer - Drawer footer
 *
 * @csspart drawer - The drawer container
 * @csspart header - Header section
 * @csspart body - Body section
 * @csspart footer - Footer section
 * @csspart backdrop - Modal backdrop
 *
 * @fires open - When drawer opens
 * @fires close - When drawer closes. Detail: { reason }
 */

import { html, css, nothing } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

export class PeekDrawer extends PeekElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    position: { type: String, reflect: true },
    size: { type: String },
    modal: { type: Boolean },
    closeOnBackdrop: { type: Boolean, attribute: 'close-on-backdrop' },
    closeOnEscape: { type: Boolean, attribute: 'close-on-escape' },
    contained: { type: Boolean }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: contents;
      }

      dialog {
        position: fixed;
        margin: 0;
        padding: 0;
        border: none;
        background: var(--peek-drawer-bg, var(--theme-bg-secondary, #fff));
        box-shadow: var(--peek-shadow-lg);
        max-width: none;
        max-height: none;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      :host([contained]) dialog {
        position: absolute;
      }

      /* Position variants */
      :host([position="left"]) dialog,
      :host(:not([position])) dialog {
        top: 0;
        left: 0;
        height: 100%;
        width: var(--peek-drawer-size, 320px);
        border-right: 1px solid var(--peek-drawer-border, var(--theme-border, #e0e0e0));
      }

      :host([position="right"]) dialog {
        top: 0;
        right: 0;
        height: 100%;
        width: var(--peek-drawer-size, 320px);
        border-left: 1px solid var(--peek-drawer-border, var(--theme-border, #e0e0e0));
      }

      :host([position="top"]) dialog {
        top: 0;
        left: 0;
        width: 100%;
        height: var(--peek-drawer-size, 320px);
        border-bottom: 1px solid var(--peek-drawer-border, var(--theme-border, #e0e0e0));
      }

      :host([position="bottom"]) dialog {
        bottom: 0;
        left: 0;
        width: 100%;
        height: var(--peek-drawer-size, 320px);
        border-top: 1px solid var(--peek-drawer-border, var(--theme-border, #e0e0e0));
      }

      /* Size presets */
      :host([size="sm"]) { --peek-drawer-size: 240px; }
      :host([size="md"]) { --peek-drawer-size: 320px; }
      :host([size="lg"]) { --peek-drawer-size: 480px; }
      :host([size="full"]) { --peek-drawer-size: 100%; }

      /* Animations */
      dialog {
        opacity: 0;
        transition: opacity var(--peek-transition-normal), transform var(--peek-transition-normal);
      }

      :host([position="left"]) dialog,
      :host(:not([position])) dialog {
        transform: translateX(-100%);
      }

      :host([position="right"]) dialog {
        transform: translateX(100%);
      }

      :host([position="top"]) dialog {
        transform: translateY(-100%);
      }

      :host([position="bottom"]) dialog {
        transform: translateY(100%);
      }

      dialog[open] {
        opacity: 1;
        transform: translate(0, 0);
      }

      /* Backdrop */
      dialog::backdrop {
        background: var(--peek-drawer-backdrop, rgba(0, 0, 0, 0.5));
        opacity: 0;
        transition: opacity var(--peek-transition-normal);
      }

      dialog[open]::backdrop {
        opacity: 1;
      }

      /* Layout */
      .header {
        display: flex;
        align-items: center;
        gap: var(--peek-space-md);
        padding: var(--peek-space-md) var(--peek-space-lg);
        border-bottom: 1px solid var(--peek-drawer-border, var(--theme-border, #e0e0e0));
        flex-shrink: 0;
      }

      .header-content {
        flex: 1;
        font-weight: var(--peek-font-semibold);
        font-size: var(--peek-font-lg);
      }

      .close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        background: transparent;
        border-radius: var(--peek-radius-sm);
        color: var(--theme-text-muted, #999);
        cursor: pointer;
        transition: background var(--peek-transition-fast), color var(--peek-transition-fast);
      }

      .close-btn:hover {
        background: var(--theme-bg-tertiary, #f5f5f5);
        color: var(--theme-text, #333);
      }

      .close-btn:focus-visible {
        outline: 2px solid var(--theme-accent, #007aff);
        outline-offset: 2px;
      }

      .body {
        flex: 1;
        padding: var(--peek-space-lg);
        overflow-y: auto;
      }

      .footer {
        display: flex;
        align-items: center;
        gap: var(--peek-space-sm);
        padding: var(--peek-space-md) var(--peek-space-lg);
        border-top: 1px solid var(--peek-drawer-border, var(--theme-border, #e0e0e0));
        flex-shrink: 0;
      }

      .footer:empty {
        display: none;
      }

      /* Hide header if no content */
      .header:not(:has(slot[name="header"]::slotted(*))) .header-content {
        display: none;
      }
    `
  ];

  constructor() {
    super();
    this.open = false;
    this.position = 'left';
    this.size = 'md';
    this.modal = true;
    this.closeOnBackdrop = true;
    this.closeOnEscape = true;
    this.contained = false;
  }

  get dialogElement() {
    return this.shadowRoot?.querySelector('dialog');
  }

  updated(changedProps) {
    if (changedProps.has('open')) {
      this.open ? this._openDrawer() : this._closeDrawer();
    }
    if (changedProps.has('size') && this.size && !['sm', 'md', 'lg', 'full'].includes(this.size)) {
      // Custom size value
      this.style.setProperty('--peek-drawer-size', this.size);
    }
  }

  _openDrawer() {
    const dialog = this.dialogElement;
    if (!dialog) return;

    if (this.modal) {
      dialog.showModal();
    } else {
      dialog.show();
    }

    this.emit('open');
  }

  _closeDrawer(reason = 'api') {
    const dialog = this.dialogElement;
    if (!dialog) return;

    dialog.close();
    this.emit('close', { reason });
  }

  _handleDialogClick(e) {
    // Check if click was on backdrop (dialog itself, not children)
    if (e.target === this.dialogElement && this.closeOnBackdrop && this.modal) {
      this.open = false;
      this._closeDrawer('backdrop');
    }
  }

  _handleKeydown(e) {
    if (e.key === 'Escape') {
      if (this.closeOnEscape) {
        e.preventDefault();
        this.open = false;
        this._closeDrawer('escape');
      } else {
        e.preventDefault(); // Prevent native dialog close
      }
    }
  }

  _handleClose() {
    this.open = false;
    this._closeDrawer('close');
  }

  _handleCancel(e) {
    // Native cancel event (Escape key on dialog)
    if (!this.closeOnEscape) {
      e.preventDefault();
    } else {
      this.open = false;
    }
  }

  render() {
    return html`
      <dialog
        part="drawer"
        @click=${this._handleDialogClick}
        @keydown=${this._handleKeydown}
        @cancel=${this._handleCancel}
      >
        <div part="header" class="header">
          <div class="header-content">
            <slot name="header"></slot>
          </div>
          <button
            class="close-btn"
            type="button"
            aria-label="Close drawer"
            @click=${this._handleClose}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div part="body" class="body">
          <slot></slot>
        </div>
        <div part="footer" class="footer">
          <slot name="footer"></slot>
        </div>
      </dialog>
    `;
  }

  // Public API
  show() {
    this.open = true;
  }

  showModal() {
    this.modal = true;
    this.open = true;
  }

  close() {
    this.open = false;
    this._closeDrawer('api');
  }
}

customElements.define('peek-drawer', PeekDrawer);
export default PeekDrawer;
