/**
 * Ad Blocker Module for Electron
 *
 * Provides native ad blocking using @cliqz/adblocker-electron.
 * This approach avoids webRequest API conflicts with browser extensions.
 *
 * Features:
 * - Pre-built filter lists for ads and trackers (EasyList, EasyPrivacy)
 * - Runtime enable/disable support
 * - Configurable via settings
 * - Attaches to Electron sessions
 */

import { session, Session } from 'electron';
import { ElectronBlocker, Request } from '@cliqz/adblocker-electron';
import fetch from 'cross-fetch';

const DEBUG = !!process.env.DEBUG;

// Module state
let blocker: ElectronBlocker | null = null;
let isEnabled = false;
const attachedSessions: Set<Session> = new Set();

// Stats tracking
let blockedCount = 0;

/**
 * Adblocker configuration options
 */
export interface AdblockerConfig {
  /** Whether ad blocking is enabled */
  enabled: boolean;
}

/**
 * Initialize the adblocker engine
 * Downloads and compiles filter lists on first run, then caches for subsequent starts
 */
export async function initAdblocker(): Promise<void> {
  if (blocker) {
    DEBUG && console.log('[adblocker] Already initialized');
    return;
  }

  DEBUG && console.log('[adblocker] Initializing...');
  const startTime = Date.now();

  try {
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);

    blocker.on('request-blocked', (request: Request) => {
      blockedCount++;
      DEBUG && console.log('[adblocker] Blocked:', request.url);
    });

    const elapsedMs = Date.now() - startTime;
    DEBUG && console.log(`[adblocker] Initialized in ${elapsedMs}ms`);
  } catch (error) {
    console.error('[adblocker] Failed to initialize:', error);
    throw error;
  }
}

/**
 * Enable ad blocking on a specific session
 */
export function enableBlockingInSession(sess: Session): void {
  if (!blocker) {
    console.error('[adblocker] Cannot enable blocking: not initialized');
    return;
  }
  if (attachedSessions.has(sess)) {
    DEBUG && console.log('[adblocker] Session already has blocking enabled');
    return;
  }

  blocker.enableBlockingInSession(sess);
  attachedSessions.add(sess);
  isEnabled = true;
  DEBUG && console.log('[adblocker] Enabled blocking in session');
}

/**
 * Disable ad blocking on a specific session
 */
export function disableBlockingInSession(sess: Session): void {
  if (!blocker || !attachedSessions.has(sess)) {
    return;
  }

  blocker.disableBlockingInSession(sess);
  attachedSessions.delete(sess);
  isEnabled = attachedSessions.size > 0;
  DEBUG && console.log('[adblocker] Disabled blocking in session');
}

/**
 * Enable ad blocking on the default session
 */
export function enableBlocking(): void {
  enableBlockingInSession(session.defaultSession);
}

/**
 * Disable ad blocking on the default session
 */
export function disableBlocking(): void {
  disableBlockingInSession(session.defaultSession);
}

/**
 * Toggle ad blocking on the default session
 * @returns New enabled state
 */
export function toggleBlocking(): boolean {
  if (isEnabled) {
    disableBlocking();
  } else {
    enableBlocking();
  }
  return isEnabled;
}

/**
 * Check if ad blocking is currently enabled
 */
export function isBlockingEnabled(): boolean {
  return isEnabled;
}

/**
 * Get the count of blocked requests since startup
 */
export function getBlockedCount(): number {
  return blockedCount;
}

/**
 * Reset the blocked request counter
 */
export function resetBlockedCount(): void {
  blockedCount = 0;
}

/**
 * Get current adblocker status
 */
export function getAdblockerStatus(): {
  initialized: boolean;
  enabled: boolean;
  blockedCount: number;
  attachedSessionCount: number;
} {
  return {
    initialized: blocker !== null,
    enabled: isEnabled,
    blockedCount,
    attachedSessionCount: attachedSessions.size,
  };
}

/**
 * Apply adblocker configuration
 * Initializes if needed and enables/disables based on config
 */
export async function applyAdblockerConfig(config: AdblockerConfig): Promise<void> {
  DEBUG && console.log('[adblocker] Applying config:', config);

  if (config.enabled) {
    if (!blocker) {
      await initAdblocker();
    }
    enableBlocking();
  } else {
    disableBlocking();
  }
}

/**
 * Clean up adblocker resources
 * Should be called before app quit
 */
export function cleanupAdblocker(): void {
  DEBUG && console.log('[adblocker] Cleaning up...');

  for (const sess of attachedSessions) {
    if (blocker) {
      try {
        blocker.disableBlockingInSession(sess);
      } catch (error) {
        DEBUG && console.log('[adblocker] Error disabling session:', error);
      }
    }
  }

  attachedSessions.clear();
  blocker = null;
  isEnabled = false;
  blockedCount = 0;
}
