/**
 * Status Line - Vim-style status bar for CodeMirror editor.
 *
 * Displays:
 * - Mode indicator (NORMAL, INSERT, VISUAL, V-LINE)
 * - Cursor position (Ln X, Col Y)
 * - Temporary messages
 */

export class StatusLine {
  constructor(options = {}) {
    this.container = options.container;
    this.currentMode = 'normal';
    this.messageTimeout = null;
    this.originalModeText = '';

    this.init();
  }

  init() {
    // Create status line container
    this.element = document.createElement('div');
    this.element.className = 'vim-status-line';
    this.element.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 12px;
      background: var(--base00);
      border-top: 1px solid var(--base02);
      min-height: 22px;
      font-family: var(--theme-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
      font-size: 12px;
    `;

    // Mode indicator (left side)
    this.modeIndicator = document.createElement('span');
    this.modeIndicator.className = 'vim-mode-indicator';
    this.modeIndicator.style.cssText = `
      color: var(--base0A);
      font-weight: 600;
    `;
    this.modeIndicator.textContent = 'NORMAL';

    // Position info (right side)
    this.positionInfo = document.createElement('span');
    this.positionInfo.className = 'vim-position-info';
    this.positionInfo.style.cssText = `
      color: var(--base04);
    `;
    this.positionInfo.textContent = 'Ln 1, Col 1';

    this.element.appendChild(this.modeIndicator);
    this.element.appendChild(this.positionInfo);

    if (this.container) {
      this.container.appendChild(this.element);
    }
  }

  /**
   * Update the mode display.
   * @param {string} mode - The vim mode ('normal', 'insert', 'visual', 'visual-line', 'replace')
   */
  updateMode(mode) {
    this.currentMode = mode;

    const modeLabels = {
      'normal': 'NORMAL',
      'insert': '-- INSERT --',
      'visual': '-- VISUAL --',
      'visual-line': '-- V-LINE --',
      'visual-block': '-- V-BLOCK --',
      'replace': '-- REPLACE --',
    };

    const modeColors = {
      'normal': 'var(--base0A)',      // Yellow
      'insert': 'var(--base0B)',      // Green
      'visual': 'var(--base0E)',      // Purple
      'visual-line': 'var(--base0E)', // Purple
      'visual-block': 'var(--base0E)', // Purple
      'replace': 'var(--base08)',     // Red
    };

    const label = modeLabels[mode] || mode.toUpperCase();
    const color = modeColors[mode] || 'var(--base05)';

    this.modeIndicator.textContent = label;
    this.modeIndicator.style.color = color;
    this.originalModeText = label;
  }

  /**
   * Update the cursor position display.
   * @param {number} line - Current line number (1-indexed)
   * @param {number} col - Current column number (1-indexed)
   */
  updatePosition(line, col) {
    this.positionInfo.textContent = `Ln ${line}, Col ${col}`;
  }

  /**
   * Show a temporary message in place of the mode indicator.
   * @param {string} message - Message to display
   * @param {number} duration - Duration in ms (0 = permanent until next update)
   */
  showMessage(message, duration = 3000) {
    // Clear any existing timeout
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
      this.messageTimeout = null;
    }

    // Store original and show message
    const originalText = this.modeIndicator.textContent;
    const originalColor = this.modeIndicator.style.color;

    this.modeIndicator.textContent = message;
    this.modeIndicator.style.color = 'var(--base04)';

    if (duration > 0) {
      this.messageTimeout = setTimeout(() => {
        this.modeIndicator.textContent = this.originalModeText || originalText;
        this.modeIndicator.style.color = originalColor;
        this.messageTimeout = null;
      }, duration);
    }
  }

  /**
   * Show the status line.
   */
  show() {
    this.element.style.display = 'flex';
  }

  /**
   * Hide the status line.
   */
  hide() {
    this.element.style.display = 'none';
  }

  /**
   * Get the status line element.
   */
  getElement() {
    return this.element;
  }

  /**
   * Destroy the status line.
   */
  destroy() {
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }
    this.element.remove();
  }
}
