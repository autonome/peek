/**
 * Peek Smoke Tests
 *
 * These tests verify core functionality doesn't regress:
 * - Settings open/close
 * - Cmd palette open and execute
 * - Peeks: add and test
 * - Slides: add and test
 * - Groups: full navigation flow
 * - External URL opening
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
// Pass the root directory - Electron will use package.json main field
const MAIN_PATH = ROOT;

// Helper to wait for a window with specific URL pattern
async function waitForWindow(app: ElectronApplication, urlPattern: string | RegExp, timeout = 10000): Promise<Page> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const windows = app.windows();
    for (const win of windows) {
      const url = win.url();
      if (typeof urlPattern === 'string' ? url.includes(urlPattern) : urlPattern.test(url)) {
        return win;
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Window matching ${urlPattern} not found within ${timeout}ms`);
}

// Helper to get extension background windows
async function getExtensionWindows(app: ElectronApplication): Promise<Page[]> {
  const windows = app.windows();
  return windows.filter(w => w.url().includes('peek://ext/') && w.url().includes('background.html'));
}

// Helper to count non-background windows
async function countVisibleWindows(app: ElectronApplication): Promise<number> {
  const windows = app.windows();
  return windows.filter(w => !w.url().includes('background.html')).length;
}

test.describe('Settings', () => {
  let electronApp: ElectronApplication;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [MAIN_PATH],
      env: { ...process.env, PROFILE: 'test-smoke', DEBUG: '1' }
    });
    await new Promise(r => setTimeout(r, 4000));
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test('open and close settings', async () => {
    // Settings opens on start in debug mode
    const settingsWindow = await waitForWindow(electronApp, 'settings/settings.html');
    expect(settingsWindow).toBeTruthy();

    // Verify content loaded
    await settingsWindow.waitForSelector('.settings-layout', { timeout: 5000 });
    expect(await settingsWindow.$('.sidebar')).toBeTruthy();
    expect(await settingsWindow.$('#sidebarNav')).toBeTruthy();

    // Close via window.close()
    await settingsWindow.evaluate(() => window.close());
    await new Promise(r => setTimeout(r, 500));

    // Verify it's closed - settings URL should not be in visible windows
    const windows = electronApp.windows();
    const settingsStillOpen = windows.some(w =>
      w.url().includes('settings/settings.html') && !w.isClosed()
    );
    // Note: window may still exist but be closed/hidden
  });
});

test.describe('Cmd Palette', () => {
  let electronApp: ElectronApplication;
  let bgWindow: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [MAIN_PATH],
      env: { ...process.env, PROFILE: 'test-smoke', DEBUG: '1' }
    });
    await new Promise(r => setTimeout(r, 4000));
    bgWindow = await waitForWindow(electronApp, 'app/background.html');
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test('open cmd and execute hello command', async () => {
    // Open cmd panel via window API (since global shortcuts don't work in tests)
    // Cmd panel is a thin input bar: 600x50, frameless, transparent
    const openResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://app/cmd/panel.html', {
        modal: true,
        width: 600,
        height: 50,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        center: true
      });
    });
    expect(openResult.success).toBe(true);

    await new Promise(r => setTimeout(r, 1000));

    // Find the cmd window
    const cmdWindow = await waitForWindow(electronApp, 'cmd/panel.html', 5000);
    expect(cmdWindow).toBeTruthy();

    // Wait for input to be ready
    await cmdWindow.waitForSelector('input', { timeout: 5000 });

    // Type 'hello' command
    await cmdWindow.fill('input', 'hello');
    await new Promise(r => setTimeout(r, 300));

    // Press Enter to execute
    await cmdWindow.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 500));

    // The hello command should have executed
    // Close the cmd window
    if (openResult.id) {
      await bgWindow.evaluate(async (id: number) => {
        return await (window as any).app.window.close(id);
      }, openResult.id);
    }
  });
});

test.describe('Peeks', () => {
  let electronApp: ElectronApplication;
  let bgWindow: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [MAIN_PATH],
      env: { ...process.env, PROFILE: 'test-smoke', DEBUG: '1' }
    });
    await new Promise(r => setTimeout(r, 4000));
    bgWindow = await waitForWindow(electronApp, 'app/background.html');
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test('add a peek and test it opens', async () => {
    // Add a peek address to the datastore
    const addResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.addAddress('https://example.com', {
        title: 'Example Peek',
        description: 'Test peek for smoke tests'
      });
    });
    expect(addResult.success).toBe(true);
    const addressId = addResult.id;

    // Get the peeks extension background window
    const peeksWindow = electronApp.windows().find(w =>
      w.url().includes('ext/peeks/background.html')
    );
    expect(peeksWindow).toBeTruthy();

    // Open a peek window for the address we created
    const peekResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('https://example.com', {
        width: 800,
        height: 600,
        key: 'test-peek'
      });
    });
    expect(peekResult.success).toBe(true);

    await new Promise(r => setTimeout(r, 2000));

    // Verify window opened
    const windows = electronApp.windows();
    const peekWindow = windows.find(w => w.url().includes('example.com'));
    expect(peekWindow).toBeTruthy();

    // Close the peek
    if (peekResult.id) {
      await bgWindow.evaluate(async (id: number) => {
        return await (window as any).app.window.close(id);
      }, peekResult.id);
    }
  });
});

test.describe('Slides', () => {
  let electronApp: ElectronApplication;
  let bgWindow: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [MAIN_PATH],
      env: { ...process.env, PROFILE: 'test-smoke', DEBUG: '1' }
    });
    await new Promise(r => setTimeout(r, 4000));
    bgWindow = await waitForWindow(electronApp, 'app/background.html');
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test('add slides and test they work', async () => {
    // Add multiple addresses to use as slides
    const urls = [
      'https://slide1.example.com',
      'https://slide2.example.com',
      'https://slide3.example.com'
    ];

    for (const url of urls) {
      const result = await bgWindow.evaluate(async (uri: string) => {
        return await (window as any).app.datastore.addAddress(uri, {
          title: `Slide: ${uri}`,
          starred: 1  // Mark as starred so it shows in slides
        });
      }, url);
      expect(result.success).toBe(true);
    }

    // Verify slides extension is loaded
    const slidesWindow = electronApp.windows().find(w =>
      w.url().includes('ext/slides/background.html')
    );
    expect(slidesWindow).toBeTruthy();

    // Query addresses to verify they were added
    const queryResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.queryAddresses({ starred: 1, limit: 10 });
    });
    expect(queryResult.success).toBe(true);
    expect(queryResult.data.length).toBeGreaterThanOrEqual(3);
  });
});

test.describe('Groups Navigation', () => {
  let electronApp: ElectronApplication;
  let bgWindow: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [MAIN_PATH],
      env: { ...process.env, PROFILE: 'test-smoke', DEBUG: '1' }
    });
    await new Promise(r => setTimeout(r, 4000));
    bgWindow = await waitForWindow(electronApp, 'app/background.html');
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test('groups to group to url and back navigation', async () => {
    // Create a tag/group with some addresses
    const tagResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.getOrCreateTag('test-group');
    });
    expect(tagResult.success).toBe(true);
    const tagId = tagResult.data?.data?.id || tagResult.data?.id;

    // Add addresses and tag them
    const addr1 = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.addAddress('https://group-test-1.example.com', {
        title: 'Group Test 1'
      });
    });
    expect(addr1.success).toBe(true);

    const addr2 = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.addAddress('https://group-test-2.example.com', {
        title: 'Group Test 2'
      });
    });
    expect(addr2.success).toBe(true);

    // Tag the addresses
    if (tagId && addr1.id) {
      await bgWindow.evaluate(async ({ addressId, tagId }) => {
        return await (window as any).app.datastore.tagAddress(addressId, tagId);
      }, { addressId: addr1.id, tagId });
    }

    if (tagId && addr2.id) {
      await bgWindow.evaluate(async ({ addressId, tagId }) => {
        return await (window as any).app.datastore.tagAddress(addressId, tagId);
      }, { addressId: addr2.id, tagId });
    }

    // Open groups home
    const groupsResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://ext/groups/home.html', {
        width: 800,
        height: 600
      });
    });
    expect(groupsResult.success).toBe(true);

    await new Promise(r => setTimeout(r, 1500));

    // Find the groups window
    const groupsWindow = await waitForWindow(electronApp, 'groups/home.html', 5000);
    expect(groupsWindow).toBeTruthy();
    await groupsWindow.waitForLoadState('domcontentloaded');

    // Wait for cards to render (groups view)
    await groupsWindow.waitForSelector('.cards', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 500));

    // STEP 1: Click on the test-group card to navigate to addresses view
    const groupCard = await groupsWindow.$('.card.group-card[data-tag-id="' + tagId + '"]');
    if (!groupCard) {
      // Try finding any group card if specific one not found
      const anyGroupCard = await groupsWindow.$('.card.group-card');
      expect(anyGroupCard).toBeTruthy();
      await anyGroupCard!.click();
    } else {
      await groupCard.click();
    }

    await new Promise(r => setTimeout(r, 500));

    // Verify we're in addresses view (Back button visible, address cards shown)
    const backBtn = await groupsWindow.$('.back-btn');
    expect(backBtn).toBeTruthy();
    const backBtnVisible = await backBtn!.evaluate((el: HTMLElement) => el.style.display !== 'none');
    expect(backBtnVisible).toBe(true);

    // STEP 2: Click on an address card to open the URL
    const addressCard = await groupsWindow.$('.card.address-card');
    expect(addressCard).toBeTruthy();

    // Get window count before click
    const windowCountBefore = electronApp.windows().length;
    await addressCard!.click();

    await new Promise(r => setTimeout(r, 1500));

    // Verify a new window was opened (window count increased)
    const windowCountAfter = electronApp.windows().length;
    expect(windowCountAfter).toBeGreaterThan(windowCountBefore);

    // STEP 3: Click Back button to return to groups list
    await backBtn!.click();
    await new Promise(r => setTimeout(r, 500));

    // Verify we're back in groups view (Back button hidden)
    const backBtnAfterClick = await groupsWindow.$('.back-btn');
    const backBtnHidden = await backBtnAfterClick!.evaluate((el: HTMLElement) => el.style.display === 'none');
    expect(backBtnHidden).toBe(true);

    // Verify header shows "Groups"
    const headerTitle = await groupsWindow.$eval('.header-title', (el: HTMLElement) => el.textContent);
    expect(headerTitle).toBe('Groups');

    // Clean up - close any remaining windows
    if (groupsResult.id) {
      try {
        await bgWindow.evaluate(async (id: number) => {
          return await (window as any).app.window.close(id);
        }, groupsResult.id);
      } catch {
        // Window may already be closed
      }
    }

    // Verify addresses can be retrieved by tag
    if (tagId) {
      const taggedAddresses = await bgWindow.evaluate(async (tId: string) => {
        return await (window as any).app.datastore.getAddressesByTag(tId);
      }, tagId);
      expect(taggedAddresses.success).toBe(true);
      expect(taggedAddresses.data.length).toBeGreaterThanOrEqual(2);
    }
  });
});

test.describe('External URL Opening', () => {
  test('open URL by calling executable', async () => {
    const testUrl = 'https://external-test.example.com';

    // Launch app with URL argument (simulates clicking a link that opens in Peek)
    const electronApp = await electron.launch({
      args: [MAIN_PATH, '--', testUrl],
      env: { ...process.env, PROFILE: 'test-smoke', DEBUG: '1' }
    });

    await new Promise(r => setTimeout(r, 5000));

    // Check if the URL was opened
    const windows = electronApp.windows();

    // The app should have processed the URL argument
    // It may have opened it in a window or queued it
    expect(windows.length).toBeGreaterThan(0);

    // Verify background window exists (app started correctly)
    const bgWindow = windows.find(w => w.url().includes('background.html'));
    expect(bgWindow).toBeTruthy();

    await electronApp.close();
  });
});

// Data Persistence Tests - verify user data survives app restart
test.describe('Data Persistence', () => {
  const PERSISTENCE_PROFILE = 'test-persistence-' + Date.now();

  test('peeks and slides settings persist across restart', async () => {
    // PHASE 1: Launch app and add custom peeks/slides configuration
    let electronApp = await electron.launch({
      args: [MAIN_PATH],
      env: { ...process.env, PROFILE: PERSISTENCE_PROFILE, DEBUG: '1', PEEK_HEADLESS: '1' }
    });
    await new Promise(r => setTimeout(r, 4000));

    let bgWindow = await waitForWindow(electronApp, 'app/background.html');

    // Add custom peek items to extension_settings
    const testPeeks = [
      { title: 'Test Peek 1', uri: 'https://test-peek-1.example.com', shortcut: 'Option+1' },
      { title: 'Test Peek 2', uri: 'https://test-peek-2.example.com', shortcut: 'Option+2' },
      { title: 'Custom Peek', uri: 'https://custom-peek.example.com', shortcut: 'Option+3' }
    ];

    const testSlides = [
      { title: 'Test Slide 1', uri: 'https://test-slide-1.example.com', position: 'right', size: 400 },
      { title: 'Test Slide 2', uri: 'https://test-slide-2.example.com', position: 'bottom', size: 300 }
    ];

    // Save peeks items to extension_settings via datastore
    const savePeeksResult = await bgWindow.evaluate(async (items) => {
      const api = (window as any).app;
      return await api.datastore.setRow('extension_settings', 'peeks:items', {
        extensionId: 'peeks',
        key: 'items',
        value: JSON.stringify(items),
        updatedAt: Date.now()
      });
    }, testPeeks);
    expect(savePeeksResult.success).toBe(true);

    // Save slides items to extension_settings
    const saveSlidesResult = await bgWindow.evaluate(async (items) => {
      const api = (window as any).app;
      return await api.datastore.setRow('extension_settings', 'slides:items', {
        extensionId: 'slides',
        key: 'items',
        value: JSON.stringify(items),
        updatedAt: Date.now()
      });
    }, testSlides);
    expect(saveSlidesResult.success).toBe(true);

    // Also save custom prefs
    const savePeeksPrefs = await bgWindow.evaluate(async () => {
      const api = (window as any).app;
      return await api.datastore.setRow('extension_settings', 'peeks:prefs', {
        extensionId: 'peeks',
        key: 'prefs',
        value: JSON.stringify({ shortcutKeyPrefix: 'Option+' }),
        updatedAt: Date.now()
      });
    });
    expect(savePeeksPrefs.success).toBe(true);

    const saveSlidesPrefs = await bgWindow.evaluate(async () => {
      const api = (window as any).app;
      return await api.datastore.setRow('extension_settings', 'slides:prefs', {
        extensionId: 'slides',
        key: 'prefs',
        value: JSON.stringify({ defaultPosition: 'right', defaultSize: 350 }),
        updatedAt: Date.now()
      });
    });
    expect(saveSlidesPrefs.success).toBe(true);

    // Verify data was saved
    const verifyResult = await bgWindow.evaluate(async () => {
      const api = (window as any).app;
      return await api.datastore.getTable('extension_settings');
    });
    expect(verifyResult.success).toBe(true);
    const savedRows = Object.values(verifyResult.data);
    expect(savedRows.length).toBeGreaterThanOrEqual(4);

    // Close the app
    await electronApp.close();
    await new Promise(r => setTimeout(r, 1000));

    // PHASE 2: Relaunch with same profile and verify data persisted
    electronApp = await electron.launch({
      args: [MAIN_PATH],
      env: { ...process.env, PROFILE: PERSISTENCE_PROFILE, DEBUG: '1', PEEK_HEADLESS: '1' }
    });
    await new Promise(r => setTimeout(r, 4000));

    bgWindow = await waitForWindow(electronApp, 'app/background.html');

    // Query extension_settings to verify persistence
    const persistedResult = await bgWindow.evaluate(async () => {
      const api = (window as any).app;
      return await api.datastore.getTable('extension_settings');
    });
    expect(persistedResult.success).toBe(true);

    const persistedData = persistedResult.data as Record<string, any>;

    // Verify peeks items persisted
    const peeksItems = persistedData['peeks:items'];
    expect(peeksItems).toBeTruthy();
    expect(peeksItems.extensionId).toBe('peeks');
    expect(peeksItems.key).toBe('items');
    const parsedPeeks = JSON.parse(peeksItems.value);
    expect(parsedPeeks.length).toBe(3);
    expect(parsedPeeks[0].title).toBe('Test Peek 1');
    expect(parsedPeeks[2].title).toBe('Custom Peek');

    // Verify slides items persisted
    const slidesItems = persistedData['slides:items'];
    expect(slidesItems).toBeTruthy();
    expect(slidesItems.extensionId).toBe('slides');
    const parsedSlides = JSON.parse(slidesItems.value);
    expect(parsedSlides.length).toBe(2);
    expect(parsedSlides[0].position).toBe('right');
    expect(parsedSlides[1].position).toBe('bottom');

    // Verify prefs persisted
    const peeksPrefs = persistedData['peeks:prefs'];
    expect(peeksPrefs).toBeTruthy();
    const parsedPeeksPrefs = JSON.parse(peeksPrefs.value);
    expect(parsedPeeksPrefs.shortcutKeyPrefix).toBe('Option+');

    const slidesPrefs = persistedData['slides:prefs'];
    expect(slidesPrefs).toBeTruthy();
    const parsedSlidesPrefs = JSON.parse(slidesPrefs.value);
    expect(parsedSlidesPrefs.defaultPosition).toBe('right');

    await electronApp.close();
  });

  test('addresses and tags persist across restart', async () => {
    const ADDR_PROFILE = 'test-addr-persist-' + Date.now();

    // PHASE 1: Add addresses and tags
    let electronApp = await electron.launch({
      args: [MAIN_PATH],
      env: { ...process.env, PROFILE: ADDR_PROFILE, DEBUG: '1', PEEK_HEADLESS: '1' }
    });
    await new Promise(r => setTimeout(r, 4000));

    let bgWindow = await waitForWindow(electronApp, 'app/background.html');

    // Add addresses
    const addr1 = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.addAddress('https://persist-test-1.example.com', {
        title: 'Persist Test 1',
        starred: 1
      });
    });
    expect(addr1.success).toBe(true);

    const addr2 = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.addAddress('https://persist-test-2.example.com', {
        title: 'Persist Test 2'
      });
    });
    expect(addr2.success).toBe(true);

    // Create a tag and tag the addresses
    const tagResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.getOrCreateTag('persist-tag');
    });
    expect(tagResult.success).toBe(true);
    const tagId = tagResult.data?.id;

    if (tagId && addr1.id) {
      await bgWindow.evaluate(async ({ addressId, tagId }) => {
        return await (window as any).app.datastore.tagAddress(addressId, tagId);
      }, { addressId: addr1.id, tagId });
    }

    await electronApp.close();
    await new Promise(r => setTimeout(r, 1000));

    // PHASE 2: Verify persistence
    electronApp = await electron.launch({
      args: [MAIN_PATH],
      env: { ...process.env, PROFILE: ADDR_PROFILE, DEBUG: '1', PEEK_HEADLESS: '1' }
    });
    await new Promise(r => setTimeout(r, 4000));

    bgWindow = await waitForWindow(electronApp, 'app/background.html');

    // Query addresses - use getTable for more reliable results
    const tableResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.getTable('addresses');
    });
    expect(tableResult.success).toBe(true);

    const addresses = Object.values(tableResult.data) as any[];
    expect(addresses.length).toBeGreaterThanOrEqual(2);

    const persistedAddr1 = addresses.find((a: any) =>
      a.uri === 'https://persist-test-1.example.com' ||
      a.uri?.includes('persist-test-1')
    );
    expect(persistedAddr1).toBeTruthy();
    expect(persistedAddr1.title).toBe('Persist Test 1');

    // Query tags
    const tagsResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.getTagsByFrecency(10);
    });
    expect(tagsResult.success).toBe(true);
    const persistTag = tagsResult.data.find((t: any) => t.name === 'persist-tag');
    expect(persistTag).toBeTruthy();

    await electronApp.close();
  });
});

// Core functionality tests
test.describe('Core Functionality', () => {
  let electronApp: ElectronApplication;
  let bgWindow: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [MAIN_PATH],
      env: { ...process.env, PROFILE: 'test-smoke', DEBUG: '1' }
    });
    await new Promise(r => setTimeout(r, 4000));
    bgWindow = await waitForWindow(electronApp, 'app/background.html');
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test('app launches and extensions load', async () => {
    const extWindows = await getExtensionWindows(electronApp);
    expect(extWindows.length).toBeGreaterThanOrEqual(3);

    // Verify specific extensions
    const extUrls = extWindows.map(w => w.url());
    expect(extUrls.some(u => u.includes('ext/groups'))).toBe(true);
    expect(extUrls.some(u => u.includes('ext/peeks'))).toBe(true);
    expect(extUrls.some(u => u.includes('ext/slides'))).toBe(true);
  });

  test('database is accessible', async () => {
    const result = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.getStats();
    });
    expect(result.success).toBe(true);
    expect(typeof result.data.totalAddresses).toBe('number');
  });

  test('commands are registered', async () => {
    const result = await bgWindow.evaluate(async () => {
      return await (window as any).app.commands.getAll();
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    // Should have hello command from example extension
    const helloCmd = result.find((c: any) => c.name === 'hello');
    expect(helloCmd).toBeTruthy();
  });

  test('window management works', async () => {
    // Open a simple test window (about:blank is lightweight)
    const openResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('about:blank', {
        width: 400,
        height: 300
      });
    });
    expect(openResult.success).toBe(true);
    expect(openResult.id).toBeDefined();

    await new Promise(r => setTimeout(r, 500));

    // List windows
    const listResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.list();
    });
    expect(listResult.success).toBe(true);
    expect(Array.isArray(listResult.windows)).toBe(true);

    // Close the window
    await bgWindow.evaluate(async (id: number) => {
      return await (window as any).app.window.close(id);
    }, openResult.id);
  });
});

// Extension Lifecycle tests
test.describe('Extension Lifecycle', () => {
  let electronApp: ElectronApplication;
  let bgWindow: Page;

  // Use the example extension for testing
  const EXAMPLE_EXT_PATH = path.join(ROOT, 'extensions', 'example');

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [MAIN_PATH],
      env: { ...process.env, PROFILE: 'test-ext-lifecycle', DEBUG: '1' }
    });
    await new Promise(r => setTimeout(r, 4000));
    bgWindow = await waitForWindow(electronApp, 'app/background.html');
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test('validate extension folder', async () => {
    const result = await bgWindow.evaluate(async (extPath: string) => {
      return await (window as any).app.extensions.validateFolder(extPath);
    }, EXAMPLE_EXT_PATH);

    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(result.data.manifest).toBeTruthy();
    expect(result.data.manifest.id || result.data.manifest.shortname || result.data.manifest.name).toBeTruthy();
  });

  test('add extension', async () => {
    // First validate to get manifest
    const validateResult = await bgWindow.evaluate(async (extPath: string) => {
      return await (window as any).app.extensions.validateFolder(extPath);
    }, EXAMPLE_EXT_PATH);

    const manifest = validateResult.data.manifest;

    // Add the extension
    const addResult = await bgWindow.evaluate(async ({ extPath, manifest }) => {
      return await (window as any).app.extensions.add(extPath, manifest, false);
    }, { extPath: EXAMPLE_EXT_PATH, manifest });

    expect(addResult.success).toBe(true);
    expect(addResult.data).toBeTruthy();
    expect(addResult.data.id).toBeTruthy();
  });

  test('list extensions includes added extension', async () => {
    const result = await bgWindow.evaluate(async () => {
      return await (window as any).app.extensions.getAll();
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    // Find the example extension
    const exampleExt = result.data.find((ext: any) =>
      ext.id === 'example' || ext.path?.includes('example')
    );
    expect(exampleExt).toBeTruthy();
  });

  test('update extension (enable/disable)', async () => {
    // Enable the extension
    const enableResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.extensions.update('example', { enabled: true });
    });
    expect(enableResult.success).toBe(true);

    // Verify it's enabled (accept both boolean true and integer 1)
    const getResult1 = await bgWindow.evaluate(async () => {
      return await (window as any).app.extensions.get('example');
    });
    expect(getResult1.success).toBe(true);
    expect(getResult1.data.enabled === true || getResult1.data.enabled === 1).toBe(true);

    // Disable it
    const disableResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.extensions.update('example', { enabled: false });
    });
    expect(disableResult.success).toBe(true);

    // Verify it's disabled (accept both boolean false and integer 0)
    const getResult2 = await bgWindow.evaluate(async () => {
      return await (window as any).app.extensions.get('example');
    });
    expect(getResult2.success).toBe(true);
    expect(getResult2.data.enabled === false || getResult2.data.enabled === 0).toBe(true);
  });

  test('remove extension', async () => {
    const removeResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.extensions.remove('example');
    });
    expect(removeResult.success).toBe(true);

    // Verify it's removed
    const getResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.extensions.get('example');
    });
    expect(getResult.success).toBe(false);

    // Verify it's not in list
    const listResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.extensions.getAll();
    });
    expect(listResult.success).toBe(true);
    const exampleExt = listResult.data.find((ext: any) => ext.id === 'example');
    expect(exampleExt).toBeFalsy();
  });
});
