/**
 * Peek UI Components Tests
 *
 * Tests for all UI components using Playwright.
 *
 * Run with:
 *   npx playwright test tests/components/ --project=components
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '../..');

// Simple static file server
let server: ReturnType<typeof createServer>;
let serverUrl: string;

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

function startServer(): Promise<string> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      let filePath = path.join(ROOT, req.url || '/');

      // Default to test page
      if (req.url === '/' || req.url === '/test') {
        filePath = path.join(__dirname, 'test-page.html');
      }

      // Handle component imports
      if (req.url?.startsWith('/app/components/')) {
        filePath = path.join(ROOT, req.url);
      }

      // Handle node_modules (for lit)
      if (req.url?.startsWith('/node_modules/')) {
        filePath = path.join(ROOT, req.url);
      }

      const ext = path.extname(filePath);
      const contentType = mimeTypes[ext] || 'text/plain';

      try {
        if (existsSync(filePath)) {
          const content = readFileSync(filePath);
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        } else {
          res.writeHead(404);
          res.end(`Not found: ${filePath}`);
        }
      } catch (err) {
        res.writeHead(500);
        res.end(`Error: ${err}`);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const url = `http://127.0.0.1:${addr.port}`;
        resolve(url);
      }
    });
  });
}

function stopServer() {
  if (server) {
    server.close();
  }
}

test.describe('Components @components', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // Start server
    serverUrl = await startServer();

    page = await browser.newPage();

    // Enable console logging for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Page error:', msg.text());
      }
    });

    page.on('pageerror', err => {
      console.log('Page exception:', err.message);
    });

    await page.goto(`${serverUrl}/test`);

    // Wait for components to be ready
    await page.waitForSelector('body[data-ready="true"]', { timeout: 15000 });
  });

  test.afterAll(async () => {
    await page.close();
    stopServer();
  });

  // ==========================================================================
  // peek-button
  // ==========================================================================

  test.describe('peek-button', () => {
    test('renders with default variant', async () => {
      const btn = page.locator('#btn-default');
      await expect(btn).toBeVisible();
    });

    test('renders all variants', async () => {
      await expect(page.locator('#btn-primary')).toBeVisible();
      await expect(page.locator('#btn-secondary')).toBeVisible();
      await expect(page.locator('#btn-ghost')).toBeVisible();
      await expect(page.locator('#btn-danger')).toBeVisible();
    });

    test('renders all sizes', async () => {
      await expect(page.locator('#btn-sm')).toBeVisible();
      await expect(page.locator('#btn-md')).toBeVisible();
      await expect(page.locator('#btn-lg')).toBeVisible();
    });

    test('disabled button is not clickable', async () => {
      const btn = page.locator('#btn-disabled');
      await expect(btn).toHaveAttribute('disabled', '');

      // Check that the native button inside shadow DOM is disabled
      const isDisabled = await page.evaluate(() => {
        const el = document.querySelector('#btn-disabled');
        const innerBtn = el?.shadowRoot?.querySelector('button');
        return innerBtn?.disabled;
      });
      expect(isDisabled).toBe(true);
    });

    test('loading button shows spinner', async () => {
      const hasSpinner = await page.evaluate(() => {
        const el = document.querySelector('#btn-loading');
        const spinner = el?.shadowRoot?.querySelector('.spinner');
        return !!spinner;
      });
      expect(hasSpinner).toBe(true);
    });

    test('emits click event', async () => {
      const clicked = await page.evaluate(() => {
        return new Promise((resolve) => {
          const btn = document.querySelector('#btn-primary');
          btn?.addEventListener('click', () => resolve(true), { once: true });
          btn?.shadowRoot?.querySelector('button')?.click();
        });
      });
      expect(clicked).toBe(true);
    });
  });

  // ==========================================================================
  // peek-card
  // ==========================================================================

  test.describe('peek-card', () => {
    test('renders with header, body, and footer', async () => {
      const card = page.locator('#card-basic');
      await expect(card).toBeVisible();

      const content = await page.evaluate(() => {
        const card = document.querySelector('#card-basic');
        const header = card?.querySelector('[slot="header"]')?.textContent;
        const footer = card?.querySelector('[slot="footer"]')?.textContent;
        return { header, footer };
      });
      expect(content.header).toBe('Card Header');
      expect(content.footer).toBe('Card Footer');
    });

    test('interactive card has interactive attribute', async () => {
      const hasAttr = await page.evaluate(() => {
        const card = document.querySelector('#card-interactive');
        return card?.hasAttribute('interactive');
      });
      expect(hasAttr).toBe(true);
    });

    test('selected card has selected attribute', async () => {
      await expect(page.locator('#card-selected')).toHaveAttribute('selected', '');
    });
  });

  // ==========================================================================
  // peek-list
  // ==========================================================================

  test.describe('peek-list', () => {
    test('renders list items', async () => {
      const items = page.locator('#list-single peek-list-item');
      await expect(items).toHaveCount(3);
    });

    test('disabled item has disabled attribute', async () => {
      const isDisabled = await page.evaluate(() => {
        const item = document.querySelector('#list-single peek-list-item[disabled]');
        return item?.hasAttribute('disabled');
      });
      expect(isDisabled).toBe(true);
    });
  });

  // ==========================================================================
  // peek-input
  // ==========================================================================

  test.describe('peek-input', () => {
    test('accepts text input', async () => {
      await page.evaluate(() => {
        const el = document.querySelector('#input-basic') as any;
        el.value = 'test value';
      });

      const value = await page.evaluate(() => {
        const el = document.querySelector('#input-basic') as any;
        return el?.value;
      });
      expect(value).toBe('test value');
    });

    test('disabled input has disabled attribute', async () => {
      const isDisabled = await page.evaluate(() => {
        const el = document.querySelector('#input-disabled');
        return el?.hasAttribute('disabled');
      });
      expect(isDisabled).toBe(true);
    });
  });

  // ==========================================================================
  // peek-select
  // ==========================================================================

  test.describe('peek-select', () => {
    test('native mode renders select element', async () => {
      const hasSelect = await page.evaluate(() => {
        const el = document.querySelector('#select-native');
        const select = el?.shadowRoot?.querySelector('select');
        return !!select;
      });
      expect(hasSelect).toBe(true);
    });

    test('custom mode renders trigger button', async () => {
      const hasTrigger = await page.evaluate(() => {
        const el = document.querySelector('#select-custom');
        const trigger = el?.shadowRoot?.querySelector('.trigger');
        return !!trigger;
      });
      expect(hasTrigger).toBe(true);
    });
  });

  // ==========================================================================
  // peek-switch
  // ==========================================================================

  test.describe('peek-switch', () => {
    test('off by default', async () => {
      const checked = await page.evaluate(() => {
        const el = document.querySelector('#switch-off') as any;
        return el?.checked;
      });
      expect(checked).toBe(false);
    });

    test('can be checked by default', async () => {
      const checked = await page.evaluate(() => {
        const el = document.querySelector('#switch-on') as any;
        return el?.checked;
      });
      expect(checked).toBe(true);
    });

    test('toggles on click', async () => {
      // Click the switch wrapper/label, not just the host element
      await page.evaluate(() => {
        const el = document.querySelector('#switch-off') as any;
        const wrapper = el?.shadowRoot?.querySelector('label');
        wrapper?.click();
      });

      await page.waitForTimeout(50);

      const newState = await page.evaluate(() => {
        const el = document.querySelector('#switch-off') as any;
        return el?.checked;
      });

      expect(newState).toBe(true);

      // Reset
      await page.evaluate(() => {
        const el = document.querySelector('#switch-off') as any;
        el.checked = false;
      });
    });
  });

  // ==========================================================================
  // peek-dialog
  // ==========================================================================

  test.describe('peek-dialog', () => {
    test('opens when show() is called', async () => {
      await page.click('#open-dialog');
      await page.waitForTimeout(100);

      const isOpen = await page.evaluate(() => {
        const el = document.querySelector('#test-dialog') as any;
        return el?.open;
      });
      expect(isOpen).toBe(true);

      // Close for next tests
      await page.click('#close-dialog');
      await page.waitForTimeout(100);
    });

    test('closes when close() is called', async () => {
      await page.click('#open-dialog');
      await page.waitForTimeout(100);
      await page.click('#close-dialog');
      await page.waitForTimeout(100);

      const isOpen = await page.evaluate(() => {
        const el = document.querySelector('#test-dialog') as any;
        return el?.open;
      });
      expect(isOpen).toBe(false);
    });
  });

  // ==========================================================================
  // peek-tabs
  // ==========================================================================

  test.describe('peek-tabs', () => {
    test('first tab is selected by default', async () => {
      const selected = await page.evaluate(() => {
        const tabs = document.querySelector('#test-tabs') as any;
        return tabs?.selected;
      });
      expect(selected).toBe(0);
    });

    test('first panel is visible', async () => {
      const panelStates = await page.evaluate(() => {
        const panels = document.querySelectorAll('#test-tabs peek-tab-panel');
        return Array.from(panels).map((p, i) => ({ index: i, hidden: p.hasAttribute('hidden') }));
      });
      // First panel should not be hidden
      expect(panelStates[0]?.hidden).toBe(false);
    });

    test('second panel is hidden', async () => {
      const panelStates = await page.evaluate(() => {
        const panels = document.querySelectorAll('#test-tabs peek-tab-panel');
        return Array.from(panels).map((p, i) => ({ index: i, hidden: p.hasAttribute('hidden') }));
      });
      // Second panel should be hidden
      expect(panelStates[1]?.hidden).toBe(true);
    });
  });

  // ==========================================================================
  // peek-details
  // ==========================================================================

  test.describe('peek-details', () => {
    test('closed by default', async () => {
      const isOpen = await page.evaluate(() => {
        const el = document.querySelector('#details-closed') as any;
        return el?.open;
      });
      expect(isOpen).toBe(false);
    });

    test('can be open by default', async () => {
      const isOpen = await page.evaluate(() => {
        const el = document.querySelector('#details-open') as any;
        return el?.open;
      });
      expect(isOpen).toBe(true);
    });
  });

  // ==========================================================================
  // peek-dropdown
  // ==========================================================================

  test.describe('peek-dropdown', () => {
    test('closed by default', async () => {
      const isOpen = await page.evaluate(() => {
        const el = document.querySelector('#test-dropdown') as any;
        return el?.open;
      });
      expect(isOpen).toBe(false);
    });
  });

  // ==========================================================================
  // peek-button-group
  // ==========================================================================

  test.describe('peek-button-group', () => {
    test('has initial selection', async () => {
      const value = await page.evaluate(() => {
        const el = document.querySelector('#btn-group-single') as any;
        return el?.value;
      });
      expect(value).toBe('opt2');
    });
  });

  // ==========================================================================
  // Accessibility Tests
  // ==========================================================================

  test.describe('Accessibility', () => {
    test('buttons use native button element', async () => {
      const tagName = await page.evaluate(() => {
        const btn = document.querySelector('#btn-primary');
        const inner = btn?.shadowRoot?.querySelector('button');
        return inner?.tagName.toLowerCase();
      });
      expect(tagName).toBe('button');
    });

    test('list has listbox role', async () => {
      const hasRole = await page.evaluate(() => {
        const list = document.querySelector('#list-single');
        const inner = list?.shadowRoot?.querySelector('[role="listbox"]');
        return !!inner;
      });
      expect(hasRole).toBe(true);
    });

    test('tabs have tablist role', async () => {
      const hasTablist = await page.evaluate(() => {
        const tabs = document.querySelector('#test-tabs');
        const tablist = tabs?.shadowRoot?.querySelector('[role="tablist"]');
        return !!tablist;
      });
      expect(hasTablist).toBe(true);
    });

    test('dialog uses native dialog element', async () => {
      const tagName = await page.evaluate(() => {
        const dialog = document.querySelector('#test-dialog');
        const inner = dialog?.shadowRoot?.querySelector('dialog');
        return inner?.tagName.toLowerCase();
      });
      expect(tagName).toBe('dialog');
    });
  });
});
