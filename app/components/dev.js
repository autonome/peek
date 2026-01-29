/**
 * Peek Development Utilities
 *
 * Hot-reload, debugging, and development helpers.
 * Only import in development - tree-shake in production.
 *
 * Usage:
 *   import { enableHotReload, devTools } from 'peek://app/components/dev.js';
 *
 *   enableHotReload(); // Connect to dev server
 *   devTools.inspect('peek-button'); // Inspect component
 */

import { registry, getComponent, loadState } from './registry.js';
import { getTheme, getThemeTokens, getThemeNames } from './theme.js';
import { getExtensionIds, getExtension } from './extension.js';
import { version } from './version.js';

// Dev mode state
let isDevMode = false;
let hotReloadSocket = null;
const componentInstances = new WeakMap();

/**
 * Enable development mode
 */
export function enableDevMode() {
  isDevMode = true;

  // Add global debug object
  if (typeof window !== 'undefined') {
    window.__PEEK_DEV__ = {
      registry,
      theme: {
        current: getTheme,
        tokens: getThemeTokens,
        names: getThemeNames
      },
      extensions: {
        ids: getExtensionIds,
        get: getExtension
      },
      version,
      inspect: inspectComponent,
      listComponents: listComponents,
      stats: getStats
    };

    console.log(
      '%c🔍 Peek Dev Mode Enabled',
      'background: #007aff; color: white; padding: 4px 8px; border-radius: 4px;'
    );
    console.log('Access dev tools via window.__PEEK_DEV__');
  }
}

/**
 * Check if dev mode is enabled
 */
export function isDevModeEnabled() {
  return isDevMode;
}

/**
 * Enable hot-reload connection
 * @param {Object} options - Hot reload options
 * @param {string} options.url - WebSocket server URL
 * @param {number} options.reconnectDelay - Reconnection delay in ms
 */
export function enableHotReload(options = {}) {
  const {
    url = 'ws://localhost:35729/livereload',
    reconnectDelay = 1000
  } = options;

  if (typeof WebSocket === 'undefined') {
    console.warn('Hot-reload requires WebSocket support');
    return;
  }

  function connect() {
    try {
      hotReloadSocket = new WebSocket(url);

      hotReloadSocket.onopen = () => {
        console.log('%c🔥 Hot-reload connected', 'color: #28a745;');
      };

      hotReloadSocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleHotReloadMessage(message);
        } catch (e) {
          // Ignore non-JSON messages
        }
      };

      hotReloadSocket.onclose = () => {
        console.log('%c🔥 Hot-reload disconnected, reconnecting...', 'color: #ffc107;');
        setTimeout(connect, reconnectDelay);
      };

      hotReloadSocket.onerror = () => {
        hotReloadSocket.close();
      };
    } catch (e) {
      console.warn('Failed to connect to hot-reload server:', e);
      setTimeout(connect, reconnectDelay);
    }
  }

  connect();
  enableDevMode();
}

/**
 * Handle hot-reload messages
 */
function handleHotReloadMessage(message) {
  switch (message.command) {
    case 'reload':
      if (message.path?.endsWith('.css')) {
        reloadStyles(message.path);
      } else if (message.path?.endsWith('.js')) {
        reloadComponent(message.path);
      } else {
        // Full page reload
        location.reload();
      }
      break;

    case 'refresh-css':
      reloadAllStyles();
      break;

    case 'refresh-component':
      if (message.component) {
        reloadComponent(message.component);
      }
      break;
  }
}

/**
 * Reload CSS styles
 */
function reloadStyles(path) {
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  links.forEach(link => {
    if (link.href.includes(path)) {
      const url = new URL(link.href);
      url.searchParams.set('_reload', Date.now());
      link.href = url.toString();
    }
  });

  console.log(`%c🔄 Reloaded styles: ${path}`, 'color: #17a2b8;');
}

/**
 * Reload all styles
 */
function reloadAllStyles() {
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  links.forEach(link => {
    const url = new URL(link.href);
    url.searchParams.set('_reload', Date.now());
    link.href = url.toString();
  });

  // Also reload peek theme styles
  const peekStyles = document.querySelectorAll('style[data-peek-theme]');
  peekStyles.forEach(style => {
    // Re-inject theme
    const theme = style.dataset.peekTheme;
    if (theme) {
      import('./theme.js').then(({ injectThemeCSS }) => {
        style.remove();
        injectThemeCSS(theme, document);
      });
    }
  });

  console.log('%c🔄 Reloaded all styles', 'color: #17a2b8;');
}

/**
 * Reload a component module
 * Note: Full module hot-reload requires native import.meta.hot support
 */
async function reloadComponent(pathOrName) {
  // Extract component name from path
  const name = pathOrName.includes('/')
    ? pathOrName.split('/').pop().replace('.js', '')
    : pathOrName;

  console.log(`%c🔄 Component changed: ${name}`, 'color: #17a2b8;');

  // For now, suggest full reload - true HMR requires bundler support
  console.log('Full hot-reload for components requires page refresh or bundler HMR support');
}

/**
 * Inspect a component
 * @param {string|HTMLElement} target - Component name or instance
 */
export function inspectComponent(target) {
  let element;
  let name;

  if (typeof target === 'string') {
    name = target;
    element = document.querySelector(target);
  } else {
    element = target;
    name = element?.tagName?.toLowerCase();
  }

  const def = getComponent(name);
  const state = loadState.get(name);

  const info = {
    name,
    definition: def,
    loadState: state,
    element: element || null,
    properties: {},
    attributes: {},
    shadowRoot: null
  };

  if (element) {
    // Get properties
    const proto = Object.getPrototypeOf(element);
    const propNames = Object.keys(element.constructor.properties || {});
    propNames.forEach(prop => {
      info.properties[prop] = element[prop];
    });

    // Get attributes
    Array.from(element.attributes).forEach(attr => {
      info.attributes[attr.name] = attr.value;
    });

    // Shadow root info
    if (element.shadowRoot) {
      info.shadowRoot = {
        mode: element.shadowRoot.mode,
        childCount: element.shadowRoot.childElementCount,
        styles: element.shadowRoot.querySelectorAll('style').length
      };
    }
  }

  console.group(`🔍 Component: ${name}`);
  console.log('Definition:', info.definition);
  console.log('Load state:', info.loadState);
  console.log('Properties:', info.properties);
  console.log('Attributes:', info.attributes);
  console.log('Shadow root:', info.shadowRoot);
  if (element) console.log('Element:', element);
  console.groupEnd();

  return info;
}

/**
 * List all components and their states
 */
export function listComponents() {
  const names = registry.names();
  const components = names.map(name => ({
    name,
    state: loadState.get(name),
    defined: !!customElements.get(name),
    instances: document.querySelectorAll(name).length
  }));

  console.table(components);
  return components;
}

/**
 * Get development statistics
 */
export function getStats() {
  return {
    version: version.current,
    components: registry.stats(),
    theme: getTheme(),
    extensions: getExtensionIds().length,
    devMode: isDevMode,
    hotReload: !!hotReloadSocket
  };
}

/**
 * Performance timing for component rendering
 */
const renderTimings = new Map();

/**
 * Start timing a component render
 */
export function startTiming(componentName) {
  renderTimings.set(componentName, performance.now());
}

/**
 * End timing and log result
 */
export function endTiming(componentName) {
  const start = renderTimings.get(componentName);
  if (start) {
    const duration = performance.now() - start;
    renderTimings.delete(componentName);

    if (duration > 16) { // Longer than one frame
      console.warn(`⚠️ Slow render: ${componentName} took ${duration.toFixed(2)}ms`);
    }

    return duration;
  }
  return 0;
}

/**
 * Component render profiler mixin
 */
export function ProfilerMixin(Base) {
  return class extends Base {
    performUpdate() {
      startTiming(this.tagName.toLowerCase());
      super.performUpdate();
      endTiming(this.tagName.toLowerCase());
    }
  };
}

/**
 * Debug logger with component context
 */
export function createLogger(componentName) {
  const prefix = `[${componentName}]`;
  return {
    log: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
    debug: (...args) => isDevMode && console.debug(prefix, ...args),
    group: (label) => console.group(`${prefix} ${label}`),
    groupEnd: () => console.groupEnd(),
    time: (label) => console.time(`${prefix} ${label}`),
    timeEnd: (label) => console.timeEnd(`${prefix} ${label}`)
  };
}

/**
 * Dev tools object for console access
 */
export const devTools = {
  enable: enableDevMode,
  hotReload: enableHotReload,
  inspect: inspectComponent,
  list: listComponents,
  stats: getStats,
  timing: { start: startTiming, end: endTiming },
  logger: createLogger,
  ProfilerMixin
};

export default devTools;
