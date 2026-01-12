/**
 * Container Tab commands - creates and manages container tabs
 * Currently disabled, needs browser extension API
 */

export default {
  name: 'containertab-source',
  type: 'source',

  /**
   * Initializes and registers container tab commands
   * @param {Function} addCommand - Function to register a command
   */
  initialize: async (addCommand) => {
    if (typeof browser === 'undefined' || !browser.contextualIdentities || !browser.tabs) {
      console.log('Container Tab source disabled: browser contextualIdentities API not available');
      return;
    }

    try {
      // Initialize "New container tab" commands
      const newCmdPrefix = 'New container tab: ';
      const switchCmdPrefix = 'Switch container to: ';

      const identities = await browser.contextualIdentities.query({});

      if (!identities.length) {
        console.log('No container identities found');
        return;
      }

      // Register "New container tab" commands
      for (let identity of identities) {
        // Command to create a new tab in a container
        addCommand({
          name: newCmdPrefix + identity.name,
          async execute(msg) {
            try {
              await browser.tabs.create({
                url: '',
                cookieStoreId: identity.cookieStoreId
              });
              return {
                success: true,
                command: 'newcontainertab',
                container: identity.name
              };
            } catch (error) {
              console.error('Failed to create container tab:', error);
              return { success: false, error: error.message };
            }
          }
        });

        // Command to switch the current tab to a different container
        addCommand({
          name: switchCmdPrefix + identity.name,
          async execute(msg) {
            try {
              const activeTabs = await browser.tabs.query({
                currentWindow: true,
                active: true
              });
              const tab = activeTabs[0];

              // Create a new tab in the target container with the same URL
              await browser.tabs.create({
                url: tab.url,
                cookieStoreId: identity.cookieStoreId,
                index: tab.index+1,
                pinned: tab.pinned
              });

              // Remove the original tab
              browser.tabs.remove(tab.id);

              return {
                success: true,
                command: 'switchcontainer',
                container: identity.name
              };
            } catch (error) {
              console.error('Failed to switch container:', error);
              return { success: false, error: error.message };
            }
          }
        });
      }

      console.log('Registered Container Tab commands:', identities.length * 2);
    } catch (error) {
      console.error('Failed to initialize Container Tab source:', error);
    }
  }
};
