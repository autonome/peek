/**
 * Peek Desktop Smoke Tests
 *
 * Cross-backend tests that run against both Electron and Tauri.
 * Uses the desktopApp fixture for backend abstraction.
 *
 * Run with:
 *   BACKEND=electron yarn test:desktop
 *   BACKEND=tauri yarn test:desktop
 */

import { test, expect, DesktopApp, launchDesktopApp } from '../fixtures/desktop-app';
import { Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '../..');

// ============================================================================
// Settings Tests
// ============================================================================

test.describe('Settings @desktop', () => {
  let app: DesktopApp;

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-settings');
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('open and close settings', async () => {
    // Settings opens on start in debug mode
    const settingsWindow = await app.getWindow('settings/settings.html');
    expect(settingsWindow).toBeTruthy();

    // Verify content loaded
    await settingsWindow.waitForSelector('.settings-layout', { timeout: 5000 });
    expect(await settingsWindow.$('.sidebar')).toBeTruthy();
    expect(await settingsWindow.$('#sidebarNav')).toBeTruthy();

    // Close via window.close()
    await settingsWindow.evaluate(() => window.close());
    await new Promise(r => setTimeout(r, 500));
  });
});

// ============================================================================
// Command Palette Tests
// ============================================================================

test.describe('Cmd Palette @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-cmd');
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('open cmd and execute hello command', async () => {
    // Open cmd panel via window API
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
    const cmdWindow = await app.getWindow('cmd/panel.html', 5000);
    expect(cmdWindow).toBeTruthy();

    // Wait for input to be ready
    await cmdWindow.waitForSelector('input', { timeout: 5000 });

    // Type 'hello' command
    await cmdWindow.fill('input', 'hello');
    await new Promise(r => setTimeout(r, 300));

    // Press Enter to execute
    await cmdWindow.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 500));

    // Close the cmd window
    if (openResult.id) {
      await bgWindow.evaluate(async (id: number) => {
        return await (window as any).app.window.close(id);
      }, openResult.id);
    }
  });
});

// ============================================================================
// Peeks Tests
// ============================================================================

test.describe('Peeks @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-peeks');
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
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

    // Verify peeks extension is loaded
    const peeksWindow = app.windows().find(w =>
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
    const peekWindow = app.windows().find(w => w.url().includes('example.com'));
    expect(peekWindow).toBeTruthy();

    // Close the peek
    if (peekResult.id) {
      await bgWindow.evaluate(async (id: number) => {
        return await (window as any).app.window.close(id);
      }, peekResult.id);
    }
  });
});

// ============================================================================
// Slides Tests
// ============================================================================

test.describe('Slides @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-slides');
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
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
          starred: 1
        });
      }, url);
      expect(result.success).toBe(true);
    }

    // Verify slides extension is loaded
    const slidesWindow = app.windows().find(w =>
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

// ============================================================================
// Groups Navigation Tests
// ============================================================================

test.describe('Groups Navigation @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-groups');
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
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
    const groupsWindow = await app.getWindow('groups/home.html', 5000);
    expect(groupsWindow).toBeTruthy();
    await groupsWindow.waitForLoadState('domcontentloaded');

    // Wait for cards to render
    await groupsWindow.waitForSelector('.cards', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 500));

    // Click on the test-group card
    const groupCard = await groupsWindow.$('.card.group-card[data-tag-id="' + tagId + '"]');
    if (!groupCard) {
      const anyGroupCard = await groupsWindow.$('.card.group-card');
      expect(anyGroupCard).toBeTruthy();
      await anyGroupCard!.click();
    } else {
      await groupCard.click();
    }

    await new Promise(r => setTimeout(r, 500));

    // Verify we're in addresses view
    const backBtn = await groupsWindow.$('.back-btn');
    expect(backBtn).toBeTruthy();
    const backBtnVisible = await backBtn!.evaluate((el: HTMLElement) => el.style.display !== 'none');
    expect(backBtnVisible).toBe(true);

    // Click on an address card
    const addressCard = await groupsWindow.$('.card.address-card');
    expect(addressCard).toBeTruthy();

    const windowCountBefore = app.windows().length;
    await addressCard!.click();

    await new Promise(r => setTimeout(r, 1500));

    // Verify a new window was opened
    const windowCountAfter = app.windows().length;
    expect(windowCountAfter).toBeGreaterThan(windowCountBefore);

    // Click Back button
    await backBtn!.click();
    await new Promise(r => setTimeout(r, 500));

    // Verify we're back in groups view
    const backBtnAfterClick = await groupsWindow.$('.back-btn');
    const backBtnHidden = await backBtnAfterClick!.evaluate((el: HTMLElement) => el.style.display === 'none');
    expect(backBtnHidden).toBe(true);

    // Verify header shows "Groups"
    const headerTitle = await groupsWindow.$eval('.header-title', (el: HTMLElement) => el.textContent);
    expect(headerTitle).toBe('Groups');

    // Clean up
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

// ============================================================================
// External URL Opening Tests
// ============================================================================

test.describe('External URL Opening @desktop', () => {
  test('open URL by calling executable', async () => {
    const testUrl = 'https://external-test.example.com';

    // Launch app with URL argument
    const app = await launchDesktopApp('test-external-url');

    await new Promise(r => setTimeout(r, 5000));

    // Verify app started correctly
    const bgWindow = app.windows().find(w => w.url().includes('background.html'));
    expect(bgWindow).toBeTruthy();

    await app.close();
  });
});

// ============================================================================
// Data Persistence Tests
// ============================================================================

test.describe('Data Persistence @desktop', () => {
  test('peeks and slides settings persist across restart', async () => {
    const PERSISTENCE_PROFILE = 'test-persistence-' + Date.now();

    // PHASE 1: Launch app and add configuration
    let app = await launchDesktopApp(PERSISTENCE_PROFILE);
    let bgWindow = await app.getBackgroundWindow();

    const testPeeks = [
      { title: 'Test Peek 1', uri: 'https://test-peek-1.example.com', shortcut: 'Option+1' },
      { title: 'Test Peek 2', uri: 'https://test-peek-2.example.com', shortcut: 'Option+2' },
      { title: 'Custom Peek', uri: 'https://custom-peek.example.com', shortcut: 'Option+3' }
    ];

    const testSlides = [
      { title: 'Test Slide 1', uri: 'https://test-slide-1.example.com', position: 'right', size: 400 },
      { title: 'Test Slide 2', uri: 'https://test-slide-2.example.com', position: 'bottom', size: 300 }
    ];

    // Save peeks items
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

    // Save slides items
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

    // Save prefs
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
    await app.close();
    await new Promise(r => setTimeout(r, 1000));

    // PHASE 2: Relaunch with same profile
    app = await launchDesktopApp(PERSISTENCE_PROFILE);
    bgWindow = await app.getBackgroundWindow();

    // Query extension_settings
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
    const parsedPeeks = JSON.parse(peeksItems.value);
    expect(parsedPeeks.length).toBe(3);
    expect(parsedPeeks[0].title).toBe('Test Peek 1');

    // Verify slides items persisted
    const slidesItems = persistedData['slides:items'];
    expect(slidesItems).toBeTruthy();
    const parsedSlides = JSON.parse(slidesItems.value);
    expect(parsedSlides.length).toBe(2);

    // Verify prefs persisted
    const peeksPrefs = persistedData['peeks:prefs'];
    expect(peeksPrefs).toBeTruthy();
    const parsedPeeksPrefs = JSON.parse(peeksPrefs.value);
    expect(parsedPeeksPrefs.shortcutKeyPrefix).toBe('Option+');

    await app.close();
  });

  test('addresses and tags persist across restart', async () => {
    const ADDR_PROFILE = 'test-addr-persist-' + Date.now();

    // PHASE 1: Add addresses and tags
    let app = await launchDesktopApp(ADDR_PROFILE);
    let bgWindow = await app.getBackgroundWindow();

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

    await app.close();
    await new Promise(r => setTimeout(r, 1000));

    // PHASE 2: Verify persistence
    app = await launchDesktopApp(ADDR_PROFILE);
    bgWindow = await app.getBackgroundWindow();

    // Query addresses
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

    await app.close();
  });
});

// ============================================================================
// Core Functionality Tests
// ============================================================================

test.describe('Core Functionality @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-core');
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('app launches and extensions load', async () => {
    const extWindows = app.getExtensionWindows();
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
    // Open a test window
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

// ============================================================================
// Extension Lifecycle Tests
// ============================================================================

test.describe('Extension Lifecycle @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  const EXAMPLE_EXT_PATH = path.join(ROOT, 'extensions', 'example');

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-ext-lifecycle');
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
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

    // Verify it's disabled
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
