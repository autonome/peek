/**
 * Device ID Module
 *
 * Generates and stores a unique device identifier for tracking
 * which device created/modified each item.
 */

import crypto from 'node:crypto';
import { getDb } from './datastore.js';
import { DEBUG } from './config.js';

let deviceId: string | null = null;

/**
 * Get or generate device ID
 * Stored in extension_settings table for persistence
 */
export function getDeviceId(): string {
  if (deviceId) {
    return deviceId;
  }

  const db = getDb();

  try {
    // Try to get existing device ID
    const row = db.prepare(`
      SELECT value FROM extension_settings
      WHERE extensionId = 'system' AND key = 'deviceId'
    `).get() as { value: string } | undefined;

    if (row && row.value) {
      try {
        deviceId = JSON.parse(row.value);
        DEBUG && console.log('[device] Loaded existing device ID:', deviceId);
        return deviceId!;
      } catch {
        // Invalid JSON, regenerate
      }
    }
  } catch (error) {
    // Table might not exist yet, will be created by datastore
  }

  // Generate new device ID
  deviceId = `desktop-${crypto.randomUUID()}`;
  DEBUG && console.log('[device] Generated new device ID:', deviceId);

  // Save to database
  try {
    const jsonValue = JSON.stringify(deviceId);
    db.prepare(`
      INSERT OR REPLACE INTO extension_settings (id, extensionId, key, value, updatedAt)
      VALUES (?, 'system', 'deviceId', ?, ?)
    `).run('system-deviceId', jsonValue, Date.now());
  } catch (error) {
    DEBUG && console.error('[device] Failed to save device ID:', error);
  }

  return deviceId;
}

/**
 * Add device tracking metadata to item metadata
 */
export function addDeviceMetadata(
  existingMetadata: Record<string, unknown> | null,
  isCreate: boolean
): Record<string, unknown> {
  const metadata = existingMetadata || {};
  const devId = getDeviceId();
  const timestamp = Date.now();

  if (!metadata._sync) {
    metadata._sync = {};
  }

  const syncMeta = metadata._sync as Record<string, unknown>;

  if (isCreate) {
    syncMeta.createdBy = devId;
    syncMeta.createdAt = timestamp;
  }

  syncMeta.modifiedBy = devId;
  syncMeta.modifiedAt = timestamp;

  return metadata;
}

/**
 * Merge device metadata from server item
 * Preserves original creation info, updates modification info
 */
export function mergeDeviceMetadata(
  localMetadata: Record<string, unknown> | null,
  serverMetadata: Record<string, unknown> | null
): Record<string, unknown> {
  const metadata = { ...(localMetadata || {}) };

  if (!serverMetadata || !serverMetadata._sync) {
    return metadata;
  }

  // Preserve server's sync metadata
  metadata._sync = serverMetadata._sync;

  return metadata;
}
