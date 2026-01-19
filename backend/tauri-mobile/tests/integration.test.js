/**
 * Integration test for Peek Mobile <-> backend/server webhook sync
 *
 * This test:
 * 1. Starts the server (backend/server/) with a temp data directory
 * 2. Creates a test user and API key
 * 3. Submits test data (pages, texts, tagsets) via the webhook API
 * 4. Fetches data back and verifies it matches what was submitted
 * 5. Cleans up temp directory on exit
 */

import { spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PEEK_NODE_PATH = join(__dirname, '..', '..', 'server');
const TEST_PORT = 3456;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let serverProcess = null;
let tempDir = null;
let apiKey = null;

// Test data
const pagesData = [
  { url: 'https://example.com/page1', tags: ['test', 'example'], metadata: { title: 'Example Page 1', sourceApp: 'com.apple.mobilesafari' } },
  { url: 'https://github.com/test/repo', tags: ['github', 'code', 'test'], metadata: { title: 'Test Repository - GitHub' } },
  { url: 'https://news.ycombinator.com/item?id=12345', tags: ['hn', 'news'] },  // No metadata to test optional handling
];

const textsData = [
  { content: 'This is a test note with #hashtag1 and #hashtag2', tags: ['hashtag1', 'hashtag2', 'manual-tag'], metadata: { sourceApp: 'com.apple.notes' } },
  { content: 'Another note without hashtags', tags: ['plain', 'note'] },
  { content: 'Quick #idea for later #todo', tags: ['idea', 'todo'], metadata: { selectedText: 'Some highlighted text' } },
];

const tagsetsData = [
  { tags: ['reading-list', 'priority'] },
  { tags: ['work', 'project-x', 'urgent'] },
  { tags: ['personal', 'recipes', 'cooking'] },
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
  console.log('Starting peek-node server...');

  // Create temp directory
  tempDir = await mkdtemp(join(tmpdir(), 'peek-test-'));
  console.log(`  Temp directory: ${tempDir}`);

  // Generate a test API key
  apiKey = 'test-api-key-' + Math.random().toString(36).substring(2);

  // Start server with temp data dir and test API key
  serverProcess = spawn('node', ['index.js'], {
    cwd: PEEK_NODE_PATH,
    env: {
      ...process.env,
      PORT: TEST_PORT.toString(),
      DATA_DIR: tempDir,
      API_KEY: apiKey,  // Legacy single-user mode for testing
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

  if (tempDir) {
    console.log('Cleaning up temp directory...');
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
}

async function apiRequest(method, path, body = null) {
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
async function testWebhookSync() {
  console.log('\n--- Testing Webhook Sync (Pages) ---');

  // Submit pages via webhook (this is what the iOS app does)
  const webhookPayload = {
    urls: pagesData.map(p => {
      const item = {
        id: crypto.randomUUID(),
        url: p.url,
        tags: p.tags,
        saved_at: new Date().toISOString(),
      };
      // Include metadata if present
      if (p.metadata) {
        item.metadata = p.metadata;
      }
      return item;
    }),
  };

  const result = await apiRequest('POST', '/webhook', webhookPayload);
  console.log(`  Submitted ${webhookPayload.urls.length} pages via webhook`);
  console.log(`  Response: received=${result.received}, saved_count=${result.saved_count}`);

  if (result.saved_count !== pagesData.length) {
    throw new Error(`Expected ${pagesData.length} saved, got ${result.saved_count}`);
  }

  // Fetch pages back
  const fetchedUrls = await apiRequest('GET', '/urls');
  console.log(`  Fetched ${fetchedUrls.urls.length} pages from API`);

  if (fetchedUrls.urls.length !== pagesData.length) {
    throw new Error(`Expected ${pagesData.length} pages, got ${fetchedUrls.urls.length}`);
  }

  // Verify each page
  for (const testPage of pagesData) {
    const found = fetchedUrls.urls.find(u => u.url === testPage.url);
    if (!found) {
      throw new Error(`Page not found: ${testPage.url}`);
    }

    const tagsMatch = testPage.tags.every(t => found.tags.includes(t)) &&
                      found.tags.every(t => testPage.tags.includes(t));
    if (!tagsMatch) {
      throw new Error(`Tags mismatch for ${testPage.url}: expected ${JSON.stringify(testPage.tags)}, got ${JSON.stringify(found.tags)}`);
    }

    // Verify metadata if it was provided
    if (testPage.metadata) {
      if (!found.metadata) {
        throw new Error(`Metadata missing for ${testPage.url}`);
      }
      if (testPage.metadata.title && found.metadata.title !== testPage.metadata.title) {
        throw new Error(`Title mismatch for ${testPage.url}: expected '${testPage.metadata.title}', got '${found.metadata.title}'`);
      }
      console.log(`  Verified metadata for ${testPage.url}: title='${found.metadata.title || 'N/A'}'`);
    }
  }

  console.log('  All pages verified successfully (including metadata)');
}

async function testTexts() {
  console.log('\n--- Testing Texts ---');

  const submittedIds = [];

  // Submit texts (including metadata when present)
  for (const text of textsData) {
    const payload = {
      content: text.content,
      tags: text.tags,
    };
    if (text.metadata) {
      payload.metadata = text.metadata;
    }
    const result = await apiRequest('POST', '/texts', payload);
    submittedIds.push(result.id);
    console.log(`  Created text: ${result.id}`);
  }

  // Fetch texts back
  const fetchedTexts = await apiRequest('GET', '/texts');
  console.log(`  Fetched ${fetchedTexts.texts.length} texts from API`);

  if (fetchedTexts.texts.length !== textsData.length) {
    throw new Error(`Expected ${textsData.length} texts, got ${fetchedTexts.texts.length}`);
  }

  // Verify each text
  for (let i = 0; i < textsData.length; i++) {
    const testText = textsData[i];
    const found = fetchedTexts.texts.find(t => t.content === testText.content);
    if (!found) {
      throw new Error(`Text not found: ${testText.content.substring(0, 30)}...`);
    }

    const tagsMatch = testText.tags.every(t => found.tags.includes(t)) &&
                      found.tags.every(t => testText.tags.includes(t));
    if (!tagsMatch) {
      throw new Error(`Tags mismatch for text: expected ${JSON.stringify(testText.tags)}, got ${JSON.stringify(found.tags)}`);
    }

    // Verify metadata if it was provided
    if (testText.metadata) {
      if (!found.metadata) {
        throw new Error(`Metadata missing for text: ${testText.content.substring(0, 30)}...`);
      }
      // Check specific metadata fields
      for (const [key, value] of Object.entries(testText.metadata)) {
        if (found.metadata[key] !== value) {
          throw new Error(`Metadata.${key} mismatch: expected '${value}', got '${found.metadata[key]}'`);
        }
      }
      console.log(`  Verified metadata for text: ${Object.keys(testText.metadata).join(', ')}`);
    }
  }

  console.log('  All texts verified successfully (including metadata)');
}

async function testTagsets() {
  console.log('\n--- Testing Tagsets ---');

  const submittedIds = [];

  // Submit tagsets
  for (const tagset of tagsetsData) {
    const result = await apiRequest('POST', '/tagsets', {
      tags: tagset.tags,
    });
    submittedIds.push(result.id);
    console.log(`  Created tagset: ${result.id}`);
  }

  // Fetch tagsets back
  const fetchedTagsets = await apiRequest('GET', '/tagsets');
  console.log(`  Fetched ${fetchedTagsets.tagsets.length} tagsets from API`);

  if (fetchedTagsets.tagsets.length !== tagsetsData.length) {
    throw new Error(`Expected ${tagsetsData.length} tagsets, got ${fetchedTagsets.tagsets.length}`);
  }

  // Verify each tagset
  for (const testTagset of tagsetsData) {
    const found = fetchedTagsets.tagsets.find(ts => {
      return testTagset.tags.every(t => ts.tags.includes(t)) &&
             ts.tags.every(t => testTagset.tags.includes(t));
    });
    if (!found) {
      throw new Error(`Tagset not found with tags: ${JSON.stringify(testTagset.tags)}`);
    }
  }

  console.log('  All tagsets verified successfully');
}

async function testUnifiedItemsAPI() {
  console.log('\n--- Testing Unified Items API ---');

  // Create one of each type via /items
  const itemsToCreate = [
    { type: 'url', content: 'https://unified-api-test.com', tags: ['unified', 'test'] },
    { type: 'text', content: 'Unified API text test #unified', tags: ['unified'] },
    { type: 'tagset', tags: ['unified', 'tagset-test'] },
  ];

  for (const item of itemsToCreate) {
    const result = await apiRequest('POST', '/items', item);
    console.log(`  Created ${item.type} via /items: ${result.id}`);
  }

  // Fetch all items
  const allItems = await apiRequest('GET', '/items');
  console.log(`  Fetched ${allItems.items.length} total items`);

  // Fetch filtered by type
  for (const type of ['url', 'text', 'tagset']) {
    const filtered = await apiRequest('GET', `/items?type=${type}`);
    console.log(`  Fetched ${filtered.items.length} items of type '${type}'`);

    // Verify all returned items are of correct type
    for (const item of filtered.items) {
      if (item.type !== type) {
        throw new Error(`Expected type '${type}', got '${item.type}'`);
      }
    }
  }

  console.log('  Unified items API verified successfully');
}

async function testTagsAPI() {
  console.log('\n--- Testing Tags API ---');

  const fetchedTags = await apiRequest('GET', '/tags');
  console.log(`  Fetched ${fetchedTags.tags.length} unique tags`);

  // Verify some expected tags exist
  const expectedTags = ['test', 'unified', 'github'];
  for (const tag of expectedTags) {
    const found = fetchedTags.tags.find(t => t.name === tag);
    if (!found) {
      throw new Error(`Expected tag '${tag}' not found`);
    }
    console.log(`  Tag '${tag}': frequency=${found.frequency}, frecency=${found.frecency_score.toFixed(2)}`);
  }

  console.log('  Tags API verified successfully');
}

async function testUpdateAndDelete() {
  console.log('\n--- Testing Update and Delete ---');

  // Create a test item
  const createResult = await apiRequest('POST', '/items', {
    type: 'text',
    content: 'Item to update and delete',
    tags: ['original-tag'],
  });
  const itemId = createResult.id;
  console.log(`  Created item: ${itemId}`);

  // Update tags
  await apiRequest('PATCH', `/items/${itemId}/tags`, {
    tags: ['updated-tag', 'new-tag'],
  });
  console.log('  Updated tags');

  // Verify update
  const items = await apiRequest('GET', '/items?type=text');
  const updated = items.items.find(i => i.id === itemId);
  if (!updated) {
    throw new Error('Updated item not found');
  }
  if (!updated.tags.includes('updated-tag') || updated.tags.includes('original-tag')) {
    throw new Error(`Tags not updated correctly: ${JSON.stringify(updated.tags)}`);
  }
  console.log('  Verified tag update');

  // Delete item
  await apiRequest('DELETE', `/items/${itemId}`);
  console.log('  Deleted item');

  // Verify deletion
  const afterDelete = await apiRequest('GET', '/items?type=text');
  const stillExists = afterDelete.items.find(i => i.id === itemId);
  if (stillExists) {
    throw new Error('Item still exists after deletion');
  }
  console.log('  Verified deletion');

  console.log('  Update and delete verified successfully');
}

// Main test runner
async function runTests() {
  console.log('='.repeat(50));
  console.log('Peek Mobile <-> Peek Node Integration Tests');
  console.log('='.repeat(50));

  let passed = 0;
  let failed = 0;
  const failures = [];

  const tests = [
    ['Webhook Sync (Pages)', testWebhookSync],
    ['Texts API', testTexts],
    ['Tagsets API', testTagsets],
    ['Unified Items API', testUnifiedItemsAPI],
    ['Tags API', testTagsAPI],
    ['Update and Delete', testUpdateAndDelete],
  ];

  try {
    await startServer();

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
  console.log('\n' + '='.repeat(50));
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
