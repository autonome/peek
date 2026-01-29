/**
 * Peek Dialog Component
 *
 * A modal/non-modal dialog built on native HTML <dialog> element.
 * Supports backdrop click to close, escape key, and focus trapping.
 *
 * @element peek-dialog
 *
 * @prop {boolean} open - Whether the dialog is open
 * @prop {boolean} modal - Open as modal (with backdrop) vs non-modal
 * @prop {boolean} closeOnBackdrop - Close when clicking backdrop (default: true)
 * @prop {boolean} closeOnEscape - Close on Escape key (default: true)
 * @prop {string} size - Dialog size: 'sm' | 'md' | 'lg' | 'full'
 *
 * @slot - Default slot for dialog body content
 * @slot header - Dialog header content
 * @slot footer - Dialog footer content (e.g., action buttons)
 *
 * @csspart dialog - The native dialog element
 * @csspart header - Header section
 * @csspart body - Body section
 * @csspart footer - Footer section
 * @csspart close - Close button
 *
 * @cssprop --peek-dialog-width - Dialog width
 * @cssprop --peek-dialog-max-height - Maximum height
 * @cssprop --peek-dialog-padding - Content padding
 *
 * @fires open - When dialog opens
 * @fires close - When dialog closes. Detail: { reason: 'escape' | 'backdrop' | 'close' | 'api' }
 *
 * @example
 * <peek-dialog id="myDialog" modal>
 *   <span slot="header">Confirm Action</span>
 *   <p>Are you sure you want to continue?</p>
 *   <div slot="footer">
 *     <peek-button variant="ghost" onclick="myDialog.close()">Cancel</peek-button>
 *     <peek-button variant="primary" onclick="confirm()">Confirm</peek-button>
 *   </div>
 * </peek-dialog>
 *
 * <peek-button onclick="myDialog.show()">Open Dialog</peek-button>
 */

import { html, css, nothing } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

export class PeekDialog extends PeekElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    modal: { type: Boolean },
    closeOnBackdrop: { type: Boolean, attribute: 'close-on-backdrop' },
    closeOnEscape: { type: Boolean, attribute: 'close-on-escape' },
    size: { type: String, reflect: true }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: contents;
      }

      dialog {
        border: none;
        border-radius: var(--peek-radius-xl);
        padding: 0;
        background: var(--theme-bg-secondary, #fff);
        box-shadow: var(--peek-shadow-xl);
        max-width: min(90vw, var(--peek-dialog-width, 480px));
        max-height: var(--peek-dialog-max-height, 85vh);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      dialog::backdrop {
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(2px);
      }

      /* Size variants */
      :host([size="sm"]) dialog {
        --peek-dialog-width: 320px;
      }

      :host([size="lg"]) dialog {
        --peek-dialog-width: 640px;
      }

      :host([size="full"]) dialog {
        --peek-dialog-width: 90vw;
        --peek-dialog-max-height: 90vh;
      }

      /* Sections */
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--peek-dialog-padding, var(--peek-space-lg));
        border-bottom: 1px solid var(--theme-border, #e0e0e0);
        font-size: var(--peek-font-lg);
        font-weight: var(--peek-font-semibold);
        color: var(--theme-text, #333);
      }

      .header:empty {
        display: none;
      }

      .header-content {
        flex: 1;
        min-width: 0;
      }

      .close-btn {
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        border-radius: var(--peek-radius-md);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        color: var(--theme-text-muted, #999);
        transition: background var(--peek-transition-fast),
                    color var(--peek-transition-fast);
        flex-shrink: 0;
        margin-left: var(--peek-space-sm);
      }

      .close-btn:hover {
        background: var(--theme-bg-tertiary, #f0f0f0);
        color: var(--theme-text, #333);
      }

      .body {
        padding: var(--peek-dialog-padding, var(--peek-space-lg));
        overflow-y: auto;
        flex: 1;
        color: var(--theme-text-secondary, #666);
        font-size: var(--peek-font-md);
        line-height: var(--peek-leading-normal);
      }

      .body:empty {
        display: none;
      }

      .footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--peek-space-sm);
        padding: var(--peek-dialog-padding, var(--peek-space-lg));
        border-top: 1px solid var(--theme-border, #e0e0e0);
      }

      .footer:empty {
        display: none;
      }

      /* Animation */
      dialog[open] {
        animation: dialog-open 0.15s ease-out;
      }

      @keyframes dialog-open {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
    `
  ];

  constructor() {
    super();
    this.open = false;
    this.modal = true;
    this.closeOnBackdrop = true;
    this.closeOnEscape = true;
    this.size = 'md';
    this._handleBackdropClick = this._handleBackdropClick.bind(this);
    this._handleKeydown = this._handleKeydown.bind(this);
    this._handleNativeClose = this._handleNativeClose.bind(this);
  }

  get dialogElement() {
    return this.shadowRoot?.querySelector('dialog');
  }

  firstUpdated() {
    const dialog = this.dialogElement;
    if (!dialog) return;

    // Sync initial state
    if (this.open) {
      this._openDialog();
    }

    // Listen for native close (e.g., form submission)
    dialog.addEventListener('close', this._handleNativeClose);
  }

  updated(changedProps) {
    if (changedProps.has('open')) {
      if (this.open) {
        this._openDialog();
      } else {
        this._closeDialog('api');
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleKeydown);
  }

  _openDialog() {
    const dialog = this.dialogElement;
    if (!dialog || dialog.open) return;

    if (this.modal) {
      dialog.showModal();
    } else {
      dialog.show();
    }

    document.addEventListener('keydown', this._handleKeydown);
    this.emit('open');
  }

  _closeDialog(reason = 'api') {
    const dialog = this.dialogElement;
    if (!dialog || !dialog.open) return;

    dialog.close();
    document.removeEventListener('keydown', this._handleKeydown);
    this.open = false;
    this.emit('close', { reason });
  }

  _handleBackdropClick(e) {
    if (!this.closeOnBackdrop) return;

    const dialog = this.dialogElement;
    // Check if click was on backdrop (outside dialog content)
    const rect = dialog.getBoundingClientRect();
    const isInDialog = (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );

    if (!isInDialog) {
      this._closeDialog('backdrop');
    }
  }

  _handleKeydown(e) {
    if (e.key === 'Escape' && this.closeOnEscape) {
      e.preventDefault();
      this._closeDialog('escape');
    }
  }

  _handleNativeClose() {
    // Sync state if dialog was closed natively
    if (this.open) {
      this.open = false;
      this.emit('close', { reason: 'native' });
    }
  }

  _handleCloseClick() {
    this._closeDialog('close');
  }

  render() {
    return html`
      <dialog
        part="dialog"
        @click=${this._handleBackdropClick}
      >
        <div part="header" class="header">
          <div class="header-content">
            <slot name="header"></slot>
          </div>
          <button
            part="close"
            class="close-btn"
            @click=${this._handleCloseClick}
            aria-label="Close dialog"
          >
            ×
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

  /**
   * Open the dialog
   */
  show() {
    this.open = true;
  }

  /**
   * Open as modal
   */
  showModal() {
    this.modal = true;
    this.open = true;
  }

  /**
   * Close the dialog
   */
  close() {
    this._closeDialog('api');
  }
}

customElements.define('peek-dialog', PeekDialog);

export default PeekDialog;
