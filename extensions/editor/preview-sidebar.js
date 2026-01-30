/**
 * Preview Sidebar - renders markdown content as HTML.
 */

/**
 * Escape HTML special characters.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Simple markdown renderer.
 * Supports: headers, bold, italic, code, links, lists, blockquotes, hr.
 * @param {string} text - Markdown text
 * @returns {string} - HTML string
 */
export function renderMarkdown(text) {
  let html = escapeHtml(text);

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">');

  // Horizontal rule
  html = html.replace(/^(---|\*\*\*|___)$/gm, '<hr>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/^[-*+] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+[.)] (.+)$/gm, '<li>$1</li>');

  // Paragraphs (lines that aren't already wrapped)
  const lines = html.split('\n');
  const result = [];
  let inParagraph = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBlock = /^<(h[1-6]|pre|ul|ol|li|blockquote|hr)/.test(line);
    const isEmpty = line.trim() === '';

    if (isBlock) {
      if (inParagraph) {
        result.push('</p>');
        inParagraph = false;
      }
      result.push(line);
    } else if (isEmpty) {
      if (inParagraph) {
        result.push('</p>');
        inParagraph = false;
      }
    } else {
      if (!inParagraph) {
        result.push('<p>');
        inParagraph = true;
      }
      result.push(line);
    }
  }

  if (inParagraph) {
    result.push('</p>');
  }

  return result.join('\n');
}

export class PreviewSidebar {
  constructor(options) {
    this.container = options.container;
    this.collapsed = false;

    // Create sidebar element
    this.element = document.createElement('div');
    this.element.className = 'preview-sidebar';

    // Header with title and collapse button
    this.header = document.createElement('div');
    this.header.className = 'sidebar-header';

    const title = document.createElement('span');
    title.className = 'sidebar-title';
    title.textContent = 'Preview';
    this.header.appendChild(title);

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.className = 'sidebar-toggle';
    this.toggleBtn.innerHTML = '\u25B6'; // ▶
    this.toggleBtn.tabIndex = -1;
    this.toggleBtn.addEventListener('mousedown', (e) => e.preventDefault());
    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.header.appendChild(this.toggleBtn);

    this.element.appendChild(this.header);

    // Content area for rendered preview
    this.content = document.createElement('div');
    this.content.className = 'preview-content';
    this.element.appendChild(this.content);

    this.container.appendChild(this.element);
  }

  /**
   * Update the preview with new markdown content.
   * @param {string} markdown
   */
  update(markdown) {
    this.content.innerHTML = renderMarkdown(markdown);
  }

  /**
   * Toggle sidebar collapsed state.
   */
  toggle() {
    this.collapsed = !this.collapsed;
    this.element.classList.toggle('collapsed', this.collapsed);

    if (this.collapsed) {
      this.toggleBtn.innerHTML = '\u25CE'; // ◎
      this.toggleBtn.title = 'Show Preview';
    } else {
      this.toggleBtn.innerHTML = '\u25B6'; // ▶
      this.toggleBtn.title = 'Hide Preview';
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
