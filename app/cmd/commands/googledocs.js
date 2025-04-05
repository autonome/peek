/**
 * Google Docs commands - creates new Google Docs documents
 * Currently disabled, needs browser extension API
 */

export default {
  name: 'googledocs-source',
  type: 'source',
  
  /**
   * Initializes and registers Google Docs commands
   * @param {Function} addCommand - Function to register a command
   */
  initialize: (addCommand) => {
    if (typeof browser === 'undefined' || !browser.tabs) {
      console.log('Google Docs source disabled: browser tabs API not available');
      return;
    }
    
    // Define the available document types
    const documents = [
      {
        cmd: 'New Google doc',
        url: 'http://docs.google.com/document/create?hl=en'
      },
      {
        cmd: 'New Google sheet',
        url: 'http://spreadsheets.google.com/ccc?new&hl=en'
      }
    ];
    
    // Register each document type as a command
    documents.forEach(function(doc) {
      addCommand({
        name: doc.cmd,
        async execute(msg) {
          try {
            await browser.tabs.create({
              url: doc.url
            });
            return { success: true, command: doc.cmd };
          } catch (error) {
            console.error(`Failed to create ${doc.cmd}:`, error);
            return { success: false, error: error.message };
          }
        }
      });
    });
    
    console.log('Registered Google Docs commands:', documents.length);
  }
};