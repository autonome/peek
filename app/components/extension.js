/**
 * Peek Extension System
 *
 * Extension registration, component loading, and CSS injection for content scripts.
 *
 * Usage:
 *   import { registerExtension, injectStyles, ExtensionContext } from 'peek://app/components/extension.js';
 *
 *   // Register an extension with custom theme tokens
 *   const ext = registerExtension('my-extension', {
 *     theme: {
 *       'theme-accent': '#ff6b35',
 *       'peek-card-bg': '#fafafa'
 *     }
 *   });
 *
 *   // Inject component styles into content script context
 *   ext.injectStyles(document);
 *
 *   // Create scoped component container
 *   const container = ext.createContainer();
 */

import { registerTheme, getThemeTokens, generateThemeCSS, getTheme } from './theme.js';

// Extension registry
const extensions = new Map();

// Component stylesheets cache
const componentStyles = new Map();

/**
 * Register component styles for injection
 * Called internally by components or manually for custom components
 * @param {string} name - Component name (e.g., 'peek-button')
 * @param {string} css - Component CSS
 */
export function registerComponentStyles(name, css) {
  componentStyles.set(name, css);
}

/**
 * Get all registered component styles
 * @returns {Map<string, string>}
 */
export function getComponentStyles() {
  return new Map(componentStyles);
}

/**
 * Generate combined CSS for all components
 * @param {string[]} components - Optional specific components (default: all)
 * @returns {string}
 */
export function generateComponentCSS(components = null) {
  const styles = [];

  if (components) {
    components.forEach(name => {
      const css = componentStyles.get(name);
      if (css) styles.push(css);
    });
  } else {
    componentStyles.forEach(css => styles.push(css));
  }

  return styles.join('\n\n');
}

/**
 * Extension context for managing extension-specific resources
 */
export class ExtensionContext {
  constructor(id, options = {}) {
    this.id = id;
    this.options = options;
    this._injectedStyles = new Set();
    this._containers = new Set();
    this._themeId = `${id}-theme`;

    // Register extension-specific theme if provided
    if (options.theme) {
      registerTheme(this._themeId, options.theme, {
        extends: options.extendsTheme || getTheme()
      });
    }
  }

  /**
   * Inject Peek component styles into a document or shadow root
   * @param {Document|ShadowRoot} root - Target root
   * @param {Object} options - Injection options
   * @param {string[]} options.components - Specific components to inject
   * @param {boolean} options.includeTheme - Include theme CSS (default: true)
   * @returns {HTMLStyleElement} The injected style element
   */
  injectStyles(root, options = {}) {
    const { components = null, includeTheme = true } = options;

    const styles = [];

    // Add theme CSS
    if (includeTheme) {
      const themeId = this.options.theme ? this._themeId : getTheme();
      styles.push(generateThemeCSS(themeId, ':host, :root'));
    }

    // Add component CSS
    styles.push(generateComponentCSS(components));

    // Create and inject style element
    const doc = root.ownerDocument || root;
    const style = doc.createElement('style');
    style.textContent = styles.join('\n\n');
    style.dataset.peekExtension = this.id;

    const target = root.head || root;
    target.appendChild(style);

    this._injectedStyles.add(style);
    return style;
  }

  /**
   * Create a scoped container for Peek components
   * Useful for content scripts to isolate styles
   * @param {Object} options - Container options
   * @param {boolean} options.useShadow - Use Shadow DOM for isolation (default: true)
   * @param {Element} options.parent - Parent element (default: document.body)
   * @returns {Element} The container element (shadow root if useShadow)
   */
  createContainer(options = {}) {
    const { useShadow = true, parent = document.body } = options;

    const wrapper = document.createElement('div');
    wrapper.dataset.peekExtension = this.id;
    wrapper.style.cssText = 'all: initial;'; // Reset inherited styles

    if (useShadow) {
      const shadow = wrapper.attachShadow({ mode: 'open' });
      this.injectStyles(shadow);
      parent.appendChild(wrapper);
      this._containers.add(wrapper);
      return shadow;
    } else {
      parent.appendChild(wrapper);
      this._containers.add(wrapper);
      return wrapper;
    }
  }

  /**
   * Set extension-specific token override
   * @param {string} token - Token name
   * @param {string} value - Token value
   */
  setToken(token, value) {
    this._containers.forEach(container => {
      const target = container.shadowRoot || container;
      target.host?.style.setProperty(`--${token}`, value);
    });
  }

  /**
   * Get current theme tokens with extension overrides
   * @returns {Object}
   */
  getTokens() {
    const themeId = this.options.theme ? this._themeId : getTheme();
    return getThemeTokens(themeId);
  }

  /**
   * Clean up all injected styles and containers
   */
  destroy() {
    this._injectedStyles.forEach(style => style.remove());
    this._injectedStyles.clear();

    this._containers.forEach(container => container.remove());
    this._containers.clear();

    extensions.delete(this.id);
  }
}

/**
 * Register a new extension
 * @param {string} id - Unique extension ID
 * @param {Object} options - Extension options
 * @param {Object} options.theme - Custom theme tokens
 * @param {string} options.extendsTheme - Base theme to extend
 * @returns {ExtensionContext}
 */
export function registerExtension(id, options = {}) {
  if (extensions.has(id)) {
    console.warn(`Extension '${id}' already registered, returning existing context`);
    return extensions.get(id);
  }

  const context = new ExtensionContext(id, options);
  extensions.set(id, context);
  return context;
}

/**
 * Get an existing extension context
 * @param {string} id - Extension ID
 * @returns {ExtensionContext|undefined}
 */
export function getExtension(id) {
  return extensions.get(id);
}

/**
 * Unregister an extension and clean up resources
 * @param {string} id - Extension ID
 */
export function unregisterExtension(id) {
  const ext = extensions.get(id);
  if (ext) {
    ext.destroy();
  }
}

/**
 * Get all registered extension IDs
 * @returns {string[]}
 */
export function getExtensionIds() {
  return Array.from(extensions.keys());
}

/**
 * Quick style injection for simple use cases
 * @param {Document|ShadowRoot} root - Target root
 * @param {Object} options - Options
 * @returns {HTMLStyleElement}
 */
export function injectStyles(root, options = {}) {
  const tempContext = new ExtensionContext('_temp_inject', options);
  const style = tempContext.injectStyles(root, options);
  // Don't track in registry for temp injection
  return style;
}

/**
 * Create a standalone scoped container
 * @param {Object} options - Container options
 * @returns {Element}
 */
export function createContainer(options = {}) {
  const tempContext = new ExtensionContext('_temp_container', options);
  return tempContext.createContainer(options);
}

/**
 * Content script helper - wraps entire injection workflow
 * @param {Object} config - Configuration
 * @param {string} config.id - Extension ID
 * @param {Object} config.theme - Custom theme tokens
 * @param {Function} config.render - Render function: (container) => void
 * @param {Element} config.parent - Parent element
 * @returns {Object} - { container, context, destroy }
 */
export function initContentScript(config) {
  const { id, theme, render, parent = document.body } = config;

  const context = registerExtension(id, { theme });
  const container = context.createContainer({ parent });

  if (render) {
    render(container);
  }

  return {
    container,
    context,
    destroy: () => context.destroy()
  };
}

/**
 * Popup/sidebar helper - injects styles into popup document
 * @param {Object} config - Configuration
 * @param {string} config.id - Extension ID
 * @param {Object} config.theme - Custom theme tokens
 * @param {Document} config.document - Popup document (default: window.document)
 * @returns {ExtensionContext}
 */
export function initPopup(config) {
  const { id, theme, document: doc = document } = config;

  const context = registerExtension(id, { theme });
  context.injectStyles(doc, { includeTheme: true });

  return context;
}
