# Server Architecture

## Overview

The Peek sync server is a Node.js/Hono application that supports both multi-user (hosted) and single-user (self-hosted) deployments. It uses abstraction layers for SQL and storage to enable future migration to different backends.

## Abstraction Layers

### SQL Abstraction (`sql/`)

Abstracts database operations to support different SQLite backends:

```
sql/
├── types.js          # SqlAdapter and SqlAdapterFactory interfaces
├── better-sqlite3-adapter.js  # Default adapter for Node.js
└── index.js          # Factory that selects adapter based on SQL_ADAPTER env
```

**Interface:**
```javascript
interface SqlAdapter {
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): { changes: number, lastInsertRowid?: number };
  get<T>(sql: string, params?: unknown[]): T | null;
  all<T>(sql: string, params?: unknown[]): T[];
  transaction<T>(fn: () => T): T;
  close(): void;
}
```

**Future adapters:**
- `do-sqlite-adapter.js` - For Cloudflare Durable Objects (TODO)

### Storage Abstraction (`storage/`)

Abstracts image/blob storage to support different backends:

```
storage/
├── types.js          # StorageAdapter interface
├── filesystem-adapter.js  # Default adapter for local filesystem
└── index.js          # Factory that selects adapter based on STORAGE_BACKEND env
```

**Interface:**
```javascript
interface StorageAdapter {
  put(key: string, data: Buffer, metadata?: object): Promise<void>;
  putSync(key: string, data: Buffer, metadata?: object): void;
  get(key: string): Promise<Buffer | null>;
  getSync(key: string): Buffer | null;
  delete(key: string): Promise<void>;
  deleteSync(key: string): void;
  exists(key: string): Promise<boolean>;
  existsSync(key: string): boolean;
  list(prefix?: string): Promise<string[]>;
}
```

**Future adapters:**
- `r2-adapter.js` - For Cloudflare R2 (TODO)
- `s3-adapter.js` - For S3-compatible storage (TODO)

## User Modes

### Multi-User Mode (Default)

Standard hosted deployment with user isolation:

```
DATA_DIR/
├── system.db                    # User registry
├── {userId}/
│   └── profiles/
│       └── {profileId}/
│           ├── datastore.sqlite
│           └── images/
└── backups/
```

- Authentication via API key (SHA-256 hash lookup in system.db)
- Full user/profile management endpoints
- Data isolation between users

### Single-User Mode

Simplified self-hosted deployment:

```
DATA_DIR/
└── profiles/
    └── {profileId}/
        ├── datastore.sqlite
        └── images/
```

**Enable with:**
```bash
SINGLE_USER_MODE=true
SINGLE_USER_TOKEN=your-secret-token  # Optional bearer token
SINGLE_USER_ID=default               # Optional, defaults to 'default'
```

**Simplifications:**
- No system.db (no user registry)
- No API key hashing (simple token comparison)
- No userId in paths
- User management endpoints disabled

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `DATA_DIR` | `./data` | Data directory |
| `SQL_ADAPTER` | `better-sqlite3` | SQL adapter to use |
| `STORAGE_BACKEND` | `filesystem` | Storage backend to use |
| `SINGLE_USER_MODE` | `false` | Enable single-user mode |
| `SINGLE_USER_TOKEN` | (none) | Bearer token for single-user auth |
| `SINGLE_USER_ID` | `default` | User ID in single-user mode |

## Files

| File | Purpose |
|------|---------|
| `index.js` | Hono app, routes, middleware |
| `db.js` | Database operations, connection pool |
| `users.js` | User/profile management (system.db) |
| `backup.js` | Backup/restore functionality |
| `config.js` | Configuration loading |
| `auth.js` | Authentication middleware factory |
| `sql/` | SQL abstraction layer |
| `storage/` | Storage abstraction layer |

## Testing

```bash
# Unit tests (110 tests)
yarn server:test

# Sync E2E tests (13 tests)
yarn test:sync:e2e

# Single-user mode tests
SINGLE_USER_MODE=true yarn server:test
```
