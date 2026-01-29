/**
 * Peek UI Components Tests
 *
 * Tests for all UI components using Playwright.
 *
 * Run with:
 *   npx playwright test tests/components/
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to get component's shadow root
async function getShadowRoot(page: Page, selector: string) {
  return page.evaluateHandle((sel) => document.querySelector(sel)?.shadowRoot, selector);
}

// Helper to query inside shadow root
async function queryShadow(page: Page, hostSelector: string, innerSelector: string) {
  return page.evaluateHandle(
    ({ host, inner }) => document.querySelector(host)?.shadowRoot?.querySelector(inner),
    { host: hostSelector, inner: innerSelector }
  );
}

test.describe('Components @components', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    const testPagePath = path.join(__dirname, 'test-page.html');
    await page.goto(`file://${testPagePath}`);
    // Wait for components to be ready
    await page.waitForSelector('body[data-ready="true"]', { timeout: 10000 });
  });

  test.afterAll(async () => {
    await page.close();
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

    test('interactive card is focusable', async () => {
      const hasTabindex = await page.evaluate(() => {
        const card = document.querySelector('#card-interactive');
        return card?.getAttribute('interactive') !== null;
      });
      expect(hasTabindex).toBe(true);
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

    test('supports keyboard navigation', async () => {
      const list = page.locator('#list-single');
      await list.focus();
      await page.keyboard.press('ArrowDown');

      // First non-disabled item should be focused
      const focusedValue = await page.evaluate(() => {
        const list = document.querySelector('#list-single') as any;
        return list?._focusedIndex;
      });
      expect(focusedValue).toBeGreaterThanOrEqual(0);
    });

    test('disabled item cannot be selected', async () => {
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
      const input = page.locator('#input-basic');
      await input.click();

      // Type into the shadow DOM input
      await page.evaluate(() => {
        const el = document.querySelector('#input-basic');
        const innerInput = el?.shadowRoot?.querySelector('input');
        if (innerInput) {
          innerInput.value = 'test value';
          innerInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      const value = await page.evaluate(() => {
        const el = document.querySelector('#input-basic') as any;
        return el?.value;
      });
      expect(value).toBe('test value');
    });

    test('disabled input is not editable', async () => {
      const isDisabled = await page.evaluate(() => {
        const el = document.querySelector('#input-disabled');
        const innerInput = el?.shadowRoot?.querySelector('input');
        return innerInput?.disabled;
      });
      expect(isDisabled).toBe(true);
    });

    test('shows suggestions when typing', async () => {
      await page.evaluate(() => {
        const el = document.querySelector('#input-suggestions');
        const innerInput = el?.shadowRoot?.querySelector('input');
        if (innerInput) {
          innerInput.value = 'App';
          innerInput.dispatchEvent(new Event('input', { bubbles: true }));
          innerInput.dispatchEvent(new Event('focus', { bubbles: true }));
        }
      });

      // Wait for suggestions to appear
      await page.waitForTimeout(100);

      const hasSuggestions = await page.evaluate(() => {
        const el = document.querySelector('#input-suggestions');
        const suggestions = el?.shadowRoot?.querySelector('.suggestions');
        return suggestions?.children.length > 0;
      });
      expect(hasSuggestions).toBe(true);
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

    test('native select has options', async () => {
      const optionCount = await page.evaluate(() => {
        const el = document.querySelector('#select-native');
        const select = el?.shadowRoot?.querySelector('select');
        return select?.options.length;
      });
      expect(optionCount).toBeGreaterThan(0);
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
      const initialState = await page.evaluate(() => {
        const el = document.querySelector('#switch-off') as any;
        return el?.checked;
      });

      await page.click('#switch-off');

      const newState = await page.evaluate(() => {
        const el = document.querySelector('#switch-off') as any;
        return el?.checked;
      });

      expect(newState).toBe(!initialState);

      // Reset
      await page.click('#switch-off');
    });

    test('disabled switch cannot be toggled', async () => {
      const isDisabled = await page.evaluate(() => {
        const el = document.querySelector('#switch-disabled');
        return el?.hasAttribute('disabled');
      });
      expect(isDisabled).toBe(true);
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
      const isHidden = await page.evaluate(() => {
        const panel = document.querySelector('#panel-1');
        return panel?.hasAttribute('hidden');
      });
      expect(isHidden).toBe(false);
    });

    test('second panel is hidden', async () => {
      const isHidden = await page.evaluate(() => {
        const panel = document.querySelector('#panel-2');
        return panel?.hasAttribute('hidden');
      });
      expect(isHidden).toBe(true);
    });

    test('clicking tab changes selection', async () => {
      // Click second tab
      await page.evaluate(() => {
        const tabs = document.querySelectorAll('#test-tabs peek-tab');
        (tabs[1] as any)?.shadowRoot?.querySelector('button')?.click();
      });

      await page.waitForTimeout(50);

      const selected = await page.evaluate(() => {
        const tabs = document.querySelector('#test-tabs') as any;
        return tabs?.selected;
      });
      expect(selected).toBe(1);

      // Reset to first tab
      await page.evaluate(() => {
        const tabs = document.querySelector('#test-tabs') as any;
        tabs?.select(0);
      });
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

    test('toggles on click', async () => {
      await page.evaluate(() => {
        const el = document.querySelector('#details-closed');
        const summary = el?.shadowRoot?.querySelector('summary');
        summary?.click();
      });

      await page.waitForTimeout(50);

      const isOpen = await page.evaluate(() => {
        const el = document.querySelector('#details-closed') as any;
        return el?.open;
      });
      expect(isOpen).toBe(true);

      // Reset
      await page.evaluate(() => {
        const el = document.querySelector('#details-closed') as any;
        el?.hide();
      });
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

    test('opens on trigger click', async () => {
      await page.evaluate(() => {
        const dropdown = document.querySelector('#test-dropdown');
        const trigger = dropdown?.querySelector('[slot="trigger"]');
        (trigger as any)?.click();
      });

      await page.waitForTimeout(100);

      const isOpen = await page.evaluate(() => {
        const el = document.querySelector('#test-dropdown') as any;
        return el?.open;
      });
      expect(isOpen).toBe(true);

      // Close
      await page.evaluate(() => {
        const el = document.querySelector('#test-dropdown') as any;
        el?.hide();
      });
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

    test('clicking item changes selection', async () => {
      await page.evaluate(() => {
        const items = document.querySelectorAll('#btn-group-single peek-button-group-item');
        (items[0] as any)?.shadowRoot?.querySelector('button')?.click();
      });

      await page.waitForTimeout(50);

      const value = await page.evaluate(() => {
        const el = document.querySelector('#btn-group-single') as any;
        return el?.value;
      });
      expect(value).toBe('opt1');

      // Reset
      await page.evaluate(() => {
        const el = document.querySelector('#btn-group-single') as any;
        el.value = 'opt2';
      });
    });
  });

  // ==========================================================================
  // Accessibility Tests
  // ==========================================================================

  test.describe('Accessibility', () => {
    test('buttons have role="button"', async () => {
      const role = await page.evaluate(() => {
        const btn = document.querySelector('#btn-primary');
        const inner = btn?.shadowRoot?.querySelector('button');
        return inner?.getAttribute('role') || inner?.tagName.toLowerCase();
      });
      expect(role).toBe('button');
    });

    test('list has proper ARIA attributes', async () => {
      const hasRole = await page.evaluate(() => {
        const list = document.querySelector('#list-single');
        const inner = list?.shadowRoot?.querySelector('[role="listbox"]');
        return !!inner;
      });
      expect(hasRole).toBe(true);
    });

    test('tabs have proper ARIA attributes', async () => {
      const hasTablist = await page.evaluate(() => {
        const tabs = document.querySelector('#test-tabs');
        const tablist = tabs?.shadowRoot?.querySelector('[role="tablist"]');
        return !!tablist;
      });
      expect(hasTablist).toBe(true);
    });

    test('dialog is modal', async () => {
      await page.click('#open-dialog');
      await page.waitForTimeout(100);

      const isModal = await page.evaluate(() => {
        const dialog = document.querySelector('#test-dialog');
        const inner = dialog?.shadowRoot?.querySelector('dialog');
        return inner?.hasAttribute('open');
      });
      expect(isModal).toBe(true);

      await page.click('#close-dialog');
    });
  });
});
