/**
 * Version constants for sync compatibility checking.
 *
 * DATASTORE_VERSION — schema shape of sync-relevant tables (items, tags, item_tags).
 *   Bump when a schema change would break sync.
 *
 * PROTOCOL_VERSION — wire format of sync JSON payloads and endpoint behavior.
 *   Bump when request/response shape changes.
 *
 * Rules:
 * - Versions are simple integers, only increment
 * - Exact match required — if versions differ, sync is refused (HTTP 409)
 * - Clients sending no version headers are accepted during rollout
 */
const DATASTORE_VERSION = 1;
const PROTOCOL_VERSION = 1;

module.exports = { DATASTORE_VERSION, PROTOCOL_VERSION };
