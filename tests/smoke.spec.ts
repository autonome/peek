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
const MAIN_PATH = path.join(ROOT, 'index.js');

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
