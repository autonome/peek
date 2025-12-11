/**
 * Debug command - opens a URL in a new window with DevTools enabled
 */
import windows from '../../windows.js';

export default {
  name: 'debug',
  execute: async (msg) => {
    console.log('debug command', msg);

    const parts = msg.typed.split(' ');
    parts.shift();

    const address = parts.shift();

    if (!address) {
      return;
    }

    // Use the new windows API with DevTools enabled (tracking handled automatically)
    try {
      const windowController = await windows.createWindow(address, {
        width: 900,
        height: 700,
        openDevTools: true,
        detachedDevTools: true,
        trackingSource: 'cmd',
        trackingSourceId: 'debug'
      });
      console.log('Debug window opened with ID:', windowController.id);
    } catch (error) {
      console.error('Failed to open debug window:', error);
    }

    return {
      command: 'debug',
      address
    };
  }
};