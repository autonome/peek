/**
 * Switch to Window command - focuses another window
 * Currently disabled, needs browser extension API
 */

export default {
  name: 'switchtowindow-source',
  type: 'source',

  /**
   * Initializes and registers Switch to Window commands
   * @param {Function} addCommand - Function to register a command
   */
  initialize: async (addCommand) => {
    if (typeof browser === 'undefined' || !browser.windows) {
      console.log('Switch to Window source disabled: browser windows API not available');
      return;
    }

    try {
      const cmdPrefix = 'Switch to window: ';
      const windows = await browser.windows.getAll({});

      windows.forEach((w) => {
        addCommand({
          name: cmdPrefix + w.title,
          async execute(msg) {
            try {
              await browser.windows.update(w.id, { focused: true });
              return { success: true, command: 'switchtowindow', windowId: w.id };
            } catch (error) {
              console.error('Failed to switch to window:', error);
              return { success: false, error: error.message };
            }
          }
        });
      });

      console.log('Registered Switch to Window commands:', windows.length);
    } catch (error) {
      console.error('Failed to initialize Switch to Window source:', error);
    }
  }
};
