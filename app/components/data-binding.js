/**
 * Data Binding Utilities for Components
 *
 * Provides reactive data binding capabilities for Peek components.
 * Integrates with signals, schema validation, and external data sources.
 *
 * @example
 * import { DataBoundElement } from './data-binding.js';
 * import { signal } from './signals.js';
 *
 * class MyComponent extends DataBoundElement {
 *   static dataSchema = {
 *     type: 'object',
 *     properties: {
 *       title: { type: 'string' },
 *       count: { type: 'integer', default: 0 }
 *     }
 *   };
 *
 *   render() {
 *     return html`<div>${this.data.title}: ${this.data.count}</div>`;
 *   }
 * }
 *
 * // Bind to a signal
 * const dataSignal = signal({ title: 'Hello', count: 5 });
 * const el = document.createElement('my-component');
 * el.bindTo(dataSignal);
 */

import { PeekElement, sharedStyles } from './base.js';
import { effect } from './signals.js';
import { validate, applyDefaults } from './schema.js';

/**
 * Mixin that adds data binding capabilities to a component
 *
 * @param {typeof LitElement} Base - Base class to extend
 * @returns {typeof DataBoundElement}
 */
export function DataBindingMixin(Base) {
  return class extends Base {
    static properties = {
      ...Base.properties,
      data: { type: Object }
    };

    /**
     * Optional JSON Schema for data validation.
     * Override in subclass to enable validation.
     * @type {Object|null}
     */
    static dataSchema = null;

    constructor() {
      super();
      this._data = {};
      this._boundSource = null;
      this._effectDispose = null;
      this._subscriptions = [];
    }

    /**
     * Get the current data object
     */
    get data() {
      return this._data;
    }

    /**
     * Set data directly (validates if schema defined)
     */
    set data(value) {
      const schema = this.constructor.dataSchema;
      if (schema) {
        const result = validate(value, schema);
        if (!result.valid) {
          console.warn(`[${this.tagName}] Data validation failed:`, result.errors);
        }
        this._data = result.data;
      } else {
        this._data = value;
      }
      this.requestUpdate();
    }

    /**
     * Bind component to a reactive data source (signal, observable, etc.)
     *
     * @param {Object} source - Data source with .value property or subscribe method
     * @param {Object} [options]
     * @param {Function} [options.transform] - Transform data before setting
     * @param {string} [options.path] - Dot-notation path to extract from source
     * @returns {() => void} - Unbind function
     *
     * @example
     * // Bind to signal
     * const data = signal({ title: 'Hello' });
     * element.bindTo(data);
     *
     * // Bind with transform
     * element.bindTo(rawData, {
     *   transform: (d) => ({ title: d.name, count: d.items.length })
     * });
     *
     * // Bind to nested path
     * element.bindTo(store, { path: 'user.profile' });
     */
    bindTo(source, options = {}) {
      // Unbind previous source
      this.unbind();

      this._boundSource = source;
      const { transform, path } = options;

      const updateData = () => {
        let value;

        // Get value from source
        if ('value' in source) {
          value = source.value;
        } else if (typeof source.get === 'function') {
          value = source.get();
        } else {
          value = source;
        }

        // Extract nested path if specified
        if (path) {
          value = getPath(value, path);
        }

        // Apply transform if specified
        if (transform) {
          value = transform(value);
        }

        this.data = value;
      };

      // Set up reactive subscription
      if ('value' in source) {
        // Signal-like source - use effect for automatic tracking
        this._effectDispose = effect(() => {
          // Access .value to track dependency
          const _ = source.value;
          updateData();
        });
      } else if (typeof source.subscribe === 'function') {
        // Observable-like source
        const unsubscribe = source.subscribe(updateData);
        this._subscriptions.push(unsubscribe);
        updateData(); // Initial value
      } else {
        // Static data - just set once
        updateData();
      }

      return () => this.unbind();
    }

    /**
     * Unbind from current data source
     */
    unbind() {
      if (this._effectDispose) {
        this._effectDispose();
        this._effectDispose = null;
      }
      for (const unsub of this._subscriptions) {
        unsub();
      }
      this._subscriptions = [];
      this._boundSource = null;
    }

    /**
     * Check if component is bound to a data source
     */
    get isBound() {
      return this._boundSource !== null;
    }

    /**
     * Update a single property in data (triggers re-render)
     * @param {string} key - Property name
     * @param {*} value - New value
     */
    updateData(key, value) {
      this.data = { ...this._data, [key]: value };
    }

    /**
     * Merge partial data into current data
     * @param {Object} partial - Partial data to merge
     */
    mergeData(partial) {
      this.data = { ...this._data, ...partial };
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this.unbind();
    }
  };
}

/**
 * Data-bound element base class
 * Extends PeekElement with data binding capabilities
 */
export class DataBoundElement extends DataBindingMixin(PeekElement) {
  static styles = [sharedStyles];
}

/**
 * Get nested value from object using dot notation
 * @param {Object} obj
 * @param {string} path - e.g., "user.profile.name"
 * @returns {*}
 */
function getPath(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Create a data-bound component dynamically
 *
 * @param {string} tagName - Custom element tag name
 * @param {Object} options
 * @param {Function} options.render - Render function (data) => TemplateResult
 * @param {Object} [options.schema] - Data schema
 * @param {CSSResult[]} [options.styles] - Additional styles
 * @returns {typeof DataBoundElement}
 *
 * @example
 * const UserCard = createDataComponent('user-card', {
 *   schema: {
 *     type: 'object',
 *     properties: {
 *       name: { type: 'string' },
 *       avatar: { type: 'string', format: 'uri' }
 *     }
 *   },
 *   render: (data) => html`
 *     <img src=${data.avatar}>
 *     <span>${data.name}</span>
 *   `
 * });
 */
export function createDataComponent(tagName, options) {
  const { render: renderFn, schema, styles = [] } = options;

  class DynamicComponent extends DataBoundElement {
    static dataSchema = schema;
    static styles = [sharedStyles, ...styles];

    render() {
      return renderFn(this.data, this);
    }
  }

  customElements.define(tagName, DynamicComponent);
  return DynamicComponent;
}

/**
 * Decorator for data-bound properties
 * Automatically validates against schema when property changes
 *
 * @param {Object} schema - Property schema
 */
export function validatedProperty(schema) {
  return function(target, propertyKey) {
    const privateKey = `_${propertyKey}`;

    Object.defineProperty(target, propertyKey, {
      get() {
        return this[privateKey];
      },
      set(value) {
        const result = validate(value, schema);
        if (!result.valid) {
          console.warn(`[${this.tagName}] Property '${propertyKey}' validation failed:`, result.errors);
        }
        this[privateKey] = result.data;
        this.requestUpdate();
      },
      configurable: true,
      enumerable: true
    });
  };
}

export default {
  DataBindingMixin,
  DataBoundElement,
  createDataComponent,
  validatedProperty
};
