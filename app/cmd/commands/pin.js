/**
 * Pin commands - toggle always-on-top for windows
 *
 * Commands:
 * - pin: Toggle always-on-top for the target window (normal level)
 * - pin app: Pin window above other app windows (floating level)
 * - pin os: Pin window above all windows (screen-saver level)
 * - unpin: Remove always-on-top from the target window
 */

const api = window.app;

/**
 * Get the target window ID (the last focused visible window, not cmd panel)
 */
async function getTargetWindowId() {
  return await api.invoke('get-focused-visible-window-id');
}

export const pinCommand = {
  name: 'pin',
  description: 'Pin window on top (use "pin app" for above app, "pin os" for above all)',
  execute: async (msg) => {
    const typed = msg.typed || '';
    const parts = typed.split(' ').filter(p => p.length > 0);
    parts.shift(); // Remove 'pin'

    const subcommand = parts[0]?.toLowerCase();
    const windowId = await getTargetWindowId();

    if (!windowId) {
      console.log('pin: No target window found');
      return { success: false, error: 'No target window' };
    }

    let level = 'normal';
    if (subcommand === 'app') {
      level = 'floating'; // Above other app windows
    } else if (subcommand === 'os') {
      level = 'screen-saver'; // Above all windows
    }

    console.log(`pin: Setting window ${windowId} always-on-top with level: ${level}`);

    const result = await api.invoke('window-set-always-on-top', {
      id: windowId,
      value: true,
      level
    });

    if (result.success) {
      console.log(`pin: Window ${windowId} pinned at level ${level}`);
    } else {
      console.error('pin: Failed to pin window:', result.error);
    }

    return result;
  }
};

export const unpinCommand = {
  name: 'unpin',
  description: 'Remove pin (always-on-top) from window',
  execute: async () => {
    const windowId = await getTargetWindowId();

    if (!windowId) {
      console.log('unpin: No target window found');
      return { success: false, error: 'No target window' };
    }

    console.log(`unpin: Removing always-on-top from window ${windowId}`);

    const result = await api.invoke('window-set-always-on-top', {
      id: windowId,
      value: false
    });

    if (result.success) {
      console.log(`unpin: Window ${windowId} unpinned`);
    } else {
      console.error('unpin: Failed to unpin window:', result.error);
    }

    return result;
  }
};

export default {
  commands: [pinCommand, unpinCommand]
};
