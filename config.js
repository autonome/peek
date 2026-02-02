/**
 * Server Configuration
 *
 * Loads configuration from environment variables.
 * Supports multi-user (default) and single-user modes.
 *
 * @typedef {Object} SingleUserConfig
 * @property {string} userId - User ID for single-user mode
 * @property {string} [token] - Optional bearer token for authentication
 *
 * @typedef {Object} ServerConfig
 * @property {'multi-user' | 'single-user'} mode - Server operation mode
 * @property {SingleUserConfig} [singleUser] - Single-user configuration
 */

/**
 * Load server configuration from environment.
 *
 * Environment variables:
 * - SINGLE_USER_MODE: Set to 'true' to enable single-user mode
 * - SINGLE_USER_ID: User ID for single-user mode (default: 'default')
 * - SINGLE_USER_TOKEN: Optional bearer token for authentication
 *
 * @returns {ServerConfig}
 */
function loadConfig() {
  if (process.env.SINGLE_USER_MODE === "true") {
    return {
      mode: "single-user",
      singleUser: {
        userId: process.env.SINGLE_USER_ID || "default",
        token: process.env.SINGLE_USER_TOKEN || undefined,
      },
    };
  }

  return { mode: "multi-user" };
}

/**
 * Check if running in single-user mode.
 *
 * @param {ServerConfig} config
 * @returns {boolean}
 */
function isSingleUserMode(config) {
  return config.mode === "single-user";
}

module.exports = { loadConfig, isSingleUserMode };
