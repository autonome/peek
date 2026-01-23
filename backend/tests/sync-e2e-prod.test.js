/**
 * End-to-End Integration Tests for Desktop <-> Production Server Sync
 *
 * This test verifies sync against the PRODUCTION Railway server:
 * 1. Requires PEEK_PROD_KEY and PEEK_PROD_URL environment variables
 * 2. Creates items with unique markers for identification and cleanup
 * 3. Verifies via API that items were synced correctly
 * 4. Cleans up all test items in finally block
 *
 * Run with: yarn test:sync:e2e:prod
 *
 * After running, verify server logs with:
 *   railway logs -n 50 --service peek-node | grep "E2E-TEST"
 */

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Import compiled desktop modules (from dist/)
import * as datastore from '../../dist/backend/electron/datastore.js';
import * as sync from '../../dist/backend/electron/sync.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration from environment
const PROD_URL = process.env.PEEK_PROD_URL;
const PROD_KEY = process.env.PEEK_PROD_KEY;

// Test marker for this run - used for identification and cleanup
const TEST_RUN_ID = `E2E-TEST-${Date.now()}`;

let desktopTempDir = null;
const createdServerItemIds = [];  // Track for cleanup

// ==================== Helpers ====================

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(...args) {
  if (process.env.VERBOSE) {
    console.log('  ', ...args);
  }
}

function testMarker(testName) {
  return `[${TEST_RUN_ID}]-${testName}`;
}

async function initDesktopDatastore() {
  console.log('Initializing desktop datastore...');

  // Create temp directory for desktop
  desktopTempDir = await mkdtemp(join(tmpdir(), 'peek-e2e-prod-desktop-'));
  const dbPath = join(desktopTempDir, 'test.db');
  log(`Desktop database: ${dbPath}`);

  // Initialize database
  datastore.initDatabase(dbPath);

  // Configure sync settings
  sync.setSyncConfig({
    serverUrl: PROD_URL,
    apiKey: PROD_KEY,
    lastSyncTime: 0,
    autoSync: false,
  });

  console.log('  Desktop datastore initialized');
}

async function cleanupDesktop() {
  if (desktopTempDir) {
    log('Cleaning up desktop temp directory...');
    datastore.closeDatabase();
    await rm(desktopTempDir, { recursive: true, force: true });
    desktopTempDir = null;
  }
}

// Server API helpers
async function serverRequest(method, path, body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${PROD_KEY}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${PROD_URL}${path}`, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function cleanupServerTestItems() {
  console.log('Cleaning up test items from production server...');

  // Get all items
  const res = await serverRequest('GET', '/items');

  // Find items with our test marker
  const testItems = res.items.filter(i =>
    i.content && i.content.includes(TEST_RUN_ID)
  );

  // Also include any tracked items that might not match the marker
  const allTestIds = new Set([
    ...testItems.map(i => i.id),
    ...createdServerItemIds
  ]);

  console.log(`  Found ${allTestIds.size} test items to delete`);

  for (const id of allTestIds) {
    try {
      await serverRequest('DELETE', `/items/${id}`);
      log(`  Deleted item: ${id}`);
    } catch (e) {
      log(`  Failed to delete ${id}: ${e.message}`);
    }
  }

  console.log('  Cleanup complete');
}

// Verification helpers
async function serverHasItem(content) {
  const res = await serverRequest('GET', '/items');
  return res.items.some(i => i.content === content);
}

function desktopHasItem(content) {
  const items = datastore.queryItems({});
  return items.some(i => i.content === content);
}

async function getServerItem(content) {
  const res = await serverRequest('GET', '/items');
  return res.items.find(i => i.content === content);
}

function getDesktopItem(content) {
  const items = datastore.queryItems({});
  return items.find(i => i.content === content);
}

// ==================== Test Functions ====================

async function testHealthCheck() {
  console.log('\n--- Test: Production Server Health Check ---');

  const res = await fetch(`${PROD_URL}/`);
  const data = await res.json();

  if (!res.ok || data.status !== 'ok') {
    throw new Error(`Health check failed: ${JSON.stringify(data)}`);
  }

  console.log(`  Server status: ${data.status}`);
  console.log('  PASSED');
}

async function testPushToProduction() {
  console.log('\n--- Test: Push to Production ---');

  const marker = testMarker('push-test');

  // Create items on desktop
  const desktopItems = [
    { type: 'url', content: `https://example.com/${marker}` },
    { type: 'text', content: `Test note: ${marker}` },
  ];

  for (const item of desktopItems) {
    const { id } = datastore.addItem(item.type, { content: item.content });
    const { tag } = datastore.getOrCreateTag('e2e-test');
    datastore.tagItem(id, tag.id);
  }
  console.log(`  Created ${desktopItems.length} items on desktop`);

  // Push to production
  const result = await sync.pushToServer(PROD_URL, PROD_KEY, 0);
  console.log(`  Pushed to production: ${result.pushed} items`);

  // Verify items exist on production
  for (const item of desktopItems) {
    const serverItem = await getServerItem(item.content);
    if (!serverItem) {
      throw new Error(`Item not found on production: ${item.content}`);
    }
    createdServerItemIds.push(serverItem.id);
    log(`  Verified on server: ${serverItem.id}`);
  }

  console.log('  Items verified on production server');
  console.log('  PASSED');
}

async function testPullFromProduction() {
  console.log('\n--- Test: Pull from Production ---');

  const marker = testMarker('pull-test');

  // Create items directly on production via API
  const serverItems = [
    { type: 'url', content: `https://server-created.com/${marker}`, tags: ['e2e-test', 'pull'] },
    { type: 'text', content: `Server note: ${marker}`, tags: ['e2e-test', 'pull'] },
  ];

  for (const item of serverItems) {
    const res = await serverRequest('POST', '/items', item);
    createdServerItemIds.push(res.id);
    log(`  Created on server: ${res.id}`);
  }
  console.log(`  Created ${serverItems.length} items on production`);

  // Pull from production
  const result = await sync.pullFromServer(PROD_URL, PROD_KEY);
  console.log(`  Pulled from production: ${result.pulled} items`);

  // Verify items exist on desktop
  for (const item of serverItems) {
    if (!desktopHasItem(item.content)) {
      throw new Error(`Item not found on desktop after pull: ${item.content}`);
    }
  }

  // Verify tags were synced
  const desktopItem = getDesktopItem(serverItems[0].content);
  const tags = datastore.getItemTags(desktopItem.id);
  if (!tags.some(t => t.name === 'pull')) {
    throw new Error('Tag "pull" not found on desktop item');
  }

  console.log('  Items verified on desktop');
  console.log('  PASSED');
}

async function testBidirectionalSync() {
  console.log('\n--- Test: Bidirectional Sync ---');

  const marker = testMarker('bidir');

  // Create different items on both sides
  const serverOnlyItem = {
    type: 'url',
    content: `https://server-only.com/${marker}`,
    tags: ['e2e-test', 'bidir']
  };
  const desktopOnlyContent = `Desktop only: ${marker}`;

  // Create on server
  const serverRes = await serverRequest('POST', '/items', serverOnlyItem);
  createdServerItemIds.push(serverRes.id);
  console.log('  Created item on production');

  // Create on desktop
  const { id } = datastore.addItem('text', { content: desktopOnlyContent });
  const { tag } = datastore.getOrCreateTag('bidir');
  datastore.tagItem(id, tag.id);
  console.log('  Created item on desktop');

  // Perform full sync
  const result = await sync.syncAll(PROD_URL, PROD_KEY);
  console.log(`  Synced: ${result.pulled} pulled, ${result.pushed} pushed`);

  // Verify server item is on desktop
  if (!desktopHasItem(serverOnlyItem.content)) {
    throw new Error('Server item not found on desktop after sync');
  }

  // Verify desktop item is on server
  const pushedItem = await getServerItem(desktopOnlyContent);
  if (!pushedItem) {
    throw new Error('Desktop item not found on server after sync');
  }
  createdServerItemIds.push(pushedItem.id);

  console.log('  Bidirectional sync verified');
  console.log('  PASSED');
}

async function testIncrementalSync() {
  console.log('\n--- Test: Incremental Sync ---');

  const marker = testMarker('incremental');

  // Create initial item and sync
  const initialItem = {
    type: 'text',
    content: `Initial: ${marker}`,
    tags: ['e2e-test', 'incremental']
  };
  const initialRes = await serverRequest('POST', '/items', initialItem);
  createdServerItemIds.push(initialRes.id);

  await sync.syncAll(PROD_URL, PROD_KEY);
  console.log('  Initial sync complete');

  // Wait and record timestamp
  await sleep(100);
  const syncTime = Date.now();
  await sleep(100);

  // Create new items on server after timestamp
  const newItems = [
    { type: 'url', content: `https://new-1.com/${marker}`, tags: ['e2e-test', 'incremental', 'new'] },
    { type: 'text', content: `New note: ${marker}`, tags: ['e2e-test', 'incremental', 'new'] },
  ];

  for (const item of newItems) {
    const res = await serverRequest('POST', '/items', item);
    createdServerItemIds.push(res.id);
  }
  console.log(`  Created ${newItems.length} new items on production after timestamp`);

  // Pull only items since timestamp
  const result = await sync.pullFromServer(PROD_URL, PROD_KEY, syncTime);
  console.log(`  Incremental pull: ${result.pulled} items`);

  // Verify new items were pulled
  for (const item of newItems) {
    if (!desktopHasItem(item.content)) {
      throw new Error(`New item not found on desktop: ${item.content}`);
    }
  }

  console.log('  Incremental sync verified');
  console.log('  PASSED');
}

async function testSyncIdDeduplication() {
  console.log('\n--- Test: sync_id Based Deduplication ---');

  const marker = testMarker('dedup');
  const uniqueContent = `https://dedup-test.com/${marker}`;
  const clientSyncId = `client-sync-id-${Date.now()}`;

  // First push with sync_id
  const res1 = await serverRequest('POST', '/items', {
    type: 'url',
    content: uniqueContent,
    tags: ['first-push'],
    sync_id: clientSyncId,
  });
  createdServerItemIds.push(res1.id);
  console.log(`  First push, got server id: ${res1.id}`);

  // Second push with same sync_id
  const res2 = await serverRequest('POST', '/items', {
    type: 'url',
    content: uniqueContent,
    tags: ['second-push'],
    sync_id: clientSyncId,
  });
  console.log(`  Second push, got server id: ${res2.id}`);

  // Should get same server ID
  if (res1.id !== res2.id) {
    throw new Error(`Expected same server ID, got ${res1.id} and ${res2.id}`);
  }

  // Verify only one item exists
  const items = (await serverRequest('GET', '/items')).items;
  const matching = items.filter(i => i.content === uniqueContent);
  if (matching.length !== 1) {
    throw new Error(`Expected 1 item, got ${matching.length}`);
  }

  console.log('  Deduplication verified');
  console.log('  PASSED');
}

async function testUnicodeContent() {
  console.log('\n--- Test: Unicode Content Handling ---');

  const marker = testMarker('unicode');

  const unicodeContents = [
    { type: 'text', content: `${marker} Hello 🌍 World 🎉`, desc: 'emoji' },
    { type: 'text', content: `${marker} 日本語テスト`, desc: 'Japanese' },
    { type: 'url', content: `https://example.com/${marker}?q=日本語`, desc: 'URL with unicode' },
  ];

  for (const item of unicodeContents) {
    const { id } = datastore.addItem(item.type, { content: item.content });
    log(`  Created ${item.desc}: ${id}`);
  }

  // Push to server
  await sync.pushToServer(PROD_URL, PROD_KEY, 0);
  console.log('  Pushed unicode items to production');

  // Verify all items exist on server with correct content
  let allMatch = true;
  for (const item of unicodeContents) {
    const serverItem = await getServerItem(item.content);
    if (!serverItem) {
      console.log(`  FAILED: ${item.desc} not found on server`);
      allMatch = false;
    } else {
      createdServerItemIds.push(serverItem.id);
      log(`  OK: ${item.desc} synced correctly`);
    }
  }

  if (!allMatch) {
    throw new Error('Some unicode content failed to sync');
  }

  console.log('  Unicode handling verified');
  console.log('  PASSED');
}

// ==================== Test Runner ====================

async function runTests() {
  console.log('='.repeat(60));
  console.log('Desktop <-> Production Server Sync E2E Tests');
  console.log('='.repeat(60));
  console.log(`Test Run ID: ${TEST_RUN_ID}`);
  console.log(`Production URL: ${PROD_URL}`);
  console.log('');

  // Check for required env vars
  if (!PROD_URL || !PROD_KEY) {
    console.error('ERROR: Required environment variables missing');
    if (!PROD_URL) console.error('  - PEEK_PROD_URL not set');
    if (!PROD_KEY) console.error('  - PEEK_PROD_KEY not set');
    console.error('');
    console.error('Set them with:');
    console.error('  export PEEK_PROD_URL=https://your-server.railway.app');
    console.error('  export PEEK_PROD_KEY=your-api-key');
    console.error('');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const failures = [];

  try {
    await initDesktopDatastore();

    const tests = [
      ['Production Health Check', testHealthCheck],
      ['Push to Production', testPushToProduction],
      ['Pull from Production', testPullFromProduction],
      ['Bidirectional Sync', testBidirectionalSync],
      ['Incremental Sync', testIncrementalSync],
      ['sync_id Deduplication', testSyncIdDeduplication],
      ['Unicode Content Handling', testUnicodeContent],
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
    // Always clean up
    try {
      await cleanupServerTestItems();
    } catch (e) {
      console.error('  Warning: Cleanup failed:', e.message);
    }
    await cleanupDesktop();
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const { name, error } of failures) {
      console.log(`  - ${name}: ${error}`);
    }
  }

  console.log('\n' + '-'.repeat(60));
  console.log('To verify server logs, run:');
  console.log(`  railway logs -n 50 --service peek-node | grep "${TEST_RUN_ID}"`);
  console.log('-'.repeat(60));

  console.log('='.repeat(60));

  if (failures.length > 0) {
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    process.exit(0);
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\nInterrupted, cleaning up...');
  try {
    await cleanupServerTestItems();
  } catch (e) {
    // Ignore cleanup errors on interrupt
  }
  await cleanupDesktop();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  try {
    await cleanupServerTestItems();
  } catch (e) {
    // Ignore cleanup errors on interrupt
  }
  await cleanupDesktop();
  process.exit(1);
});

// Run tests
runTests().catch(async (error) => {
  console.error('Test runner error:', error);
  try {
    await cleanupServerTestItems();
  } catch (e) {
    // Ignore cleanup errors
  }
  await cleanupDesktop();
  process.exit(1);
});
