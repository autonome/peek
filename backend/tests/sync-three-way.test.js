/**
 * Three-Way Sync Test: Mobile, Desktop, and Server
 *
 * This test verifies that all three platforms sync correctly using UUIDs:
 * 1. Starts local server with temp data
 * 2. Creates server profiles (returns UUIDs used as folder names)
 * 3. Simulates mobile sync (API calls with profile UUID)
 * 4. Simulates desktop sync (API calls with profile UUID)
 * 5. Verifies profile isolation works correctly
 *
 * Note: Uses HTTP requests to simulate clients (avoids native module issues)
 *
 * Profile parameter: ?profile={uuid}
 * - Server resolves UUID to folder path
 * - Legacy slugs still work for backward compat
 */

import { spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, '..', 'server');
const TEST_PORT = 3459;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let serverProcess = null;
let serverTempDir = null;
let apiKey = null;

// Server-assigned profile UUIDs (set after profile creation)
let defaultProfileId = null;
let devProfileId = null;

// ==================== Helpers ====================

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(...args) {
  if (process.env.VERBOSE) {
    console.log('  ', ...args);
  }
}

async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) {
        console.log('  Server is ready');
        return true;
      }
    } catch (e) {
      // Server not ready yet
    }
    await sleep(100);
  }
  throw new Error('Server failed to start');
}

async function startServer() {
  console.log('Starting server...');

  serverTempDir = await mkdtemp(join(tmpdir(), 'peek-three-way-server-'));
  log(`Server temp directory: ${serverTempDir}`);

  apiKey = 'test-three-way-key-' + Math.random().toString(36).substring(2);

  serverProcess = spawn('node', ['index.js'], {
    cwd: SERVER_PATH,
    env: {
      ...process.env,
      PORT: TEST_PORT.toString(),
      DATA_DIR: serverTempDir,
      API_KEY: apiKey,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (data) => {
    log(`[server] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    log(`[server err] ${data.toString().trim()}`);
  });

  await waitForServer();
  console.log(`  Server running on port ${TEST_PORT}`);
}

async function stopServer() {
  if (serverProcess) {
    console.log('Stopping server...');
    serverProcess.kill('SIGTERM');
    await sleep(500);
    serverProcess = null;
  }

  if (serverTempDir) {
    log('Cleaning up server temp directory...');
    await rm(serverTempDir, { recursive: true, force: true });
    serverTempDir = null;
  }
}

// ==================== API Helpers ====================

/**
 * Make API request with profile UUID parameter
 */
async function clientRequest(profileId, method, path, body = null) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${separator}profile=${profileId}`;

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  log(`${method} ${url}`);
  const res = await fetch(url, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Make API request with legacy slug (simulates old client)
 */
async function legacyRequest(slug, method, path, body = null) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${separator}profile=${slug}`;

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  log(`[legacy] ${method} ${url}`);
  const res = await fetch(url, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Create a server profile and return its UUID
 */
async function createServerProfile(name) {
  const res = await fetch(`${BASE_URL}/profiles`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to create profile: ${JSON.stringify(data)}`);
  }
  return data.profile.id;
}

// ==================== Test Functions ====================

async function testProfileCreation() {
  console.log('\n--- Test: Server Profile Creation ---');

  // Create profiles on server
  defaultProfileId = await createServerProfile('Default');
  console.log(`  Created default profile: ${defaultProfileId}`);

  devProfileId = await createServerProfile('Development');
  console.log(`  Created dev profile: ${devProfileId}`);

  // Verify both are UUIDs
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(defaultProfileId)) {
    throw new Error(`Default profile ID is not a UUID: ${defaultProfileId}`);
  }
  if (!uuidPattern.test(devProfileId)) {
    throw new Error(`Dev profile ID is not a UUID: ${devProfileId}`);
  }

  // List profiles and verify
  const res = await fetch(`${BASE_URL}/profiles`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  const data = await res.json();
  if (data.profiles.length !== 2) {
    throw new Error(`Expected 2 profiles, got ${data.profiles.length}`);
  }

  console.log('  PASSED');
}

async function testMobileToServerSync() {
  console.log('\n--- Test: Mobile → Server Sync ---');

  // Mobile creates items using profile UUID
  const mobileItems = [
    { type: 'url', content: 'https://mobile-created.example.com', tags: ['mobile', 'test'] },
    { type: 'text', content: 'Text created on mobile device', tags: ['mobile', 'note'] },
  ];

  for (const item of mobileItems) {
    const result = await clientRequest(defaultProfileId, 'POST', '/items', item);
    console.log(`  Mobile created: ${result.id}`);
  }

  // Verify items exist on server
  const serverItems = await clientRequest(defaultProfileId, 'GET', '/items');
  console.log(`  Server has ${serverItems.items.length} items for default profile`);

  for (const item of mobileItems) {
    const found = serverItems.items.find(i => i.content === item.content);
    if (!found) {
      throw new Error(`Mobile item not found on server: ${item.content}`);
    }
  }

  console.log('  PASSED');
}

async function testDesktopToServerSync() {
  console.log('\n--- Test: Desktop → Server Sync ---');

  // Desktop creates items using same profile UUID
  const desktopItems = [
    { type: 'url', content: 'https://desktop-created.example.com', tags: ['desktop', 'test'] },
    { type: 'text', content: 'Text created on desktop app', tags: ['desktop', 'note'] },
  ];

  for (const item of desktopItems) {
    const result = await clientRequest(defaultProfileId, 'POST', '/items', item);
    console.log(`  Desktop created: ${result.id}`);
  }

  // Verify items exist on server
  const serverItems = await clientRequest(defaultProfileId, 'GET', '/items');
  console.log(`  Server has ${serverItems.items.length} items for default profile`);

  for (const item of desktopItems) {
    const found = serverItems.items.find(i => i.content === item.content);
    if (!found) {
      throw new Error(`Desktop item not found on server: ${item.content}`);
    }
  }

  console.log('  PASSED');
}

async function testProfileIsolation() {
  console.log('\n--- Test: Profile Isolation ---');

  // Create item in default profile
  const defaultOnlyItem = {
    type: 'url',
    content: 'https://default-only-isolation-' + Date.now() + '.example.com',
    tags: ['default-only']
  };
  await clientRequest(defaultProfileId, 'POST', '/items', defaultOnlyItem);
  console.log('  Created item in default profile');

  // Create item in dev profile
  const devOnlyItem = {
    type: 'url',
    content: 'https://dev-only-isolation-' + Date.now() + '.example.com',
    tags: ['dev-only']
  };
  await clientRequest(devProfileId, 'POST', '/items', devOnlyItem);
  console.log('  Created item in dev profile');

  // Verify default profile doesn't see dev's item
  const defaultItems = await clientRequest(defaultProfileId, 'GET', '/items');
  const defaultSeesDev = defaultItems.items.some(i => i.content === devOnlyItem.content);
  if (defaultSeesDev) {
    throw new Error('Default should NOT see dev-only item (profile isolation failed)');
  }
  console.log('  Verified: Default does NOT see dev-only items');

  // Verify dev profile doesn't see default's item
  const devItems = await clientRequest(devProfileId, 'GET', '/items');
  const devSeesDefault = devItems.items.some(i => i.content === defaultOnlyItem.content);
  if (devSeesDefault) {
    throw new Error('Dev should NOT see default-only item (profile isolation failed)');
  }
  console.log('  Verified: Dev does NOT see default-only items');

  console.log('  PASSED');
}

async function testLegacySlugBackwardCompat() {
  console.log('\n--- Test: Legacy Slug Backward Compatibility ---');

  // Create an item using legacy slug-only request
  const legacyItem = {
    type: 'url',
    content: 'https://legacy-client-' + Date.now() + '.example.com',
    tags: ['legacy']
  };
  const legacyRes = await legacyRequest('default', 'POST', '/items', legacyItem);
  console.log(`  Legacy client created item: ${legacyRes.id}`);

  // Verify item is accessible via the UUID profile
  const uuidItems = await clientRequest(defaultProfileId, 'GET', '/items');
  const found = uuidItems.items.some(i => i.content === legacyItem.content);
  if (!found) {
    throw new Error('Legacy item not found via UUID profile (backward compat failed)');
  }

  console.log('  Verified: Legacy slug items accessible via UUID profile');
  console.log('  PASSED');
}

async function testMobileDesktopRoundTrip() {
  console.log('\n--- Test: Mobile ↔ Desktop Round Trip (Same Profile UUID) ---');

  // Both mobile and desktop use the same server profile UUID

  // Mobile creates item
  const mobileItem = {
    type: 'url',
    content: 'https://mobile-roundtrip-' + Date.now() + '.example.com',
    tags: ['mobile', 'roundtrip']
  };
  await clientRequest(defaultProfileId, 'POST', '/items', mobileItem);
  console.log('  Mobile created item');

  // Desktop fetches and should see mobile's item
  const desktopFetch = await clientRequest(defaultProfileId, 'GET', '/items');
  const desktopSeesMobile = desktopFetch.items.some(i => i.content === mobileItem.content);
  if (!desktopSeesMobile) {
    throw new Error('Desktop should see mobile item (same profile UUID)');
  }
  console.log('  Desktop sees mobile item');

  // Desktop creates item
  const desktopItem = {
    type: 'url',
    content: 'https://desktop-roundtrip-' + Date.now() + '.example.com',
    tags: ['desktop', 'roundtrip']
  };
  await clientRequest(defaultProfileId, 'POST', '/items', desktopItem);
  console.log('  Desktop created item');

  // Mobile fetches and should see desktop's item
  const mobileFetch = await clientRequest(defaultProfileId, 'GET', '/items');
  const mobileSeesDesktop = mobileFetch.items.some(i => i.content === desktopItem.content);
  if (!mobileSeesDesktop) {
    throw new Error('Mobile should see desktop item (same profile UUID)');
  }
  console.log('  Mobile sees desktop item');

  console.log('  PASSED');
}

async function testWebhookWithProfile() {
  console.log('\n--- Test: Webhook with Profile UUID Parameter ---');

  // Simulate iOS webhook call with profile UUID
  const webhookPayload = {
    urls: [
      {
        id: crypto.randomUUID(),
        url: 'https://webhook-test-' + Date.now() + '.example.com',
        tags: ['webhook', 'test'],
        saved_at: new Date().toISOString(),
      }
    ],
  };

  const webhookUrl = `${BASE_URL}/webhook?profile=${defaultProfileId}`;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(webhookPayload),
  });

  const result = await res.json();
  console.log(`  Webhook response: received=${result.received}, saved=${result.saved_count}`);

  if (result.saved_count !== 1) {
    throw new Error(`Expected 1 saved, got ${result.saved_count}`);
  }

  // Verify item is in correct profile
  const items = await clientRequest(defaultProfileId, 'GET', '/items');
  const found = items.items.some(i => i.content === webhookPayload.urls[0].url);
  if (!found) {
    throw new Error('Webhook item not found in profile');
  }

  console.log('  Verified: Webhook item saved to correct profile');
  console.log('  PASSED');
}

async function testUnknownUuidFallsBackToDefault() {
  console.log('\n--- Test: Unknown UUID Falls Back to Default ---');

  // Send request with a UUID that doesn't exist on the server
  const unknownUuid = crypto.randomUUID();
  const item = {
    type: 'text',
    content: 'unknown-uuid-fallback-' + Date.now(),
    tags: ['fallback-test']
  };
  await clientRequest(unknownUuid, 'POST', '/items', item);
  console.log('  Created item with unknown UUID');

  // Item should land in the default profile
  const defaultItems = await clientRequest(defaultProfileId, 'GET', '/items');
  const found = defaultItems.items.some(i => i.content === item.content);
  if (!found) {
    throw new Error('Item with unknown UUID not found in default profile (fallback failed)');
  }

  console.log('  Verified: Unknown UUID falls back to default profile');
  console.log('  PASSED');
}

// ==================== Test Runner ====================

async function runTests() {
  console.log('='.repeat(60));
  console.log('Three-Way Sync Tests: Mobile, Desktop, Server');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;
  const failures = [];

  try {
    await startServer();

    const tests = [
      ['Profile Creation', testProfileCreation],
      ['Mobile → Server Sync', testMobileToServerSync],
      ['Desktop → Server Sync', testDesktopToServerSync],
      ['Profile Isolation', testProfileIsolation],
      ['Legacy Slug Backward Compat', testLegacySlugBackwardCompat],
      ['Mobile ↔ Desktop Round Trip', testMobileDesktopRoundTrip],
      ['Webhook with Profile UUID', testWebhookWithProfile],
      ['Unknown UUID Falls Back to Default', testUnknownUuidFallsBackToDefault],
    ];

    for (const [name, testFn] of tests) {
      try {
        await testFn();
        passed++;
      } catch (error) {
        failed++;
        failures.push({ name, error: error.message });
        console.error(`  FAILED: ${name}`);
        console.error(`    Error: ${error.message}`);
        if (process.env.VERBOSE) {
          console.error(error.stack);
        }
      }
    }
  } finally {
    await stopServer();
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const { name, error } of failures) {
      console.log(`  - ${name}: ${error}`);
    }
    console.log('='.repeat(60));
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    console.log('='.repeat(60));
    process.exit(0);
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\nInterrupted, cleaning up...');
  await stopServer();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await stopServer();
  process.exit(1);
});

// Run tests
runTests().catch(async (error) => {
  console.error('Test runner error:', error);
  await stopServer();
  process.exit(1);
});
