/**
 * PubSub messaging system for cross-process communication
 *
 * Handles:
 * - Topic-based publish/subscribe
 * - Scope-based message filtering (SYSTEM, SELF, GLOBAL)
 * - Extension window broadcasting (via callback)
 */

// Message scopes
export const scopes = {
  SYSTEM: 1,
  SELF: 2,
  GLOBAL: 3
} as const;

export type Scope = typeof scopes[keyof typeof scopes];

// System address for privileged subscribers
const SYSTEM_ADDRESS = 'peek://system/';

// Topic subscribers: topic -> Map<source, callback>
const topics = new Map<string, Map<string, (msg: unknown) => void>>();

// Callback for broadcasting to extension windows
let extensionBroadcaster: ((topic: string, msg: unknown, source: string) => void) | null = null;

/**
 * Extract pseudo-host from a peek:// URL
 * e.g., 'peek://app/foo.html' -> 'app'
 */
function getPseudoHost(str: string): string {
  return str.split('/')[2] || '';
}

/**
 * Check if a subscriber should receive a message based on scope
 */
function scopeCheck(pubSource: string, subSource: string, scope: Scope): boolean {
  // System address receives everything
  if (subSource === SYSTEM_ADDRESS) {
    return true;
  }
  // GLOBAL scope sends to everyone
  if (scope === scopes.GLOBAL) {
    return true;
  }
  // SELF scope only sends to same pseudo-host
  if (getPseudoHost(subSource) === getPseudoHost(pubSource)) {
    return true;
  }
  return false;
}

/**
 * Set the callback for broadcasting to extension windows
 * This is called from the main process to inject the window broadcasting logic
 */
export function setExtensionBroadcaster(
  broadcaster: (topic: string, msg: unknown, source: string) => void
): void {
  extensionBroadcaster = broadcaster;
}

/**
 * Publish a message to a topic
 */
export function publish(source: string, scope: Scope, topic: string, msg: unknown): void {
  // Route to traditional subscribers (via IPC callbacks)
  if (topics.has(topic)) {
    const t = topics.get(topic)!;
    for (const [subSource, cb] of t) {
      if (scopeCheck(source, subSource, scope)) {
        cb(msg);
      }
    }
  }

  // Route to extension windows (GLOBAL scope only)
  if (scope === scopes.GLOBAL && extensionBroadcaster) {
    extensionBroadcaster(topic, msg, source);
  }
}

/**
 * Subscribe to a topic
 */
export function subscribe(
  source: string,
  scope: Scope,
  topic: string,
  cb: (msg: unknown) => void
): void {
  if (!topics.has(topic)) {
    topics.set(topic, new Map([[source, cb]]));
  } else {
    const subscribers = topics.get(topic)!;
    subscribers.set(source, cb);
  }
}

/**
 * Unsubscribe from a topic
 */
export function unsubscribe(source: string, topic: string): boolean {
  if (!topics.has(topic)) {
    return false;
  }
  const subscribers = topics.get(topic)!;
  return subscribers.delete(source);
}

/**
 * Unsubscribe from all topics for a source
 */
export function unsubscribeAll(source: string): void {
  for (const [, subscribers] of topics) {
    subscribers.delete(source);
  }
}

/**
 * Get the system address constant
 */
export function getSystemAddress(): string {
  return SYSTEM_ADDRESS;
}
