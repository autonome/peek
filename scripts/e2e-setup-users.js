#!/usr/bin/env node
/**
 * E2E test setup: create test users in system.db before server starts.
 *
 * Uses createRequire to import the CJS users module directly so we get
 * real DB access without running the server.
 *
 * Environment variables:
 *   DATA_DIR     — server data directory (must exist or will be created)
 *   USER_A_KEY   — API key to assign to account-a
 *   USER_B_KEY   — API key to assign to account-b
 *
 * Outputs JSON to stdout:
 *   { "account-a": { userId, apiKey }, "account-b": { userId, apiKey } }
 */

import { createRequire } from 'module';
import { resolve } from 'path';

const require = createRequire(import.meta.url);

// DATA_DIR must be set so users.js writes to the test directory
const DATA_DIR = process.env.DATA_DIR;
const USER_A_KEY = process.env.USER_A_KEY;
const USER_B_KEY = process.env.USER_B_KEY;

if (!DATA_DIR) {
  console.error('DATA_DIR is required');
  process.exit(1);
}
if (!USER_A_KEY || !USER_B_KEY) {
  console.error('USER_A_KEY and USER_B_KEY are required');
  process.exit(1);
}

// Set DATA_DIR before importing users.js (it reads process.env.DATA_DIR at module level)
process.env.DATA_DIR = resolve(DATA_DIR);

const users = require('../backend/server/users.js');

try {
  users.createUserWithKey('account-a', USER_A_KEY);
  users.createUserWithKey('account-b', USER_B_KEY);

  const result = {
    'account-a': { userId: 'account-a', apiKey: USER_A_KEY },
    'account-b': { userId: 'account-b', apiKey: USER_B_KEY },
  };

  console.log(JSON.stringify(result));
  users.closeSystemDb();
} catch (err) {
  console.error('Failed to create test users:', err.message);
  users.closeSystemDb();
  process.exit(1);
}
