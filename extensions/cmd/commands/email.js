/**
 * Email command - emails the current page
 * Currently disabled, needs browser extension API
 */

export default {
  name: 'Email page to',

  /**
   * Executes the email command
   */
  execute: async (msg) => {
    if (typeof browser === 'undefined' || !browser.tabs) {
      console.error('Email command disabled: browser API not available');
      return { success: false, error: 'Browser API not available' };
    }

    try {
      let tabs = await browser.tabs.query({active:true});
      let email = msg.typed.replace(msg.name, '').trim();
      let url =
        'mailto:' + email +
        '?subject=Web%20page!&body=' +
        encodeURIComponent(tabs[0].title) +
        '%0D%0A' +
        encodeURIComponent(tabs[0].url);

      // Navigate the current tab to the mailto: URL
      // Note: This approach might be replaced with a more modern API
      tabs[0].url = url;

      return {
        success: true,
        command: 'email',
        recipient: email
      };
    } catch (error) {
      console.error('Failed to email page:', error);
      return { success: false, error: error.message };
    }
  }
};
