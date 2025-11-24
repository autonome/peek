// Test file for datastore module

import datastore from './index.js';

console.log('===== Datastore Test Suite =====\n');

// Initialize the datastore
console.log('1. Initializing datastore...');
const initResult = datastore.init();
console.log('   Result:', initResult ? 'SUCCESS' : 'FAILED');

if (!initResult) {
  console.error('Failed to initialize datastore');
  process.exit(1);
}

// Test Addresses
console.log('\n2. Testing Addresses...');
const addr1 = datastore.addAddress('https://example.com/article', {
  title: 'Example Article',
  description: 'An example article',
  tags: 'tag_1,tag_2'
});
console.log('   Added address:', addr1);

const addr2 = datastore.addAddress('https://github.com/project', {
  title: 'GitHub Project',
  starred: 1
});
console.log('   Added address:', addr2);

const retrievedAddr = datastore.getAddress(addr1);
console.log('   Retrieved address:', retrievedAddr);

datastore.updateAddress(addr1, {
  description: 'Updated description',
  starred: 1
});
console.log('   Updated address');

const allAddresses = datastore.queryAddresses();
console.log('   Total addresses:', allAddresses.length);

const starredAddresses = datastore.queryAddresses({ starred: 1 });
console.log('   Starred addresses:', starredAddresses.length);

// Test Visits
console.log('\n3. Testing Visits...');
const visit1 = datastore.addVisit(addr1, {
  duration: 45000,
  source: 'peek',
  sourceId: 'peek_1',
  windowType: 'modal'
});
console.log('   Added visit:', visit1);

const visit2 = datastore.addVisit(addr1, {
  duration: 120000,
  source: 'direct'
});
console.log('   Added visit:', visit2);

const recentVisits = datastore.queryVisits({ limit: 10 });
console.log('   Recent visits:', recentVisits.length);

const addr1Visits = datastore.queryVisits({ addressId: addr1 });
console.log('   Visits to address 1:', addr1Visits.length);

// Verify address visit count was updated
const updatedAddr1 = datastore.getAddress(addr1);
console.log('   Address visit count:', updatedAddr1.visitCount);

// Test Content
console.log('\n4. Testing Content...');
const content1 = datastore.addContent({
  title: 'My First Note',
  content: '# Hello World\n\nThis is my first note.',
  contentType: 'markdown',
  mimeType: 'text/markdown',
  tags: 'tag_1'
});
console.log('   Added markdown content:', content1);

const content2 = datastore.addContent({
  title: 'Product Prices',
  content: 'product,price\nWidget,19.99\nGadget,29.99',
  contentType: 'csv',
  mimeType: 'text/csv',
  addressRefs: addr2
});
console.log('   Added CSV content:', content2);

const content3 = datastore.addContent({
  title: 'Helper Function',
  content: 'function add(a, b) { return a + b; }',
  contentType: 'code',
  mimeType: 'text/javascript',
  language: 'javascript',
  starred: 1
});
console.log('   Added code snippet:', content3);

datastore.updateContent(content1, {
  content: '# Hello World\n\nThis is my updated note.',
  synced: 1,
  syncPath: 'notes/first-note.md'
});
console.log('   Updated content with sync info');

const allContent = datastore.queryContent();
console.log('   Total content items:', allContent.length);

const markdownContent = datastore.queryContent({ contentType: 'markdown' });
console.log('   Markdown content:', markdownContent.length);

const syncedContent = datastore.queryContent({ synced: 1 });
console.log('   Synced content:', syncedContent.length);

const starredContent = datastore.queryContent({ starred: 1 });
console.log('   Starred content:', starredContent.length);

// Test Tags
console.log('\n5. Testing Tags...');
const tag1 = datastore.addTag('Work', {
  color: '#3498db',
  description: 'Work-related content'
});
console.log('   Added tag:', tag1);

const tag2 = datastore.addTag('Personal', {
  color: '#e74c3c',
  description: 'Personal content'
});
console.log('   Added tag:', tag2);

const tag3 = datastore.addTag('Project Alpha', {
  color: '#2ecc71',
  parentId: tag1
});
console.log('   Added child tag:', tag3);

const workTag = datastore.getTagByName('Work');
console.log('   Retrieved tag by name:', workTag);

const allTags = datastore.queryTags();
console.log('   Total tags:', allTags.length);

const topLevelTags = datastore.queryTags({ parentId: '' });
console.log('   Top-level tags:', topLevelTags.length);

const workChildTags = datastore.queryTags({ parentId: tag1 });
console.log('   Work child tags:', workChildTags.length);

// Test Stats
console.log('\n6. Testing Stats...');
const stats = datastore.getStats();
console.log('   Stats:', JSON.stringify(stats, null, 2));

// Test Store Access
console.log('\n7. Testing Direct Store Access...');
const store = datastore.getStore();
const addressesTable = store.getTable('addresses');
console.log('   Direct table access - addresses:', Object.keys(addressesTable).length);

// Test Cleanup
console.log('\n8. Testing Cleanup...');
datastore.deleteContent(content2);
console.log('   Deleted content item');

const remainingContent = datastore.queryContent();
console.log('   Remaining content:', remainingContent.length);

// Final Stats
console.log('\n9. Final Stats...');
const finalStats = datastore.getStats();
console.log('   Final stats:', JSON.stringify(finalStats, null, 2));

// Summary
console.log('\n===== Test Summary =====');
console.log('Addresses created:', allAddresses.length);
console.log('Visits recorded:', recentVisits.length);
console.log('Content items created:', allContent.length);
console.log('Tags created:', allTags.length);
console.log('All tests completed successfully!');

// Uninitialize
console.log('\n10. Uninitializing datastore...');
datastore.uninit();
console.log('   Done!');
