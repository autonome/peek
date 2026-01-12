/**
 * Send to Window command - moves the current tab to another window
 * Currently disabled, needs browser extension API
 */

export default {
  name: 'sendtowindow-source',
  type: 'source',

  /**
   * Initializes and registers Send to Window commands
   * @param {Function} addCommand - Function to register a command
   */
  initialize: async (addCommand) => {
    if (typeof browser === 'undefined' || !browser.windows || !browser.tabs) {
      console.log('Send to Window source disabled: browser windows/tabs API not available');
      return;
    }

    try {
      const cmdPrefix = 'Move to window: ';
      const windows = await browser.windows.getAll({windowTypes: ['normal']});

      windows.forEach((w) => {
        addCommand({
          name: cmdPrefix + w.title,
          async execute(msg) {
            try {
              const activeTabs = await browser.tabs.query({active: true});
              await browser.tabs.move(activeTabs[0].id, {windowId: w.id, index: -1});
              return { success: true, command: 'movetowindow', windowId: w.id };
            } catch (error) {
              console.error('Failed to move tab to window:', error);
              return { success: false, error: error.message };
            }
          }
        });
      });

      console.log('Registered Send to Window commands:', windows.length);
    } catch (error) {
      console.error('Failed to initialize Send to Window source:', error);
    }
  }
};
