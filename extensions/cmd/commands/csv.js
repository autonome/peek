/**
 * CSV command - convert JSON data to CSV format
 *
 * This is a chaining-enabled command that accepts JSON input
 * and produces CSV output.
 *
 * Usage in chain:
 *   lists → csv → save
 */

/**
 * Convert JSON array to CSV string
 */
function jsonToCsv(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  // Get all unique keys from all objects
  const keys = new Set();
  data.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach(key => keys.add(key));
    }
  });

  const headers = Array.from(keys);

  // Escape CSV value
  const escapeValue = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    // If contains comma, newline, or quote, wrap in quotes and escape existing quotes
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  // Build CSV
  const lines = [];

  // Header row
  lines.push(headers.map(escapeValue).join(','));

  // Data rows
  data.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      const row = headers.map(header => escapeValue(item[header]));
      lines.push(row.join(','));
    } else {
      // Simple value, put in first column
      lines.push(escapeValue(item));
    }
  });

  return lines.join('\n');
}

export default {
  name: 'csv',
  description: 'Convert JSON to CSV format',
  accepts: ['application/json'],
  produces: ['text/csv'],

  execute: async (ctx) => {
    console.log('[csv] execute:', ctx);

    // Check if we have input data from chain
    if (!ctx.input) {
      console.log('[csv] No input data');
      return {
        success: false,
        error: 'No input data. Use this command in a chain after a command that produces JSON.'
      };
    }

    try {
      // Parse input if it's a string
      let data = ctx.input;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          // Not JSON, treat as plain text
          return {
            success: false,
            error: 'Input is not valid JSON'
          };
        }
      }

      // Ensure we have an array
      if (!Array.isArray(data)) {
        // If it's an object with an 'items' property, use that
        if (data && Array.isArray(data.items)) {
          data = data.items;
        } else {
          // Wrap single object in array
          data = [data];
        }
      }

      // Convert to CSV
      const csvOutput = jsonToCsv(data);

      console.log('[csv] Converted', data.length, 'items to CSV');

      return {
        success: true,
        output: {
          data: csvOutput,
          mimeType: 'text/csv',
          title: `CSV (${data.length} rows)`
        }
      };
    } catch (err) {
      console.error('[csv] Error:', err);
      return { success: false, error: err.message };
    }
  }
};
