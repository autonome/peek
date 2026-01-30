/**
 * Editor Layout - Three-panel markdown editor.
 * Combines outline sidebar, CodeMirror editor, and preview sidebar.
 * Resizable panels with vim mode support.
 */

import { OutlineSidebar } from './outline-sidebar.js';
import { PreviewSidebar } from './preview-sidebar.js';
import * as CodeMirror from './codemirror.js';

export class EditorLayout {
  constructor(options) {
    this.container = options.container;
    this.onContentChange = options.onContentChange;
    this.initialContent = options.initialContent || '';
    this.vimMode = options.vimMode || false;

    this.outlineSidebar = null;
    this.previewSidebar = null;
    this.cmEditor = null;
    this.lastContent = '';
    this.rafId = null;
    this.isDestroyed = false;
    this.isFocusMode = false;
    this.originalContainerStyles = '';

    this.init();
  }

  init() {
    // Create main wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'editor-layout';

    // Create outline sidebar (left)
    this.outlineSidebar = new OutlineSidebar({
      container: this.wrapper,
      onHeaderClick: (header) => this.jumpToHeader(header),
    });

    // Create left resizer
    this.leftResizer = this.createResizer('left');
    this.wrapper.appendChild(this.leftResizer);

    // Create editor container (center)
    this.editorContainer = document.createElement('div');
    this.editorContainer.className = 'editor-container';

    // CodeMirror container
    this.cmContainer = document.createElement('div');
    this.cmContainer.className = 'cm-container';
    this.editorContainer.appendChild(this.cmContainer);

    // Toolbar below editor
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'editor-toolbar';

    // Vim mode toggle
    this.vimToggle = document.createElement('label');
    this.vimToggle.className = 'vim-toggle';

    this.vimCheckbox = document.createElement('input');
    this.vimCheckbox.type = 'checkbox';
    this.vimCheckbox.checked = this.vimMode;
    this.vimCheckbox.addEventListener('change', () => this.handleVimToggle());

    const vimLabel = document.createElement('span');
    vimLabel.textContent = 'Vim';

    this.vimToggle.appendChild(this.vimCheckbox);
    this.vimToggle.appendChild(vimLabel);
    this.toolbar.appendChild(this.vimToggle);

    // Sidebar toggles
    const sidebarToggles = document.createElement('div');
    sidebarToggles.className = 'sidebar-toggles';

    this.outlineToggleBtn = document.createElement('button');
    this.outlineToggleBtn.className = 'toolbar-btn';
    this.outlineToggleBtn.textContent = 'Outline';
    this.outlineToggleBtn.title = 'Toggle outline sidebar (Cmd+Shift+O)';
    this.outlineToggleBtn.addEventListener('click', () => this.toggleOutline());
    sidebarToggles.appendChild(this.outlineToggleBtn);

    this.previewToggleBtn = document.createElement('button');
    this.previewToggleBtn.className = 'toolbar-btn';
    this.previewToggleBtn.textContent = 'Preview';
    this.previewToggleBtn.title = 'Toggle preview sidebar (Cmd+Shift+P)';
    this.previewToggleBtn.addEventListener('click', () => this.togglePreview());
    sidebarToggles.appendChild(this.previewToggleBtn);

    this.focusBtn = document.createElement('button');
    this.focusBtn.className = 'toolbar-btn';
    this.focusBtn.textContent = 'Focus';
    this.focusBtn.title = 'Toggle focus mode (Escape to exit)';
    this.focusBtn.addEventListener('click', () => this.toggleFocusMode());
    sidebarToggles.appendChild(this.focusBtn);

    this.toolbar.appendChild(sidebarToggles);
    this.editorContainer.appendChild(this.toolbar);

    this.wrapper.appendChild(this.editorContainer);

    // Create right resizer
    this.rightResizer = this.createResizer('right');
    this.wrapper.appendChild(this.rightResizer);

    // Create preview sidebar (right)
    this.previewSidebar = new PreviewSidebar({
      container: this.wrapper,
    });

    this.container.appendChild(this.wrapper);

    // Initialize CodeMirror
    this.cmEditor = CodeMirror.createEditor({
      parent: this.cmContainer,
      content: this.initialContent,
      vimMode: this.vimMode,
      showLineNumbers: true,
      onChange: (content) => this.handleContentChange(content),
    });

    // Default sidebars to collapsed
    this.outlineSidebar.toggle();
    this.previewSidebar.toggle();

    // Initial update
    this.lastContent = this.initialContent;
    this.updateSidebars();

    // Start watching for changes (throttled updates)
    this.startWatching();

    // Set up keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Focus editor
    setTimeout(() => {
      if (this.cmEditor) CodeMirror.focus(this.cmEditor);
    }, 100);
  }

  createResizer(side) {
    const resizer = document.createElement('div');
    resizer.className = `resizer resizer-${side}`;

    const indicator = document.createElement('div');
    indicator.className = 'resizer-indicator';
    resizer.appendChild(indicator);

    resizer.addEventListener('mouseenter', () => {
      indicator.classList.add('visible');
    });

    resizer.addEventListener('mouseleave', () => {
      if (!resizer.classList.contains('dragging')) {
        indicator.classList.remove('visible');
      }
    });

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      indicator.classList.add('visible');
      this.startResize(side, e, indicator);
    });

    return resizer;
  }

  startResize(side, startEvent, indicator) {
    const resizer = side === 'left' ? this.leftResizer : this.rightResizer;
    const target = side === 'left'
      ? this.outlineSidebar.getElement()
      : this.previewSidebar.getElement();

    if (!resizer || !target) return;

    resizer.classList.add('dragging');

    const startX = startEvent.clientX;
    const startWidth = target.offsetWidth;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (e) => {
      const delta = side === 'left'
        ? e.clientX - startX
        : startX - e.clientX;

      const newWidth = Math.max(100, Math.min(600, startWidth + delta));
      target.style.width = `${newWidth}px`;
      target.style.minWidth = `${newWidth}px`;
    };

    const onMouseUp = () => {
      resizer.classList.remove('dragging');
      indicator.classList.remove('visible');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Cmd+Shift+O: Toggle outline
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'o') {
        e.preventDefault();
        this.toggleOutline();
      }
      // Cmd+Shift+P: Toggle preview
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'p') {
        e.preventDefault();
        this.togglePreview();
      }
      // Escape: Exit focus mode
      if (e.key === 'Escape' && this.isFocusMode) {
        this.exitFocusMode();
      }
    });
  }

  startWatching() {
    const check = () => {
      if (this.isDestroyed) return;

      const currentContent = this.getContent();
      if (currentContent !== this.lastContent) {
        this.lastContent = currentContent;
        this.updateSidebars();
      }

      this.rafId = requestAnimationFrame(check);
    };

    this.rafId = requestAnimationFrame(check);
  }

  stopWatching() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  updateSidebars() {
    const content = this.lastContent;

    if (this.outlineSidebar) {
      this.outlineSidebar.update(content);
    }

    if (this.previewSidebar) {
      this.previewSidebar.update(content);
    }
  }

  handleContentChange(content) {
    this.lastContent = content;
    this.updateSidebars();

    if (this.onContentChange) {
      this.onContentChange(content);
    }
  }

  handleVimToggle() {
    this.vimMode = this.vimCheckbox.checked;
    if (this.cmEditor) {
      CodeMirror.setVimMode(this.cmEditor, this.vimMode);
    }
  }

  jumpToHeader(header) {
    if (!this.cmEditor) return;

    // Set cursor position to the header's offset
    const view = this.cmEditor;
    view.dispatch({
      selection: { anchor: header.offset },
      scrollIntoView: true,
    });
    CodeMirror.focus(view);
  }

  /**
   * Get the current content.
   */
  getContent() {
    if (this.cmEditor) {
      return CodeMirror.getContent(this.cmEditor);
    }
    return this.lastContent;
  }

  /**
   * Set the editor content.
   */
  setContent(content) {
    if (this.cmEditor) {
      CodeMirror.setContent(this.cmEditor, content);
    }
    this.lastContent = content;
    this.updateSidebars();
  }

  /**
   * Toggle outline sidebar.
   */
  toggleOutline() {
    if (this.outlineSidebar) {
      this.outlineSidebar.toggle();
      this.outlineToggleBtn.classList.toggle('active', !this.outlineSidebar.isCollapsed());
    }
  }

  /**
   * Toggle preview sidebar.
   */
  togglePreview() {
    if (this.previewSidebar) {
      this.previewSidebar.toggle();
      this.previewToggleBtn.classList.toggle('active', !this.previewSidebar.isCollapsed());
    }
  }

  /**
   * Enter focus mode - expand editor to fill viewport.
   */
  enterFocusMode() {
    if (this.isFocusMode) return;

    this.isFocusMode = true;
    this.originalContainerStyles = this.container.style.cssText;
    this.wrapper.classList.add('focus-mode');
    this.focusBtn.classList.add('active');

    // Hide sidebars and resizers
    if (this.outlineSidebar) {
      this.outlineSidebar.getElement().style.display = 'none';
    }
    if (this.previewSidebar) {
      this.previewSidebar.getElement().style.display = 'none';
    }
    if (this.leftResizer) {
      this.leftResizer.style.display = 'none';
    }
    if (this.rightResizer) {
      this.rightResizer.style.display = 'none';
    }

    if (this.cmEditor) CodeMirror.focus(this.cmEditor);
  }

  /**
   * Exit focus mode.
   */
  exitFocusMode() {
    if (!this.isFocusMode) return;

    this.isFocusMode = false;
    this.container.style.cssText = this.originalContainerStyles;
    this.wrapper.classList.remove('focus-mode');
    this.focusBtn.classList.remove('active');

    // Restore sidebars and resizers
    if (this.outlineSidebar) {
      this.outlineSidebar.getElement().style.display = '';
    }
    if (this.previewSidebar) {
      this.previewSidebar.getElement().style.display = '';
    }
    if (this.leftResizer) {
      this.leftResizer.style.display = '';
    }
    if (this.rightResizer) {
      this.rightResizer.style.display = '';
    }

    if (this.cmEditor) CodeMirror.focus(this.cmEditor);
  }

  /**
   * Toggle focus mode.
   */
  toggleFocusMode() {
    if (this.isFocusMode) {
      this.exitFocusMode();
    } else {
      this.enterFocusMode();
    }
  }

  /**
   * Check if in focus mode.
   */
  isInFocusMode() {
    return this.isFocusMode;
  }

  /**
   * Set vim mode.
   */
  setVimMode(enabled) {
    this.vimMode = enabled;
    this.vimCheckbox.checked = enabled;
    if (this.cmEditor) {
      CodeMirror.setVimMode(this.cmEditor, enabled);
    }
  }

  /**
   * Get vim mode state.
   */
  getVimMode() {
    return this.vimMode;
  }

  /**
   * Focus the editor.
   */
  focus() {
    if (this.cmEditor) {
      CodeMirror.focus(this.cmEditor);
    }
  }

  /**
   * Destroy the layout and clean up.
   */
  destroy() {
    this.isDestroyed = true;
    this.stopWatching();

    if (this.isFocusMode) {
      this.exitFocusMode();
    }

    if (this.cmEditor) {
      CodeMirror.destroy(this.cmEditor);
      this.cmEditor = null;
    }

    this.outlineSidebar?.destroy();
    this.previewSidebar?.destroy();
    this.wrapper.remove();
  }
}
