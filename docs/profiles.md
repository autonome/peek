# Peek User Profiles

Multi-profile support for managing separate data workspaces on desktop and server.

## Overview

Peek supports **user profiles** - isolated data environments that allow you to maintain separate collections of items, settings, and browser sessions. Each profile has its own:

- **Data storage** - Separate SQLite database (`datastore.sqlite`)
- **Sync configuration** - Independent API key and server profile mapping
- **Browser session** - Isolated Chromium session data (cookies, cache, localStorage)
- **Settings** - Profile-specific configuration

## Architecture

### Desktop Client

```
{userData}/
├── profiles.db              # Profile metadata and sync config
├── default/                 # Production profile
│   ├── datastore.sqlite     # Items, tags, etc.
│   ├── chromium/            # Electron session data
│   └── extension_settings   # Legacy settings
├── dev/                     # Development profile
│   ├── datastore.sqlite
│   └── chromium/
└── work/                    # Custom user profile
    ├── datastore.sqlite
    └── chromium/
```

### Server

```
data/
├── system.db                # Users and profile metadata
│   ├── users (id, api_key_hash)
│   └── profiles (id, user_id, slug, name)
└── {userId}/
    └── profiles/
        ├── default/
        │   └── datastore.sqlite
        ├── work/
        │   └── datastore.sqlite
        └── personal/
            └── datastore.sqlite
```

## Profile Metadata

**Desktop `profiles.db` schema:**

```sql
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,                -- UUID
  name TEXT NOT NULL UNIQUE,          -- User-visible (e.g., "Work")
  slug TEXT NOT NULL UNIQUE,          -- Filesystem-safe (e.g., "work")

  -- Sync configuration (optional)
  sync_enabled INTEGER DEFAULT 0,     -- Boolean
  api_key TEXT,                       -- Server user API key
  server_profile_slug TEXT,           -- Which server profile to sync to
  last_sync_at INTEGER,               -- Unix ms

  created_at INTEGER NOT NULL,        -- Unix ms
  last_used_at INTEGER NOT NULL,      -- Unix ms
  is_default INTEGER DEFAULT 0        -- Boolean
);

CREATE TABLE active_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  profile_slug TEXT NOT NULL
);
```

## Profile Types

### Production Profile (default)

- Used by packaged builds installed in `/Applications`
- Created automatically on first launch
- Cannot be deleted
- Isolated from development work

### Development Profile (dev)

- Used by builds running from source (`yarn start`)
- Completely isolated from production
- Skips single-instance lock (allows dev + production to run simultaneously)
- Never touched by production builds

### Custom Profiles

- User-created via Settings UI
- Can be deleted (except active profile)
- Independent sync configuration
- Switchable via Settings (requires app restart)

## Profile Selection Logic

**Desktop (entry.ts):**

1. **Explicit `PROFILE` env var** - Takes precedence (for testing)
2. **Development builds** - ALWAYS use `dev` (source or dev-packaged builds)
3. **Production builds** - Use active profile from `profiles.db`
4. **Fallback** - Use `default`

This ensures:
- Development never touches production data
- Production can use profile switching
- Dev and production can run side-by-side

## Sync Configuration

Each desktop profile can optionally sync to a server profile:

- **API Key** - Authenticates with server user account
- **Server Profile Slug** - Which server profile to sync to

One server user can have multiple server profiles. A desktop user can map different local profiles to different server profiles under the same server account.

**Example:**

```
Desktop Profile     Server User    Server Profile
─────────────────   ──────────     ──────────────
Work                alice          work
Personal            alice          personal
```

Both desktop profiles use the same API key (alice's account) but sync to different server profiles.

## Chromium Profiles vs Peek Profiles

**They are nested, NOT the same:**

```
Peek Profile                     # Application-level profile
└── Chromium Profile             # Browser session data

~/.config/Peek/
├── profiles.db                  # Peek profile metadata
├── default/                     # Peek profile "default"
│   ├── datastore.sqlite         # Peek data
│   └── chromium/                # Chromium session for this profile
│       ├── Cookies
│       ├── Local Storage
│       ├── Cache
│       └── ...
└── work/                        # Peek profile "work"
    ├── datastore.sqlite
    └── chromium/                # Separate Chromium session
```

**Electron configuration:**

```typescript
const profileDataPath = path.join(userDataPath, PROFILE);
const sessionDataPath = path.join(profileDataPath, 'chromium');

app.setPath('userData', profileDataPath);
app.setPath('sessionData', sessionDataPath);
```

Each Peek profile gets its own Chromium session directory. This provides:

- **Isolated cookies** - Separate login sessions per profile
- **Isolated localStorage** - Settings don't bleed between profiles
- **Isolated cache** - Browser cache separation
- **Isolated extensions** - Browser extensions per profile

**Key Difference:**

- **Peek Profile** = High-level data workspace (items, tags, sync config)
- **Chromium Profile** = Low-level browser session data (cookies, cache, etc.)

Chromium profiles are automatically created per Peek profile and are not directly user-visible or manageable.

## Usage

### Settings UI

Open Settings → Profiles section to:

1. **View current profile** - Shows active profile name
2. **Create profile** - Click "Add Profile", enter name
3. **Switch profiles** - Select radio button (app restarts)
4. **Delete profile** - Delete button (disabled for default/active)
5. **Configure sync** - Enable/disable sync per profile

### IPC API

```javascript
// List all profiles
const result = await window.app.profiles.list();
// result.data = [{ id, name, slug, syncEnabled, ... }]

// Get current profile
const current = await window.app.profiles.getCurrent();

// Create new profile
await window.app.profiles.create('Work');

// Switch profile (app restarts)
await window.app.profiles.switch('work');

// Delete profile
await window.app.profiles.delete(profileId);

// Sync configuration
await window.app.profiles.enableSync(profileId, apiKey, serverProfileSlug);
await window.app.profiles.disableSync(profileId);
const syncConfig = await window.app.profiles.getSyncConfig(profileId);
```

### Backend API (profiles.ts)

```typescript
import {
  initProfilesDb,
  listProfiles,
  createProfile,
  getProfile,
  deleteProfile,
  getActiveProfile,
  setActiveProfile,
  enableSync,
  disableSync,
  getSyncConfig,
} from './profiles.js';
```

## Migration

### First Launch

When profiles support first launches:

1. `initProfilesDb()` creates `profiles.db` if missing
2. `migrateExistingProfiles()` detects existing profile directories
3. Existing `default/` and `dev/` directories become profile records
4. `ensureDefaultProfile()` creates default profile if none exist

### Data Preservation

- Profile directories are NOT deleted when profile is removed from `profiles.db`
- Data remains on disk in `{userData}/{slug}/`
- User can manually delete directory if desired

### Backward Compatibility

- `PROFILE` env var still works (overrides profiles.db)
- Existing profile directories detected and migrated
- Development builds always use `dev` regardless of profiles.db state

## Server API

### Profile Endpoints

```
GET  /profiles                # List user's profiles
POST /profiles                # Create profile
  { "slug": "work", "name": "Work" }
DELETE /profiles/:id          # Delete profile
```

### Data Endpoints with Profile Parameter

All data endpoints accept optional `?profile={slug}` parameter:

```
GET  /items?profile=work      # Get items from work profile
POST /items?profile=work      # Create item in work profile
```

Default: `profile=default` if not specified (backward compatible)

## Security Considerations

- API keys stored in plaintext in `profiles.db` (local SQLite file)
- Profile data isolation is filesystem-based
- No encryption on profile data at rest
- Single-instance lock skipped for dev profiles (allows dev+prod simultaneously)

## Limitations

- **Profile switching requires app restart** - Electron limitation
- **No profile encryption** - Data stored in plaintext SQLite
- **No profile export/import** - Manual directory copy required
- **Mobile support pending** - Currently desktop-only feature

## Files

**Implementation:**

- `backend/electron/profiles.ts` - Profile management module
- `backend/electron/entry.ts` - Profile initialization and selection
- `backend/electron/ipc.ts` - IPC handlers for profiles
- `backend/electron/sync.ts` - Per-profile sync configuration
- `app/settings/settings.js` - Profiles UI section
- `preload.js` - Profiles API exposure

**Server:**

- `backend/server/users.js` - Profile CRUD functions
- `backend/server/db.js` - Profile-aware connection pooling
- `backend/server/index.js` - Profile API endpoints

**Documentation:**

- `docs/profiles.md` - This file
- `DEVELOPMENT.md` - Updated with profile architecture
- `docs/sync.md` - Updated with per-profile sync

## Testing

```bash
# Test profile isolation
yarn start                    # Should use dev profile
# Open Settings → Profiles
# Create "Test" profile
# Switch to "Test" (app restarts)
# Verify data is separate

# Test sync configuration
# Enable sync for "Test" profile
# Add items
# Run sync
# Verify items go to correct server profile
```

## Implementation Notes

### Files Modified/Created

**Server:**
- `backend/server/users.js` - Added profiles table and CRUD functions
- `backend/server/db.js` - Profile-aware connection pooling (userId:profileSlug)
- `backend/server/index.js` - Profile API endpoints + data migration

**Desktop:**
- `backend/electron/profiles.ts` - Profile management module (NEW)
- `backend/electron/entry.ts` - Profile initialization and selection
- `backend/electron/ipc.ts` - Profile IPC handlers
- `backend/electron/sync.ts` - Per-profile sync configuration
- `app/settings/settings.js` - Profiles UI section
- `preload.js` - Profiles API exposure

**Documentation:**
- `docs/profiles.md` - This file
- `DEVELOPMENT.md` - Updated profile management section
- `docs/sync.md` - Updated with per-profile sync

### Design Principles

**1. Production/Dev Isolation**

The most critical rule: development builds NEVER touch production data.

```typescript
// Profile selection logic (entry.ts)
if (PROFILE_ENV_VAR) {
  PROFILE = PROFILE_ENV_VAR;  // Explicit override
} else if (!app.isPackaged || isDevPackagedBuild()) {
  PROFILE = 'dev';  // Development ALWAYS uses dev
} else {
  PROFILE = getActiveProfile().slug;  // Production uses profiles.db
}
```

**2. Single-Instance Lock**

```typescript
export function requestSingleInstance(): boolean {
  // Skip lock for dev/test profiles
  if (isDevProfile() || isTestProfile()) {
    return true;  // Allow multiple instances
  }

  // Production profiles enforce single instance
  return app.requestSingleInstanceLock();
}
```

This allows dev and production to run simultaneously without conflicts.

**3. Automatic Migration**

On first launch with profiles support:
1. `initProfilesDb()` creates `profiles.db` if missing
2. `migrateExistingProfiles()` detects existing profile directories
3. Existing data preserved in original locations
4. Profile records created in profiles.db

No user action required, zero data loss.

**4. Nested Profile Relationship**

Peek profiles contain Chromium profiles:
- Peek manages the outer profile (application data)
- Electron manages the inner profile (browser session)
- User never directly interacts with Chromium profiles
- Isolation is automatic and transparent

### Backward Compatibility

- `PROFILE` env var still works (overrides all logic)
- Existing profile directories detected and migrated
- Server API endpoints default to `profile=default`
- Old clients continue working without changes

### Migration Strategy

**Server Migration:**
- `migrateUserDataToProfiles()` runs automatically on first request
- Moves `data/{userId}/peek.db` → `data/{userId}/profiles/default/datastore.sqlite`
- Creates "default" profile record in system.db
- Idempotent (safe to run multiple times)

**Desktop Migration:**
- Runs on startup before profile selection
- Detects `{userData}/default/` and `{userData}/dev/` directories
- Creates profile records if they don't exist
- Never deletes or moves data

### Commits

Implementation was completed in 11 atomic commits:

1. `feat(server): add profiles support to users.js`
2. `feat(server): add profile-aware connection pooling to db.js`
3. `feat(server): add profile endpoints and migration to index.js`
4. `feat(client): create profiles.ts module for profile management`
5. `feat(client): add profile IPC handlers to ipc.ts`
6. `feat(client): update entry.ts to initialize profiles`
7. `feat(sync): update sync.ts for per-profile configuration`
8. `feat(settings): add profiles section to settings UI`
9. `feat(frontend): add profiles API to preload`
10. `fix(profiles): enforce dev profile isolation from production`
11. `docs: add comprehensive profiles documentation`

### Testing Considerations

**Automated Tests:**
- Existing tests already use profile isolation via `getTestProfile()`
- Each test gets unique profile: `test-{name}-{timestamp}`
- No test modifications required

**Scripts:**
- `yarn start` → Automatically uses dev profile
- `yarn package:install` → Packaged build uses default profile
- `PROFILE` env var for testing overrides

### Known Issues

1. **Profile switching requires app restart** - Electron limitation (userData path set once)
2. **No prompt for already-selected profile** - Radio button behavior (change event only fires on actual change)
3. **API keys stored in plaintext** - In local SQLite file (consider encryption for future)

## Mobile Profile Support (iOS)

Mobile profiles provide dev/production isolation for iOS builds.

### How It Works

**Auto-Detection via App Store Receipt:**

```
App Store / TestFlight build → has receipt → "default" profile
Xcode install (dev/test)    → no receipt  → "dev" profile
```

**Local Data Isolation:**

Each profile uses a separate database file:
```
App Group Container/
├── peek-default.db    # TestFlight/App Store data
├── peek-dev.db        # Xcode dev builds
└── peek-test.db       # If user switches to "test" profile
```

**Sync Isolation:**

All sync URLs include `?profile={slug}`:
```
GET  /items?profile=dev
POST /items?profile=dev
```

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    iOS App                               │
├─────────────────────────────────────────────────────────┤
│  Build Detection (is_app_store_build)                   │
│  ├── Has receipt? → "default" profile                   │
│  └── No receipt?  → "dev" profile                       │
├─────────────────────────────────────────────────────────┤
│  Local Storage                 │  Server Sync           │
│  ─────────────────────────────┼────────────────────────│
│  peek-{profile}.db            │  ?profile={profile}    │
│  (auto-detect only)           │  (can override)        │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**1. Local DB uses auto-detected profile only**

The database filename is determined by build type, not user settings:
- Prevents accidentally using wrong database
- Xcode builds ALWAYS use `peek-dev.db`
- TestFlight/App Store ALWAYS use `peek-default.db`

**2. Sync profile can be overridden**

User can change sync profile in Settings for testing scenarios:
- Default: auto-detected (matches local DB)
- Override: any profile name (for advanced testing)

**3. Same bundle ID, different data**

Both dev and production use `com.dietrich.peek-mobile`:
- Installing one replaces the other
- App Group container persists between installs
- Each install type uses its own database file

### Settings UI

The Settings screen shows:
- Current profile (auto-detected or overridden)
- Build type indicator (production/development)
- Quick switch buttons: default, dev, test
- "Reset to auto" button if overridden
- Visual warning banner when not on "default"

### Trade-offs and Alternatives Considered

**Current Implementation: Per-Profile Database Files**

```
Pros:
✓ Full local data isolation
✓ Simple implementation
✓ No bundle ID changes needed
✓ Works with single App Group

Cons:
✗ Can't run dev and prod simultaneously (same bundle ID)
✗ Switching installs replaces the app
```

**Alternative 1: Different Bundle IDs**

```
com.dietrich.peek-mobile       # Production
com.dietrich.peek-mobile-dev   # Development

Pros:
✓ True coexistence (both installed at once)
✓ Complete isolation (separate App Groups)
✓ Different app icons possible

Cons:
✗ Requires separate provisioning profiles
✗ Two apps in App Store Connect
✗ More build configuration complexity
✗ Share extension would need separate handling
```

**Alternative 2: Shared Database, Sync-Only Isolation**

```
Single peek.db for all builds
Only sync URLs include ?profile=

Pros:
✓ Simplest implementation
✓ Shared local data (could be useful)

Cons:
✗ Test data pollutes production view
✗ Easy to accidentally sync test data to prod server
✗ No local isolation (the problem we had)
```

**Alternative 3: User-Selectable Local Profile**

```
Settings allows changing local DB profile
peek-{user-selected}.db

Pros:
✓ Maximum flexibility
✓ User can create arbitrary profiles

Cons:
✗ Easy to accidentally use wrong profile
✗ Complex state management
✗ Profile mismatch between local/sync possible
```

### Files

**Implementation:**
- `src-tauri/AppGroupBridge.m` - `is_app_store_build()` receipt detection
- `src-tauri/src/lib.rs`:
  - `get_default_profile()` - auto-detect based on build type
  - `get_db_path()` - profile-specific database filename
  - `get_current_profile_slug()` - sync profile (with override support)
  - `append_profile_to_url()` - adds ?profile= to sync URLs
  - `get_profile_info` / `set_profile` - Tauri commands
- `src/App.tsx` - Profile section in Settings UI
- `src/App.css` - Profile banner and selector styles

**Build Scripts:**
- `npm run rebuild:ios` - Clean rebuild for simulator
- `npm run rebuild:ios:release` - Clean rebuild for device

## Future Enhancements

- Profile import/export functionality
- Profile templates (pre-configured profiles)
- Profile-level theme settings
- Profile backup/restore
- ~~Mobile profile support (Tauri)~~ ✓ Implemented
- Profile encryption at rest
- Profile-specific extension configurations
- Profile migration between machines
- Cloud backup of profiles
