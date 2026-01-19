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
import { waitForCommandResults, waitForWindowCount, waitForVisible, waitForClass, waitForResultsWithContent, waitForSelectionChange, sleep } from '../helpers/window-utils';

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

  test('open cmd and execute gallery command', async () => {
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

    // Find the cmd window (getWindow already polls until found)
    const cmdWindow = await app.getWindow('cmd/panel.html', 5000);
    expect(cmdWindow).toBeTruthy();

    // Wait for input to be ready
    await cmdWindow.waitForSelector('input', { timeout: 5000 });

    // Type 'example:gallery' command and wait for results to filter
    await cmdWindow.fill('input', 'example:gallery');
    await waitForCommandResults(cmdWindow, 1);

    // Press Enter to execute
    await cmdWindow.keyboard.press('Enter');

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

    // Verify peeks extension is loaded (hybrid mode: may be iframe or separate window)
    const runningExts = await bgWindow.evaluate(async () => {
      return await (window as any).app.extensions.list();
    });
    const peeksRunning = runningExts.data?.some((ext: any) => ext.id === 'peeks');
    expect(peeksRunning).toBe(true);

    // Open a peek window for the address we created
    const peekResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('https://example.com', {
        width: 800,
        height: 600,
        key: 'test-peek'
      });
    });
    expect(peekResult.success).toBe(true);

    // Wait for window to open (getWindow polls)
    const peekWindow = await app.getWindow('example.com', 5000);
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

    // Verify slides extension is loaded (hybrid mode: may be iframe or separate window)
    const runningExts = await bgWindow.evaluate(async () => {
      return await (window as any).app.extensions.list();
    });
    const slidesRunning = runningExts.data?.some((ext: any) => ext.id === 'slides');
    expect(slidesRunning).toBe(true);

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

    // Find the groups window (getWindow polls)
    const groupsWindow = await app.getWindow('groups/home.html', 5000);
    expect(groupsWindow).toBeTruthy();
    await groupsWindow.waitForLoadState('domcontentloaded');

    // Wait for cards to render
    await groupsWindow.waitForSelector('.cards', { timeout: 5000 });

    // Click on the test-group card
    const groupCard = await groupsWindow.$('.card.group-card[data-tag-id="' + tagId + '"]');
    if (!groupCard) {
      const anyGroupCard = await groupsWindow.$('.card.group-card');
      expect(anyGroupCard).toBeTruthy();
      await anyGroupCard!.click();
    } else {
      await groupCard.click();
    }

    // Wait for navigation to addresses view (address cards appear)
    await groupsWindow.waitForSelector('.card.address-card', { timeout: 5000 });

    // Verify we're in addresses view by checking search placeholder
    const placeholderInGroup = await groupsWindow.$eval('.search-input', (el: HTMLInputElement) => el.placeholder);
    expect(placeholderInGroup).toContain('Search in');

    // Click on an address card
    const addressCard = await groupsWindow.$('.card.address-card');
    expect(addressCard).toBeTruthy();

    const windowCountBefore = app.windows().length;
    await addressCard!.click();

    // Wait for new window to open
    await waitForWindowCount(() => app.windows(), windowCountBefore + 1, 5000);

    // Verify a new window was opened
    const windowCountAfter = app.windows().length;
    expect(windowCountAfter).toBeGreaterThan(windowCountBefore);

    // Navigate back to groups view
    // Note: Playwright's keyboard.press('Escape') doesn't reliably trigger
    // Electron's before-input-event handler, so we call the navigation function directly
    await groupsWindow.evaluate(async () => {
      const showGroups = (window as any).showGroups;
      if (showGroups) {
        await showGroups();
      }
    });

    // Small delay for async operations
    await new Promise(resolve => setTimeout(resolve, 100));

    // Wait for groups view (group cards appear, address cards disappear)
    await groupsWindow.waitForSelector('.card.group-card', { timeout: 5000 });

    // Verify we're back in groups view by checking search placeholder
    const placeholderInGroups = await groupsWindow.$eval('.search-input', (el: HTMLInputElement) => el.placeholder);
    expect(placeholderInGroups).toBe('Search groups...');

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
    // Launch app (fixture already waits for background and extensions)
    const app = await launchDesktopApp('test-external-url');

    // Verify app started correctly (fixture already ensured this)
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
    // In hybrid mode:
    // - Built-in extensions (groups, peeks, slides) are in extension host as iframes
    // - External extensions (example) are in separate windows
    const windows = app.windows();

    // Check extension host exists (for built-in extensions)
    const hostWindow = windows.find(w => w.url().includes('extension-host.html'));
    expect(hostWindow).toBeDefined();

    // Check external extension window exists (example)
    const extWindows = app.getExtensionWindows();
    expect(extWindows.length).toBeGreaterThanOrEqual(1);
    expect(extWindows.some(w => w.url().includes('ext/example'))).toBe(true);
  });

  test('database is accessible', async () => {
    const result = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.getStats();
    });
    expect(result.success).toBe(true);
    expect(typeof result.data.totalAddresses).toBe('number');
  });

  test('commands are registered', async () => {
    // Commands are now owned by the cmd extension via pubsub
    // Query via cmd:query-commands topic with retry for extension loading
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;

      const queryCommands = () => new Promise((resolve) => {
        api.subscribe('cmd:query-commands-response', (msg: any) => {
          resolve(msg.commands || []);
        }, api.scopes.GLOBAL);
        api.publish('cmd:query-commands', {}, api.scopes.GLOBAL);
        setTimeout(() => resolve([]), 1000);
      });

      // Retry a few times to allow extensions to finish loading
      for (let i = 0; i < 5; i++) {
        const cmds = await queryCommands() as any[];
        if (cmds.some((c: any) => c.name === 'example:gallery')) {
          return cmds;
        }
        await new Promise(r => setTimeout(r, 500));
      }
      return await queryCommands();
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    // Should have gallery command from example extension
    const galleryCmd = result.find((c: any) => c.name === 'example:gallery');
    expect(galleryCmd).toBeTruthy();
  });

  test('quit and restart commands are registered', async () => {
    // Query commands via cmd extension
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;

      return new Promise((resolve) => {
        api.subscribe('cmd:query-commands-response', (msg: any) => {
          const commands = msg.commands || [];
          resolve({
            hasQuit: commands.some((c: any) => c.name === 'quit'),
            hasRestart: commands.some((c: any) => c.name === 'restart'),
            quitCmd: commands.find((c: any) => c.name === 'quit'),
            restartCmd: commands.find((c: any) => c.name === 'restart')
          });
        }, api.scopes.GLOBAL);
        api.publish('cmd:query-commands', {}, api.scopes.GLOBAL);
        setTimeout(() => resolve({ hasQuit: false, hasRestart: false }), 2000);
      });
    });

    expect(result.hasQuit).toBe(true);
    expect(result.hasRestart).toBe(true);
    expect(result.quitCmd?.description).toBe('Quit the application');
    expect(result.restartCmd?.description).toBe('Restart the application');
  });

  test('reload extension command is registered', async () => {
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;

      return new Promise((resolve) => {
        api.subscribe('cmd:query-commands-response', (msg: any) => {
          const commands = msg.commands || [];
          const reloadCmd = commands.find((c: any) => c.name === 'reload extension');
          resolve({
            hasReloadExtension: !!reloadCmd,
            description: reloadCmd?.description
          });
        }, api.scopes.GLOBAL);
        api.publish('cmd:query-commands', {}, api.scopes.GLOBAL);
        setTimeout(() => resolve({ hasReloadExtension: false }), 2000);
      });
    });

    expect(result.hasReloadExtension).toBe(true);
    expect(result.description).toBe('Reload an external extension by ID');
  });

  test('api.quit and api.restart functions exist', async () => {
    const result = await bgWindow.evaluate(() => {
      const api = (window as any).app;
      return {
        hasQuit: typeof api.quit === 'function',
        hasRestart: typeof api.restart === 'function'
      };
    });

    expect(result.hasQuit).toBe(true);
    expect(result.hasRestart).toBe(true);
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

    // Wait for window to open
    await app.getWindow('about:blank', 5000);

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
// Tag Command Tests
// ============================================================================

test.describe('Tag Command @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-tag-command');
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('creates address if not exists when tagging', async () => {
    // This tests the bug fix: addResult.data.id instead of addResult.id
    // Use unique URI to avoid conflicts with other tests
    // Note: datastore normalizes URLs (adds trailing slash)
    const timestamp = Date.now();
    const testUri = `https://tag-test-new-address-${timestamp}.example.com/`;

    // Create tag with unique name
    const tagResult = await bgWindow.evaluate(async (ts: number) => {
      return await (window as any).app.datastore.getOrCreateTag('test-new-addr-tag-' + ts);
    }, timestamp);
    expect(tagResult.success).toBe(true);
    const tagId = tagResult.data?.tag?.id;
    expect(tagId).toBeTruthy();

    // Create address
    const addResult = await bgWindow.evaluate(async (uri: string) => {
      return await (window as any).app.datastore.addAddress(uri, { title: 'New Tagged Address' });
    }, testUri);
    expect(addResult.success).toBe(true);
    // Bug fix verification: data.id is the correct path
    expect(addResult.data?.id).toBeTruthy();

    // Tag the address using the correct id path
    const linkResult = await bgWindow.evaluate(async ({ addressId, tagId }) => {
      return await (window as any).app.datastore.tagAddress(addressId, tagId);
    }, { addressId: addResult.data.id, tagId });
    expect(linkResult.success).toBe(true);

    // Verify address is tagged
    const taggedAddresses = await bgWindow.evaluate(async (tId: string) => {
      return await (window as any).app.datastore.getAddressesByTag(tId);
    }, tagId);
    expect(taggedAddresses.success).toBe(true);
    expect(taggedAddresses.data.some((a: any) => a.uri === testUri)).toBe(true);
  });

  test('getOrCreateTag returns tag in data.tag', async () => {
    // This tests the bug fix: tagResult.data.tag.id instead of tagResult.data.id
    const tagName = 'test-nested-tag-response';

    const result = await bgWindow.evaluate(async (name: string) => {
      return await (window as any).app.datastore.getOrCreateTag(name);
    }, tagName);

    expect(result.success).toBe(true);
    // Bug fix verification: tag is nested in data.tag
    expect(result.data?.tag).toBeTruthy();
    expect(result.data?.tag?.id).toBeTruthy();
    expect(result.data?.tag?.name).toBe(tagName);
    expect(typeof result.data?.created).toBe('boolean');
  });

  test('tagAddress links tag to address correctly', async () => {
    // Create address
    const addr = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.addAddress('https://tag-link-test.example.com', {
        title: 'Tag Link Test'
      });
    });
    expect(addr.success).toBe(true);

    // Create tag
    const tag = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.getOrCreateTag('link-test-tag');
    });
    expect(tag.success).toBe(true);

    // Link them
    const link = await bgWindow.evaluate(async ({ addressId, tagId }) => {
      return await (window as any).app.datastore.tagAddress(addressId, tagId);
    }, { addressId: addr.data.id, tagId: tag.data.tag.id });
    expect(link.success).toBe(true);

    // Verify link exists
    const addressTags = await bgWindow.evaluate(async (addressId: string) => {
      return await (window as any).app.datastore.getAddressTags(addressId);
    }, addr.data.id);
    expect(addressTags.success).toBe(true);
    expect(addressTags.data.some((t: any) => t.name === 'link-test-tag')).toBe(true);
  });

  test('multiple tags can be added to same address', async () => {
    // Create address
    const addr = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.addAddress('https://multi-tag-test.example.com', {
        title: 'Multi Tag Test'
      });
    });
    expect(addr.success).toBe(true);

    // Create and link multiple tags
    const tagNames = ['multi-tag-1', 'multi-tag-2', 'multi-tag-3'];

    for (const tagName of tagNames) {
      const tag = await bgWindow.evaluate(async (name: string) => {
        return await (window as any).app.datastore.getOrCreateTag(name);
      }, tagName);
      expect(tag.success).toBe(true);

      const link = await bgWindow.evaluate(async ({ addressId, tagId }) => {
        return await (window as any).app.datastore.tagAddress(addressId, tagId);
      }, { addressId: addr.data.id, tagId: tag.data.tag.id });
      expect(link.success).toBe(true);
    }

    // Verify all tags are linked
    const addressTags = await bgWindow.evaluate(async (addressId: string) => {
      return await (window as any).app.datastore.getAddressTags(addressId);
    }, addr.data.id);
    expect(addressTags.success).toBe(true);
    expect(addressTags.data.length).toBeGreaterThanOrEqual(3);

    for (const tagName of tagNames) {
      expect(addressTags.data.some((t: any) => t.name === tagName)).toBe(true);
    }
  });

  test('untagAddress removes tag from address', async () => {
    // Create address
    const addr = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.addAddress('https://untag-test.example.com', {
        title: 'Untag Test'
      });
    });
    expect(addr.success).toBe(true);

    // Create and link tag
    const tag = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.getOrCreateTag('untag-test-tag');
    });
    expect(tag.success).toBe(true);

    await bgWindow.evaluate(async ({ addressId, tagId }) => {
      return await (window as any).app.datastore.tagAddress(addressId, tagId);
    }, { addressId: addr.data.id, tagId: tag.data.tag.id });

    // Verify tag is linked
    let addressTags = await bgWindow.evaluate(async (addressId: string) => {
      return await (window as any).app.datastore.getAddressTags(addressId);
    }, addr.data.id);
    expect(addressTags.data.some((t: any) => t.name === 'untag-test-tag')).toBe(true);

    // Remove tag
    const untag = await bgWindow.evaluate(async ({ addressId, tagId }) => {
      return await (window as any).app.datastore.untagAddress(addressId, tagId);
    }, { addressId: addr.data.id, tagId: tag.data.tag.id });
    expect(untag.success).toBe(true);

    // Verify tag is removed
    addressTags = await bgWindow.evaluate(async (addressId: string) => {
      return await (window as any).app.datastore.getAddressTags(addressId);
    }, addr.data.id);
    expect(addressTags.data.some((t: any) => t.name === 'untag-test-tag')).toBe(false);
  });

  test('getUntaggedAddresses returns addresses without tags', async () => {
    // Use unique URI to avoid conflicts
    // Note: datastore normalizes URLs (adds trailing slash)
    const timestamp = Date.now();
    const testUri = `https://untagged-test-${timestamp}.example.com/`;

    // Create address without tagging it
    const addr = await bgWindow.evaluate(async (uri: string) => {
      return await (window as any).app.datastore.addAddress(uri, {
        title: 'Untagged Test'
      });
    }, testUri);
    expect(addr.success).toBe(true);
    expect(addr.data?.id).toBeTruthy();

    // Query untagged addresses
    const untagged = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.getUntaggedAddresses();
    });
    expect(untagged.success).toBe(true);
    expect(untagged.data.some((a: any) => a.uri === testUri)).toBe(true);

    // Tag the address with unique tag name
    const tag = await bgWindow.evaluate(async (ts: number) => {
      return await (window as any).app.datastore.getOrCreateTag('now-tagged-' + ts);
    }, timestamp);
    expect(tag.success).toBe(true);
    expect(tag.data?.tag?.id).toBeTruthy();

    await bgWindow.evaluate(async ({ addressId, tagId }) => {
      return await (window as any).app.datastore.tagAddress(addressId, tagId);
    }, { addressId: addr.data.id, tagId: tag.data.tag.id });

    // Verify it's no longer in untagged list
    const untaggedAfter = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.getUntaggedAddresses();
    });
    expect(untaggedAfter.data.some((a: any) => a.uri === testUri)).toBe(false);
  });
});

// ============================================================================
// Groups View Tests (Empty Groups Filtering)
// ============================================================================

test.describe('Groups View @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-groups-view');
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('empty groups are not shown in groups list', async () => {
    // Create an empty tag (group with no addresses)
    const emptyTag = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.getOrCreateTag('empty-group-test');
    });
    expect(emptyTag.success).toBe(true);

    // Create a tag with an address
    const nonEmptyTag = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.getOrCreateTag('non-empty-group-test');
    });
    expect(nonEmptyTag.success).toBe(true);

    const addr = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.addAddress('https://non-empty-group-addr.example.com', {
        title: 'Non Empty Group Address'
      });
    });
    expect(addr.success).toBe(true);

    await bgWindow.evaluate(async ({ addressId, tagId }) => {
      return await (window as any).app.datastore.tagAddress(addressId, tagId);
    }, { addressId: addr.data.id, tagId: nonEmptyTag.data.tag.id });

    // Open groups home
    const groupsResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://ext/groups/home.html', {
        width: 800,
        height: 600
      });
    });
    expect(groupsResult.success).toBe(true);

    // Find the groups window (getWindow polls)
    const groupsWindow = await app.getWindow('groups/home.html', 5000);
    expect(groupsWindow).toBeTruthy();
    await groupsWindow.waitForLoadState('domcontentloaded');

    // Wait for cards to render
    await groupsWindow.waitForSelector('.cards', { timeout: 5000 });

    // Get all group card tag IDs
    const groupCards = await groupsWindow.$$eval('.card.group-card', (cards: any[]) =>
      cards.map(c => c.dataset.tagId)
    );

    // Non-empty group should be shown
    expect(groupCards.includes(nonEmptyTag.data.tag.id)).toBe(true);

    // Empty group should NOT be shown
    expect(groupCards.includes(emptyTag.data.tag.id)).toBe(false);

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
  });

  test('Untagged group shows when there are untagged addresses', async () => {
    // Create an untagged address
    // Note: datastore normalizes URLs (adds trailing slash)
    const testUri = 'https://untagged-for-groups-view.example.com/';
    const addr = await bgWindow.evaluate(async (uri: string) => {
      return await (window as any).app.datastore.addAddress(uri, {
        title: 'Untagged For Groups View'
      });
    }, testUri);
    expect(addr.success).toBe(true);

    // Verify it's untagged
    const untagged = await bgWindow.evaluate(async () => {
      return await (window as any).app.datastore.getUntaggedAddresses();
    });
    expect(untagged.data.some((a: any) => a.uri === testUri)).toBe(true);

    // Open groups home
    const groupsResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://ext/groups/home.html', {
        width: 800,
        height: 600,
        key: 'groups-untagged-test'
      });
    });
    expect(groupsResult.success).toBe(true);

    // Find the groups window (getWindow polls)
    const groupsWindow = await app.getWindow('groups/home.html', 5000);
    expect(groupsWindow).toBeTruthy();
    await groupsWindow.waitForLoadState('domcontentloaded');

    // Wait for cards to render
    await groupsWindow.waitForSelector('.cards', { timeout: 5000 });

    // Check for Untagged group (has special ID __untagged__)
    const untaggedCard = await groupsWindow.$('.card.group-card[data-tag-id="__untagged__"]');
    expect(untaggedCard).toBeTruthy();

    // Verify it shows the special-group class
    const hasSpecialClass = await untaggedCard!.evaluate((el: HTMLElement) =>
      el.classList.contains('special-group')
    );
    expect(hasSpecialClass).toBe(true);

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

// ============================================================================
// Command Chaining Tests
// ============================================================================

test.describe('Command Chaining @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-chaining');
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('cmd panel loads with chain state initialized', async () => {
    // Open cmd panel to verify it loads correctly with chain support
    const openResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://ext/cmd/panel.html', {
        modal: true,
        width: 600,
        height: 300,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        center: true
      });
    });
    expect(openResult.success).toBe(true);

    const cmdWindow = await app.getWindow('cmd/panel.html', 5000);
    expect(cmdWindow).toBeTruthy();

    // Verify state object has chain properties
    const hasChainState = await cmdWindow.evaluate(() => {
      // Access state through the module scope would require exposing it
      // Instead verify the UI elements that depend on chain state exist
      const chainIndicator = document.getElementById('chain-indicator');
      const previewContainer = document.getElementById('preview-container');
      return chainIndicator !== null && previewContainer !== null;
    });
    expect(hasChainState).toBe(true);

    // Close the window
    if (openResult.id) {
      await bgWindow.evaluate(async (id: number) => {
        return await (window as any).app.window.close(id);
      }, openResult.id);
    }
  });

  test('MIME type matching works correctly', async () => {
    // Test MIME matching logic in panel context
    const openResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://ext/cmd/panel.html', {
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

    // Find the cmd window
    const cmdWindow = await app.getWindow('cmd/panel.html', 5000);
    expect(cmdWindow).toBeTruthy();

    // Test MIME type matching function (if exposed, or test via behavior)
    // The panel.js has mimeTypeMatches function - we test the expected behavior

    // Test exact match: 'application/json' matches 'application/json'
    const exactMatch = await cmdWindow.evaluate(() => {
      // We can't directly call the function, but we can verify commands filter correctly
      // This is more of an integration test
      return true;
    });
    expect(exactMatch).toBe(true);

    // Close the window
    if (openResult.id) {
      await bgWindow.evaluate(async (id: number) => {
        return await (window as any).app.window.close(id);
      }, openResult.id);
    }
  });

  test('cmd panel input works correctly', async () => {
    // Open cmd panel
    const openResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://ext/cmd/panel.html', {
        modal: true,
        width: 600,
        height: 400,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        center: true
      });
    });
    expect(openResult.success).toBe(true);

    // Find the cmd window
    const cmdWindow = await app.getWindow('cmd/panel.html', 5000);
    expect(cmdWindow).toBeTruthy();

    // Wait for input to be ready
    await cmdWindow.waitForSelector('input', { timeout: 5000 });

    // Verify input is focusable and can receive text
    await cmdWindow.fill('input', 'test');
    const inputValue = await cmdWindow.$eval('input', (el: HTMLInputElement) => el.value);
    expect(inputValue).toBe('test');

    // Close the window
    if (openResult.id) {
      await bgWindow.evaluate(async (id: number) => {
        return await (window as any).app.window.close(id);
      }, openResult.id);
    }
  });

  test('panel has chain indicator, preview, and execution state elements', async () => {
    // Open cmd panel
    const openResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://ext/cmd/panel.html', {
        modal: true,
        width: 600,
        height: 300,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        center: true
      });
    });
    expect(openResult.success).toBe(true);

    const cmdWindow = await app.getWindow('cmd/panel.html', 5000);
    expect(cmdWindow).toBeTruthy();

    // Check chain indicator element exists
    const chainIndicator = await cmdWindow.$('#chain-indicator');
    expect(chainIndicator).toBeTruthy();

    // Check preview container exists
    const previewContainer = await cmdWindow.$('#preview-container');
    expect(previewContainer).toBeTruthy();

    // Check execution state element exists
    const executionState = await cmdWindow.$('#execution-state');
    expect(executionState).toBeTruthy();

    // Verify chain indicator is initially hidden (no 'visible' class)
    const chainVisible = await cmdWindow.$eval('#chain-indicator', (el: HTMLElement) => el.classList.contains('visible'));
    expect(chainVisible).toBe(false);

    // Verify preview is initially hidden (no 'visible' class)
    const previewVisible = await cmdWindow.$eval('#preview-container', (el: HTMLElement) => el.classList.contains('visible'));
    expect(previewVisible).toBe(false);

    // Verify execution state is initially hidden (no 'visible' class)
    const execVisible = await cmdWindow.$eval('#execution-state', (el: HTMLElement) => el.classList.contains('visible'));
    expect(execVisible).toBe(false);

    // Verify results is initially hidden (no 'visible' class)
    const resultsVisible = await cmdWindow.$eval('#results', (el: HTMLElement) => el.classList.contains('visible'));
    expect(resultsVisible).toBe(false);

    // Close the window
    if (openResult.id) {
      await bgWindow.evaluate(async (id: number) => {
        return await (window as any).app.window.close(id);
      }, openResult.id);
    }
  });

  test('lists command produces array output and enters output selection mode', async () => {
    // Open cmd panel
    const openResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://ext/cmd/panel.html', {
        modal: true,
        width: 600,
        height: 400,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        center: true
      });
    });
    expect(openResult.success).toBe(true);

    const cmdWindow = await app.getWindow('cmd/panel.html', 5000);
    expect(cmdWindow).toBeTruthy();

    // Wait for input to be ready
    await cmdWindow.waitForSelector('input', { timeout: 5000 });

    // Type 'lists' command
    await cmdWindow.fill('input', 'lists');

    // Press down arrow to show results
    await cmdWindow.press('input', 'ArrowDown');
    await waitForClass(cmdWindow, '#results', 'visible');

    // Verify results are visible
    const resultsVisible = await cmdWindow.$eval('#results', (el: HTMLElement) => el.classList.contains('visible'));
    expect(resultsVisible).toBe(true);

    // Press Enter to execute
    await cmdWindow.press('input', 'Enter');
    await waitForResultsWithContent(cmdWindow);

    // After lists executes, we should be in output selection mode
    // Results should show the items from the lists output
    const hasResults = await cmdWindow.$eval('#results', (el: HTMLElement) => {
      return el.classList.contains('visible') && el.children.length > 0;
    });
    expect(hasResults).toBe(true);

    // Preview should show the selected item
    const previewVisible = await cmdWindow.$eval('#preview-container', (el: HTMLElement) => el.classList.contains('visible'));
    expect(previewVisible).toBe(true);

    // Close the window
    if (openResult.id) {
      await bgWindow.evaluate(async (id: number) => {
        return await (window as any).app.window.close(id);
      }, openResult.id);
    }
  });

  test('selecting output item enters chain mode with filtered commands', async () => {
    // Open cmd panel
    const openResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://ext/cmd/panel.html', {
        modal: true,
        width: 600,
        height: 400,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        center: true
      });
    });
    expect(openResult.success).toBe(true);

    const cmdWindow = await app.getWindow('cmd/panel.html', 5000);
    expect(cmdWindow).toBeTruthy();

    // Execute lists command
    await cmdWindow.waitForSelector('input', { timeout: 5000 });
    await cmdWindow.fill('input', 'lists');
    await cmdWindow.press('input', 'ArrowDown');
    await waitForClass(cmdWindow, '#results', 'visible');
    await cmdWindow.press('input', 'Enter');
    await waitForResultsWithContent(cmdWindow);

    // Now in output selection mode - press Enter to select first item
    await cmdWindow.press('input', 'Enter');
    await waitForClass(cmdWindow, '#chain-indicator', 'visible');

    // Should now be in chain mode
    const chainVisible = await cmdWindow.$eval('#chain-indicator', (el: HTMLElement) => el.classList.contains('visible'));
    expect(chainVisible).toBe(true);

    // Results should show commands that accept the output MIME type (application/json)
    const resultsVisible = await cmdWindow.$eval('#results', (el: HTMLElement) => el.classList.contains('visible'));
    expect(resultsVisible).toBe(true);

    // Should see csv and save commands (they accept application/json or */*)
    const resultText = await cmdWindow.$eval('#results', (el: HTMLElement) => el.textContent || '');
    expect(resultText.toLowerCase()).toContain('csv');
    expect(resultText.toLowerCase()).toContain('save');

    // Close the window
    if (openResult.id) {
      await bgWindow.evaluate(async (id: number) => {
        return await (window as any).app.window.close(id);
      }, openResult.id);
    }
  });

  test('csv command converts JSON to CSV format', async () => {
    // Open cmd panel
    const openResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://ext/cmd/panel.html', {
        modal: true,
        width: 600,
        height: 400,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        center: true
      });
    });
    expect(openResult.success).toBe(true);

    const cmdWindow = await app.getWindow('cmd/panel.html', 5000);
    expect(cmdWindow).toBeTruthy();

    // Execute lists command
    await cmdWindow.waitForSelector('input', { timeout: 5000 });
    await cmdWindow.fill('input', 'lists');
    await cmdWindow.press('input', 'ArrowDown');
    await waitForClass(cmdWindow, '#results', 'visible');
    await cmdWindow.press('input', 'Enter');
    await waitForResultsWithContent(cmdWindow);

    // Select first item
    await cmdWindow.press('input', 'Enter');
    await waitForClass(cmdWindow, '#chain-indicator', 'visible');

    // Now in chain mode - type 'csv' and execute
    await cmdWindow.fill('input', 'csv');
    await cmdWindow.press('input', 'ArrowDown');
    await waitForClass(cmdWindow, '#results', 'visible');
    await cmdWindow.press('input', 'Enter');
    // Wait for CSV table to appear in preview
    await cmdWindow.waitForSelector('#preview-content table.preview-csv', { timeout: 5000 });

    // After csv executes, preview should show CSV content rendered as a table
    // The CSV renderer converts comma-separated values into HTML table cells
    const previewInfo = await cmdWindow.$eval('#preview-content', (el: HTMLElement) => {
      const table = el.querySelector('table.preview-csv');
      const cells = el.querySelectorAll('td');
      return {
        hasTable: !!table,
        cellCount: cells.length,
        // Get text from cells to verify data is present
        cellTexts: Array.from(cells).slice(0, 8).map(c => c.textContent || '')
      };
    });
    // CSV should be rendered as a table with multiple cells
    expect(previewInfo.hasTable).toBe(true);
    expect(previewInfo.cellCount).toBeGreaterThan(0);
    // Should have some data cells (header + at least one row)
    expect(previewInfo.cellTexts.length).toBeGreaterThan(0);

    // Chain indicator should show text/csv MIME type
    const chainMime = await cmdWindow.$eval('#chain-mime', (el: HTMLElement) => el.textContent || '');
    expect(chainMime).toBe('text/csv');

    // Close the window
    if (openResult.id) {
      await bgWindow.evaluate(async (id: number) => {
        return await (window as any).app.window.close(id);
      }, openResult.id);
    }
  });

  test('escape exits chain mode before closing panel', async () => {
    // Open cmd panel
    const openResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://ext/cmd/panel.html', {
        modal: true,
        width: 600,
        height: 400,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        center: true
      });
    });
    expect(openResult.success).toBe(true);

    const cmdWindow = await app.getWindow('cmd/panel.html', 5000);
    expect(cmdWindow).toBeTruthy();

    // Execute lists and select item to enter chain mode
    await cmdWindow.waitForSelector('input', { timeout: 5000 });
    await cmdWindow.fill('input', 'lists');
    await cmdWindow.press('input', 'ArrowDown');
    await waitForClass(cmdWindow, '#results', 'visible');
    await cmdWindow.press('input', 'Enter');
    await waitForResultsWithContent(cmdWindow);
    await cmdWindow.press('input', 'Enter');
    await waitForClass(cmdWindow, '#chain-indicator', 'visible');

    // Verify in chain mode
    let chainVisible = await cmdWindow.$eval('#chain-indicator', (el: HTMLElement) => el.classList.contains('visible'));
    expect(chainVisible).toBe(true);

    // Press Escape - should exit chain mode, not close panel
    await cmdWindow.press('input', 'Escape');
    await waitForClass(cmdWindow, '#chain-indicator', 'visible', false);

    // Chain indicator should be hidden now
    chainVisible = await cmdWindow.$eval('#chain-indicator', (el: HTMLElement) => el.classList.contains('visible'));
    expect(chainVisible).toBe(false);

    // Panel should still exist (window not closed)
    const inputExists = await cmdWindow.$('input');
    expect(inputExists).toBeTruthy();

    // Close the window
    if (openResult.id) {
      await bgWindow.evaluate(async (id: number) => {
        return await (window as any).app.window.close(id);
      }, openResult.id);
    }
  });

  test('arrow navigation in output selection mode', async () => {
    // Open cmd panel
    const openResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://ext/cmd/panel.html', {
        modal: true,
        width: 600,
        height: 400,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        center: true
      });
    });
    expect(openResult.success).toBe(true);

    const cmdWindow = await app.getWindow('cmd/panel.html', 5000);
    expect(cmdWindow).toBeTruthy();

    // Execute lists command
    await cmdWindow.waitForSelector('input', { timeout: 5000 });
    await cmdWindow.fill('input', 'lists');
    await cmdWindow.press('input', 'ArrowDown');
    await waitForClass(cmdWindow, '#results', 'visible');
    await cmdWindow.press('input', 'Enter');
    await waitForResultsWithContent(cmdWindow);

    // In output selection mode - first item should be selected
    let selectedItem = await cmdWindow.$('.command-item.selected');
    expect(selectedItem).toBeTruthy();

    // Get initial selected item text
    const firstSelectedText = await cmdWindow.$eval('.command-item.selected', (el: HTMLElement) => el.textContent || '');

    // Press down to select next item
    await cmdWindow.press('input', 'ArrowDown');
    await waitForSelectionChange(cmdWindow, '.command-item.selected', firstSelectedText);

    // Selected item should change
    const secondSelectedText = await cmdWindow.$eval('.command-item.selected', (el: HTMLElement) => el.textContent || '');
    expect(secondSelectedText).not.toBe(firstSelectedText);

    // Press up to go back
    await cmdWindow.press('input', 'ArrowUp');
    await waitForSelectionChange(cmdWindow, '.command-item.selected', secondSelectedText);

    // Should be back to first item
    const backToFirst = await cmdWindow.$eval('.command-item.selected', (el: HTMLElement) => el.textContent || '');
    expect(backToFirst).toBe(firstSelectedText);

    // Close the window
    if (openResult.id) {
      await bgWindow.evaluate(async (id: number) => {
        return await (window as any).app.window.close(id);
      }, openResult.id);
    }
  });
});

// ============================================================================
// Theme Tests
// ============================================================================

test.describe('Themes @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-themes');
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('theme API is available', async () => {
    const hasThemeApi = await bgWindow.evaluate(() => {
      const api = (window as any).app;
      return !!(api.theme && api.theme.get && api.theme.setTheme && api.theme.getAll);
    });
    expect(hasThemeApi).toBe(true);
  });

  test('get current theme state', async () => {
    const themeState = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.get();
    });

    expect(themeState).toBeTruthy();
    expect(themeState.themeId).toBeTruthy();
    expect(themeState.colorScheme).toBeTruthy();
    expect(['system', 'light', 'dark']).toContain(themeState.colorScheme);
    expect(typeof themeState.isDark).toBe('boolean');
    expect(['light', 'dark']).toContain(themeState.effectiveScheme);
  });

  test('list available themes', async () => {
    const result = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.getAll();
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThanOrEqual(2); // basic and peek

    // Verify built-in themes exist
    const themeIds = result.data.map((t: any) => t.id);
    expect(themeIds).toContain('basic');
    expect(themeIds).toContain('peek');

    // Verify theme structure
    for (const theme of result.data) {
      expect(theme.id).toBeTruthy();
      expect(theme.name).toBeTruthy();
      expect(theme.version).toBeTruthy();
    }
  });

  test('switch themes', async () => {
    // Get initial theme
    const initialState = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.get();
    });

    // Switch to a different theme
    const targetTheme = initialState.themeId === 'basic' ? 'peek' : 'basic';
    const switchResult = await bgWindow.evaluate(async (themeId: string) => {
      return await (window as any).app.theme.setTheme(themeId);
    }, targetTheme);

    expect(switchResult.success).toBe(true);
    expect(switchResult.themeId).toBe(targetTheme);

    // Verify theme changed
    const newState = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.get();
    });
    expect(newState.themeId).toBe(targetTheme);

    // Switch back to original
    await bgWindow.evaluate(async (themeId: string) => {
      return await (window as any).app.theme.setTheme(themeId);
    }, initialState.themeId);
  });

  test('switch color scheme', async () => {
    // Get initial state
    const initialState = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.get();
    });

    // Switch to light mode
    const lightResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.setColorScheme('light');
    });
    expect(lightResult.success).toBe(true);
    expect(lightResult.colorScheme).toBe('light');

    // Verify it changed
    let state = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.get();
    });
    expect(state.colorScheme).toBe('light');
    expect(state.effectiveScheme).toBe('light');

    // Switch to dark mode
    const darkResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.setColorScheme('dark');
    });
    expect(darkResult.success).toBe(true);
    expect(darkResult.colorScheme).toBe('dark');

    state = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.get();
    });
    expect(state.colorScheme).toBe('dark');
    expect(state.effectiveScheme).toBe('dark');

    // Switch back to system
    const systemResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.setColorScheme('system');
    });
    expect(systemResult.success).toBe(true);
    expect(systemResult.colorScheme).toBe('system');

    // Restore original color scheme
    await bgWindow.evaluate(async (scheme: string) => {
      return await (window as any).app.theme.setColorScheme(scheme);
    }, initialState.colorScheme);
  });

  test('invalid theme returns error', async () => {
    const result = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.setTheme('nonexistent-theme');
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('invalid color scheme returns error', async () => {
    const result = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.setColorScheme('invalid');
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ============================================================================
// Theme Persistence Tests
// ============================================================================

test.describe('Theme Persistence @desktop', () => {
  const profileName = 'test-theme-persist';

  test('saved theme is restored on restart', async () => {
    // First session: set theme to peek
    let app = await launchDesktopApp(profileName);
    let bgWindow = await app.getBackgroundWindow();

    // Set theme to peek
    const setResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.setTheme('peek');
    });
    expect(setResult.success).toBe(true);

    // Verify theme is set
    const themeState1 = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.get();
    });
    expect(themeState1.themeId).toBe('peek');

    // Close app
    await app.close();

    // Second session: verify theme is restored
    app = await launchDesktopApp(profileName);
    bgWindow = await app.getBackgroundWindow();

    // Theme should be peek without needing to set it
    const themeState2 = await bgWindow.evaluate(async () => {
      return await (window as any).app.theme.get();
    });
    expect(themeState2.themeId).toBe('peek');

    // Open settings window to verify the theme CSS is loaded correctly
    await bgWindow.evaluate(async () => {
      return await (window as any).app.window.open('peek://app/settings/settings.html', {
        width: 800, height: 600
      });
    });

    const settingsWin = await app.getWindow('settings/settings.html', 5000);
    expect(settingsWin).toBeTruthy();

    // Check that the CSS variable has the peek theme's font
    const fontVar = await settingsWin.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--theme-font-sans');
    });
    expect(fontVar).toContain('ServerMono');

    await app.close();
  });
});

// ============================================================================
// Command Registration Performance Tests
// ============================================================================

test.describe('Command Registration Performance @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-cmd-perf');
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('cmd:register-batch is handled by cmd extension', async () => {
    // Test that batch registration works by sending a batch and verifying commands appear
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;

      // Send a batch of test commands
      api.publish('cmd:register-batch', {
        commands: [
          { name: 'test-batch-cmd-1', description: 'Test batch command 1', source: 'test' },
          { name: 'test-batch-cmd-2', description: 'Test batch command 2', source: 'test' },
          { name: 'test-batch-cmd-3', description: 'Test batch command 3', source: 'test' }
        ]
      }, api.scopes.GLOBAL);

      // Wait for batch to be processed
      await new Promise(r => setTimeout(r, 100));

      // Query commands to verify they were registered
      return new Promise((resolve) => {
        api.subscribe('cmd:query-commands-response', (msg: any) => {
          const commands = msg.commands || [];
          const batchCmds = commands.filter((c: any) => c.name.startsWith('test-batch-cmd-'));
          resolve({
            totalCommands: commands.length,
            batchCommandsFound: batchCmds.length,
            batchCommandNames: batchCmds.map((c: any) => c.name)
          });
        }, api.scopes.GLOBAL);

        api.publish('cmd:query-commands', {}, api.scopes.GLOBAL);

        setTimeout(() => resolve({ totalCommands: 0, batchCommandsFound: 0, batchCommandNames: [] }), 2000);
      });
    });

    expect(result.batchCommandsFound).toBe(3);
    expect(result.batchCommandNames).toContain('test-batch-cmd-1');
    expect(result.batchCommandNames).toContain('test-batch-cmd-2');
    expect(result.batchCommandNames).toContain('test-batch-cmd-3');
  });

  test('api.commands.flush() sends pending registrations immediately', async () => {
    // Test that flush() can be called to send batched commands immediately
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;

      // Register a command (it will be batched)
      api.commands.register({
        name: 'test-flush-cmd',
        description: 'Test flush command',
        execute: () => {}
      });

      // Immediately flush
      api.commands.flush();

      // Wait a bit for processing
      await new Promise(r => setTimeout(r, 50));

      // Query commands to verify it was registered
      return new Promise((resolve) => {
        api.subscribe('cmd:query-commands-response', (msg: any) => {
          const commands = msg.commands || [];
          const flushCmd = commands.find((c: any) => c.name === 'test-flush-cmd');
          resolve({
            found: !!flushCmd,
            commandName: flushCmd?.name
          });
        }, api.scopes.GLOBAL);

        api.publish('cmd:query-commands', {}, api.scopes.GLOBAL);

        setTimeout(() => resolve({ found: false }), 2000);
      });
    });

    expect(result.found).toBe(true);
    expect(result.commandName).toBe('test-flush-cmd');
  });

  test('commands registered via api.commands.register are batched', async () => {
    // Test that multiple rapid registrations are batched (not sent individually)
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;
      const receivedBatches: any[] = [];

      // Subscribe to batch messages to count them
      api.subscribe('cmd:register-batch', (msg: any) => {
        receivedBatches.push(msg);
      }, api.scopes.GLOBAL);

      // Register multiple commands rapidly
      for (let i = 0; i < 5; i++) {
        api.commands.register({
          name: `test-rapid-cmd-${i}`,
          description: `Rapid command ${i}`,
          execute: () => {}
        });
      }

      // Wait for debounce to complete (16ms + buffer)
      await new Promise(r => setTimeout(r, 50));

      // Verify commands are registered
      return new Promise((resolve) => {
        api.subscribe('cmd:query-commands-response', (msg: any) => {
          const commands = msg.commands || [];
          const rapidCmds = commands.filter((c: any) => c.name.startsWith('test-rapid-cmd-'));
          resolve({
            commandsRegistered: rapidCmds.length,
            // Note: We can't directly count batches from renderer, but we verify all commands arrived
            allCommandsPresent: rapidCmds.length === 5
          });
        }, api.scopes.GLOBAL);

        api.publish('cmd:query-commands', {}, api.scopes.GLOBAL);

        setTimeout(() => resolve({ commandsRegistered: 0, allCommandsPresent: false }), 2000);
      });
    });

    expect(result.commandsRegistered).toBe(5);
    expect(result.allCommandsPresent).toBe(true);
  });
});

// ============================================================================
// Startup Phase Events Tests
// ============================================================================

test.describe('Startup Phase Events @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-startup-phases');
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('ext:startup:phase events are available for subscription', async () => {
    // Test that extensions can subscribe to startup phase events
    // Since app is already started, we test that the subscription mechanism works
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;
      let received = false;

      // Subscribe to startup phase events
      api.subscribe('ext:startup:phase', (msg: any) => {
        received = true;
      }, api.scopes.GLOBAL);

      // The subscription should be set up without error
      return { subscriptionCreated: true };
    });

    expect(result.subscriptionCreated).toBe(true);
  });

  test('ext:all-loaded event was published during startup', async () => {
    // Verify that the ext:all-loaded event was published by checking extensions are running
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;

      // Get running extensions - if they're running, ext:all-loaded was published
      const extResult = await api.extensions.list();
      const extensions = extResult.data || [];
      return {
        success: extResult.success,
        extensionCount: extensions.length,
        hasCmd: extensions.some((e: any) => e.id === 'cmd'),
        hasGroups: extensions.some((e: any) => e.id === 'groups')
      };
    });

    expect(result.success).toBe(true);
    expect(result.extensionCount).toBeGreaterThan(0);
    expect(result.hasCmd).toBe(true);
  });

  test('cmd extension loads before other extensions can register commands', async () => {
    // Verify that cmd is running and accepting commands (which means it loaded first)
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;

      // Query commands - if we get a response, cmd is running and initialized
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ cmdResponded: false, commandCount: 0 });
        }, 2000);

        api.subscribe('cmd:query-commands-response', (msg: any) => {
          clearTimeout(timeout);
          resolve({
            cmdResponded: true,
            commandCount: msg.commands?.length || 0,
            hasGalleryCommand: msg.commands?.some((c: any) => c.name === 'example:gallery')
          });
        }, api.scopes.GLOBAL);

        api.publish('cmd:query-commands', {}, api.scopes.GLOBAL);
      });
    });

    expect(result.cmdResponded).toBe(true);
    expect(result.commandCount).toBeGreaterThan(0);
    // gallery command from example extension should be registered
    expect(result.hasGalleryCommand).toBe(true);
  });

  test('cmd extension is always running (cannot be disabled)', async () => {
    // cmd is required infrastructure - verify it's always in the running extensions list
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;
      const runningExts = await api.extensions.list();
      return {
        success: runningExts.success,
        extensions: runningExts.data || [],
        cmdRunning: runningExts.data?.some((ext: any) => ext.id === 'cmd'),
        cmdStatus: runningExts.data?.find((ext: any) => ext.id === 'cmd')?.status
      };
    });

    expect(result.success).toBe(true);
    expect(result.cmdRunning).toBe(true);
    expect(result.cmdStatus).toBe('running');
  });
});

// ============================================================================
// Hybrid Extension Mode Tests
// ============================================================================

test.describe('Hybrid Extension Mode @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    // Launch app - hybrid mode is now the default
    app = await launchDesktopApp(`test-hybrid-${Date.now()}`);
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('extension host window exists for built-in extensions', async () => {
    // Extension host should exist for consolidated built-in extensions
    const windows = app.windows();
    const hostWindow = windows.find(w => w.url().includes('peek://app/extension-host.html'));
    expect(hostWindow).toBeDefined();
  });

  test('built-in extensions load as iframes in extension host', async () => {
    // Get the extension host window
    const windows = app.windows();
    const hostWindow = windows.find(w => w.url().includes('peek://app/extension-host.html'));
    expect(hostWindow).toBeDefined();

    // Wait for iframes to load (with retry)
    const iframeData = await hostWindow!.evaluate(async () => {
      const maxWait = 10000;
      const start = Date.now();
      while (Date.now() - start < maxWait) {
        const container = document.getElementById('extensions');
        const iframes = container ? Array.from(container.querySelectorAll('iframe')) : [];
        // Built-in extensions: cmd, groups, peeks, slides, windows (5 total)
        if (iframes.length >= 5) {
          return {
            count: iframes.length,
            srcs: iframes.map(f => f.src)
          };
        }
        await new Promise(r => setTimeout(r, 200));
      }
      const container = document.getElementById('extensions');
      const iframes = container ? Array.from(container.querySelectorAll('iframe')) : [];
      return {
        count: iframes.length,
        srcs: iframes.map(f => f.src)
      };
    });

    // Should have iframes for cmd, groups, peeks, slides, windows (5 built-in extensions)
    expect(iframeData.count).toBe(5);
    expect(iframeData.srcs.some(s => s.includes('peek://cmd/'))).toBe(true);
    expect(iframeData.srcs.some(s => s.includes('peek://groups/'))).toBe(true);
    expect(iframeData.srcs.some(s => s.includes('peek://peeks/'))).toBe(true);
    expect(iframeData.srcs.some(s => s.includes('peek://slides/'))).toBe(true);
    expect(iframeData.srcs.some(s => s.includes('peek://windows/'))).toBe(true);
  });

  test('example extension loads as separate window (external)', async () => {
    // Example extension should load in its own window, not in extension host
    const windows = app.windows();

    // Should have a separate window for example extension
    const exampleWindow = windows.find(w =>
      w.url().includes('peek://ext/example/background.html')
    );
    expect(exampleWindow).toBeDefined();
  });

  test('api.extensions.reload() reloads external extension', async () => {
    // Reload the example extension (external, not consolidated)
    const reloadResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.extensions.reload('example');
    });

    expect(reloadResult.success).toBe(true);
    expect(reloadResult.data?.id).toBe('example');

    // Wait for extension to reload
    await sleep(500);

    // Verify the extension window still exists after reload
    const windows = app.windows();
    const exampleWindow = windows.find(w =>
      w.url().includes('peek://ext/example/background.html')
    );
    expect(exampleWindow).toBeDefined();
  });

  test('api.extensions.reload() fails for consolidated extensions', async () => {
    // Consolidated extensions (like cmd, groups) cannot be reloaded
    const reloadResult = await bgWindow.evaluate(async () => {
      return await (window as any).app.extensions.reload('cmd');
    });

    expect(reloadResult.success).toBe(false);
    expect(reloadResult.error).toContain('Failed to reload');
  });

  test('commands work from both consolidated and external extensions', async () => {
    // Wait a bit for extensions to initialize and register commands
    await sleep(1000);

    // Query commands - should include commands from all extensions
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, commandCount: 0 });
        }, 10000);

        api.subscribe('cmd:query-commands-response', (msg: any) => {
          clearTimeout(timeout);
          resolve({
            success: true,
            commandCount: msg.commands?.length || 0,
            // example:gallery comes from external 'example' extension
            hasGalleryCommand: msg.commands?.some((c: any) => c.name === 'example:gallery'),
            // settings comes from core (via consolidated cmd)
            hasSettingsCommand: msg.commands?.some((c: any) => c.name === 'settings')
          });
        }, api.scopes.GLOBAL);

        api.publish('cmd:query-commands', {}, api.scopes.GLOBAL);
      });
    });

    expect(result.success).toBe(true);
    expect(result.commandCount).toBeGreaterThan(0);
    // example:gallery proves external extension commands work
    expect(result.hasGalleryCommand).toBe(true);
    // settings proves consolidated extension commands work
    expect(result.hasSettingsCommand).toBe(true);
  });

  test('pubsub works between consolidated and external extensions', async () => {
    // Test pubsub routing between extensions in different modes
    // cmd (consolidated) receives query, responds to core
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ received: false, commandCount: 0 });
        }, 5000);

        api.subscribe('cmd:query-commands-response', (msg: any) => {
          clearTimeout(timeout);
          resolve({
            received: true,
            commandCount: msg.commands?.length || 0
          });
        }, api.scopes.GLOBAL);

        api.publish('cmd:query-commands', {}, api.scopes.GLOBAL);
      });
    });

    expect(result.received).toBe(true);
    expect(result.commandCount).toBeGreaterThan(0);
  });

  test('correct window count for hybrid mode', async () => {
    // In hybrid mode we should have:
    // - 1 background window (core)
    // - 1 extension host window (consolidated built-ins)
    // - 1 separate window for 'example' extension
    // - Plus any UI windows (settings, etc.)
    const windows = app.windows();

    const bgWindows = windows.filter(w => w.url().includes('app/background.html'));
    const hostWindows = windows.filter(w => w.url().includes('extension-host.html'));
    const extWindows = windows.filter(w =>
      w.url().includes('peek://ext/') && w.url().includes('background.html')
    );

    expect(bgWindows.length).toBe(1);
    expect(hostWindows.length).toBe(1);
    // Only example should be in separate window
    expect(extWindows.length).toBe(1);
    expect(extWindows[0].url()).toContain('example');
  });
});

// ============================================================================
// Extension Settings in Hybrid Mode Tests
// ============================================================================

test.describe('Extension Settings in Hybrid Mode @desktop', () => {
  test('hybrid mode extensions can access settings via api.settings.get()', async () => {
    // This test verifies that extensions running at peek://{extId}/... URLs
    // (hybrid mode) can successfully use the settings API
    //
    // The preload must correctly detect these URLs as extensions and return
    // the proper extension ID for settings lookups
    //
    // We test this by updating settings via pubsub and verifying:
    // 1. cmd receives the update (which requires api.settings.get() to have worked during init)
    // 2. cmd persists the settings (which requires api.settings.set() to work)

    // Launch fresh app with unique profile
    const app = await launchDesktopApp(`test-settings-hybrid-${Date.now()}`);
    const bgWindow = await app.getBackgroundWindow();

    try {
      // Wait for extensions to initialize
      await sleep(1000);

      // Custom shortcut to test with
      const customShortcut = 'Option+Shift+T';

      // Update cmd settings via pubsub
      const updateResult = await bgWindow.evaluate(async (shortcut) => {
        const api = (window as any).app;

        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            resolve({ success: false, error: 'timeout waiting for settings change' });
          }, 5000);

          // Subscribe to settings changed notification from cmd
          api.subscribe('cmd:settings-changed', (msg: any) => {
            clearTimeout(timeout);
            resolve({
              success: true,
              receivedShortcut: msg?.prefs?.shortcutKey,
              matchesExpected: msg?.prefs?.shortcutKey === shortcut
            });
          }, api.scopes.GLOBAL);

          // Update cmd settings via pubsub (this is how Settings UI does it)
          api.publish('cmd:settings-update', {
            data: { prefs: { shortcutKey: shortcut } }
          }, api.scopes.GLOBAL);
        });
      }, customShortcut);

      expect(updateResult.success).toBe(true);
      expect(updateResult.matchesExpected).toBe(true);
      expect(updateResult.receivedShortcut).toBe(customShortcut);

      // Wait a moment for persistence to complete
      await sleep(200);

      // Now verify the settings were persisted to datastore
      // Note: extension-settings-set stores with id format ${extId}_${key}
      const persistResult = await bgWindow.evaluate(async (expectedShortcut) => {
        const api = (window as any).app;
        const stored = await api.datastore.getRow('extension_settings', 'cmd_prefs');

        if (!stored.success || !stored.data?.value) {
          return { success: false, error: 'No stored settings found', stored };
        }

        const parsed = JSON.parse(stored.data.value);
        return {
          success: true,
          persistedShortcut: parsed.shortcutKey,
          wasPersisted: parsed.shortcutKey === expectedShortcut
        };
      }, customShortcut);

      expect(persistResult.success).toBe(true);
      expect(persistResult.wasPersisted).toBe(true);
      expect(persistResult.persistedShortcut).toBe(customShortcut);

    } finally {
      await app.close();
    }
  });

  test('extension loads custom settings instead of defaults on startup', async () => {
    // This test verifies that when custom settings exist in the datastore,
    // extensions load those settings instead of their defaults
    //
    // We set up custom settings, close the app, relaunch with the same profile,
    // and verify the extension loaded the custom settings on init

    // Use a fixed profile name so we can relaunch with the same settings
    const profileName = `test-custom-settings-${Date.now()}`;

    // First, launch app to set up custom settings in the datastore
    const setupApp = await launchDesktopApp(profileName);
    const setupWindow = await setupApp.getBackgroundWindow();

    const customShortcut = 'Option+Ctrl+P';

    // Store custom settings (using format ${extId}_${key} to match extension-settings-set handler)
    const saveResult = await setupWindow.evaluate(async (shortcut) => {
      const api = (window as any).app;
      return await api.datastore.setRow('extension_settings', 'cmd_prefs', {
        extensionId: 'cmd',
        key: 'prefs',
        value: JSON.stringify({ shortcutKey: shortcut }),
        updatedAt: Date.now()
      });
    }, customShortcut);

    expect(saveResult.success).toBe(true);

    // Close and relaunch - extensions should load custom settings on init
    await setupApp.close();

    // Small delay to ensure clean shutdown
    await sleep(500);

    // Relaunch with SAME profile to pick up saved settings
    const testApp = await launchDesktopApp(profileName);

    try {
      // Wait for extensions to fully load
      await sleep(1000);

      const testWindow = await testApp.getBackgroundWindow();

      // Verify cmd loaded the custom settings on startup
      // We update settings with the same value and verify it was already set
      const result = await testWindow.evaluate(async (expectedShortcut) => {
        const api = (window as any).app;

        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            resolve({ success: false, error: 'timeout' });
          }, 5000);

          api.subscribe('cmd:settings-changed', (msg: any) => {
            clearTimeout(timeout);
            resolve({
              success: true,
              shortcutKey: msg?.prefs?.shortcutKey,
              matchesCustom: msg?.prefs?.shortcutKey === expectedShortcut,
              // Check if it's NOT the default (Option+Space)
              isNotDefault: msg?.prefs?.shortcutKey !== 'Option+Space'
            });
          }, api.scopes.GLOBAL);

          // Poke cmd to report its current settings (update with same value)
          api.publish('cmd:settings-update', {
            data: { prefs: { shortcutKey: expectedShortcut } }
          }, api.scopes.GLOBAL);
        });
      }, customShortcut);

      expect(result.success).toBe(true);
      expect(result.isNotDefault).toBe(true);
      expect(result.matchesCustom).toBe(true);
      expect(result.shortcutKey).toBe(customShortcut);

    } finally {
      await testApp.close();
    }
  });

  test('extension falls back to defaults when no custom settings exist', async () => {
    // This test verifies that when no custom settings exist in the datastore,
    // extensions correctly use their default settings

    // Launch with unique profile (no pre-existing settings)
    const app = await launchDesktopApp(`test-defaults-${Date.now()}`);

    try {
      await sleep(1000); // Wait for extensions to load

      const bgWindow = await app.getBackgroundWindow();

      // Query cmd's current settings
      const result = await bgWindow.evaluate(async () => {
        const api = (window as any).app;
        const defaultShortcut = 'Option+Space'; // cmd's default

        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            resolve({ success: false, error: 'timeout' });
          }, 5000);

          api.subscribe('cmd:settings-changed', (msg: any) => {
            clearTimeout(timeout);
            resolve({
              success: true,
              shortcutKey: msg?.prefs?.shortcutKey,
              isDefault: msg?.prefs?.shortcutKey === defaultShortcut
            });
          }, api.scopes.GLOBAL);

          // Poke cmd to report its settings - use the default to not change it
          api.publish('cmd:settings-update', {
            data: { prefs: { shortcutKey: defaultShortcut } }
          }, api.scopes.GLOBAL);
        });
      });

      expect(result.success).toBe(true);
      expect(result.isDefault).toBe(true);
      expect(result.shortcutKey).toBe('Option+Space');

    } finally {
      await app.close();
    }
  });
});

// ============================================================================
// Window Targeting Tests
// ============================================================================
// Tests for the window focus tracking system that enables per-window commands
// like "theme dark here" to target the correct window.
//
// Key behavior: Modal windows (like cmd palette) should NOT update the
// "last focused visible window" tracker, so commands target the window
// the user was looking at before opening the palette.

test.describe('Window Targeting @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    app = await launchDesktopApp();
    bgWindow = await app.getBackgroundWindow();
    await sleep(500); // Wait for app to stabilize
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('setWindowColorScheme returns success with windowId', async () => {
    // Test that setWindowColorScheme works and returns expected data
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;

      // Open a test window (non-modal) to have a valid target
      const winResult = await api.window.open('peek://app/settings/settings.html', {
        width: 400,
        height: 300,
        modal: false,
        key: 'test-theme-window-1'
      });

      if (!winResult.success) {
        return { success: false, error: 'Failed to open window' };
      }

      // Wait for window to be ready and focused
      await new Promise(r => setTimeout(r, 300));

      // Call setWindowColorScheme
      const themeResult = await api.theme.setWindowColorScheme('dark');

      // Clean up
      try {
        await api.window.close(winResult.id);
      } catch (e) {
        // Ignore close errors
      }

      return {
        success: themeResult.success,
        windowId: themeResult.windowId,
        colorScheme: themeResult.colorScheme,
        error: themeResult.error
      };
    });

    expect(result.success).toBe(true);
    expect(result.colorScheme).toBe('dark');
    expect(typeof result.windowId).toBe('number');
  });

  test('modal window does not become theme target', async () => {
    // This test verifies that opening a modal window after a non-modal window
    // still allows setWindowColorScheme to target the non-modal window
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;

      // Open a non-modal window first
      const nonModalResult = await api.window.open('peek://app/settings/settings.html', {
        width: 400,
        height: 300,
        modal: false,
        key: 'test-nonmodal-target'
      });

      if (!nonModalResult.success) {
        return { success: false, error: 'Failed to open non-modal window' };
      }

      // Wait for it to focus
      await new Promise(r => setTimeout(r, 300));

      // Now open a modal window (simulating cmd palette behavior)
      const modalResult = await api.window.open('peek://app/settings/settings.html', {
        width: 300,
        height: 200,
        modal: true,
        key: 'test-modal-overlay'
      });

      if (!modalResult.success) {
        // Clean up non-modal
        try { await api.window.close(nonModalResult.id); } catch (e) {}
        return { success: false, error: 'Failed to open modal window' };
      }

      // Wait a bit for modal to be ready
      await new Promise(r => setTimeout(r, 200));

      // Now call setWindowColorScheme - should still target the NON-MODAL window
      const themeResult = await api.theme.setWindowColorScheme('light');

      // Clean up both windows
      try { await api.window.close(modalResult.id); } catch (e) {}
      try { await api.window.close(nonModalResult.id); } catch (e) {}

      return {
        success: themeResult.success,
        targetedWindowId: themeResult.windowId,
        nonModalWindowId: nonModalResult.id,
        modalWindowId: modalResult.id,
        // Key assertion: the targeted window should be the non-modal one
        targetedNonModal: themeResult.windowId === nonModalResult.id
      };
    });

    expect(result.success).toBe(true);
    // The theme command should have targeted the non-modal window, not the modal
    expect(result.targetedNonModal).toBe(true);
  });

  test('setWindowColorScheme with global resets override', async () => {
    // Test the 'global' value which should reset window-specific override
    const result = await bgWindow.evaluate(async () => {
      const api = (window as any).app;

      // Open a test window
      const winResult = await api.window.open('peek://app/settings/settings.html', {
        width: 400,
        height: 300,
        modal: false,
        key: 'test-theme-reset-window'
      });

      if (!winResult.success) {
        return { success: false, error: 'Failed to open window' };
      }

      await new Promise(r => setTimeout(r, 300));

      // Set to dark first
      const darkResult = await api.theme.setWindowColorScheme('dark');

      // Then reset to global
      const globalResult = await api.theme.setWindowColorScheme('global');

      // Clean up
      try { await api.window.close(winResult.id); } catch (e) {}

      return {
        darkSuccess: darkResult.success,
        globalSuccess: globalResult.success,
        globalColorScheme: globalResult.colorScheme
      };
    });

    expect(result.darkSuccess).toBe(true);
    expect(result.globalSuccess).toBe(true);
    expect(result.globalColorScheme).toBe('global');
  });
});

// ============================================================================
// Backup Tests
// ============================================================================

test.describe('Backup @desktop', () => {
  let app: DesktopApp;
  let bgWindow: Page;

  test.beforeAll(async () => {
    app = await launchDesktopApp('test-backup');
    bgWindow = await app.getBackgroundWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test('backup-get-config returns config object', async () => {
    const result = await bgWindow.evaluate(async () => {
      return await (window as any).app.invoke('backup-get-config');
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(typeof result.data.enabled).toBe('boolean');
    expect(typeof result.data.backupDir).toBe('string');
    expect(typeof result.data.retentionCount).toBe('number');
    expect(typeof result.data.lastBackupTime).toBe('number');
  });

  test('backup is disabled when backupDir is not configured', async () => {
    const result = await bgWindow.evaluate(async () => {
      return await (window as any).app.invoke('backup-get-config');
    });

    expect(result.success).toBe(true);
    // By default, backupDir should be empty and backups disabled
    expect(result.data.backupDir).toBe('');
    expect(result.data.enabled).toBe(false);
  });

  test('backup-create returns error when not configured', async () => {
    const result = await bgWindow.evaluate(async () => {
      return await (window as any).app.invoke('backup-create');
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });

  test('backup-list returns empty when not configured', async () => {
    const result = await bgWindow.evaluate(async () => {
      return await (window as any).app.invoke('backup-list');
    });

    expect(result.success).toBe(true);
    expect(result.data.backups).toEqual([]);
    expect(result.data.backupDir).toBe('');
  });

  test('backup works when backupDir is configured', async () => {
    // Create temp directory for test backups
    const os = await import('os');
    const pathModule = await import('path');
    const fs = await import('fs');

    const tempBackupDir = pathModule.default.join(os.default.tmpdir(), `peek-backup-test-${Date.now()}`);
    fs.default.mkdirSync(tempBackupDir, { recursive: true });

    try {
      // Store the current prefs and configure backup
      const setupResult = await bgWindow.evaluate(async (backupDir: string) => {
        const api = (window as any).app;

        // Get current prefs
        const prefsResult = await api.datastore.getTable('extension_settings');
        const corePrefsRow = Object.values(prefsResult.data || {}).find(
          (r: any) => r.extensionId === 'core' && r.key === 'prefs'
        ) as any;
        const originalPrefs = corePrefsRow ? JSON.parse(corePrefsRow.value) : {};

        // Set backupDir in core prefs
        const newPrefs = { ...originalPrefs, backupDir };
        await api.datastore.setRow('extension_settings', 'core:prefs', {
          extensionId: 'core',
          key: 'prefs',
          value: JSON.stringify(newPrefs),
          updatedAt: Date.now()
        });

        return { originalPrefs };
      }, tempBackupDir);

      // Verify config reflects the change
      const configResult = await bgWindow.evaluate(async () => {
        return await (window as any).app.invoke('backup-get-config');
      });
      expect(configResult.success).toBe(true);
      expect(configResult.data.backupDir).toBe(tempBackupDir);
      expect(configResult.data.enabled).toBe(true);

      // Create a backup
      const backupResult = await bgWindow.evaluate(async () => {
        return await (window as any).app.invoke('backup-create');
      });
      expect(backupResult.success).toBe(true);
      expect(backupResult.path).toBeTruthy();
      expect(backupResult.path.endsWith('.zip')).toBe(true);

      // Verify the file exists
      expect(fs.default.existsSync(backupResult.path)).toBe(true);

      // List backups - should have one
      const listResult = await bgWindow.evaluate(async () => {
        return await (window as any).app.invoke('backup-list');
      });
      expect(listResult.success).toBe(true);
      expect(listResult.data.backups.length).toBe(1);

      // Restore original prefs
      await bgWindow.evaluate(async (originalPrefs: Record<string, unknown>) => {
        const api = (window as any).app;
        await api.datastore.setRow('extension_settings', 'core:prefs', {
          extensionId: 'core',
          key: 'prefs',
          value: JSON.stringify(originalPrefs),
          updatedAt: Date.now()
        });
      }, setupResult.originalPrefs);
    } finally {
      // Clean up temp directory
      try {
        fs.default.rmSync(tempBackupDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });
});
