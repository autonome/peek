/**
 * Bookmark command - bookmarks the current page
 * Currently disabled, needs browser extension API
 */

export default {
  name: 'bookmark current page',
  
  /**
   * Executes the bookmark command
   */
  execute: async () => {
    if (typeof browser === 'undefined' || !browser.tabs || !browser.bookmarks) {
      console.error('Bookmark command disabled: browser API not available');
      return { success: false, error: 'Browser API not available' };
    }
    
    try {
      let tab = await browser.tabs.query({active:true});
      let node = await browser.bookmarks.create({
        title: tab[0].title,
        url: tab[0].url
      });
      
      return { 
        success: true, 
        command: 'bookmark',
        bookmark: {
          id: node.id,
          title: node.title,
          url: node.url
        }
      };
    } catch (error) {
      console.error('Failed to bookmark page:', error);
      return { success: false, error: error.message };
    }
  }
};