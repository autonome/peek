# Peek Test Framework

## Architecture

Tests are organized by platform capability:

```
tests/
├── desktop/           # Tests for desktop backends (Electron, Tauri)
│   └── smoke.spec.ts  # Main smoke tests
├── fixtures/          # Playwright fixtures for app launching
│   └── desktop-app.ts # Desktop app launcher abstraction
├── helpers/           # Shared utilities
│   └── window-utils.ts
└── README.md          # This file
```

Backend-specific tests live in their respective directories:
- `backend/electron/tests/` - Electron-only features
- `backend/tauri/tests/` - Tauri-only features (includes smoke.rs Rust unit tests)

## Running Tests

```bash
# Run all tests (Electron Playwright + Tauri Rust)
yarn test

# Run specific backend
yarn test:electron          # Electron Playwright tests (headless)
yarn test:tauri             # Tauri Rust unit tests

# Run with visible windows (Electron only)
yarn test:visible

# Run specific test by name
yarn test:grep "Settings"

# Debug mode (visible + Playwright inspector)
yarn test:debug
```

## Backend Status

| Backend | Status | Test Framework | Command |
|---------|--------|----------------|---------|
| Electron | ✅ Working | Playwright | `yarn test:electron` |
| Tauri | ✅ Working | Frontend Mock + Rust | `yarn test:tauri` |

### Tauri Testing Notes

Tauri on macOS uses WKWebView which doesn't support Chrome DevTools Protocol (CDP) or WebDriver.

**Tauri testing uses a two-part approach:**
1. **Frontend Tests** (`yarn test:tauri:frontend`) - Runs the same Playwright tests against a mocked backend served via HTTP. Tests frontend UI behavior.
2. **Rust Unit Tests** (`yarn test:tauri:rust`) - Tests backend datastore and API functionality.

**Known Limitations of Frontend Mock:**
- Each page has its own mock instance - data doesn't share across pages (e.g., Groups Navigation test fails)
- Data doesn't persist across app restarts (Data Persistence tests fail)
- 14/17 tests pass with the mock approach

The Rust unit tests in `backend/tauri/src-tauri/tests/smoke.rs` cover the backend functionality that the mock doesn't test.

## Coverage Matrix

Both test frameworks cover equivalent functionality:

| Feature | Playwright (Electron) | Rust (Tauri) |
|---------|----------------------|--------------|
| Database initialization | `Core Functionality` | `test_database_init` |
| Address CRUD | `Core Functionality` | `test_address_operations` |
| Visit tracking | `Core Functionality` | `test_visit_tracking` |
| Tag operations | `Core Functionality` | `test_tag_operations` |
| Stats retrieval | `Core Functionality` | `test_stats` |
| Table operations | `Core Functionality` | `test_table_operations` |
| URL normalization | `Core Functionality` | `test_url_normalization` |
| Extension CRUD | `Extension Lifecycle` | `test_extension_operations` |
| Extension settings | `Extension Lifecycle` | `test_extension_settings` |
| Extension errors | `Extension Lifecycle` | `test_extension_error_tracking` |
| Data persistence | `Data Persistence` | `test_data_persistence` |
| Settings UI | `Settings` | N/A (UI only) |
| Cmd Palette | `Cmd Palette` | N/A (UI only) |
| Extension windows | `Peeks`, `Slides`, `Groups` | N/A (UI only) |

**Note:** UI-specific tests (Settings, Cmd Palette, extension windows) only run via Playwright.
Tauri Rust tests focus on backend/datastore functionality.

## Writing Tests

### Cross-Backend Tests (tests/desktop/)

Use the `desktopApp` fixture - it works with any desktop backend:

```typescript
import { test, expect } from '../fixtures/desktop-app';

test('datastore works', async ({ desktopApp }) => {
  const bg = await desktopApp.getBackgroundWindow();

  const result = await bg.evaluate(async () => {
    return await window.app.datastore.getStats();
  });

  expect(result.success).toBe(true);
});
```

### Using launchDesktopApp Directly

For tests that need manual app lifecycle control:

```typescript
import { launchDesktopApp, DesktopApp } from '../fixtures/desktop-app';

test.describe('My Feature @desktop', () => {
  let app: DesktopApp;

  test.beforeAll(async () => {
    app = await launchDesktopApp('my-test-profile');
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('works', async () => {
    const bg = await app.getBackgroundWindow();
    // ... test code
  });
});
```

### Backend-Specific Tests

Place in `backend/{name}/tests/` and use backend-specific APIs:

```typescript
// backend/electron/tests/tray.spec.ts
import { test, _electron as electron } from '@playwright/test';

test('tray icon works', async () => {
  // Electron-specific tray testing
});
```

## Environment Variables

| Variable | Values | Default | Purpose |
|----------|--------|---------|---------|
| BACKEND | electron, tauri | electron | Which backend to test |
| PROFILE | string | auto-generated | Data isolation directory |
| HEADLESS | 1 or empty | 1 (in scripts) | Run without visible windows (unified across backends) |
| DEBUG | 1 or empty | empty | Enable debug logging |

**Note:** The `HEADLESS` env var is unified across backends. The test fixture translates it to
backend-specific vars (e.g., `PEEK_HEADLESS` for Electron). Always use `HEADLESS` in test commands.

## Fixtures

### desktopApp

Provides a launched desktop app instance per test:

```typescript
interface DesktopApp {
  backend: 'electron' | 'tauri';
  windows(): Page[];
  getWindow(pattern: string | RegExp, timeout?: number): Promise<Page>;
  getBackgroundWindow(): Promise<Page>;
  getExtensionWindows(): Page[];
  close(): Promise<void>;
}
```

## Test Isolation

Each test suite should use a unique profile to avoid data conflicts.
The fixture auto-generates profiles based on test names.

For manual control:
```typescript
const app = await launchDesktopApp('my-unique-profile-name');
```

## Adding New Platforms

1. Create fixture in `tests/fixtures/{platform}-app.ts`
2. Create test directory `tests/{platform}/`
3. Add scripts to package.json
4. Document in this README

## IMPORTANT: For Claude Code

When working on tests:

1. **Cross-backend tests go in `tests/desktop/`**
2. **Use `desktopApp` fixture, never `_electron` directly** in cross-backend tests
3. **Backend-specific tests go in `backend/{name}/tests/`**
4. **Always use PROFILE for data isolation**
5. **Test both backends before marking complete:** `yarn test`
6. **Follow existing patterns** - look at smoke.spec.ts for examples
7. **Use @desktop tag** in test.describe for desktop-only tests

## Test Tags

Tests use `@desktop`, `@mobile`, `@extension` tags for filtering:

```typescript
test.describe('Settings @desktop', () => {
  // Runs on desktop backends only
});
```

## Troubleshooting

### Tests hang or timeout
- Check if previous test left app running: `pkill -f "peek-tauri\|electron"`
- Increase timeout: `yarn test:desktop --timeout=120000`

### Window not found
- Increase wait time in test
- Check URL patterns match actual window URLs
- Use `app.windows()` to debug available windows

### Data conflicts between tests
- Ensure unique PROFILE per test suite
- Use `launchDesktopApp('unique-name')` for isolation
