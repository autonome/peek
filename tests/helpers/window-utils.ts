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

// ============================================================================
// Extension Waiting Helpers
// ============================================================================

interface ExtensionInfo {
  id: string;
  status: string;
}

interface ExtensionListResult {
  success: boolean;
  data?: ExtensionInfo[];
}

interface AppApi {
  extensions: {
    list(): Promise<ExtensionListResult>;
  };
  subscribe(event: string, callback: (msg: unknown) => void, scope: unknown): () => void;
  publish(event: string, data: unknown, scope: unknown): void;
  scopes: {
    GLOBAL: unknown;
  };
}

interface WindowWithApp extends Window {
  app: AppApi;
}

/**
 * Wait for all extensions to be initialized and ready
 */
export async function waitForExtensionsReady(
  bgWindow: Page,
  timeout = 10000
): Promise<void> {
  await bgWindow.waitForFunction(
    async () => {
      const api = (window as unknown as WindowWithApp).app;
      if (!api || !api.extensions) return false;

      const result = await api.extensions.list();
      if (!result.success || !result.data) return false;

      // Check if critical extensions are running
      const hasCmd = result.data.some(
        (e: ExtensionInfo) => e.id === 'cmd' && e.status === 'running'
      );
      const extensionCount = result.data.length;

      return hasCmd && extensionCount >= 3; // At least cmd + 2 others
    },
    { timeout }
  );
}

/**
 * Wait for specific event to be published via pubsub
 */
export async function waitForPubsubEvent(
  bgWindow: Page,
  eventName: string,
  timeout = 5000
): Promise<unknown> {
  return bgWindow.evaluate(
    async ([event, timeoutMs]) => {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          reject(new Error(`Event ${event} not received within ${timeoutMs}ms`));
        }, timeoutMs);

        const api = (window as unknown as WindowWithApp).app;
        const unsub = api.subscribe(
          event,
          (msg: unknown) => {
            clearTimeout(t);
            unsub();
            resolve(msg);
          },
          api.scopes.GLOBAL
        );
      });
    },
    [eventName, timeout] as [string, number]
  );
}

interface CommandInfo {
  name: string;
}

interface QueryCommandsResponse {
  commands?: CommandInfo[];
}

/**
 * Wait for command to be available in cmd extension
 */
export async function waitForCommand(
  bgWindow: Page,
  commandName: string,
  timeout = 10000
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const found = await bgWindow.evaluate(async (cmd) => {
      const api = (window as unknown as WindowWithApp).app;
      return new Promise((resolve) => {
        const unsub = api.subscribe(
          'cmd:query-commands-response',
          (msg: unknown) => {
            unsub();
            const response = msg as QueryCommandsResponse;
            resolve(response.commands?.some((c) => c.name === cmd) || false);
          },
          api.scopes.GLOBAL
        );

        api.publish('cmd:query-commands', {}, api.scopes.GLOBAL);
        setTimeout(() => resolve(false), 500);
      });
    }, commandName);
    if (found) return;
    await sleep(200);
  }
  throw new Error(`Command "${commandName}" not found within ${timeout}ms`);
}

/**
 * Query commands with retry logic for reliability.
 * Retry loop is inside evaluate to avoid subscription issues across page boundary.
 */
export async function queryCommandsWithRetry(
  bgWindow: Page,
  retries = 5,
  delayMs = 500
): Promise<CommandInfo[]> {
  const commands = await bgWindow.evaluate(
    async ([maxRetries, delay]) => {
      const api = (window as unknown as WindowWithApp).app;

      const queryCommands = () =>
        new Promise<CommandInfo[] | null>((resolve) => {
          const unsub = api.subscribe(
            'cmd:query-commands-response',
            (msg: unknown) => {
              unsub();
              const response = msg as QueryCommandsResponse;
              resolve((response.commands as CommandInfo[]) || []);
            },
            api.scopes.GLOBAL
          );

          api.publish('cmd:query-commands', {}, api.scopes.GLOBAL);
          setTimeout(() => resolve(null), 1000);
        });

      // Retry loop inside evaluate to keep subscriptions in same JS context
      for (let i = 0; i < maxRetries; i++) {
        const cmds = await queryCommands();
        if (cmds && cmds.length > 0) {
          return cmds;
        }
        await new Promise((r) => setTimeout(r, delay));
      }
      return [];
    },
    [retries, delayMs] as const
  );

  if (!commands || commands.length === 0) {
    throw new Error(`Failed to query commands after ${retries} attempts`);
  }
  return commands as CommandInfo[];
}
