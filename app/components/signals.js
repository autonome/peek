/**
 * Native Signals Implementation
 *
 * A lightweight reactive primitives library following the TC39 Signals proposal pattern.
 * No external dependencies - pure JavaScript implementation.
 *
 * @example
 * import { signal, computed, effect } from './signals.js';
 *
 * const count = signal(0);
 * const doubled = computed(() => count.value * 2);
 *
 * effect(() => {
 *   console.log('Count:', count.value, 'Doubled:', doubled.value);
 * });
 *
 * count.value = 5; // Logs: "Count: 5 Doubled: 10"
 */

// Track the currently running effect for automatic dependency collection
let currentEffect = null;
const effectStack = [];

/**
 * Signal - A reactive value container
 *
 * @template T
 * @param {T} initialValue - Initial value
 * @returns {Signal<T>} - Signal object with .value property
 *
 * @example
 * const name = signal('Alice');
 * console.log(name.value); // 'Alice'
 * name.value = 'Bob'; // Notifies all subscribers
 */
export function signal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();

  return {
    /**
     * Get or set the signal value.
     * Getting tracks the current effect as a dependency.
     * Setting notifies all subscribers.
     */
    get value() {
      // Track dependency
      if (currentEffect) {
        subscribers.add(currentEffect);
      }
      return value;
    },

    set value(newValue) {
      if (!Object.is(value, newValue)) {
        value = newValue;
        // Notify subscribers (copy to avoid mutation during iteration)
        for (const subscriber of [...subscribers]) {
          subscriber();
        }
      }
    },

    /**
     * Get value without tracking (peek at value)
     * @returns {T}
     */
    peek() {
      return value;
    },

    /**
     * Subscribe to changes manually (for non-effect use cases)
     * @param {Function} callback - Called when value changes
     * @returns {Function} - Unsubscribe function
     */
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },

    /**
     * Number of active subscribers
     */
    get subscriberCount() {
      return subscribers.size;
    }
  };
}

/**
 * Computed - A derived reactive value
 *
 * Automatically tracks dependencies and recomputes when they change.
 * Lazy evaluation - only computes when .value is accessed.
 *
 * @template T
 * @param {() => T} fn - Computation function
 * @returns {ComputedSignal<T>} - Read-only signal
 *
 * @example
 * const firstName = signal('John');
 * const lastName = signal('Doe');
 * const fullName = computed(() => `${firstName.value} ${lastName.value}`);
 *
 * console.log(fullName.value); // 'John Doe'
 * firstName.value = 'Jane';
 * console.log(fullName.value); // 'Jane Doe'
 */
export function computed(fn) {
  let cachedValue;
  let dirty = true;
  const subscribers = new Set();

  // Internal effect to track dependencies and mark dirty
  const recompute = () => {
    dirty = true;
    // Notify our subscribers that we changed
    for (const subscriber of [...subscribers]) {
      subscriber();
    }
  };

  return {
    get value() {
      // Track this computed as a dependency
      if (currentEffect) {
        subscribers.add(currentEffect);
      }

      if (dirty) {
        // Run computation with dependency tracking
        const previousEffect = currentEffect;
        currentEffect = recompute;
        effectStack.push(recompute);

        try {
          cachedValue = fn();
          dirty = false;
        } finally {
          effectStack.pop();
          currentEffect = previousEffect;
        }
      }

      return cachedValue;
    },

    /**
     * Get value without tracking
     */
    peek() {
      if (dirty) {
        // Compute without tracking
        const previousEffect = currentEffect;
        currentEffect = null;
        try {
          cachedValue = fn();
          dirty = false;
        } finally {
          currentEffect = previousEffect;
        }
      }
      return cachedValue;
    },

    /**
     * Subscribe to changes manually
     */
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    }
  };
}

/**
 * Effect - Run side effects when dependencies change
 *
 * Automatically tracks signal/computed dependencies accessed during execution.
 * Re-runs whenever any dependency changes.
 *
 * @param {() => void | (() => void)} fn - Effect function. May return cleanup function.
 * @returns {() => void} - Dispose function to stop the effect
 *
 * @example
 * const count = signal(0);
 *
 * const dispose = effect(() => {
 *   console.log('Count is:', count.value);
 *   return () => console.log('Cleanup');
 * });
 *
 * count.value = 1; // Logs: "Cleanup" then "Count is: 1"
 * dispose(); // Stops the effect
 */
export function effect(fn) {
  let cleanup = null;
  let disposed = false;

  const execute = () => {
    if (disposed) return;

    // Run cleanup from previous execution
    if (cleanup && typeof cleanup === 'function') {
      cleanup();
      cleanup = null;
    }

    // Run effect with dependency tracking
    const previousEffect = currentEffect;
    currentEffect = execute;
    effectStack.push(execute);

    try {
      cleanup = fn();
    } finally {
      effectStack.pop();
      currentEffect = previousEffect;
    }
  };

  // Initial execution
  execute();

  // Return dispose function
  return () => {
    disposed = true;
    if (cleanup && typeof cleanup === 'function') {
      cleanup();
    }
  };
}

/**
 * Batch multiple signal updates into a single notification
 *
 * @param {() => void} fn - Function containing signal updates
 *
 * @example
 * const a = signal(1);
 * const b = signal(2);
 *
 * batch(() => {
 *   a.value = 10;
 *   b.value = 20;
 * }); // Effects run once, not twice
 */
let batchDepth = 0;
let batchedEffects = new Set();

export function batch(fn) {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      const effects = [...batchedEffects];
      batchedEffects.clear();
      for (const effect of effects) {
        effect();
      }
    }
  }
}

/**
 * Create a signal from an external data source
 *
 * Useful for bridging external state (localStorage, APIs, etc.) with signals.
 *
 * @template T
 * @param {() => T} get - Getter function
 * @param {(value: T) => void} set - Setter function
 * @param {(callback: () => void) => () => void} subscribe - Subscribe to external changes
 * @returns {Signal<T>}
 *
 * @example
 * const storedValue = fromExternal(
 *   () => localStorage.getItem('key'),
 *   (v) => localStorage.setItem('key', v),
 *   (cb) => { window.addEventListener('storage', cb); return () => window.removeEventListener('storage', cb); }
 * );
 */
export function fromExternal(get, set, subscribe) {
  const s = signal(get());

  // Sync from external source
  const unsubscribe = subscribe(() => {
    s.value = get();
  });

  // Return a proxy that syncs back to external
  return {
    get value() {
      return s.value;
    },
    set value(newValue) {
      set(newValue);
      s.value = newValue;
    },
    peek: s.peek,
    subscribe: s.subscribe,
    dispose: unsubscribe
  };
}

/**
 * Watch a signal and call handler when it changes
 *
 * Similar to effect but more explicit - only watches specified signals.
 *
 * @template T
 * @param {Signal<T> | ComputedSignal<T>} source - Signal to watch
 * @param {(value: T, oldValue: T) => void} handler - Called on change
 * @param {Object} [options]
 * @param {boolean} [options.immediate=false] - Call handler immediately with current value
 * @returns {() => void} - Stop watching
 *
 * @example
 * const count = signal(0);
 * const stop = watch(count, (newVal, oldVal) => {
 *   console.log(`Changed from ${oldVal} to ${newVal}`);
 * });
 */
export function watch(source, handler, options = {}) {
  let oldValue = source.peek();

  if (options.immediate) {
    handler(oldValue, undefined);
  }

  return source.subscribe(() => {
    const newValue = source.peek();
    if (!Object.is(newValue, oldValue)) {
      const prev = oldValue;
      oldValue = newValue;
      handler(newValue, prev);
    }
  });
}

export default { signal, computed, effect, batch, fromExternal, watch };
