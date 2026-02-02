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

    // If token is configured, require it
    if (token) {
      const auth = c.req.header("Authorization");
      if (!auth || auth !== `Bearer ${token}`) {
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

    const auth = c.req.header("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const apiKey = auth.slice(7); // Remove "Bearer " prefix
    const userId = users.getUserIdFromApiKey(apiKey);

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("userId", userId);
    return next();
  };
}

module.exports = { createAuthMiddleware };
