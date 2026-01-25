/**
 * History command - search and open pages from saved URLs
 * URLs are sorted by recent first (createdAt descending)
 */
import windows from 'peek://app/windows.js';
import api from 'peek://app/api.js';

/**
 * Get URL items sorted by most recent
 * Optionally filter by search term
 */
const getHistory = async (searchTerm = '', limit = 20) => {
  const result = await api.datastore.queryItems({ type: 'url' });
  if (!result.success) return [];

  let items = result.data;

  // Filter by search term if provided (check URL content and metadata title)
  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    items = items.filter(item => {
      const url = (item.content || '').toLowerCase();
      let title = '';
      if (item.metadata) {
        try {
          const meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
          title = (meta.title || '').toLowerCase();
        } catch (e) {}
      }
      return url.includes(lower) || title.includes(lower);
    });
  }

  // Sort by createdAt descending (most recent first)
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return items.slice(0, limit);
};

/**
 * Open a URL from history
 */
const openFromHistory = async (url) => {
  try {
    const windowController = await windows.createWindow(url, {
      width: 800,
      height: 600,
      openDevTools: window.app.debug,
      trackingSource: 'cmd',
      trackingSourceId: 'history'
    });
    console.log('Opened from history:', url, 'window:', windowController.id);
    return { success: true };
  } catch (error) {
    console.error('Failed to open from history:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get display title for an item
 */
const getItemTitle = (item) => {
  if (item.metadata) {
    try {
      const meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
      if (meta.title) return meta.title;
    } catch (e) {}
  }
  return item.content || 'Untitled';
};

// Commands
const commands = [
  {
    name: 'history',
    description: 'Search and open saved URLs',
    async execute(ctx) {
      if (ctx.search) {
        // Search provided - find matching URL and open it
        const matches = await getHistory(ctx.search, 1);
        if (matches.length > 0) {
          await openFromHistory(matches[0].content);
        } else {
          console.log('No history matches for:', ctx.search);
        }
      } else {
        // No search - just log recent history
        const recent = await getHistory('', 10);
        if (recent.length === 0) {
          console.log('No saved URLs yet');
        } else {
          console.log('Recent URLs:');
          recent.forEach((item, i) => {
            console.log(`${i + 1}. ${getItemTitle(item)}`);
          });
        }
      }
    }
  }
];

/**
 * Initialize history entries as commands
 * Each history entry becomes a searchable command
 */
export const initializeSources = async (addCommand) => {
  const history = await getHistory('', 50);
  console.log('Adding history entries as commands:', history.length);

  history.forEach(item => {
    const url = item.content;
    const title = getItemTitle(item);

    // Add URL as command
    addCommand({
      name: url,
      async execute(ctx) {
        await openFromHistory(url);
      }
    });

    // Also add title as a command if different from URL
    if (title && title !== url) {
      addCommand({
        name: title,
        async execute(ctx) {
          await openFromHistory(url);
        }
      });
    }
  });
};

export default {
  commands,
  initializeSources
};
