/**
 * Outline Sidebar - displays markdown header hierarchy.
 * Clicking a header jumps to that location in the editor.
 */

/**
 * Parse markdown text and extract headers with their positions.
 * @param {string} text - Markdown text
 * @returns {Array<{level: number, text: string, line: number, offset: number}>}
 */
export function parseHeaders(text) {
  const headers = [];
  const lines = text.split('\n');
  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.+)$/);

    if (match) {
      headers.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i + 1,
        offset: offset,
      });
    }

    offset += line.length + 1; // +1 for newline
  }

  return headers;
}

export class OutlineSidebar {
  constructor(options) {
    this.container = options.container;
    this.onHeaderClick = options.onHeaderClick;
    this.collapsed = false;

    // Create sidebar element
    this.element = document.createElement('div');
    this.element.className = 'outline-sidebar';

    // Header with title and collapse button
    this.header = document.createElement('div');
    this.header.className = 'sidebar-header';

    const title = document.createElement('span');
    title.className = 'sidebar-title';
    title.textContent = 'Outline';
    this.header.appendChild(title);

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.className = 'sidebar-toggle';
    this.toggleBtn.innerHTML = '\u25C0'; // ◀
    this.toggleBtn.tabIndex = -1;
    this.toggleBtn.addEventListener('mousedown', (e) => e.preventDefault());
    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.header.appendChild(this.toggleBtn);

    this.element.appendChild(this.header);

    // Content area for header list
    this.content = document.createElement('div');
    this.content.className = 'sidebar-content';
    this.element.appendChild(this.content);

    this.container.appendChild(this.element);
  }

  /**
   * Update the outline with new headers.
   * @param {string} text - Markdown text
   */
  update(text) {
    const headers = parseHeaders(text);
    this.content.innerHTML = '';

    if (headers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'outline-empty';
      empty.textContent = 'No headers found';
      this.content.appendChild(empty);
      return;
    }

    // Level indicator colors using theme variables
    const levelColors = [
      'var(--base0A)', 'var(--base0B)', 'var(--base09)',
      'var(--base0D)', 'var(--base0E)', 'var(--base0C)'
    ];

    for (const header of headers) {
      const item = document.createElement('div');
      item.className = 'outline-item';
      item.style.paddingLeft = `${12 + (header.level - 1) * 12}px`;

      // Level indicator dot
      const indicator = document.createElement('span');
      indicator.className = 'outline-indicator';
      indicator.style.background = levelColors[(header.level - 1) % levelColors.length];
      item.appendChild(indicator);

      const text = document.createElement('span');
      text.textContent = header.text;
      item.appendChild(text);

      item.addEventListener('mousedown', (e) => e.preventDefault());
      item.addEventListener('click', () => {
        if (this.onHeaderClick) {
          this.onHeaderClick(header);
        }
      });

      this.content.appendChild(item);
    }
  }

  /**
   * Toggle sidebar collapsed state.
   */
  toggle() {
    this.collapsed = !this.collapsed;
    this.element.classList.toggle('collapsed', this.collapsed);

    if (this.collapsed) {
      this.toggleBtn.innerHTML = '\u2261'; // ≡
      this.toggleBtn.title = 'Show Outline';
    } else {
      this.toggleBtn.innerHTML = '\u25C0'; // ◀
      this.toggleBtn.title = 'Hide Outline';
    }
  }

  /**
   * Check if sidebar is collapsed.
   */
  isCollapsed() {
    return this.collapsed;
  }

  /**
   * Get the sidebar element.
   */
  getElement() {
    return this.element;
  }

  /**
   * Destroy the sidebar.
   */
  destroy() {
    this.element.remove();
  }
}
