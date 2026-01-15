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

**Tauri testing uses a two-part approach:**
1. **Frontend Tests** (`yarn test:tauri:frontend`) - Runs the same Playwright tests against a mocked backend served via HTTP. Tests frontend UI behavior.
2. **Rust Unit Tests** (`yarn test:tauri:rust`) - Tests backend datastore and API functionality.

**Known Limitations of Frontend Mock:**
- Each page has its own mock instance - data doesn't share across pages (e.g., Groups Navigation test fails)
- Data doesn't persist across app restarts (Data Persistence tests fail)
- 14/17 tests pass with the mock approach

The Rust unit tests in `backend/tauri/src-tauri/tests/smoke.rs` cover the backend functionality that the mock doesn't test.

### Why Can't We Test Tauri Directly on macOS?

Tauri on macOS uses **WKWebView** (Apple's native WebKit wrapper), which has no automation support:

| Protocol | Electron (Chromium) | Tauri macOS (WKWebView) | Tauri Linux (WebKitGTK) | Tauri Windows (WebView2) |
|----------|---------------------|-------------------------|-------------------------|--------------------------|
| CDP (Chrome DevTools Protocol) | ✅ | ❌ | ❌ | ✅ |
| WebDriver | ✅ | ❌ | ✅ | ✅ |
| Playwright support | ✅ | ❌ | ❌ | ✅ |

**The core problem:** Apple provides `safaridriver` for Safari, but **no equivalent driver for WKWebView**. They simply never built one.

**Relevant issues and documentation:**
- [tauri-apps/tauri#7068](https://github.com/tauri-apps/tauri/issues/7068) - Feature request for macOS support in tauri-driver
- [Tauri WebDriver docs](https://v2.tauri.app/develop/tests/webdriver/) - Official docs confirming macOS limitation
- [Apple Developer Forums](https://developer.apple.com/forums/thread/89848) - "How to test WKWebView" with no good answer
- [appium/appium#5839](https://github.com/appium/appium/issues/5839) - Appium's historical struggles with WKWebView
- [Example workarounds repo](https://github.com/nicok/tauri-ui-testing-on-macos)

### Alternative Approaches Considered

| Approach | Reuses Playwright Tests | Tests Real App | Complexity | Why Not |
|----------|------------------------|----------------|------------|---------|
| **Frontend Mock** (chosen) | ✅ Yes | ❌ Mock only | Low | Best tradeoff |
| Appium Mac2 Driver | ❌ Different API | ✅ Yes | Medium | Can't reuse tests, clunky |
| tauri-driver | ✅ WebDriver | ✅ Yes | Low | **Doesn't work on macOS** |
| TestDriver.ai | ❌ Different API | ✅ Yes | Medium | AI-based, non-deterministic |
| CrabNebula Cloud | ✅ Partial | ✅ Yes | Low | Paid service |
| Run Linux VM | ✅ Yes | ✅ Yes | High | Slow CI, complex setup |

### How the Frontend Mock Works

Since the frontend code (`app/`) is **identical** between Electron and Tauri, we can test it separately:

```
Electron Tests:                    Tauri Frontend Tests:
┌─────────────────┐               ┌─────────────────┐
│   Playwright    │               │   Playwright    │
│   (CDP to       │               │   (HTTP to      │
│    Electron)    │               │    localhost)   │
└────────┬────────┘               └────────┬────────┘
         │                                 │
         ▼                                 ▼
┌─────────────────┐               ┌─────────────────┐
│  Electron App   │               │  HTTP Server    │
│  (real backend) │               │  + Mock API     │
└─────────────────┘               └─────────────────┘
```

**Implementation:**
1. `tests/mocks/tauri-backend.js` - Mocks the `window.app` API (datastore, shortcuts, windows, etc.)
2. `tests/fixtures/desktop-app.ts` - `launchTauriFrontend()` starts HTTP server and injects mock
3. HTTP server serves `app/` directory on `localhost:5199`
4. Playwright runs against Chromium, same selectors and assertions as Electron tests

**What gets tested:**
- ✅ Frontend UI (identical code, same tests)
- ✅ Component interactions
- ✅ Datastore API calls (mocked responses)
- ❌ Real Tauri↔Frontend IPC
- ❌ Real multi-window behavior
- ❌ Data persistence across restarts

**The gap is filled by Rust unit tests** in `backend/tauri/src-tauri/tests/smoke.rs` which test real datastore operations, persistence, and backend logic.

## Hybrid Extension Mode Tests

The test suite includes specific tests for the hybrid extension architecture in the `Hybrid Extension Mode @desktop` describe block:

| Test | What it verifies |
|------|-----------------|
| `extension host window exists` | Extension host window loads at `peek://app/extension-host.html` |
| `built-in extensions load as iframes` | `cmd`, `groups`, `peeks`, `slides` are iframes in extension host |
| `example extension loads as separate window` | External extensions get separate BrowserWindows |
| `commands work from both consolidated and external` | Commands from both loading modes are accessible |
| `pubsub works between consolidated and external` | Cross-extension messaging works across loading modes |
| `correct window count for hybrid mode` | Expected window count: 1 core + 1 host + 1 external |

The test fixture (`tests/fixtures/desktop-app.ts`) handles hybrid mode by:
1. Waiting for the extension host window to load
2. Waiting for at least one external extension window (e.g., `example`)
3. Providing `getExtensionWindows()` that returns separate window extensions only

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

## Test Environment Behavior

### Dock and Menubar

During tests (when `PROFILE` starts with `test`), the macOS dock icon is **always hidden**.
This prevents the dock from appearing during test runs and interfering with test execution
or causing visual distractions. The `updateDockVisibility()` function in
`backend/electron/windows.ts` checks `isTestProfile()` and always hides the dock.

### DevTools

DevTools are automatically disabled in test profiles to prevent them from stealing focus
or slowing down tests.

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

### Playwright keyboard.press('Escape') doesn't work
Playwright's `keyboard.press('Escape')` doesn't reliably trigger Electron's `before-input-event`
handler on `webContents`. This affects escape-based navigation in modal windows.

**Workaround:** Expose the navigation function on `window` and call it directly from the test:
```javascript
// In the page code:
window.showGroups = showGroups;

// In the test:
await page.evaluate(async () => {
  await (window as any).showGroups();
});
```

This tests the navigation logic without relying on the escape key mechanism.
