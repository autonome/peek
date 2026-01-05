/**
 * History command - search and open pages from address history
 * Addresses are sorted by visitCount (frecency)
 */
import windows from '../../windows.js';
import api from '../../api.js';

/**
 * Get addresses sorted by visit count (frecency)
 * Optionally filter by search term
 */
const getHistory = async (searchTerm = '', limit = 20) => {
  const result = await api.datastore.queryAddresses({});
  if (!result.success) return [];

  let addresses = result.data;

  // Filter by search term if provided
  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    addresses = addresses.filter(addr => {
      const uri = (addr.uri || '').toLowerCase();
      const title = (addr.title || '').toLowerCase();
      const domain = (addr.domain || '').toLowerCase();
      return uri.includes(lower) || title.includes(lower) || domain.includes(lower);
    });
  }

  // Sort by visitCount descending (frecency)
  addresses.sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0));

  return addresses.slice(0, limit);
};

/**
 * Open an address from history
 */
const openFromHistory = async (uri) => {
  try {
    const windowController = await windows.createWindow(uri, {
      width: 800,
      height: 600,
      openDevTools: window.app.debug,
      trackingSource: 'cmd',
      trackingSourceId: 'history'
    });
    console.log('Opened from history:', uri, 'window:', windowController.id);
    return { success: true };
  } catch (error) {
    console.error('Failed to open from history:', error);
    return { success: false, error: error.message };
  }
};

// Commands
const commands = [
  {
    name: 'history',
    async execute(ctx) {
      if (ctx.search) {
        // Search provided - find matching address and open it
        const matches = await getHistory(ctx.search, 1);
        if (matches.length > 0) {
          await openFromHistory(matches[0].uri);
        } else {
          console.log('No history matches for:', ctx.search);
        }
      } else {
        // No search - just log recent history
        const recent = await getHistory('', 10);
        console.log('Recent history:');
        recent.forEach((addr, i) => {
          console.log(`${i + 1}. [${addr.visitCount || 0}] ${addr.title || addr.uri}`);
        });
      }
    }
  }
];

/**
 * Initialize history entries as commands
 * Each history entry becomes a searchable command
 * Adaptive matching will handle ranking based on user selections
 */
export const initializeSources = async (addCommand) => {
  const history = await getHistory('', 50); // Get more entries
  console.log('Adding history entries as commands:', history.length);

  history.forEach(addr => {
    // Use the URI as the command name so it's searchable
    addCommand({
      name: addr.uri,
      async execute(ctx) {
        await openFromHistory(addr.uri);
      }
    });

    // Also add title as a command if it exists and is different
    if (addr.title && addr.title !== addr.uri) {
      addCommand({
        name: addr.title,
        async execute(ctx) {
          await openFromHistory(addr.uri);
        }
      });
    }
  });
};

export default {
  commands,
  initializeSources
};
