// Datastore module - TinyBase implementation

import { createStore, createIndexes, createRelationships, createMetrics } from 'tinybase';
import { schema, indexes, relationships, metrics } from './schema.js';
import { id, labels, defaults, storageKeys } from './config.js';

console.log('datastore', 'loading');

let store = null;
let indexesInstance = null;
let relationshipsInstance = null;
let metricsInstance = null;

// Generate unique ID
const generateId = (prefix = 'id') => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Get current timestamp
const now = () => Date.now();

// Parse URL to extract components
const parseUrl = (uri) => {
  try {
    const url = new URL(uri);
    return {
      protocol: url.protocol.replace(':', ''),
      domain: url.hostname,
      path: url.pathname + url.search + url.hash
    };
  } catch (error) {
    // Fallback for invalid URLs
    return {
      protocol: '',
      domain: '',
      path: uri
    };
  }
};

// Initialize the datastore
const init = () => {
  console.log('datastore', 'initializing');

  try {
    // Create the store with schema
    store = createStore();

    // Set up the schema
    store.setTablesSchema(schema);

    // Create indexes
    indexesInstance = createIndexes(store);
    Object.entries(indexes).forEach(([indexName, indexConfig]) => {
      indexesInstance.setIndexDefinition(
        indexName,
        indexConfig.table,
        indexConfig.on
      );
    });

    // Create relationships
    relationshipsInstance = createRelationships(store);
    Object.entries(relationships).forEach(([relName, relConfig]) => {
      relationshipsInstance.setRelationshipDefinition(
        relName,
        relConfig.localTableId,
        relConfig.remoteTableId,
        relConfig.relationshipId
      );
    });

    // Create metrics
    metricsInstance = createMetrics(store);
    Object.entries(metrics).forEach(([metricName, metricConfig]) => {
      if (metricConfig.metric) {
        // Aggregate metric on specific cell
        metricsInstance.setMetricDefinition(
          metricName,
          metricConfig.table,
          metricConfig.aggregate,
          metricConfig.metric
        );
      } else {
        // Simple count metric
        metricsInstance.setMetricDefinition(
          metricName,
          metricConfig.table,
          'count'
        );
      }
    });

    console.log('datastore', 'initialized successfully');
    return true;
  } catch (error) {
    console.error('datastore', 'initialization failed:', error);
    return false;
  }
};

// Uninitialize (cleanup)
const uninit = () => {
  console.log('datastore', 'uninitializing');

  if (metricsInstance) {
    metricsInstance.destroy();
    metricsInstance = null;
  }

  if (relationshipsInstance) {
    relationshipsInstance.destroy();
    relationshipsInstance = null;
  }

  if (indexesInstance) {
    indexesInstance.destroy();
    indexesInstance = null;
  }

  // Store doesn't have a destroy method in TinyBase, just clear references
  if (store) {
    store = null;
  }
};

// ===== CRUD Operations =====

// --- Addresses ---

const addAddress = (uri, data = {}) => {
  const parsed = parseUrl(uri);
  const addressId = generateId('addr');
  const timestamp = now();

  const row = {
    uri,
    protocol: data.protocol || parsed.protocol,
    domain: data.domain || parsed.domain,
    path: data.path || parsed.path,
    title: data.title || '',
    mimeType: data.mimeType || 'text/html',
    favicon: data.favicon || '',
    description: data.description || '',
    tags: data.tags || '',
    metadata: data.metadata || '{}',
    createdAt: timestamp,
    updatedAt: timestamp,
    lastVisitAt: data.lastVisitAt || 0,
    visitCount: data.visitCount || 0,
    starred: data.starred || 0,
    archived: data.archived || 0
  };

  store.setRow('addresses', addressId, row);
  return addressId;
};

const getAddress = (addressId) => {
  return store.getRow('addresses', addressId);
};

const updateAddress = (addressId, data) => {
  const existing = getAddress(addressId);
  if (!existing) {
    throw new Error(`Address ${addressId} not found`);
  }

  const updated = {
    ...existing,
    ...data,
    updatedAt: now()
  };

  store.setRow('addresses', addressId, updated);
  return updated;
};

const deleteAddress = (addressId) => {
  store.delRow('addresses', addressId);
};

const queryAddresses = (filter = {}) => {
  const table = store.getTable('addresses');
  let results = Object.entries(table).map(([id, row]) => ({ id, ...row }));

  // Apply filters
  if (filter.domain) {
    results = results.filter(addr => addr.domain === filter.domain);
  }
  if (filter.protocol) {
    results = results.filter(addr => addr.protocol === filter.protocol);
  }
  if (filter.starred !== undefined) {
    results = results.filter(addr => addr.starred === filter.starred);
  }
  if (filter.tag) {
    results = results.filter(addr => addr.tags.includes(filter.tag));
  }

  // Sort
  if (filter.sortBy === 'lastVisit') {
    results.sort((a, b) => b.lastVisitAt - a.lastVisitAt);
  } else if (filter.sortBy === 'visitCount') {
    results.sort((a, b) => b.visitCount - a.visitCount);
  } else if (filter.sortBy === 'created') {
    results.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Limit
  if (filter.limit) {
    results = results.slice(0, filter.limit);
  }

  return results;
};

// --- Visits ---

const addVisit = (addressId, data = {}) => {
  const visitId = generateId('visit');
  const timestamp = now();

  const row = {
    addressId,
    timestamp: data.timestamp || timestamp,
    duration: data.duration || 0,
    source: data.source || 'direct',
    sourceId: data.sourceId || '',
    windowType: data.windowType || 'main',
    metadata: data.metadata || '{}',
    scrollDepth: data.scrollDepth || 0,
    interacted: data.interacted || 0
  };

  store.setRow('visits', visitId, row);

  // Update address visit stats
  const address = getAddress(addressId);
  if (address) {
    updateAddress(addressId, {
      lastVisitAt: timestamp,
      visitCount: address.visitCount + 1
    });
  }

  return visitId;
};

const getVisit = (visitId) => {
  return store.getRow('visits', visitId);
};

const queryVisits = (filter = {}) => {
  const table = store.getTable('visits');
  let results = Object.entries(table).map(([id, row]) => ({ id, ...row }));

  // Apply filters
  if (filter.addressId) {
    results = results.filter(visit => visit.addressId === filter.addressId);
  }
  if (filter.source) {
    results = results.filter(visit => visit.source === filter.source);
  }
  if (filter.since) {
    const since = typeof filter.since === 'number' ? filter.since : now() - filter.since;
    results = results.filter(visit => visit.timestamp >= since);
  }

  // Sort by timestamp (most recent first)
  results.sort((a, b) => b.timestamp - a.timestamp);

  // Limit
  if (filter.limit) {
    results = results.slice(0, filter.limit);
  }

  return results;
};

// --- Content ---

const addContent = (data = {}) => {
  const contentId = generateId('content');
  const timestamp = now();

  const row = {
    title: data.title || 'Untitled',
    content: data.content || '',
    mimeType: data.mimeType || 'text/plain',
    contentType: data.contentType || 'plain',
    language: data.language || '',
    encoding: data.encoding || 'utf-8',
    tags: data.tags || '',
    addressRefs: data.addressRefs || '',
    parentId: data.parentId || '',
    metadata: data.metadata || '{}',
    createdAt: timestamp,
    updatedAt: timestamp,
    syncPath: data.syncPath || '',
    synced: data.synced || 0,
    starred: data.starred || 0,
    archived: data.archived || 0
  };

  store.setRow('content', contentId, row);
  return contentId;
};

const getContent = (contentId) => {
  return store.getRow('content', contentId);
};

const updateContent = (contentId, data) => {
  const existing = getContent(contentId);
  if (!existing) {
    throw new Error(`Content ${contentId} not found`);
  }

  const updated = {
    ...existing,
    ...data,
    updatedAt: now()
  };

  store.setRow('content', contentId, updated);
  return updated;
};

const deleteContent = (contentId) => {
  store.delRow('content', contentId);
};

const queryContent = (filter = {}) => {
  const table = store.getTable('content');
  let results = Object.entries(table).map(([id, row]) => ({ id, ...row }));

  // Apply filters
  if (filter.contentType) {
    results = results.filter(item => item.contentType === filter.contentType);
  }
  if (filter.mimeType) {
    results = results.filter(item => item.mimeType === filter.mimeType);
  }
  if (filter.synced !== undefined) {
    results = results.filter(item => item.synced === filter.synced);
  }
  if (filter.starred !== undefined) {
    results = results.filter(item => item.starred === filter.starred);
  }
  if (filter.tag) {
    results = results.filter(item => item.tags.includes(filter.tag));
  }

  // Sort
  if (filter.sortBy === 'updated') {
    results.sort((a, b) => b.updatedAt - a.updatedAt);
  } else if (filter.sortBy === 'created') {
    results.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Limit
  if (filter.limit) {
    results = results.slice(0, filter.limit);
  }

  return results;
};

// --- Tags ---

const addTag = (name, data = {}) => {
  const tagId = generateId('tag');
  const timestamp = now();

  // Generate slug from name
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const row = {
    name,
    slug,
    color: data.color || '#999999',
    parentId: data.parentId || '',
    description: data.description || '',
    metadata: data.metadata || '{}',
    createdAt: timestamp,
    updatedAt: timestamp,
    usageCount: data.usageCount || 0
  };

  store.setRow('tags', tagId, row);
  return tagId;
};

const getTag = (tagId) => {
  return store.getRow('tags', tagId);
};

const getTagByName = (name) => {
  const table = store.getTable('tags');
  const entry = Object.entries(table).find(([id, row]) => row.name === name);
  return entry ? { id: entry[0], ...entry[1] } : null;
};

const updateTag = (tagId, data) => {
  const existing = getTag(tagId);
  if (!existing) {
    throw new Error(`Tag ${tagId} not found`);
  }

  const updated = {
    ...existing,
    ...data,
    updatedAt: now()
  };

  store.setRow('tags', tagId, updated);
  return updated;
};

const deleteTag = (tagId) => {
  store.delRow('tags', tagId);
};

const queryTags = (filter = {}) => {
  const table = store.getTable('tags');
  let results = Object.entries(table).map(([id, row]) => ({ id, ...row }));

  // Apply filters
  if (filter.parentId !== undefined) {
    results = results.filter(tag => tag.parentId === filter.parentId);
  }

  // Sort
  if (filter.sortBy === 'usage') {
    results.sort((a, b) => b.usageCount - a.usageCount);
  } else if (filter.sortBy === 'name') {
    results.sort((a, b) => a.name.localeCompare(b.name));
  }

  return results;
};

// --- Utility functions ---

const getStats = () => {
  if (!metricsInstance) {
    return {};
  }

  return {
    totalAddresses: metricsInstance.getMetric('totalAddresses'),
    totalVisits: metricsInstance.getMetric('totalVisits'),
    avgVisitDuration: metricsInstance.getMetric('avgVisitDuration'),
    totalBlobSize: metricsInstance.getMetric('totalBlobSize'),
    totalContent: metricsInstance.getMetric('totalContent'),
    syncedContent: metricsInstance.getMetric('syncedContent')
  };
};

const getStore = () => store;
const getIndexes = () => indexesInstance;
const getRelationships = () => relationshipsInstance;
const getMetrics = () => metricsInstance;

// Export datastore API
export default {
  // Lifecycle
  init,
  uninit,

  // Addresses
  addAddress,
  getAddress,
  updateAddress,
  deleteAddress,
  queryAddresses,

  // Visits
  addVisit,
  getVisit,
  queryVisits,

  // Content
  addContent,
  getContent,
  updateContent,
  deleteContent,
  queryContent,

  // Tags
  addTag,
  getTag,
  getTagByName,
  updateTag,
  deleteTag,
  queryTags,

  // Stats & utilities
  getStats,
  getStore,
  getIndexes,
  getRelationships,
  getMetrics,

  // Config
  id,
  labels,
  defaults,
  storageKeys
};
