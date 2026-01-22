# User Profiles Implementation - Summary

## Overview

Successfully implemented user profiles and profile switching across desktop and server. Each profile provides isolated data storage with optional per-profile sync configuration.

## What Was Implemented

### Server (Multi-User System)

1. **Profiles Table** (`backend/server/users.js`)
   - Added `profiles` table to `system.db`
   - Schema: `id`, `user_id`, `slug`, `name`, `created_at`, `last_used_at`
   - CRUD functions: `createProfile`, `listProfiles`, `getProfile`, `deleteProfile`

2. **Connection Pooling** (`backend/server/db.js`)
   - Changed from `userId` to `userId:profileSlug` composite keys
   - Database path: `data/{userId}/profiles/{profileSlug}/datastore.sqlite`
   - All DB functions accept optional `profileSlug` parameter (defaults to "default")

3. **API Endpoints** (`backend/server/index.js`)
   - All endpoints accept `?profile={slug}` query parameter
   - New endpoints: GET/POST/DELETE `/profiles`
   - Migration function: `migrateUserDataToProfiles()` moves `peek.db` → `profiles/default/`
   - Backward compatible: defaults to "default" profile if not specified

### Desktop Client

4. **Profile Database Module** (`backend/electron/profiles.ts`) - NEW FILE
   - `profiles.db` stores profile metadata and sync config
   - Schema includes: id, name, slug, syncEnabled, apiKey, serverProfileSlug, lastSyncAt
   - Functions: initProfilesDb, listProfiles, createProfile, getProfile, deleteProfile
   - Active profile tracking: getActiveProfile, setActiveProfile
   - Sync config: enableSync, disableSync, getSyncConfig, updateLastSyncTime
   - Migration: migrateExistingProfiles() detects existing profile directories

5. **IPC Handlers** (`backend/electron/ipc.ts`)
   - Added `registerProfileHandlers()` function
   - Handlers for: list, create, get, delete, getCurrent, switch
   - Sync configuration handlers: enableSync, disableSync, getSyncConfig
   - Profile switching triggers app relaunch

6. **Profile Initialization** (`backend/electron/entry.ts`)
   - Initialize profiles.db on startup
   - Profile selection logic:
     1. Explicit `PROFILE` env var (testing override)
     2. **Development builds → ALWAYS use 'dev'** (production isolation)
     3. Production builds → use active profile from profiles.db
     4. Fallback → 'default'
   - **Critical fix**: Dev builds never touch production profiles

7. **Sync Integration** (`backend/electron/sync.ts`)
   - Modified to use per-profile sync configuration
   - `getSyncConfig()` reads from active profile
   - Pull/push operations include `?profile={serverProfileSlug}` parameter
   - `syncAll()` updates per-profile lastSyncTime

8. **Settings UI** (`app/settings/settings.js`)
   - New "Profiles" section between Sync and Themes
   - Displays current active profile
   - Profile list with radio buttons for switching
   - "Add Profile" button with name input dialog
   - Delete profile button (disabled for default/active)
   - Per-profile sync configuration UI:
     - Enable/disable sync buttons
     - API key and server profile slug inputs
     - Shows sync status and server profile mapping

9. **Frontend API** (`preload.js`)
   - Exposed `api.profiles` object
   - Functions: list, create, get, delete, getCurrent, switch
   - Sync: enableSync, disableSync, getSyncConfig

## Key Design Decisions

### Production vs Development Isolation

**Critical Rule**: Development builds NEVER touch production data.

- **Production** (packaged in /Applications) → uses "default" or user-selected profile
- **Development** (`yarn start` from source) → ALWAYS uses "dev" profile
- Single-instance lock skipped for dev profiles → allows both to run simultaneously

This prevents accidental corruption of production data during development.

### Profile vs Chromium Profile

**Nested relationship, NOT the same:**

```
Peek Profile                     # Application-level
└── Chromium Profile             # Browser session data

~/.config/Peek/
├── profiles.db                  # Peek profile metadata
├── default/                     # Peek profile
│   ├── datastore.sqlite         # Peek data (items, tags)
│   └── chromium/                # Chromium session (cookies, cache)
└── work/                        # Another Peek profile
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

Each Peek profile gets its own isolated Chromium session, providing:
- Separate cookies (login sessions)
- Separate localStorage
- Separate cache
- Separate browser extensions

### Per-Profile Sync Configuration

Each profile can independently sync to different server profiles:

```
Desktop Profile     Server User    Server Profile
─────────────────   ──────────     ──────────────
Work                alice          work
Personal            alice          personal
```

- One API key (authenticates user)
- Multiple server profile targets
- Stored in profiles.db per desktop profile

## Data Storage Structure

### Desktop

```
{userData}/
├── profiles.db              # Profile metadata + sync config
├── default/                 # Production profile
│   ├── datastore.sqlite
│   └── chromium/
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
├── system.db                # Users and profiles
└── {userId}/
    └── profiles/
        ├── default/
        │   └── datastore.sqlite
        ├── work/
        │   └── datastore.sqlite
        └── personal/
            └── datastore.sqlite
```

## Migration Strategy

### Automatic Migration

On first launch with new code:

1. `initProfilesDb()` creates `profiles.db` if missing
2. `migrateExistingProfiles()` detects existing directories:
   - `default/` → creates "Default" profile record
   - `dev/` → creates "Development" profile record
3. `ensureDefaultProfile()` ensures default profile exists
4. Existing data preserved, no data loss

### Server Migration

`migrateUserDataToProfiles()` runs automatically:
- Detects `data/{userId}/peek.db` (old path)
- Moves to `data/{userId}/profiles/default/datastore.sqlite`
- Creates "default" profile record in system.db
- One-time operation, idempotent

## Backward Compatibility

- `PROFILE` env var still works (overrides all logic)
- API endpoints default to `profile=default` if not specified
- Existing profile directories detected and migrated
- Zero breaking changes for existing deployments

## Testing Status

### Manual Testing Performed

✅ App starts with profile migration (saw "Migrated existing dev profile directory")
✅ Dev build uses "dev" profile (verified in logs)
✅ Dev and production can run simultaneously (single-instance skip works)

### Pending Manual Tests

- [ ] Create new profile via Settings UI
- [ ] Switch profiles (app restart)
- [ ] Delete profile
- [ ] Enable sync for a profile
- [ ] Sync to different server profiles
- [ ] Verify data isolation between profiles

### Automated Tests

Existing tests already use profile-based isolation:
- `getTestProfile()` generates unique test profiles
- `PROFILE` env var passed to test instances
- Tests should work without modification

## Files Modified/Created

### Server
- `backend/server/users.js` - Added profiles table and CRUD
- `backend/server/db.js` - Profile-aware connection pooling
- `backend/server/index.js` - Profile API endpoints + migration

### Desktop
- **NEW**: `backend/electron/profiles.ts` - Profile management module
- `backend/electron/entry.ts` - Profile initialization and selection
- `backend/electron/ipc.ts` - Profile IPC handlers
- `backend/electron/sync.ts` - Per-profile sync config
- `app/settings/settings.js` - Profiles UI section
- `preload.js` - Profiles API exposure

### Documentation
- **NEW**: `docs/profiles.md` - Comprehensive profiles documentation
- `DEVELOPMENT.md` - Updated profile management section
- `docs/sync.md` - Updated with per-profile sync
- **NEW**: `PROFILES-IMPLEMENTATION-SUMMARY.md` - This file

## Known Limitations

1. **Profile switching requires app restart** - Electron limitation
2. **No profile encryption** - Data stored in plaintext
3. **No profile export/import** - Manual directory copy required
4. **Mobile support pending** - Desktop-only for now
5. **API keys stored in plaintext** - In local SQLite file

## Security Considerations

- Profile isolation is filesystem-based
- No encryption at rest
- API keys visible in profiles.db
- Single-instance lock skipped for dev profiles (intentional for development)
- Chromium sessions isolated per profile (cookies, cache separated)

## Scripts and Build Configs

### No Changes Required

Existing scripts work correctly:
- `yarn start` → Uses dev profile automatically
- `yarn package:install` → Packaged build uses default profile
- Tests use unique profiles per test case
- `PROFILE` env var still works for testing

### Future Script Considerations

Potential additions:
- `yarn profile:list` - List all profiles
- `yarn profile:create <name>` - Create profile from CLI
- `yarn profile:export <slug>` - Export profile data
- `yarn profile:import <slug> <path>` - Import profile data

## Deployment Impact

### Server Deployment

**Zero downtime, backward compatible:**
1. Migrations run automatically on first request
2. Old API calls (without profile param) work (defaults to "default")
3. Old clients continue working
4. New clients can use profiles

### Desktop Deployment

**Zero disruption:**
1. Migration runs on first launch
2. Existing data preserved in "default" profile
3. Users can continue using default profile
4. Profile switching is opt-in

## Future Enhancements

1. **Profile import/export** - Backup and restore functionality
2. **Profile templates** - Pre-configured profiles for different use cases
3. **Profile encryption** - At-rest encryption for sensitive data
4. **Profile-level theme settings** - Different themes per profile
5. **Mobile support** - Extend to Tauri mobile
6. **Profile backup automation** - Scheduled backups per profile
7. **Profile-specific extension configs** - Different extensions per profile

## Questions Answered

### Q: How do Peek profiles relate to Chromium profiles?

**A: They are nested, not the same.**

- **Peek Profile** = High-level data workspace (items, tags, sync config)
- **Chromium Profile** = Low-level browser session data (cookies, cache)

Each Peek profile automatically gets its own Chromium session directory. This provides complete isolation including browser state. Users manage Peek profiles; Chromium profiles are an implementation detail.

### Q: Can dev and production run simultaneously?

**A: Yes, by design.**

Development builds:
- Always use "dev" profile (isolated from production)
- Skip single-instance lock
- Can run alongside production instance safely

### Q: What happens to existing data?

**A: Automatically migrated, zero data loss.**

- Existing `default/` → "Default" profile
- Existing `dev/` → "Development" profile
- Data stays in same location, just tracked in profiles.db

## Commits

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

## Status

✅ **Implementation Complete**
✅ **Documentation Complete**
⏳ **Manual Testing In Progress**

All code is committed and ready for testing.
