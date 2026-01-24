/**
 * Three-Way Sync Test: Mobile, Desktop, and Server
 *
 * This test verifies that all three platforms sync correctly using UUIDs:
 * 1. Starts local server with temp data
 * 2. Simulates mobile sync (API calls with profile UUID + slug fallback)
 * 3. Simulates desktop sync (API calls with profile UUID + slug fallback)
 * 4. Verifies profile isolation and slug fallback work correctly
 *
 * Note: Uses HTTP requests to simulate clients (avoids native module issues)
 *
 * Tests the profile parameter migration:
 * - New clients send: ?profile={uuid}&slug={fallback}
 * - Server resolves UUID to folder path, falls back to slug if UUID unknown
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

// Simulated mobile profile (like what iOS would have)
const mobileProfile = {
  id: crypto.randomUUID(),
  slug: 'default',
  name: 'Default',
};

// Simulated desktop profile
const desktopProfile = {
  id: crypto.randomUUID(),
  slug: 'default',
  name: 'Default',
};

// Second profile for isolation tests
const devProfile = {
  id: crypto.randomUUID(),
  slug: 'dev',
  name: 'Development',
};

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
 * Make API request with profile parameters (simulates mobile or desktop client)
 * Sends: ?profile={uuid}&slug={fallback}
 */
async function clientRequest(profile, method, path, body = null) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${separator}profile=${profile.id}&slug=${profile.slug}`;

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

  log(`[${profile.name}] ${method} ${url}`);
  const res = await fetch(url, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Make API request with slug only (simulates legacy client)
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

// ==================== Test Functions ====================

async function testMobileToServerSync() {
  console.log('\n--- Test: Mobile → Server Sync ---');

  // Mobile creates items
  const mobileItems = [
    { type: 'url', content: 'https://mobile-created.example.com', tags: ['mobile', 'test'] },
    { type: 'text', content: 'Text created on mobile device', tags: ['mobile', 'note'] },
  ];

  for (const item of mobileItems) {
    const result = await clientRequest(mobileProfile, 'POST', '/items', item);
    console.log(`  Mobile created: ${result.id}`);
  }

  // Verify items exist on server
  const serverItems = await clientRequest(mobileProfile, 'GET', '/items');
  console.log(`  Server has ${serverItems.items.length} items for mobile profile`);

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

  // Desktop creates items
  const desktopItems = [
    { type: 'url', content: 'https://desktop-created.example.com', tags: ['desktop', 'test'] },
    { type: 'text', content: 'Text created on desktop app', tags: ['desktop', 'note'] },
  ];

  for (const item of desktopItems) {
    const result = await clientRequest(desktopProfile, 'POST', '/items', item);
    console.log(`  Desktop created: ${result.id}`);
  }

  // Verify items exist on server
  const serverItems = await clientRequest(desktopProfile, 'GET', '/items');
  console.log(`  Server has ${serverItems.items.length} items for desktop profile`);

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

  // Mobile creates item in default profile
  const mobileOnlyItem = {
    type: 'url',
    content: 'https://mobile-only-isolation-' + Date.now() + '.example.com',
    tags: ['mobile-only']
  };
  await clientRequest(mobileProfile, 'POST', '/items', mobileOnlyItem);
  console.log('  Mobile created item in default profile');

  // Dev profile creates item (different profile)
  const devOnlyItem = {
    type: 'url',
    content: 'https://dev-only-isolation-' + Date.now() + '.example.com',
    tags: ['dev-only']
  };
  await clientRequest(devProfile, 'POST', '/items', devOnlyItem);
  console.log('  Dev profile created item in dev profile');

  // Verify mobile profile doesn't see dev's item
  const mobileItems = await clientRequest(mobileProfile, 'GET', '/items');
  const mobileSeesDev = mobileItems.items.some(i => i.content === devOnlyItem.content);
  if (mobileSeesDev) {
    throw new Error('Mobile should NOT see dev-only item (profile isolation failed)');
  }
  console.log('  Verified: Mobile does NOT see dev-only items');

  // Verify dev profile doesn't see mobile's item
  const devItems = await clientRequest(devProfile, 'GET', '/items');
  const devSeesMobile = devItems.items.some(i => i.content === mobileOnlyItem.content);
  if (devSeesMobile) {
    throw new Error('Dev should NOT see mobile-only item (profile isolation failed)');
  }
  console.log('  Verified: Dev does NOT see mobile-only items');

  console.log('  PASSED');
}

async function testSlugFallback() {
  console.log('\n--- Test: Slug Fallback for Unknown UUID ---');

  // Create an item using legacy slug-only request
  const legacyItem = {
    type: 'url',
    content: 'https://legacy-client-' + Date.now() + '.example.com',
    tags: ['legacy']
  };
  const legacyRes = await legacyRequest('default', 'POST', '/items', legacyItem);
  console.log(`  Legacy client created item: ${legacyRes.id}`);

  // Create item with unknown UUID but same slug fallback
  const unknownProfile = {
    id: crypto.randomUUID(),
    slug: 'default',
    name: 'Unknown',
  };
  const newClientItem = {
    type: 'url',
    content: 'https://new-client-unknown-uuid-' + Date.now() + '.example.com',
    tags: ['new-client']
  };
  const newClientRes = await clientRequest(unknownProfile, 'POST', '/items', newClientItem);
  console.log(`  New client (unknown UUID) created item: ${newClientRes.id}`);

  // Both should be in the same profile folder (slug fallback worked)
  const allItems = await legacyRequest('default', 'GET', '/items');

  const hasLegacy = allItems.items.some(i => i.content === legacyItem.content);
  const hasNewClient = allItems.items.some(i => i.content === newClientItem.content);

  if (!hasLegacy) {
    throw new Error('Legacy item not found in profile');
  }
  if (!hasNewClient) {
    throw new Error('New client item not found in profile (slug fallback failed)');
  }

  console.log('  Verified: Both legacy and new client items in same profile via slug fallback');
  console.log('  PASSED');
}

async function testSameSlugDifferentUUIDs() {
  console.log('\n--- Test: Same Slug, Different UUIDs ---');

  // Two different UUIDs with same slug should use same folder (via fallback)
  const client1 = {
    id: crypto.randomUUID(),
    slug: 'shared-slug',
    name: 'Client1',
  };
  const client2 = {
    id: crypto.randomUUID(),
    slug: 'shared-slug',
    name: 'Client2',
  };

  const item1 = { type: 'text', content: 'Item from client 1 - ' + Date.now(), tags: ['client1'] };
  const item2 = { type: 'text', content: 'Item from client 2 - ' + Date.now(), tags: ['client2'] };

  await clientRequest(client1, 'POST', '/items', item1);
  console.log('  Client 1 created item');

  await clientRequest(client2, 'POST', '/items', item2);
  console.log('  Client 2 created item');

  // Client 1 should see client 2's item (same profile via slug fallback)
  const client1Items = await clientRequest(client1, 'GET', '/items');
  const client1SeesItem2 = client1Items.items.some(i => i.content === item2.content);

  if (!client1SeesItem2) {
    throw new Error('Client 1 should see Client 2 item (same slug fallback folder)');
  }

  console.log('  Verified: Different UUIDs with same slug share data');
  console.log('  PASSED');
}

async function testMobileDesktopRoundTrip() {
  console.log('\n--- Test: Mobile ↔ Desktop Round Trip (Same Profile) ---');

  // Use same slug for both (simulating same user on both devices)
  const sharedSlug = 'roundtrip-test';
  const mobileClient = {
    id: crypto.randomUUID(),
    slug: sharedSlug,
    name: 'Mobile',
  };
  const desktopClient = {
    id: crypto.randomUUID(),
    slug: sharedSlug,
    name: 'Desktop',
  };

  // Mobile creates item
  const mobileItem = {
    type: 'url',
    content: 'https://mobile-roundtrip-' + Date.now() + '.example.com',
    tags: ['mobile', 'roundtrip']
  };
  await clientRequest(mobileClient, 'POST', '/items', mobileItem);
  console.log('  Mobile created item');

  // Desktop fetches and should see mobile's item
  const desktopFetch = await clientRequest(desktopClient, 'GET', '/items');
  const desktopSeesMobile = desktopFetch.items.some(i => i.content === mobileItem.content);
  if (!desktopSeesMobile) {
    throw new Error('Desktop should see mobile item (same profile slug)');
  }
  console.log('  Desktop sees mobile item');

  // Desktop creates item
  const desktopItem = {
    type: 'url',
    content: 'https://desktop-roundtrip-' + Date.now() + '.example.com',
    tags: ['desktop', 'roundtrip']
  };
  await clientRequest(desktopClient, 'POST', '/items', desktopItem);
  console.log('  Desktop created item');

  // Mobile fetches and should see desktop's item
  const mobileFetch = await clientRequest(mobileClient, 'GET', '/items');
  const mobileSeesDesktop = mobileFetch.items.some(i => i.content === desktopItem.content);
  if (!mobileSeesDesktop) {
    throw new Error('Mobile should see desktop item (same profile slug)');
  }
  console.log('  Mobile sees desktop item');

  console.log('  PASSED');
}

async function testWebhookWithProfile() {
  console.log('\n--- Test: Webhook with Profile Parameter ---');

  // Simulate iOS webhook call with profile params
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

  const separator = '?';
  const webhookUrl = `${BASE_URL}/webhook${separator}profile=${mobileProfile.id}&slug=${mobileProfile.slug}`;

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
  const items = await clientRequest(mobileProfile, 'GET', '/items');
  const found = items.items.some(i => i.content === webhookPayload.urls[0].url);
  if (!found) {
    throw new Error('Webhook item not found in profile');
  }

  console.log('  Verified: Webhook item saved to correct profile');
  console.log('  PASSED');
}

// ==================== Test Runner ====================

async function runTests() {
  console.log('='.repeat(60));
  console.log('Three-Way Sync Tests: Mobile, Desktop, Server');
  console.log('='.repeat(60));
  console.log(`Mobile profile: ${mobileProfile.id} (slug: ${mobileProfile.slug})`);
  console.log(`Desktop profile: ${desktopProfile.id} (slug: ${desktopProfile.slug})`);
  console.log(`Dev profile: ${devProfile.id} (slug: ${devProfile.slug})`);

  let passed = 0;
  let failed = 0;
  const failures = [];

  try {
    await startServer();

    const tests = [
      ['Mobile → Server Sync', testMobileToServerSync],
      ['Desktop → Server Sync', testDesktopToServerSync],
      ['Profile Isolation', testProfileIsolation],
      ['Slug Fallback for Unknown UUID', testSlugFallback],
      ['Same Slug Different UUIDs', testSameSlugDifferentUUIDs],
      ['Mobile ↔ Desktop Round Trip', testMobileDesktopRoundTrip],
      ['Webhook with Profile Parameter', testWebhookWithProfile],
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
