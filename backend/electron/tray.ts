/**
 * System tray management
 *
 * Handles:
 * - Creating and managing the system tray icon
 * - Tray click events
 */

import { Tray } from 'electron';
import path from 'node:path';

const ICON_RELATIVE_PATH = 'assets/tray/tray@2x.png';

let tray: Tray | null = null;

export interface TrayOptions {
  tooltip: string;
  onClick?: () => void;
}

/**
 * Initialize the system tray
 * @param rootDir - Application root directory (for icon path)
 * @param options - Tray configuration options
 */
export function initTray(rootDir: string, options: TrayOptions): Tray | null {
  if (tray && !tray.isDestroyed()) {
    return tray;
  }

  const iconPath = path.join(rootDir, ICON_RELATIVE_PATH);
  console.log('initTray: loading icon from', iconPath);

  try {
    tray = new Tray(iconPath);
    tray.setToolTip(options.tooltip);

    if (options.onClick) {
      tray.on('click', options.onClick);
    }

    console.log('initTray: tray created successfully');
    return tray;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('initTray: failed to create tray:', message);
    return null;
  }
}

/**
 * Get the current tray instance
 */
export function getTray(): Tray | null {
  return tray && !tray.isDestroyed() ? tray : null;
}

/**
 * Destroy the tray
 */
export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}
