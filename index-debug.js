// Debug script to test server auth configuration
console.error(`NODE_ENV=${process.env.NODE_ENV}`);
console.error(`SINGLE_USER_MODE=${process.env.SINGLE_USER_MODE}`);
console.error(`SINGLE_USER_TOKEN=${process.env.SINGLE_USER_TOKEN ? 'set (' + process.env.SINGLE_USER_TOKEN.substring(0, 20) + '...)' : 'not set'}`);
console.error(`PORT=${process.env.PORT}`);
console.error(`DATA_DIR=${process.env.DATA_DIR}`);

// Load config and check
const { loadConfig } = require("./config");
const config = loadConfig();

console.error(`Config mode: ${config.mode}`);
if (config.mode === 'single-user') {
  console.error(`Config userId: ${config.singleUser.userId}`);
  console.error(`Config token: ${config.singleUser.token ? 'set (' + config.singleUser.token.substring(0, 20) + '...)' : 'not set'}`);
}
