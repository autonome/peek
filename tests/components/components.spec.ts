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

      // Wait for checked state to change
      await page.waitForFunction(() => {
        const el = document.querySelector('#switch-off') as any;
        return el?.checked === true;
      });

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

      // Wait for dialog to open
      await page.waitForFunction(() => {
        const el = document.querySelector('#test-dialog') as any;
        return el?.open === true;
      });

      const isOpen = await page.evaluate(() => {
        const el = document.querySelector('#test-dialog') as any;
        return el?.open;
      });
      expect(isOpen).toBe(true);

      // Close for next tests
      await page.click('#close-dialog');
      await page.waitForFunction(() => {
        const el = document.querySelector('#test-dialog') as any;
        return el?.open === false;
      });
    });

    test('closes when close() is called', async () => {
      await page.click('#open-dialog');
      await page.waitForFunction(() => {
        const el = document.querySelector('#test-dialog') as any;
        return el?.open === true;
      });

      await page.click('#close-dialog');
      await page.waitForFunction(() => {
        const el = document.querySelector('#test-dialog') as any;
        return el?.open === false;
      });

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
  // peek-carousel
  // ==========================================================================

  test.describe('peek-carousel', () => {
    test('renders slides', async () => {
      const slideCount = await page.evaluate(() => {
        const carousel = document.querySelector('#carousel-basic') as any;
        return carousel?.items?.length;
      });
      expect(slideCount).toBe(3);
    });

    test('starts at first slide', async () => {
      const activeIndex = await page.evaluate(() => {
        const carousel = document.querySelector('#carousel-basic') as any;
        return carousel?.activeIndex;
      });
      expect(activeIndex).toBe(0);
    });

    test('has controls when enabled', async () => {
      const hasControls = await page.evaluate(() => {
        const carousel = document.querySelector('#carousel-basic');
        const prev = carousel?.shadowRoot?.querySelector('[part="prev"]');
        const next = carousel?.shadowRoot?.querySelector('[part="next"]');
        return !!prev && !!next;
      });
      expect(hasControls).toBe(true);
    });

    test('has indicators when enabled', async () => {
      const indicatorCount = await page.evaluate(() => {
        const carousel = document.querySelector('#carousel-basic');
        const indicators = carousel?.shadowRoot?.querySelectorAll('.indicator');
        return indicators?.length;
      });
      expect(indicatorCount).toBe(3);
    });

    test('has navigation methods', async () => {
      const hasMethods = await page.evaluate(() => {
        const carousel = document.querySelector('#carousel-basic') as any;
        return {
          hasNext: typeof carousel?.next === 'function',
          hasPrev: typeof carousel?.prev === 'function',
          hasGoTo: typeof carousel?.goTo === 'function'
        };
      });
      expect(hasMethods.hasNext).toBe(true);
      expect(hasMethods.hasPrev).toBe(true);
      expect(hasMethods.hasGoTo).toBe(true);
    });

    test('loop carousel wraps at end', async () => {
      const canWrap = await page.evaluate(() => {
        const carousel = document.querySelector('#carousel-loop') as any;
        return carousel?.loop === true;
      });
      expect(canWrap).toBe(true);
    });
  });

  // ==========================================================================
  // peek-grid
  // ==========================================================================

  test.describe('peek-grid', () => {
    test('renders grid container', async () => {
      const hasGrid = await page.evaluate(() => {
        const grid = document.querySelector('#grid-basic');
        const inner = grid?.shadowRoot?.querySelector('[part="grid"]');
        return !!inner;
      });
      expect(hasGrid).toBe(true);
    });

    test('uses auto-fit by default', async () => {
      const gridColumns = await page.evaluate(() => {
        const grid = document.querySelector('#grid-basic');
        const inner = grid?.shadowRoot?.querySelector('.grid') as HTMLElement;
        return inner?.style.getPropertyValue('--_grid-columns');
      });
      expect(gridColumns).toContain('auto-fit');
    });

    test('respects fixed columns', async () => {
      const gridColumns = await page.evaluate(() => {
        const grid = document.querySelector('#grid-fixed');
        const inner = grid?.shadowRoot?.querySelector('.grid') as HTMLElement;
        return inner?.style.getPropertyValue('--_grid-columns');
      });
      expect(gridColumns).toContain('repeat(2');
    });

    test('applies gap', async () => {
      const gap = await page.evaluate(() => {
        const grid = document.querySelector('#grid-basic');
        const inner = grid?.shadowRoot?.querySelector('.grid') as HTMLElement;
        return inner?.style.getPropertyValue('--_grid-gap');
      });
      expect(gap).toBe('8px');
    });
  });

  // ==========================================================================
  // peek-popover
  // ==========================================================================

  test.describe('peek-popover', () => {
    test('closed by default', async () => {
      const isOpen = await page.evaluate(() => {
        const popover = document.querySelector('#popover-basic') as any;
        return popover?.open;
      });
      expect(isOpen).toBe(false);
    });

    test('has trigger slot', async () => {
      const hasTrigger = await page.evaluate(() => {
        const popover = document.querySelector('#popover-basic');
        const slot = popover?.shadowRoot?.querySelector('slot[name="trigger"]');
        return !!slot;
      });
      expect(hasTrigger).toBe(true);
    });

    test('has popover element', async () => {
      const hasPopover = await page.evaluate(() => {
        const popover = document.querySelector('#popover-basic');
        const el = popover?.shadowRoot?.querySelector('[popover]');
        return !!el;
      });
      expect(hasPopover).toBe(true);
    });
  });

  // ==========================================================================
  // peek-drawer
  // ==========================================================================

  test.describe('peek-drawer', () => {
    test('closed by default', async () => {
      const isOpen = await page.evaluate(() => {
        const drawer = document.querySelector('#test-drawer') as any;
        return drawer?.open;
      });
      expect(isOpen).toBe(false);
    });

    test('uses native dialog element', async () => {
      const tagName = await page.evaluate(() => {
        const drawer = document.querySelector('#test-drawer');
        const dialog = drawer?.shadowRoot?.querySelector('dialog');
        return dialog?.tagName.toLowerCase();
      });
      expect(tagName).toBe('dialog');
    });

    test('opens when show() is called', async () => {
      await page.click('#open-drawer');

      // Wait for drawer to open
      await page.waitForFunction(() => {
        const drawer = document.querySelector('#test-drawer') as any;
        return drawer?.open === true;
      });

      const isOpen = await page.evaluate(() => {
        const drawer = document.querySelector('#test-drawer') as any;
        return drawer?.open;
      });
      expect(isOpen).toBe(true);

      // Close drawer
      await page.evaluate(() => {
        const drawer = document.querySelector('#test-drawer') as any;
        drawer?.close();
      });
      await page.waitForFunction(() => {
        const drawer = document.querySelector('#test-drawer') as any;
        return drawer?.open === false;
      });
    });

    test('has close button', async () => {
      const hasClose = await page.evaluate(() => {
        const drawer = document.querySelector('#test-drawer');
        const btn = drawer?.shadowRoot?.querySelector('.close-btn');
        return !!btn;
      });
      expect(hasClose).toBe(true);
    });
  });

  // ==========================================================================
  // peek-tooltip
  // ==========================================================================

  test.describe('peek-tooltip', () => {
    test('has content attribute', async () => {
      const content = await page.evaluate(() => {
        const tooltip = document.querySelector('#tooltip-top') as any;
        return tooltip?.content;
      });
      expect(content).toBe('Tooltip on top');
    });

    test('uses popover manual mode', async () => {
      const popoverMode = await page.evaluate(() => {
        const tooltip = document.querySelector('#tooltip-top');
        const el = tooltip?.shadowRoot?.querySelector('.tooltip');
        return el?.getAttribute('popover');
      });
      expect(popoverMode).toBe('manual');
    });

    test('has role tooltip', async () => {
      const role = await page.evaluate(() => {
        const tooltip = document.querySelector('#tooltip-top');
        const el = tooltip?.shadowRoot?.querySelector('.tooltip');
        return el?.getAttribute('role');
      });
      expect(role).toBe('tooltip');
    });

    test('positions can be set', async () => {
      const position = await page.evaluate(() => {
        const tooltip = document.querySelector('#tooltip-bottom') as any;
        return tooltip?.position;
      });
      expect(position).toBe('bottom');
    });
  });

  // ==========================================================================
  // Component Combos
  // ==========================================================================

  test.describe('Component Combos', () => {
    test('cards render in grid', async () => {
      const cardsInGrid = await page.evaluate(() => {
        const grid = document.querySelector('#combo-cards-grid');
        const cards = grid?.querySelectorAll('peek-card');
        return cards?.length;
      });
      expect(cardsInGrid).toBe(2);
    });

    test('dialog contains form elements', async () => {
      await page.click('#open-form-dialog');

      // Wait for dialog to open
      await page.waitForFunction(() => {
        const dialog = document.querySelector('#form-dialog') as any;
        return dialog?.open === true;
      });

      const hasFormElements = await page.evaluate(() => {
        const dialog = document.querySelector('#form-dialog');
        const input = dialog?.querySelector('peek-input');
        const switchEl = dialog?.querySelector('peek-switch');
        return !!input && !!switchEl;
      });
      expect(hasFormElements).toBe(true);

      // Close dialog
      await page.click('#form-dialog-cancel');
      await page.waitForFunction(() => {
        const dialog = document.querySelector('#form-dialog') as any;
        return dialog?.open === false;
      });
    });

    test('tooltip works on disabled button', async () => {
      const tooltipContent = await page.evaluate(() => {
        const tooltip = document.querySelector('#tooltip-disabled') as any;
        return tooltip?.content;
      });
      expect(tooltipContent).toBe('This button is disabled');
    });

    test('nested buttons in dialog footer are accessible', async () => {
      await page.click('#open-form-dialog');

      // Wait for dialog to open
      await page.waitForFunction(() => {
        const dialog = document.querySelector('#form-dialog') as any;
        return dialog?.open === true;
      });

      const buttons = await page.evaluate(() => {
        const dialog = document.querySelector('#form-dialog');
        const footer = dialog?.querySelector('[slot="footer"]');
        const btns = footer?.querySelectorAll('peek-button');
        return btns?.length;
      });
      expect(buttons).toBe(2);

      await page.click('#form-dialog-cancel');
      await page.waitForFunction(() => {
        const dialog = document.querySelector('#form-dialog') as any;
        return dialog?.open === false;
      });
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
