/**
 * Window utilities for Peek tests
 *
 * Shared helpers for finding and managing windows across backends.
 */

import { Page } from '@playwright/test';

/**
 * Wait for a window/page matching a URL pattern
 */
export async function waitForWindow(
  getWindows: () => Page[],
  urlPattern: string | RegExp,
  timeout = 10000
): Promise<Page> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const windows = getWindows();
    for (const win of windows) {
      const url = win.url();
      if (typeof urlPattern === 'string' ? url.includes(urlPattern) : urlPattern.test(url)) {
        return win;
      }
    }
    await sleep(200);
  }
  throw new Error(`Window matching ${urlPattern} not found within ${timeout}ms`);
}

/**
 * Get extension background windows
 */
export function getExtensionWindows(getWindows: () => Page[]): Page[] {
  const windows = getWindows();
  return windows.filter(w => w.url().includes('peek://ext/') && w.url().includes('background.html'));
}

/**
 * Count non-background windows (visible windows)
 */
export function countVisibleWindows(getWindows: () => Page[]): number {
  const windows = getWindows();
  return windows.filter(w => !w.url().includes('background.html')).length;
}

/**
 * Check if a URL matches a pattern
 */
export function matchesPattern(url: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return url.includes(pattern);
  }
  return pattern.test(url);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for a port to be available (for CDP connection)
 */
export async function waitForPort(port: number, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Port not ready yet
    }
    await sleep(100);
  }
  throw new Error(`Port ${port} not available within ${timeout}ms`);
}

/**
 * Generate a unique test profile name
 */
export function getTestProfile(suiteName?: string): string {
  const base = suiteName || 'test';
  return `${base}-${Date.now()}`;
}

/**
 * Wait for window count to reach expected value
 */
export async function waitForWindowCount(
  getWindows: () => Page[],
  count: number,
  timeout = 5000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (getWindows().length === count) return;
    await sleep(50);
  }
  throw new Error(`Window count didn't reach ${count} within ${timeout}ms (current: ${getWindows().length})`);
}

/**
 * Wait for command results to appear in cmd panel
 */
export async function waitForCommandResults(
  page: Page,
  minCount = 1,
  timeout = 5000
): Promise<void> {
  await page.waitForFunction(
    (min: number) => document.querySelectorAll('.command-item').length >= min,
    minCount,
    { timeout }
  );
}

/**
 * Wait for element visibility state change
 */
export async function waitForVisible(
  page: Page,
  selector: string,
  visible = true,
  timeout = 5000
): Promise<void> {
  await page.waitForFunction(
    ({ sel, vis }: { sel: string; vis: boolean }) => {
      const el = document.querySelector(sel) as HTMLElement;
      if (!el) return !vis;
      const style = window.getComputedStyle(el);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      return vis ? isVisible : !isVisible;
    },
    { sel: selector, vis: visible },
    { timeout }
  );
}

/**
 * Wait for element to have a specific class
 */
export async function waitForClass(
  page: Page,
  selector: string,
  className: string,
  present = true,
  timeout = 5000
): Promise<void> {
  await page.waitForFunction(
    ({ sel, cls, pres }: { sel: string; cls: string; pres: boolean }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      return pres ? el.classList.contains(cls) : !el.classList.contains(cls);
    },
    { sel: selector, cls: className, pres: present },
    { timeout }
  );
}

/**
 * Wait for app API to be ready in a page
 */
export async function waitForAppReady(page: Page, timeout = 10000): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { app?: { datastore?: unknown } }).app?.datastore !== undefined,
    undefined,
    { timeout }
  );
}

/**
 * Wait for results panel to be visible and have content
 */
export async function waitForResultsWithContent(
  page: Page,
  timeout = 5000
): Promise<void> {
  await page.waitForFunction(
    () => {
      const results = document.querySelector('#results');
      return results?.classList.contains('visible') && results.children.length > 0;
    },
    undefined,
    { timeout }
  );
}

/**
 * Wait for selection to change to a different item
 */
export async function waitForSelectionChange(
  page: Page,
  selector: string,
  previousText: string,
  timeout = 5000
): Promise<void> {
  await page.waitForFunction(
    ({ sel, prev }: { sel: string; prev: string }) => {
      const el = document.querySelector(sel);
      return el && el.textContent !== prev;
    },
    { sel: selector, prev: previousText },
    { timeout }
  );
}
