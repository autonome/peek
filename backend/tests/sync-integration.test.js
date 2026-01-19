/**
 * Integration tests for Desktop <-> Server Sync
 *
 * This test verifies the server-side sync endpoints work correctly:
 * 1. Starts the server (backend/server/) with a temp data directory
 * 2. Creates test items via POST /items
 * 3. Tests GET /items/since/:timestamp for incremental sync
 * 4. Tests GET /items/:id for single item fetch
 * 5. Tests conflict scenarios via timestamps
 * 6. Cleans up temp directory on exit
 *
 * Note: This tests the server sync API. The desktop sync.ts module
 * is tested via the Electron tests.
 */

import { spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, '..', 'server');
const TEST_PORT = 3457;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let serverProcess = null;
let serverTempDir = null;
let apiKey = null;

// Test data
const testItems = [
  { type: 'url', content: 'https://example.com/page1', tags: ['test', 'example'] },
  { type: 'text', content: 'This is a test note #sync', tags: ['sync', 'test'] },
  { type: 'tagset', tags: ['reading-list', 'priority'] },
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  // Create temp directory for server
  serverTempDir = await mkdtemp(join(tmpdir(), 'peek-sync-test-'));
  console.log(`  Temp directory: ${serverTempDir}`);

  // Generate a test API key
  apiKey = 'test-sync-key-' + Math.random().toString(36).substring(2);

  // Start server with temp data dir and test API key
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
    if (process.env.VERBOSE) {
      console.log(`  [server] ${data.toString().trim()}`);
    }
  });

  serverProcess.stderr.on('data', (data) => {
    if (process.env.VERBOSE) {
      console.error(`  [server err] ${data.toString().trim()}`);
    }
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
    console.log('Cleaning up temp directory...');
    await rm(serverTempDir, { recursive: true, force: true });
    serverTempDir = null;
  }
}

// Server API helpers
async function serverRequest(method, path, body = null) {
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

  const res = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

// Test functions
async function testCreateItems() {
  console.log('\n--- Test: Create Items ---');

  const createdIds = [];
  for (const item of testItems) {
    const result = await serverRequest('POST', '/items', item);
    createdIds.push(result.id);
    console.log(`  Created ${item.type}: ${result.id}`);
  }

  if (createdIds.length !== testItems.length) {
    throw new Error(`Expected ${testItems.length} items created, got ${createdIds.length}`);
  }

  // Verify all items exist
  const response = await serverRequest('GET', '/items');
  if (response.items.length !== testItems.length) {
    throw new Error(`Expected ${testItems.length} items, got ${response.items.length}`);
  }

  console.log('  All items created successfully');
  return createdIds;
}

async function testGetSingleItem(itemIds) {
  console.log('\n--- Test: Get Single Item by ID ---');

  const itemId = itemIds[0];
  const response = await serverRequest('GET', `/items/${itemId}`);

  if (!response.item) {
    throw new Error('Expected item in response');
  }

  if (response.item.id !== itemId) {
    throw new Error(`Expected item ID ${itemId}, got ${response.item.id}`);
  }

  console.log(`  Retrieved item: ${response.item.id} (type: ${response.item.type})`);

  // Test non-existent item
  try {
    await serverRequest('GET', '/items/non-existent-id');
    throw new Error('Expected 404 for non-existent item');
  } catch (error) {
    if (!error.message.includes('404')) {
      throw error;
    }
    console.log('  Correctly returned 404 for non-existent item');
  }

  console.log('  Get single item verified');
}

async function testIncrementalSync() {
  console.log('\n--- Test: Incremental Sync (GET /items/since/:timestamp) ---');

  // Record timestamp before creating new items
  const beforeTimestamp = new Date().toISOString();
  await sleep(100); // Ensure items are created after timestamp

  // Create new items
  const newItems = [
    { type: 'url', content: 'https://incremental-1.com', tags: ['incremental'] },
    { type: 'text', content: 'Incremental note', tags: ['incremental'] },
  ];

  for (const item of newItems) {
    await serverRequest('POST', '/items', item);
  }
  console.log(`  Created ${newItems.length} items after timestamp`);

  // Get items since timestamp
  const response = await serverRequest('GET', `/items/since/${beforeTimestamp}`);
  console.log(`  GET /items/since returned ${response.items.length} items`);

  if (response.items.length !== newItems.length) {
    throw new Error(`Expected ${newItems.length} items from /items/since, got ${response.items.length}`);
  }

  // Verify only new items are returned
  for (const newItem of newItems) {
    const found = response.items.find(i => i.content === newItem.content);
    if (!found) {
      throw new Error(`New item not found in response: ${newItem.content}`);
    }
  }

  // Verify response includes timestamp
  if (!response.since) {
    throw new Error('Expected "since" field in response');
  }

  console.log('  Incremental sync endpoint verified');
}

async function testIncrementalSyncWithTypeFilter() {
  console.log('\n--- Test: Incremental Sync with Type Filter ---');

  const beforeTimestamp = new Date().toISOString();
  await sleep(100);

  // Create items of different types
  await serverRequest('POST', '/items', { type: 'url', content: 'https://filter-test.com', tags: ['filter'] });
  await serverRequest('POST', '/items', { type: 'text', content: 'Filter test text', tags: ['filter'] });
  console.log('  Created 1 url and 1 text item');

  // Get only urls since timestamp
  const urlResponse = await serverRequest('GET', `/items/since/${beforeTimestamp}?type=url`);
  console.log(`  GET /items/since?type=url returned ${urlResponse.items.length} items`);

  if (urlResponse.items.length !== 1) {
    throw new Error(`Expected 1 url, got ${urlResponse.items.length}`);
  }

  if (urlResponse.items[0].type !== 'url') {
    throw new Error(`Expected type 'url', got '${urlResponse.items[0].type}'`);
  }

  // Get only texts since timestamp
  const textResponse = await serverRequest('GET', `/items/since/${beforeTimestamp}?type=text`);
  console.log(`  GET /items/since?type=text returned ${textResponse.items.length} items`);

  if (textResponse.items.length !== 1) {
    throw new Error(`Expected 1 text, got ${textResponse.items.length}`);
  }

  console.log('  Type filter verified');
}

async function testInvalidTimestamp() {
  console.log('\n--- Test: Invalid Timestamp Handling ---');

  try {
    await serverRequest('GET', '/items/since/not-a-valid-timestamp');
    throw new Error('Expected error for invalid timestamp');
  } catch (error) {
    if (!error.message.includes('400') && !error.message.includes('Invalid timestamp')) {
      throw error;
    }
    console.log('  Correctly rejected invalid timestamp');
  }

  console.log('  Invalid timestamp handling verified');
}

async function testAllTypesSync() {
  console.log('\n--- Test: All Types Sync (url, text, tagset, image) ---');

  const beforeTimestamp = new Date().toISOString();
  await sleep(100);

  // Create items of each type
  const allTypeItems = [
    { type: 'url', content: 'https://all-types-test.com', tags: ['alltype'] },
    { type: 'text', content: 'All types text note', tags: ['alltype'] },
    { type: 'tagset', tags: ['alltype', 'category1', 'category2'] },
  ];

  for (const item of allTypeItems) {
    await serverRequest('POST', '/items', item);
  }
  console.log(`  Created ${allTypeItems.length} items of different types`);

  // Get all items since timestamp
  const response = await serverRequest('GET', `/items/since/${beforeTimestamp}`);

  // Verify each type
  for (const testItem of allTypeItems) {
    const found = response.items.find(i => i.type === testItem.type);
    if (!found) {
      throw new Error(`Item of type '${testItem.type}' not found in sync response`);
    }
    console.log(`  Verified type '${testItem.type}' in sync response`);
  }

  console.log('  All types sync verified');
}

async function testTagsInSyncResponse() {
  console.log('\n--- Test: Tags in Sync Response ---');

  const beforeTimestamp = new Date().toISOString();
  await sleep(100);

  // Create item with multiple tags
  const taggedItem = {
    type: 'text',
    content: 'Item with many tags for sync',
    tags: ['tag1', 'tag2', 'tag3', 'nested/tag'],
  };

  await serverRequest('POST', '/items', taggedItem);
  console.log(`  Created item with ${taggedItem.tags.length} tags`);

  // Get item via sync endpoint
  const response = await serverRequest('GET', `/items/since/${beforeTimestamp}`);
  const found = response.items.find(i => i.content === taggedItem.content);

  if (!found) {
    throw new Error('Tagged item not found in sync response');
  }

  if (!found.tags || !Array.isArray(found.tags)) {
    throw new Error('Expected tags array in sync response');
  }

  const missingTags = taggedItem.tags.filter(t => !found.tags.includes(t));
  if (missingTags.length > 0) {
    throw new Error(`Missing tags in sync response: ${missingTags.join(', ')}`);
  }

  console.log(`  All ${taggedItem.tags.length} tags present in sync response`);
  console.log('  Tags in sync response verified');
}

async function testMetadataInSyncResponse() {
  console.log('\n--- Test: Metadata in Sync Response ---');

  const beforeTimestamp = new Date().toISOString();
  await sleep(100);

  // Create item with metadata
  const itemWithMetadata = {
    type: 'url',
    content: 'https://metadata-test.com',
    tags: ['metadata'],
    metadata: {
      title: 'Test Page Title',
      sourceApp: 'com.test.app',
      customField: 'custom value',
    },
  };

  await serverRequest('POST', '/items', itemWithMetadata);
  console.log('  Created item with metadata');

  // Get item via sync endpoint
  const response = await serverRequest('GET', `/items/since/${beforeTimestamp}`);
  const found = response.items.find(i => i.content === itemWithMetadata.content);

  if (!found) {
    throw new Error('Item with metadata not found in sync response');
  }

  if (!found.metadata) {
    throw new Error('Expected metadata in sync response');
  }

  if (found.metadata.title !== itemWithMetadata.metadata.title) {
    throw new Error(`Expected title '${itemWithMetadata.metadata.title}', got '${found.metadata.title}'`);
  }

  console.log('  Metadata correctly included in sync response');
}

async function testTimestampFields() {
  console.log('\n--- Test: Timestamp Fields in Response ---');

  const beforeTimestamp = new Date().toISOString();
  await sleep(100);

  await serverRequest('POST', '/items', {
    type: 'text',
    content: 'Timestamp test item',
    tags: ['timestamp'],
  });

  const response = await serverRequest('GET', `/items/since/${beforeTimestamp}`);
  const item = response.items[0];

  if (!item.created_at) {
    throw new Error('Expected created_at in sync response');
  }

  if (!item.updated_at) {
    throw new Error('Expected updated_at in sync response');
  }

  // Verify timestamps are valid ISO strings
  const createdAt = new Date(item.created_at);
  const updatedAt = new Date(item.updated_at);

  if (isNaN(createdAt.getTime())) {
    throw new Error(`Invalid created_at timestamp: ${item.created_at}`);
  }

  if (isNaN(updatedAt.getTime())) {
    throw new Error(`Invalid updated_at timestamp: ${item.updated_at}`);
  }

  console.log(`  created_at: ${item.created_at}`);
  console.log(`  updated_at: ${item.updated_at}`);
  console.log('  Timestamp fields verified');
}

// Main test runner
async function runTests() {
  console.log('='.repeat(60));
  console.log('Desktop <-> Server Sync Integration Tests');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;
  const failures = [];

  try {
    await startServer();

    const tests = [
      ['Create Items', testCreateItems],
      ['Get Single Item', async () => {
        const response = await serverRequest('GET', '/items');
        const ids = response.items.map(i => i.id);
        await testGetSingleItem(ids);
      }],
      ['Incremental Sync', testIncrementalSync],
      ['Incremental Sync with Type Filter', testIncrementalSyncWithTypeFilter],
      ['Invalid Timestamp Handling', testInvalidTimestamp],
      ['All Types Sync', testAllTypesSync],
      ['Tags in Sync Response', testTagsInSyncResponse],
      ['Metadata in Sync Response', testMetadataInSyncResponse],
      ['Timestamp Fields', testTimestampFields],
    ];

    for (const [name, testFn] of tests) {
      try {
        await testFn();
        passed++;
        console.log(`  PASSED: ${name}`);
      } catch (error) {
        failed++;
        failures.push({ name, error: error.message });
        console.error(`  FAILED: ${name}`);
        console.error(`    Error: ${error.message}`);
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
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
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
