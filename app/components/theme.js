/**
 * Peek Theme System
 *
 * Theme registration, switching, and token inheritance for extensions.
 *
 * Usage:
 *   import { registerTheme, setTheme, getTheme, ThemeMixin } from 'peek://app/components/theme.js';
 *
 *   // Register a custom theme
 *   registerTheme('dark', {
 *     'theme-bg': '#1a1a1a',
 *     'theme-text': '#ffffff',
 *     'theme-accent': '#4dabf7'
 *   });
 *
 *   // Switch themes
 *   setTheme('dark');
 *
 *   // Extend base theme with custom tokens
 *   registerTheme('brand', {
 *     'theme-accent': '#ff6b35',
 *     'peek-btn-radius': '999px'
 *   }, { extends: 'light' });
 */

// Default theme tokens
const DEFAULT_TOKENS = {
  // Theme colors
  'theme-bg': '#ffffff',
  'theme-bg-secondary': '#fafafa',
  'theme-bg-tertiary': '#f5f5f5',
  'theme-text': '#333333',
  'theme-text-secondary': '#666666',
  'theme-text-muted': '#999999',
  'theme-accent': '#007aff',
  'theme-accent-hover': '#0056b3',
  'theme-border': '#e0e0e0',
  'theme-danger': '#dc3545',
  'theme-success': '#28a745',
  'theme-warning': '#ffc107',

  // Component spacing
  'peek-space-xs': '4px',
  'peek-space-sm': '8px',
  'peek-space-md': '12px',
  'peek-space-lg': '16px',
  'peek-space-xl': '24px',

  // Border radius
  'peek-radius-sm': '4px',
  'peek-radius-md': '6px',
  'peek-radius-lg': '8px',

  // Typography
  'peek-font-sm': '13px',
  'peek-font-md': '14px',
  'peek-font-lg': '16px',
  'peek-font-medium': '500',
  'peek-font-semibold': '600',

  // Shadows
  'peek-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
  'peek-shadow-md': '0 2px 4px rgba(0, 0, 0, 0.1)',
  'peek-shadow-lg': '0 4px 12px rgba(0, 0, 0, 0.15)',

  // Transitions
  'peek-transition-fast': '100ms ease',
  'peek-transition-normal': '150ms ease',

  // Button heights
  'peek-btn-height-sm': '28px',
  'peek-btn-height-md': '36px',
  'peek-btn-height-lg': '44px',

  // Focus ring
  'peek-focus-ring': '0 0 0 2px rgba(0, 122, 255, 0.3)'
};

// Built-in dark theme
const DARK_TOKENS = {
  'theme-bg': '#1a1a1a',
  'theme-bg-secondary': '#242424',
  'theme-bg-tertiary': '#2e2e2e',
  'theme-text': '#ffffff',
  'theme-text-secondary': '#b0b0b0',
  'theme-text-muted': '#808080',
  'theme-border': '#3a3a3a',
  'peek-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.3)',
  'peek-shadow-md': '0 2px 4px rgba(0, 0, 0, 0.4)',
  'peek-shadow-lg': '0 4px 12px rgba(0, 0, 0, 0.5)'
};

// Theme registry
const themes = new Map();
themes.set('light', { tokens: { ...DEFAULT_TOKENS }, extends: null });
themes.set('dark', { tokens: { ...DARK_TOKENS }, extends: 'light' });

// Current theme state
let currentTheme = 'light';
const themeListeners = new Set();

/**
 * Register a custom theme
 * @param {string} name - Theme name
 * @param {Object} tokens - CSS custom property values (without -- prefix)
 * @param {Object} options - Options
 * @param {string} options.extends - Base theme to extend
 */
export function registerTheme(name, tokens, options = {}) {
  if (typeof name !== 'string' || !name) {
    throw new Error('Theme name must be a non-empty string');
  }

  const { extends: baseTheme = 'light' } = options;

  // Validate base theme exists
  if (baseTheme && !themes.has(baseTheme)) {
    throw new Error(`Base theme '${baseTheme}' does not exist`);
  }

  themes.set(name, {
    tokens: { ...tokens },
    extends: baseTheme
  });

  // If this is the current theme, re-apply it
  if (currentTheme === name) {
    applyTheme(name);
  }

  return true;
}

/**
 * Unregister a theme
 * @param {string} name - Theme name (cannot unregister built-in themes)
 */
export function unregisterTheme(name) {
  if (name === 'light' || name === 'dark') {
    throw new Error('Cannot unregister built-in themes');
  }

  if (currentTheme === name) {
    setTheme('light');
  }

  return themes.delete(name);
}

/**
 * Get all registered theme names
 * @returns {string[]}
 */
export function getThemeNames() {
  return Array.from(themes.keys());
}

/**
 * Get the current theme name
 * @returns {string}
 */
export function getTheme() {
  return currentTheme;
}

/**
 * Get resolved tokens for a theme (with inheritance)
 * @param {string} name - Theme name
 * @returns {Object} Resolved token values
 */
export function getThemeTokens(name) {
  const theme = themes.get(name);
  if (!theme) {
    throw new Error(`Theme '${name}' does not exist`);
  }

  // Build token chain from inheritance
  const tokenChain = [];
  let current = name;

  while (current) {
    const t = themes.get(current);
    if (t) {
      tokenChain.unshift(t.tokens);
      current = t.extends;
    } else {
      break;
    }
  }

  // Merge tokens (later overrides earlier)
  return Object.assign({}, ...tokenChain);
}

/**
 * Set and apply a theme
 * @param {string} name - Theme name
 * @param {Element} target - Target element (default: document.documentElement)
 */
export function setTheme(name, target = document.documentElement) {
  if (!themes.has(name)) {
    throw new Error(`Theme '${name}' does not exist`);
  }

  const previousTheme = currentTheme;
  currentTheme = name;

  applyTheme(name, target);

  // Notify listeners
  themeListeners.forEach(listener => {
    try {
      listener({ theme: name, previousTheme });
    } catch (e) {
      console.error('Theme listener error:', e);
    }
  });
}

/**
 * Apply theme tokens to a target element
 * @param {string} name - Theme name
 * @param {Element} target - Target element
 */
export function applyTheme(name, target = document.documentElement) {
  const tokens = getThemeTokens(name);

  Object.entries(tokens).forEach(([key, value]) => {
    target.style.setProperty(`--${key}`, value);
  });

  // Set data attribute for CSS selectors
  target.dataset.theme = name;
}

/**
 * Remove theme from a target element
 * @param {Element} target - Target element
 */
export function clearTheme(target = document.documentElement) {
  const tokens = getThemeTokens(currentTheme);

  Object.keys(tokens).forEach(key => {
    target.style.removeProperty(`--${key}`);
  });

  delete target.dataset.theme;
}

/**
 * Subscribe to theme changes
 * @param {Function} listener - Callback: ({ theme, previousTheme }) => void
 * @returns {Function} Unsubscribe function
 */
export function onThemeChange(listener) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

/**
 * Get a specific token value
 * @param {string} token - Token name (without -- prefix)
 * @param {string} theme - Theme name (default: current theme)
 * @returns {string|undefined}
 */
export function getToken(token, theme = currentTheme) {
  const tokens = getThemeTokens(theme);
  return tokens[token];
}

/**
 * Set a single token value at runtime
 * @param {string} token - Token name (without -- prefix)
 * @param {string} value - Token value
 * @param {Element} target - Target element
 */
export function setToken(token, value, target = document.documentElement) {
  target.style.setProperty(`--${token}`, value);
}

/**
 * Generate CSS string for a theme
 * @param {string} name - Theme name
 * @param {string} selector - CSS selector (default: ':root')
 * @returns {string} CSS string
 */
export function generateThemeCSS(name, selector = ':root') {
  const tokens = getThemeTokens(name);
  const props = Object.entries(tokens)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join('\n');

  return `${selector} {\n${props}\n}`;
}

/**
 * Inject theme CSS into a document or shadow root
 * Useful for content scripts and isolated contexts
 * @param {string} name - Theme name
 * @param {Document|ShadowRoot} root - Target root
 * @param {string} selector - CSS selector
 * @returns {HTMLStyleElement} The injected style element
 */
export function injectThemeCSS(name, root = document, selector = ':root') {
  const css = generateThemeCSS(name, selector);
  const style = root.createElement ? root.createElement('style') : document.createElement('style');
  style.textContent = css;
  style.dataset.peekTheme = name;

  const target = root.head || root;
  target.appendChild(style);

  return style;
}

/**
 * Create a scoped theme for a specific element
 * @param {Element} element - Target element
 * @param {Object} tokens - Token overrides
 * @returns {Function} Cleanup function
 */
export function scopedTheme(element, tokens) {
  Object.entries(tokens).forEach(([key, value]) => {
    element.style.setProperty(`--${key}`, value);
  });

  return () => {
    Object.keys(tokens).forEach(key => {
      element.style.removeProperty(`--${key}`);
    });
  };
}

/**
 * Mixin for components that need theme awareness
 * @param {Class} Base - Base class to extend
 * @returns {Class} Extended class with theme support
 */
export function ThemeMixin(Base) {
  return class extends Base {
    constructor() {
      super();
      this._themeUnsubscribe = null;
    }

    connectedCallback() {
      super.connectedCallback?.();
      this._themeUnsubscribe = onThemeChange(() => this.requestUpdate?.());
    }

    disconnectedCallback() {
      super.disconnectedCallback?.();
      this._themeUnsubscribe?.();
      this._themeUnsubscribe = null;
    }

    get currentTheme() {
      return getTheme();
    }

    getToken(name) {
      return getToken(name);
    }
  };
}

/**
 * Detect system color scheme preference
 * @returns {'light' | 'dark'}
 */
export function getSystemTheme() {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

/**
 * Auto-switch theme based on system preference
 * @returns {Function} Cleanup function
 */
export function followSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handler = (e) => {
    setTheme(e.matches ? 'dark' : 'light');
  };

  // Set initial theme
  handler(mediaQuery);

  // Listen for changes
  mediaQuery.addEventListener('change', handler);

  return () => mediaQuery.removeEventListener('change', handler);
}

// Export default tokens for reference
export const defaultTokens = { ...DEFAULT_TOKENS };
export const darkTokens = { ...DARK_TOKENS };
