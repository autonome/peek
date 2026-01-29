/**
 * Component Communication Bus
 *
 * A lightweight pubsub system for cross-component communication.
 * Works across Shadow DOM boundaries and supports typed events.
 *
 * @example
 * import { bus, on, emit, channel } from './events.js';
 *
 * // Subscribe to events
 * const unsubscribe = on('user:login', (user) => {
 *   console.log('User logged in:', user);
 * });
 *
 * // Publish events
 * emit('user:login', { name: 'Alice', id: 123 });
 *
 * // Create typed channels
 * const userChannel = channel('user');
 * userChannel.on('login', handler);
 * userChannel.emit('login', userData);
 */

/**
 * @typedef {Object} Subscription
 * @property {() => void} unsubscribe - Stop receiving events
 * @property {boolean} active - Whether subscription is active
 */

/**
 * Event bus instance
 */
class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
    /** @type {Map<string, *>} */
    this._lastValues = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name (supports wildcards: 'user:*')
   * @param {Function} handler - Event handler
   * @param {Object} [options]
   * @param {boolean} [options.once=false] - Only handle once then unsubscribe
   * @param {boolean} [options.replay=false] - Replay last value immediately if available
   * @returns {Subscription}
   */
  on(event, handler, options = {}) {
    const { once = false, replay = false } = options;

    let wrappedHandler = handler;
    let active = true;

    if (once) {
      wrappedHandler = (...args) => {
        if (active) {
          active = false;
          this._removeHandler(event, wrappedHandler);
          handler(...args);
        }
      };
    }

    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event).add(wrappedHandler);

    // Replay last value if requested and available
    if (replay && this._lastValues.has(event)) {
      queueMicrotask(() => {
        if (active) {
          wrappedHandler(this._lastValues.get(event));
        }
      });
    }

    return {
      unsubscribe: () => {
        active = false;
        this._removeHandler(event, wrappedHandler);
      },
      get active() {
        return active;
      }
    };
  }

  /**
   * Subscribe to event, receiving only the next occurrence
   * @param {string} event
   * @param {Function} handler
   * @returns {Subscription}
   */
  once(event, handler) {
    return this.on(event, handler, { once: true });
  }

  /**
   * Emit an event to all subscribers
   * @param {string} event - Event name
   * @param {*} [data] - Event data
   * @param {Object} [options]
   * @param {boolean} [options.retain=false] - Store value for replay
   */
  emit(event, data, options = {}) {
    const { retain = false } = options;

    if (retain) {
      this._lastValues.set(event, data);
    }

    // Exact match handlers
    const handlers = this._handlers.get(event);
    if (handlers) {
      for (const handler of [...handlers]) {
        try {
          handler(data);
        } catch (error) {
          console.error(`[EventBus] Error in handler for '${event}':`, error);
        }
      }
    }

    // Wildcard handlers (e.g., 'user:*' matches 'user:login')
    for (const [pattern, patternHandlers] of this._handlers) {
      if (pattern.endsWith(':*')) {
        const prefix = pattern.slice(0, -1);
        if (event.startsWith(prefix) && pattern !== event) {
          for (const handler of [...patternHandlers]) {
            try {
              handler(data, event);
            } catch (error) {
              console.error(`[EventBus] Error in wildcard handler for '${event}':`, error);
            }
          }
        }
      }
    }
  }

  /**
   * Remove all handlers for an event
   * @param {string} event
   */
  off(event) {
    this._handlers.delete(event);
    this._lastValues.delete(event);
  }

  /**
   * Remove all handlers and clear state
   */
  clear() {
    this._handlers.clear();
    this._lastValues.clear();
  }

  /**
   * Get count of handlers for an event
   * @param {string} event
   * @returns {number}
   */
  listenerCount(event) {
    return this._handlers.get(event)?.size ?? 0;
  }

  _removeHandler(event, handler) {
    const handlers = this._handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this._handlers.delete(event);
      }
    }
  }
}

/**
 * Global event bus instance
 */
export const bus = new EventBus();

/**
 * Subscribe to an event on the global bus
 * @param {string} event
 * @param {Function} handler
 * @param {Object} [options]
 * @returns {Subscription}
 */
export function on(event, handler, options) {
  return bus.on(event, handler, options);
}

/**
 * Subscribe once to an event
 * @param {string} event
 * @param {Function} handler
 * @returns {Subscription}
 */
export function once(event, handler) {
  return bus.once(event, handler);
}

/**
 * Emit an event on the global bus
 * @param {string} event
 * @param {*} [data]
 * @param {Object} [options]
 */
export function emit(event, data, options) {
  bus.emit(event, data, options);
}

/**
 * Create a namespaced channel
 *
 * @param {string} namespace - Channel namespace (e.g., 'user', 'editor')
 * @returns {Channel}
 *
 * @example
 * const userChannel = channel('user');
 * userChannel.on('login', (user) => console.log(user));
 * userChannel.emit('login', { name: 'Alice' });
 * // Equivalent to: bus.emit('user:login', { name: 'Alice' })
 */
export function channel(namespace) {
  return {
    on(event, handler, options) {
      return bus.on(`${namespace}:${event}`, handler, options);
    },
    once(event, handler) {
      return bus.once(`${namespace}:${event}`, handler);
    },
    emit(event, data, options) {
      bus.emit(`${namespace}:${event}`, data, options);
    },
    off(event) {
      bus.off(`${namespace}:${event}`);
    },
    /**
     * Subscribe to all events in this channel
     */
    onAny(handler, options) {
      return bus.on(`${namespace}:*`, handler, options);
    }
  };
}

/**
 * Create a typed event emitter for a specific event
 *
 * @template T
 * @param {string} event - Event name
 * @returns {{ emit: (data: T) => void, on: (handler: (data: T) => void) => Subscription }}
 *
 * @example
 * const userLogin = typedEvent('user:login');
 * userLogin.on((user) => console.log(user.name));
 * userLogin.emit({ name: 'Alice', id: 123 });
 */
export function typedEvent(event) {
  return {
    emit(data, options) {
      bus.emit(event, data, options);
    },
    on(handler, options) {
      return bus.on(event, handler, options);
    },
    once(handler) {
      return bus.once(event, handler);
    }
  };
}

/**
 * Wait for an event (Promise-based)
 *
 * @param {string} event - Event to wait for
 * @param {Object} [options]
 * @param {number} [options.timeout] - Timeout in ms (rejects if exceeded)
 * @param {Function} [options.filter] - Only resolve if filter returns true
 * @returns {Promise<*>}
 *
 * @example
 * const userData = await waitFor('user:login', { timeout: 5000 });
 */
export function waitFor(event, options = {}) {
  const { timeout, filter } = options;

  return new Promise((resolve, reject) => {
    let timeoutId;
    let subscription;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (subscription) subscription.unsubscribe();
    };

    subscription = bus.on(event, (data) => {
      if (!filter || filter(data)) {
        cleanup();
        resolve(data);
      }
    });

    if (timeout) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);
    }
  });
}

/**
 * Mixin that adds event bus methods to a component
 *
 * @param {typeof LitElement} Base
 * @returns {typeof LitElement}
 *
 * @example
 * class MyComponent extends EventBusMixin(LitElement) {
 *   connectedCallback() {
 *     super.connectedCallback();
 *     this.subscribe('data:update', this.handleUpdate);
 *   }
 *
 *   handleUpdate = (data) => {
 *     this.data = data;
 *   }
 * }
 */
export function EventBusMixin(Base) {
  return class extends Base {
    constructor() {
      super();
      this._busSubscriptions = [];
    }

    /**
     * Subscribe to an event (auto-cleanup on disconnect)
     */
    subscribe(event, handler, options) {
      const sub = bus.on(event, handler, options);
      this._busSubscriptions.push(sub);
      return sub;
    }

    /**
     * Emit an event
     */
    publish(event, data, options) {
      bus.emit(event, data, options);
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      // Clean up all subscriptions
      for (const sub of this._busSubscriptions) {
        sub.unsubscribe();
      }
      this._busSubscriptions = [];
    }
  };
}

/**
 * Create a new isolated event bus instance
 * Useful for testing or isolated component trees
 *
 * @returns {EventBus}
 */
export function createBus() {
  return new EventBus();
}

export default {
  bus,
  on,
  once,
  emit,
  channel,
  typedEvent,
  waitFor,
  EventBusMixin,
  createBus
};
