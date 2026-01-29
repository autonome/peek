/**
 * Peek Component Registry
 *
 * Dynamic component registration, discovery, and lazy loading.
 *
 * Usage:
 *   import { registry, defineComponent, loadComponent } from 'peek://app/components/registry.js';
 *
 *   // Register a component
 *   defineComponent('peek-custom', {
 *     version: '1.0.0',
 *     module: () => import('./peek-custom.js'),
 *     dependencies: ['peek-button']
 *   });
 *
 *   // Load component on demand
 *   await loadComponent('peek-custom');
 *
 *   // Check if registered
 *   registry.has('peek-custom');
 */

// Component metadata registry
const componentRegistry = new Map();

// Load state tracking
const loadState = new Map(); // 'pending' | 'loading' | 'loaded' | 'error'
const loadPromises = new Map();

// Version info
const REGISTRY_VERSION = '1.0.0';

/**
 * Component definition interface
 * @typedef {Object} ComponentDefinition
 * @property {string} version - Semantic version
 * @property {Function} module - Dynamic import function
 * @property {string[]} [dependencies] - Required component names
 * @property {string} [description] - Component description
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * Define/register a component
 * @param {string} name - Component tag name (e.g., 'peek-button')
 * @param {ComponentDefinition} definition - Component definition
 */
export function defineComponent(name, definition) {
  if (!name || typeof name !== 'string') {
    throw new Error('Component name must be a non-empty string');
  }

  if (!definition.module || typeof definition.module !== 'function') {
    throw new Error('Component definition must include a module loader function');
  }

  const def = {
    name,
    version: definition.version || '0.0.0',
    module: definition.module,
    dependencies: definition.dependencies || [],
    description: definition.description || '',
    metadata: definition.metadata || {},
    registeredAt: Date.now()
  };

  componentRegistry.set(name, def);
  loadState.set(name, 'pending');

  return def;
}

/**
 * Unregister a component
 * @param {string} name - Component name
 */
export function undefineComponent(name) {
  componentRegistry.delete(name);
  loadState.delete(name);
  loadPromises.delete(name);
}

/**
 * Check if a component is registered
 * @param {string} name - Component name
 * @returns {boolean}
 */
export function hasComponent(name) {
  return componentRegistry.has(name);
}

/**
 * Get component definition
 * @param {string} name - Component name
 * @returns {ComponentDefinition|undefined}
 */
export function getComponent(name) {
  return componentRegistry.get(name);
}

/**
 * Get all registered component names
 * @returns {string[]}
 */
export function getComponentNames() {
  return Array.from(componentRegistry.keys());
}

/**
 * Get component load state
 * @param {string} name - Component name
 * @returns {'pending'|'loading'|'loaded'|'error'|undefined}
 */
export function getLoadState(name) {
  return loadState.get(name);
}

/**
 * Load a component and its dependencies
 * @param {string} name - Component name
 * @returns {Promise<void>}
 */
export async function loadComponent(name) {
  const state = loadState.get(name);

  // Already loaded
  if (state === 'loaded') {
    return;
  }

  // Currently loading - return existing promise
  if (state === 'loading') {
    return loadPromises.get(name);
  }

  // Check if registered
  const def = componentRegistry.get(name);
  if (!def) {
    // Try to load from custom elements registry
    if (customElements.get(name)) {
      loadState.set(name, 'loaded');
      return;
    }
    throw new Error(`Component '${name}' is not registered`);
  }

  // Start loading
  loadState.set(name, 'loading');

  const loadPromise = (async () => {
    try {
      // Load dependencies first
      if (def.dependencies.length > 0) {
        await Promise.all(def.dependencies.map(dep => loadComponent(dep)));
      }

      // Load the component module
      await def.module();

      // Verify it's registered with custom elements
      await customElements.whenDefined(name);

      loadState.set(name, 'loaded');
    } catch (error) {
      loadState.set(name, 'error');
      throw error;
    }
  })();

  loadPromises.set(name, loadPromise);
  return loadPromise;
}

/**
 * Load multiple components
 * @param {string[]} names - Component names
 * @returns {Promise<void>}
 */
export async function loadComponents(names) {
  await Promise.all(names.map(name => loadComponent(name)));
}

/**
 * Preload components without waiting
 * @param {string[]} names - Component names
 */
export function preloadComponents(names) {
  names.forEach(name => {
    loadComponent(name).catch(() => {
      // Silently fail preloads
    });
  });
}

/**
 * Wait for a component to be defined
 * @param {string} name - Component name
 * @param {number} timeout - Timeout in ms (default: 10000)
 * @returns {Promise<CustomElementConstructor>}
 */
export async function whenDefined(name, timeout = 10000) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout waiting for '${name}'`)), timeout);
  });

  return Promise.race([
    customElements.whenDefined(name),
    timeoutPromise
  ]);
}

/**
 * Create a component instance
 * @param {string} name - Component name
 * @param {Object} props - Initial properties
 * @returns {Promise<HTMLElement>}
 */
export async function createElement(name, props = {}) {
  await loadComponent(name);

  const element = document.createElement(name);

  Object.entries(props).forEach(([key, value]) => {
    if (key in element) {
      element[key] = value;
    } else {
      element.setAttribute(key, value);
    }
  });

  return element;
}

/**
 * Registry statistics
 * @returns {Object}
 */
export function getStats() {
  const stats = {
    version: REGISTRY_VERSION,
    total: componentRegistry.size,
    pending: 0,
    loading: 0,
    loaded: 0,
    error: 0
  };

  loadState.forEach(state => {
    stats[state]++;
  });

  return stats;
}

/**
 * Export registry for inspection
 */
export const registry = {
  define: defineComponent,
  undefine: undefineComponent,
  has: hasComponent,
  get: getComponent,
  names: getComponentNames,
  load: loadComponent,
  loadAll: loadComponents,
  preload: preloadComponents,
  whenDefined,
  createElement,
  getState: getLoadState,
  stats: getStats,
  version: REGISTRY_VERSION
};

// Register built-in components
const BUILTIN_COMPONENTS = [
  { name: 'peek-button', module: () => import('./peek-button.js') },
  { name: 'peek-card', module: () => import('./peek-card.js') },
  { name: 'peek-list', module: () => import('./peek-list.js'), exports: ['PeekList', 'PeekListItem'] },
  { name: 'peek-list-item', module: () => import('./peek-list.js') },
  { name: 'peek-carousel', module: () => import('./peek-carousel.js') },
  { name: 'peek-input', module: () => import('./peek-input.js') },
  { name: 'peek-grid', module: () => import('./peek-grid.js'), exports: ['PeekGrid', 'PeekGridItem'] },
  { name: 'peek-grid-item', module: () => import('./peek-grid.js') },
  { name: 'peek-dialog', module: () => import('./peek-dialog.js') },
  { name: 'peek-popover', module: () => import('./peek-popover.js') },
  { name: 'peek-tabs', module: () => import('./peek-tabs.js'), exports: ['PeekTabs', 'PeekTab', 'PeekTabPanel'] },
  { name: 'peek-tab', module: () => import('./peek-tabs.js') },
  { name: 'peek-tab-panel', module: () => import('./peek-tabs.js') },
  { name: 'peek-details', module: () => import('./peek-details.js') },
  { name: 'peek-select', module: () => import('./peek-select.js') },
  { name: 'peek-dropdown', module: () => import('./peek-dropdown.js'), exports: ['PeekDropdown', 'PeekDropdownItem', 'PeekDropdownDivider'] },
  { name: 'peek-dropdown-item', module: () => import('./peek-dropdown.js') },
  { name: 'peek-dropdown-divider', module: () => import('./peek-dropdown.js') },
  { name: 'peek-switch', module: () => import('./peek-switch.js') },
  { name: 'peek-drawer', module: () => import('./peek-drawer.js') },
  { name: 'peek-tooltip', module: () => import('./peek-tooltip.js') },
  { name: 'peek-button-group', module: () => import('./peek-button-group.js'), exports: ['PeekButtonGroup', 'PeekButtonGroupItem'] },
  { name: 'peek-button-group-item', module: () => import('./peek-button-group.js') }
];

BUILTIN_COMPONENTS.forEach(({ name, module }) => {
  defineComponent(name, { module, version: '1.0.0' });
});

export default registry;
