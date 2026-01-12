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
