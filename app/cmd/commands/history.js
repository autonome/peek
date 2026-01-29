/**
 * History command - search and open pages from URL history
 * Uses unified items table with frecency scoring
 */
import windows from '../../windows.js';
import api from '../../api.js';

/**
 * Get URL items sorted by frecency score
 * Optionally filter by search term
 */
const getHistory = async (searchTerm = '', limit = 20) => {
  // Use the new unified items API with frecency sorting
  const filter = {
    type: 'url',
    sortBy: 'frecency',
    limit,
  };

  // Add search filter if provided
  if (searchTerm) {
    filter.search = searchTerm;
  }

  const result = await api.datastore.queryItems(filter);
  if (!result.success) return [];

  // Transform items to the shape expected by the rest of the code
  return result.data.map(item => ({
    uri: item.content || '',
    title: item.title || '',
    domain: item.domain || '',
    visitCount: item.visitCount || 0,
    frecencyScore: item.frecencyScore || 0,
  }));
};

/**
 * Open a URL from history
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
        // Search provided - find matching item and open it
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
        recent.forEach((item, i) => {
          console.log(`${i + 1}. [${item.frecencyScore}] ${item.title || item.uri}`);
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

  history.forEach(item => {
    // Use the URI as the command name so it's searchable
    addCommand({
      name: item.uri,
      async execute(ctx) {
        await openFromHistory(item.uri);
      }
    });

    // Also add title as a command if it exists and is different
    if (item.title && item.title !== item.uri) {
      addCommand({
        name: item.title,
        async execute(ctx) {
          await openFromHistory(item.uri);
        }
      });
    }
  });
};

export default {
  commands,
  initializeSources
};
