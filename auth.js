/**
 * Authentication Middleware Factory
 *
 * Creates appropriate auth middleware based on server configuration.
 * - Multi-user mode: API key authentication via users module
 * - Single-user mode: Optional token authentication
 */

const users = require("./users");

/**
 * @typedef {import('./config').ServerConfig} ServerConfig
 * @typedef {import('./config').SingleUserConfig} SingleUserConfig
 */

/**
 * Create authentication middleware based on configuration.
 *
 * @param {ServerConfig} config - Server configuration
 * @returns {function} Hono middleware function
 */
function createAuthMiddleware(config) {
  if (config.mode === "single-user") {
    return singleUserMiddleware(config.singleUser);
  }
  return multiUserMiddleware();
}

/**
 * Single-user authentication middleware.
 * - If token is configured, requires Bearer token auth
 * - If no token, allows all authenticated requests
 *
 * @param {SingleUserConfig} singleUser
 * @returns {function}
 */
function singleUserMiddleware(singleUser) {
  const { userId, token } = singleUser;

  return async (c, next) => {
    // Health check is always public
    if (c.req.path === "/") {
      return next();
    }

    // /admin/* has its own ADMIN_TOKEN gate (see adminMiddleware) — never
    // authenticate it with a user/device credential.
    if (c.req.path.startsWith("/admin")) {
      return next();
    }

    // Skip auth in e2e test mode
    if (process.env.E2E_TEST === 'true') {
      c.set("userId", userId);
      return next();
    }

    // If token is configured, require it
    if (token) {
      const auth = c.req.header("Authorization");
      const expected = `Bearer ${token}`;

      if (!auth || auth !== expected) {
        return c.json({ error: "Unauthorized" }, 401);
      }
    }

    // Set the configured user ID
    c.set("userId", userId);
    return next();
  };
}

/**
 * Multi-user authentication middleware.
 * Authenticates via API key lookup in users module.
 *
 * @returns {function}
 */
function multiUserMiddleware() {
  return async (c, next) => {
    // Health check is public
    if (c.req.path === "/") {
      return next();
    }

    // /admin/* has its own ADMIN_TOKEN gate (see adminMiddleware) — never
    // authenticate it with a user/device credential.
    if (c.req.path.startsWith("/admin")) {
      return next();
    }

    // Skip auth in e2e test mode (use 'default' user)
    if (process.env.E2E_TEST === 'true') {
      c.set("userId", "default");
      c.set("deviceId", "e2e-test");
      return next();
    }

    const auth = c.req.header("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const apiKey = auth.slice(7); // Remove "Bearer " prefix

    // Resolve the key to a per-device credential. A revoked device is rejected
    // here even though its key is otherwise well-formed — this is the
    // individual-revocation guarantee that the old shared-key model lacked.
    const cred = users.resolveDevice(apiKey);
    if (!cred || cred.revoked || !cred.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("userId", cred.userId);
    // deviceId is null only for a pre-migration legacy-key match; downstream
    // attribution treats that as an empty origin.
    c.set("deviceId", cred.deviceId || "");
    return next();
  };
}

module.exports = { createAuthMiddleware };
