// Datastore schema definitions for TinyBase

export const schema = {
  addresses: {
    uri: { type: 'string' },
    protocol: { type: 'string', default: 'https' },
    domain: { type: 'string' },
    path: { type: 'string', default: '' },
    title: { type: 'string', default: '' },
    mimeType: { type: 'string', default: 'text/html' },
    favicon: { type: 'string', default: '' },
    description: { type: 'string', default: '' },
    tags: { type: 'string', default: '' },
    metadata: { type: 'string', default: '{}' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
    lastVisitAt: { type: 'number', default: 0 },
    visitCount: { type: 'number', default: 0 },
    starred: { type: 'number', default: 0 },
    archived: { type: 'number', default: 0 }
  },

  visits: {
    addressId: { type: 'string' },
    timestamp: { type: 'number' },
    duration: { type: 'number', default: 0 },
    source: { type: 'string', default: 'direct' },
    sourceId: { type: 'string', default: '' },
    windowType: { type: 'string', default: 'main' },
    metadata: { type: 'string', default: '{}' },
    scrollDepth: { type: 'number', default: 0 },
    interacted: { type: 'number', default: 0 }
  },

  content: {
    title: { type: 'string', default: 'Untitled' },
    content: { type: 'string', default: '' },
    mimeType: { type: 'string', default: 'text/plain' },
    contentType: { type: 'string', default: 'plain' },
    language: { type: 'string', default: '' },
    encoding: { type: 'string', default: 'utf-8' },
    tags: { type: 'string', default: '' },
    addressRefs: { type: 'string', default: '' },
    parentId: { type: 'string', default: '' },
    metadata: { type: 'string', default: '{}' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
    syncPath: { type: 'string', default: '' },
    synced: { type: 'number', default: 0 },
    starred: { type: 'number', default: 0 },
    archived: { type: 'number', default: 0 }
  },

  tags: {
    name: { type: 'string' },
    slug: { type: 'string' },
    color: { type: 'string', default: '#999999' },
    parentId: { type: 'string', default: '' },
    description: { type: 'string', default: '' },
    metadata: { type: 'string', default: '{}' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
    usageCount: { type: 'number', default: 0 }
  },

  blobs: {
    filename: { type: 'string' },
    mimeType: { type: 'string' },
    mediaType: { type: 'string' },
    size: { type: 'number' },
    hash: { type: 'string' },
    extension: { type: 'string' },
    path: { type: 'string' },
    addressId: { type: 'string', default: '' },
    contentId: { type: 'string', default: '' },
    tags: { type: 'string', default: '' },
    metadata: { type: 'string', default: '{}' },
    createdAt: { type: 'number' },
    width: { type: 'number', default: 0 },
    height: { type: 'number', default: 0 },
    duration: { type: 'number', default: 0 },
    thumbnail: { type: 'string', default: '' }
  },

  scripts_data: {
    scriptId: { type: 'string' },
    scriptName: { type: 'string' },
    addressId: { type: 'string' },
    selector: { type: 'string' },
    content: { type: 'string' },
    contentType: { type: 'string', default: 'text' },
    metadata: { type: 'string', default: '{}' },
    extractedAt: { type: 'number' },
    previousValue: { type: 'string', default: '' },
    changed: { type: 'number', default: 0 }
  },

  feeds: {
    name: { type: 'string' },
    description: { type: 'string', default: '' },
    type: { type: 'string' },
    query: { type: 'string', default: '' },
    schedule: { type: 'string', default: '' },
    source: { type: 'string', default: 'internal' },
    tags: { type: 'string', default: '' },
    metadata: { type: 'string', default: '{}' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
    lastFetchedAt: { type: 'number', default: 0 },
    enabled: { type: 'number', default: 1 }
  }
};

// Index definitions
export const indexes = {
  // Address indexes
  addresses_byDomain: {
    table: 'addresses',
    on: 'domain'
  },
  addresses_byProtocol: {
    table: 'addresses',
    on: 'protocol'
  },
  addresses_byStarred: {
    table: 'addresses',
    on: 'starred'
  },

  // Visit indexes
  visits_byAddress: {
    table: 'visits',
    on: 'addressId'
  },
  visits_byTimestamp: {
    table: 'visits',
    on: 'timestamp'
  },
  visits_bySource: {
    table: 'visits',
    on: 'source'
  },

  // Content indexes
  content_byContentType: {
    table: 'content',
    on: 'contentType'
  },
  content_byMimeType: {
    table: 'content',
    on: 'mimeType'
  },
  content_bySynced: {
    table: 'content',
    on: 'synced'
  },
  content_byUpdated: {
    table: 'content',
    on: 'updatedAt'
  },

  // Tag indexes
  tags_byName: {
    table: 'tags',
    on: 'name'
  },
  tags_byParent: {
    table: 'tags',
    on: 'parentId'
  },

  // Blob indexes
  blobs_byMediaType: {
    table: 'blobs',
    on: 'mediaType'
  },
  blobs_byMimeType: {
    table: 'blobs',
    on: 'mimeType'
  },

  // Scripts data indexes
  scripts_data_byScript: {
    table: 'scripts_data',
    on: 'scriptId'
  },
  scripts_data_byChanged: {
    table: 'scripts_data',
    on: 'changed'
  },

  // Feed indexes
  feeds_byType: {
    table: 'feeds',
    on: 'type'
  },
  feeds_byEnabled: {
    table: 'feeds',
    on: 'enabled'
  }
};

// Relationship definitions
export const relationships = {
  // Visits to their addresses
  visitAddress: {
    localTableId: 'visits',
    remoteTableId: 'addresses',
    relationshipId: 'addressId'
  },

  // Blobs to their source addresses
  blobAddress: {
    localTableId: 'blobs',
    remoteTableId: 'addresses',
    relationshipId: 'addressId'
  },

  // Blobs to their content
  blobContent: {
    localTableId: 'blobs',
    remoteTableId: 'content',
    relationshipId: 'contentId'
  },

  // Scripts data to addresses
  scriptDataAddress: {
    localTableId: 'scripts_data',
    remoteTableId: 'addresses',
    relationshipId: 'addressId'
  },

  // Tag hierarchy (self-referential)
  childTags: {
    localTableId: 'tags',
    remoteTableId: 'tags',
    relationshipId: 'parentId'
  },

  // Content hierarchy (self-referential)
  childContent: {
    localTableId: 'content',
    remoteTableId: 'content',
    relationshipId: 'parentId'
  }
};

// Metric definitions
export const metrics = {
  // Total addresses
  totalAddresses: {
    table: 'addresses',
    aggregate: 'count'
  },

  // Total visits
  totalVisits: {
    table: 'visits',
    aggregate: 'count'
  },

  // Average visit duration
  avgVisitDuration: {
    table: 'visits',
    metric: 'duration',
    aggregate: 'avg'
  },

  // Total storage used by blobs
  totalBlobSize: {
    table: 'blobs',
    metric: 'size',
    aggregate: 'sum'
  },

  // Number of content items
  totalContent: {
    table: 'content',
    aggregate: 'count'
  },

  // Number of synced content items
  syncedContent: {
    table: 'content',
    where: { synced: 1 },
    aggregate: 'count'
  }
};
