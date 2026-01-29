/**
 * Peek Component Bundle Configuration
 *
 * Defines the component library structure for bundling and distribution.
 * Can be used with any ESM-compatible bundler (esbuild, rollup, vite, etc.)
 *
 * Usage:
 *   import { bundleConfig, generateImportMap, getEntryPoints } from 'peek://app/components/bundle.js';
 */

import { LIBRARY_VERSION } from './version.js';

/**
 * Component module definitions
 */
export const MODULES = {
  // Core utilities
  base: {
    path: './base.js',
    exports: ['PeekElement', 'sharedStyles'],
    dependencies: ['lit']
  },
  signals: {
    path: './signals.js',
    exports: ['signal', 'computed', 'effect', 'batch', 'watch', 'fromExternal'],
    dependencies: []
  },
  schema: {
    path: './schema.js',
    exports: ['validate', 'createValidator', 'assertValid', 'isValid', 'Schema'],
    dependencies: []
  },
  'data-binding': {
    path: './data-binding.js',
    exports: ['DataBoundElement', 'DataBindingMixin', 'createDataComponent'],
    dependencies: ['./base.js', './signals.js', './schema.js']
  },
  events: {
    path: './events.js',
    exports: ['bus', 'on', 'once', 'emit', 'channel', 'typedEvent', 'waitFor', 'EventBusMixin'],
    dependencies: []
  },
  theme: {
    path: './theme.js',
    exports: ['registerTheme', 'setTheme', 'getTheme', 'getThemeTokens', 'ThemeMixin'],
    dependencies: []
  },
  extension: {
    path: './extension.js',
    exports: ['registerExtension', 'ExtensionContext', 'initContentScript', 'initPopup'],
    dependencies: ['./theme.js']
  },
  registry: {
    path: './registry.js',
    exports: ['registry', 'defineComponent', 'loadComponent', 'createElement'],
    dependencies: []
  },
  version: {
    path: './version.js',
    exports: ['version', 'LIBRARY_VERSION', 'checkCompatibility'],
    dependencies: []
  },
  dev: {
    path: './dev.js',
    exports: ['devTools', 'enableDevMode', 'enableHotReload'],
    dependencies: ['./registry.js', './theme.js', './extension.js', './version.js'],
    devOnly: true
  },

  // Basic components
  'peek-button': {
    path: './peek-button.js',
    exports: ['PeekButton'],
    dependencies: ['./base.js'],
    component: true
  },
  'peek-card': {
    path: './peek-card.js',
    exports: ['PeekCard'],
    dependencies: ['./base.js'],
    component: true
  },
  'peek-list': {
    path: './peek-list.js',
    exports: ['PeekList', 'PeekListItem'],
    dependencies: ['./base.js'],
    component: true
  },

  // Complex components
  'peek-carousel': {
    path: './peek-carousel.js',
    exports: ['PeekCarousel'],
    dependencies: ['./base.js'],
    component: true
  },
  'peek-input': {
    path: './peek-input.js',
    exports: ['PeekInput'],
    dependencies: ['./base.js'],
    component: true
  },
  'peek-grid': {
    path: './peek-grid.js',
    exports: ['PeekGrid', 'PeekGridItem'],
    dependencies: ['./base.js'],
    component: true
  },
  'peek-dialog': {
    path: './peek-dialog.js',
    exports: ['PeekDialog'],
    dependencies: ['./base.js'],
    component: true
  },

  // Native/Open UI components
  'peek-popover': {
    path: './peek-popover.js',
    exports: ['PeekPopover'],
    dependencies: ['./base.js'],
    component: true
  },
  'peek-tabs': {
    path: './peek-tabs.js',
    exports: ['PeekTabs', 'PeekTab', 'PeekTabPanel'],
    dependencies: ['./base.js'],
    component: true
  },
  'peek-details': {
    path: './peek-details.js',
    exports: ['PeekDetails'],
    dependencies: ['./base.js'],
    component: true
  },

  // Phase 4 components
  'peek-select': {
    path: './peek-select.js',
    exports: ['PeekSelect'],
    dependencies: ['./base.js'],
    component: true
  },
  'peek-dropdown': {
    path: './peek-dropdown.js',
    exports: ['PeekDropdown', 'PeekDropdownItem', 'PeekDropdownDivider'],
    dependencies: ['./base.js'],
    component: true
  },
  'peek-switch': {
    path: './peek-switch.js',
    exports: ['PeekSwitch'],
    dependencies: ['./base.js'],
    component: true
  },
  'peek-drawer': {
    path: './peek-drawer.js',
    exports: ['PeekDrawer'],
    dependencies: ['./base.js'],
    component: true
  },
  'peek-tooltip': {
    path: './peek-tooltip.js',
    exports: ['PeekTooltip'],
    dependencies: ['./base.js'],
    component: true
  },
  'peek-button-group': {
    path: './peek-button-group.js',
    exports: ['PeekButtonGroup', 'PeekButtonGroupItem'],
    dependencies: ['./base.js'],
    component: true
  }
};

/**
 * Bundle presets
 */
export const PRESETS = {
  // Full bundle with everything
  full: {
    include: Object.keys(MODULES).filter(m => !MODULES[m].devOnly),
    description: 'Complete component library'
  },

  // Core only - utilities without components
  core: {
    include: ['base', 'signals', 'schema', 'data-binding', 'events', 'theme', 'extension', 'registry', 'version'],
    description: 'Core utilities only, no components'
  },

  // Minimal - just base and essential utilities
  minimal: {
    include: ['base', 'signals', 'events'],
    description: 'Minimal utilities for custom components'
  },

  // Basic components
  basic: {
    include: ['base', 'peek-button', 'peek-card', 'peek-list'],
    description: 'Basic components only'
  },

  // Form components
  forms: {
    include: ['base', 'peek-button', 'peek-input', 'peek-select', 'peek-switch', 'peek-button-group'],
    description: 'Form-related components'
  },

  // Layout components
  layout: {
    include: ['base', 'peek-card', 'peek-grid', 'peek-tabs', 'peek-dialog', 'peek-drawer', 'peek-details'],
    description: 'Layout and container components'
  },

  // Interactive components
  interactive: {
    include: ['base', 'peek-button', 'peek-list', 'peek-dropdown', 'peek-popover', 'peek-tooltip'],
    description: 'Interactive and menu components'
  }
};

/**
 * Get entry points for bundler
 * @param {string} preset - Preset name or 'full'
 * @returns {Object} Entry point configuration
 */
export function getEntryPoints(preset = 'full') {
  const modules = PRESETS[preset]?.include || Object.keys(MODULES);

  const entries = {};
  modules.forEach(name => {
    const mod = MODULES[name];
    if (mod) {
      entries[name] = mod.path;
    }
  });

  return entries;
}

/**
 * Get dependency graph
 * @param {string[]} modules - Module names
 * @returns {Map<string, string[]>}
 */
export function getDependencyGraph(modules = null) {
  const names = modules || Object.keys(MODULES);
  const graph = new Map();

  names.forEach(name => {
    const mod = MODULES[name];
    if (mod) {
      graph.set(name, mod.dependencies.map(d => d.replace('./', '').replace('.js', '')));
    }
  });

  return graph;
}

/**
 * Generate import map for native ES modules
 * @param {string} baseUrl - Base URL for components
 * @param {string} preset - Preset name
 * @returns {Object} Import map
 */
export function generateImportMap(baseUrl = '/components/', preset = 'full') {
  const modules = PRESETS[preset]?.include || Object.keys(MODULES);

  const imports = {
    'peek://app/components/': baseUrl
  };

  modules.forEach(name => {
    const mod = MODULES[name];
    if (mod) {
      imports[`peek://app/components/${name}.js`] = `${baseUrl}${mod.path}`;
    }
  });

  // Add index
  imports['peek://app/components/index.js'] = `${baseUrl}index.js`;

  return { imports };
}

/**
 * Generate bundle configuration
 * @param {Object} options - Configuration options
 * @returns {Object} Bundle config
 */
export function bundleConfig(options = {}) {
  const {
    preset = 'full',
    format = 'esm',
    minify = true,
    sourcemap = true,
    outdir = 'dist',
    external = ['lit']
  } = options;

  const entryPoints = getEntryPoints(preset);

  return {
    // Common bundler options
    entryPoints: Object.values(entryPoints),
    format,
    minify,
    sourcemap,
    outdir,
    external,

    // Metadata
    version: LIBRARY_VERSION,
    preset,
    modules: Object.keys(entryPoints),

    // ESBuild specific
    esbuild: {
      entryPoints,
      bundle: true,
      format,
      minify,
      sourcemap,
      outdir,
      external,
      target: ['es2022'],
      platform: 'browser'
    },

    // Rollup specific
    rollup: {
      input: entryPoints,
      output: {
        dir: outdir,
        format,
        sourcemap,
        preserveModules: true
      },
      external
    },

    // Vite specific
    vite: {
      build: {
        lib: {
          entry: entryPoints,
          formats: [format === 'esm' ? 'es' : format]
        },
        outDir: outdir,
        sourcemap,
        minify: minify ? 'esbuild' : false,
        rollupOptions: {
          external
        }
      }
    }
  };
}

/**
 * Get all component tag names
 * @returns {string[]}
 */
export function getComponentNames() {
  return Object.entries(MODULES)
    .filter(([_, mod]) => mod.component)
    .map(([name]) => name);
}

/**
 * Get all utility module names
 * @returns {string[]}
 */
export function getUtilityNames() {
  return Object.entries(MODULES)
    .filter(([_, mod]) => !mod.component)
    .map(([name]) => name);
}

export default {
  MODULES,
  PRESETS,
  getEntryPoints,
  getDependencyGraph,
  generateImportMap,
  bundleConfig,
  getComponentNames,
  getUtilityNames,
  version: LIBRARY_VERSION
};
