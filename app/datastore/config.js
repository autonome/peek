// Datastore configuration

export const id = 'datastore';

export const labels = {
  id: 'datastore',
  name: 'Datastore',
  description: 'Personal datastore for addresses, content, and metadata'
};

export const storageKeys = {
  VERSION: 'version',
  SETTINGS: 'settings'
};

export const defaults = {
  version: '1.0.0',
  settings: {
    autoSave: true,
    enableSync: false,
    persistenceType: 'indexeddb', // 'indexeddb', 'sqlite', 'memory'
    blobStoragePath: 'datastore/blobs',
    contentStoragePath: 'datastore/content',
    maxBlobSize: 100 * 1024 * 1024, // 100MB
    autoBackup: false,
    backupInterval: 24 * 60 * 60 * 1000 // 24 hours
  }
};
