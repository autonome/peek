/**
 * Open command - opens a URL in a new window
 * Only opens window if input is a valid URL
 */
import windows from '../../windows.js';

export default {
  name: 'open',
  execute: async (msg) => {
    console.log('open command', msg);

    const parts = msg.typed.split(' ');
    parts.shift();

    const address = parts.shift();

    if (!address) {
      console.log('No address provided');
      return { error: 'No address provided' };
    }

    // Check if the input is a valid URL and get the normalized version
    const urlResult = getValidURL(address);
    if (!urlResult.valid) {
      console.log('Invalid URL:', address);
      return { error: 'Invalid URL. Must be a valid URL starting with http://, https://, or other valid protocol.' };
    }

    // Use the normalized URL (with protocol added if needed)
    const normalizedAddress = urlResult.url;
    console.log('Using normalized URL:', normalizedAddress);

    // Use the new windows API (tracking handled automatically)
    try {
      const windowController = await windows.createWindow(normalizedAddress, {
        width: 800,
        height: 600,
        openDevTools: window.app.debug,
        trackingSource: 'cmd',
        trackingSourceId: 'open'
      });
      console.log('Window opened with ID:', windowController.id);

      return {
        command: 'open',
        address: normalizedAddress,
        success: true
      };
    } catch (error) {
      console.error('Failed to open window:', error);
      return {
        error: 'Failed to open window: ' + error.message,
        address: normalizedAddress
      };
    }
  }
};

/**
 * Validates and normalizes a URL string
 * @param {string} str - The string to check
 * @returns {Object} - Object with valid flag and normalized URL
 */
function getValidURL(str) {
  // Quick check for empty string
  if (!str) return { valid: false };
  
  // Check if it starts with a valid protocol
  const hasValidProtocol = /^(https?|ftp|file|peek):\/\//.test(str);
  
  if (!hasValidProtocol) {
    // If no protocol, check if it's a domain name pattern
    const isDomainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(str);
    if (isDomainPattern) {
      // It's a domain without protocol, add https://
      const urlWithProtocol = 'https://' + str;
      try {
        // Validate the URL with added protocol
        new URL(urlWithProtocol);
        return { valid: true, url: urlWithProtocol };
      } catch (e) {
        return { valid: false };
      }
    }
    return { valid: false };
  }
  
  try {
    // Already has protocol, just validate
    new URL(str);
    return { valid: true, url: str };
  } catch (e) {
    return { valid: false };
  }
}