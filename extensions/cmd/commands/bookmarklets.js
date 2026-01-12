/**
 * Bookmarklets command - adds bookmarklets as commands
 * Currently disabled, needs browser extension API
 */

export default {
  name: 'bookmarklets-source',
  type: 'source',

  /**
   * Initializes and registers bookmarklet commands
   * @param {Function} addCommand - Function to register a command
   */
  initialize: async (addCommand) => {
    if (typeof browser === 'undefined' || !browser.bookmarks) {
      console.log('Bookmarklets source disabled: browser bookmarks API not available');
      return;
    }

    try {
      // add bookmarklets as commands
      let bmarklets = await browser.bookmarks.search({ query: 'javascript:'} );
      bmarklets.map(b => {
        return {
          name: b.title,
          async execute(cmd) {
            //let tags = cmd.typed.split(' ').filter(w => w != cmd.name)
            //console.log('tags', tags)
            let tabs = await browser.tabs.query({active:true});
            browser.tabs.executeScript(tabs[0].id, {
              code: b.url.replace('javascript:', '')
            });
          }
        };
      }).forEach(addCommand);

      console.log('Registered bookmarklet commands:', bmarklets.length);
    } catch (error) {
      console.error('Failed to initialize bookmarklets source:', error);
    }
  }
};
