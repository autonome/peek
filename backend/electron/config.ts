/**
 * Electron-Specific Runtime Configuration
 *
 * Runtime configuration and state for the Electron main process.
 * For shared constants, see backend/config.ts
 */

// Re-export shared constants for convenience
export {
  APP_DEF_WIDTH,
  APP_DEF_HEIGHT,
  WEB_CORE_ADDRESS,
  SETTINGS_ADDRESS,
  IPC_CHANNELS,
  TOPICS,
} from '../config.js';

// Debug mode - set DEBUG=1 to enable logging
export const DEBUG = !!process.env.DEBUG;

// Runtime configuration (set during app initialization)
let _preloadPath: string = '';
let _profile: string = '';

/**
 * Check if running in headless mode (no visible windows)
 * Set PEEK_HEADLESS=1 to enable
 */
export function isHeadless(): boolean {
  return !!process.env.PEEK_HEADLESS;
}

/**
 * Set runtime paths (called during app initialization)
 */
export function setPreloadPath(preloadPath: string): void {
  _preloadPath = preloadPath;
}

/**
 * Set profile (called during app initialization)
 */
export function setProfile(profile: string): void {
  _profile = profile;
}

/**
 * Get the preload script path
 */
export function getPreloadPath(): string {
  return _preloadPath;
}

/**
 * Get the current profile name
 */
export function getProfile(): string {
  return _profile;
}

/**
 * Check if running in test profile
 */
export function isTestProfile(): boolean {
  return _profile.startsWith('test');
}

/**
 * Check if running in dev profile
 */
export function isDevProfile(): boolean {
  return _profile === 'dev';
}
