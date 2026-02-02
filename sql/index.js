/**
 * SQL Adapter Factory
 *
 * Selects the appropriate SQL adapter based on environment configuration.
 * Currently only supports better-sqlite3; future adapters can be added here.
 */

const { factory: betterSqlite3Factory } = require("./better-sqlite3-adapter");

// Environment variable to select SQL adapter (future use)
const SQL_ADAPTER = process.env.SQL_ADAPTER || "better-sqlite3";

function getFactory() {
  switch (SQL_ADAPTER) {
    case "better-sqlite3":
      return betterSqlite3Factory;
    // Future: case "do-sqlite": return doSqliteFactory;
    default:
      console.warn(`Unknown SQL_ADAPTER "${SQL_ADAPTER}", falling back to better-sqlite3`);
      return betterSqlite3Factory;
  }
}

const sqlFactory = getFactory();

module.exports = { sqlFactory };
