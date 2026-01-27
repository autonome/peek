/**
 * Browser Extension Environment Module
 *
 * Detects browser environment and generates persistent device IDs.
 * Mirrors backend/electron/device.ts for the extension backend.
 */

import { getRawDb } from './datastore.js';

let cachedDeviceId = null;

// ==================== Device ID ====================

/**
 * Get or generate a persistent device ID.
 * Stored in extension_settings IndexedDB store (key: system-deviceId).
 * Requires openDatabase() to have been called first.
 */
export async function getDeviceId() {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  const db = getRawDb();

  // Try to load existing ID
  try {
    const tx = db.transaction('extension_settings', 'readonly');
    const store = tx.objectStore('extension_settings');
    const row = await idbGet(store, 'system-deviceId');

    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      if (typeof parsed === 'string' && parsed.startsWith('extension-')) {
        cachedDeviceId = parsed;
        return cachedDeviceId;
      }
    }
  } catch {
    // Store may not exist yet
  }

  // Generate new ID
  cachedDeviceId = `extension-${crypto.randomUUID()}`;

  // Persist
  try {
    const tx = db.transaction('extension_settings', 'readwrite');
    const store = tx.objectStore('extension_settings');
    await idbPut(store, {
      id: 'system-deviceId',
      extensionId: 'system',
      key: 'deviceId',
      value: JSON.stringify(cachedDeviceId),
      updatedAt: Date.now(),
    });
  } catch {
    // Non-fatal — ID is still cached in memory
  }

  return cachedDeviceId;
}

// ==================== Environment Snapshot ====================

/**
 * Return a snapshot of the current browser environment.
 */
export async function getEnvironment() {
  const deviceId = await getDeviceId();
  const uaInfo = detectBrowserFromUA();
  const platformFromUA = detectPlatformFromUA();

  let extensionVersion = null;
  try {
    extensionVersion = chrome.runtime.getManifest().version;
  } catch {
    // Not available in all contexts
  }

  // Use extension APIs for authoritative info when available
  const browserInfo = await getBrowserInfo();
  const platformInfo = await getPlatformInfo();

  return {
    deviceId,
    browser: browserInfo.name || uaInfo.browser,
    browserVersion: browserInfo.version || uaInfo.browserVersion,
    browserBuildId: browserInfo.buildID || null,
    browserVendor: browserInfo.vendor || null,
    extensionVersion,
    platform: platformFromUA,
    os: platformInfo.os || null,
    arch: platformInfo.arch || null,
    lastSeen: Date.now(),
  };
}

// ==================== Detection Helpers ====================

/**
 * runtime.getBrowserInfo() — Firefox only.
 * Returns { name, vendor, version, buildID } or empty object.
 */
async function getBrowserInfo() {
  try {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getBrowserInfo) {
      return await browser.runtime.getBrowserInfo();
    }
  } catch {
    // Not available
  }
  return {};
}

/**
 * runtime.getPlatformInfo() — cross-browser.
 * Returns { os, arch } or empty object.
 */
async function getPlatformInfo() {
  try {
    if (chrome.runtime && chrome.runtime.getPlatformInfo) {
      return await chrome.runtime.getPlatformInfo();
    }
  } catch {
    // Not available
  }
  return {};
}

/** UA-based browser detection (fallback). */
function detectBrowserFromUA() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  // Order matters — Edge and Chrome both contain "Chrome"
  if (/Edg\/(\d[\d.]*)/.test(ua)) {
    return { browser: 'Edge', browserVersion: RegExp.$1 };
  }
  if (/Firefox\/(\d[\d.]*)/.test(ua)) {
    return { browser: 'Firefox', browserVersion: RegExp.$1 };
  }
  if (/Chrome\/(\d[\d.]*)/.test(ua)) {
    return { browser: 'Chrome', browserVersion: RegExp.$1 };
  }
  if (/Safari\/(\d[\d.]*)/.test(ua) && /Version\/(\d[\d.]*)/.test(ua)) {
    return { browser: 'Safari', browserVersion: RegExp.$1 };
  }
  return { browser: 'Unknown', browserVersion: null };
}

/** UA-based platform detection (human-readable name). */
function detectPlatformFromUA() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

// ==================== IndexedDB Helpers ====================

function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(store, value) {
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Reset cached device ID (for testing).
 */
export function _resetCache() {
  cachedDeviceId = null;
}
