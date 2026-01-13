/**
 * Save command - save data to a file
 *
 * This is a chaining-enabled command that accepts any input
 * and saves it as a file download.
 *
 * Usage in chain:
 *   lists → csv → save myfile.csv
 *   lists → save data.json
 */

const api = window.app;

/**
 * Get file extension from MIME type
 */
function getExtensionFromMime(mimeType) {
  const mimeToExt = {
    'application/json': 'json',
    'text/csv': 'csv',
    'text/plain': 'txt',
    'text/html': 'html',
    'application/xml': 'xml',
    'text/xml': 'xml'
  };
  return mimeToExt[mimeType] || 'txt';
}

/**
 * Generate default filename
 */
function generateFilename(mimeType, title) {
  const ext = getExtensionFromMime(mimeType);
  const timestamp = new Date().toISOString().slice(0, 10);

  if (title) {
    // Sanitize title for filename
    const safeTitle = title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);
    return `${safeTitle}-${timestamp}.${ext}`;
  }

  return `export-${timestamp}.${ext}`;
}

export default {
  name: 'save',
  description: 'Save data to a file',
  accepts: ['*/*'], // Accept any MIME type
  produces: [], // End of chain - doesn't produce output

  execute: async (ctx) => {
    console.log('[save] execute:', ctx);

    // Check if we have input data from chain
    if (!ctx.input) {
      console.log('[save] No input data');
      return {
        success: false,
        error: 'No input data. Use this command in a chain after a command that produces output.'
      };
    }

    try {
      const data = ctx.input;
      const mimeType = ctx.inputMimeType || 'text/plain';

      // Determine filename - use search arg if provided, otherwise generate
      let filename = ctx.search?.trim();
      if (!filename) {
        filename = generateFilename(mimeType, ctx.inputTitle);
      }

      // Ensure proper extension
      if (!filename.includes('.')) {
        filename += '.' + getExtensionFromMime(mimeType);
      }

      // Stringify data if needed
      let content;
      if (typeof data === 'string') {
        content = data;
      } else {
        content = JSON.stringify(data, null, 2);
      }

      // Send to background script to handle download
      // Background persists regardless of panel state
      api.publish('cmd:save-file', {
        content,
        filename,
        mimeType
      }, api.scopes.GLOBAL);

      console.log('[save] Requested download:', filename);
      return {
        success: true,
        message: `Saving ${filename}...`
      };
    } catch (err) {
      console.error('[save] Error:', err);
      return { success: false, error: err.message };
    }
  }
};
