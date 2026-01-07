// Navigation history tracking helper
import api from '../api.js';

// Normalize URL by ensuring root paths have trailing slash
// Matches normalization in main process
const normalizeUrl = (uri) => {
  try {
    const url = new URL(uri);
    if (!url.pathname || url.pathname === '') {
      url.pathname = '/';
    }
    return url.toString();
  } catch (error) {
    return uri;
  }
};

/**
 * Track a navigation event
 * @param {string} uri - The URL navigated to
 * @param {Object} options - Navigation options
 * @param {string} options.source - Source of navigation (peek, slide, direct, etc.)
 * @param {string} options.sourceId - ID of the source feature
 * @param {string} options.windowType - Type of window (modal, persistent, main)
 * @param {number} options.duration - Time spent on page in ms
 * @param {Object} options.metadata - Additional metadata
 */
export const trackNavigation = async (uri, options = {}) => {
  try {
    // Normalize URI for consistent lookups
    const normalizedUri = normalizeUrl(uri);

    // Get or create address
    let addressId;
    const addressesResult = await api.datastore.queryAddresses({});
    if (!addressesResult.success) {
      console.error('Failed to query addresses:', addressesResult.error);
      return null;
    }

    const addresses = addressesResult.data;
    const existing = addresses.find(addr => addr.uri === normalizedUri);

    if (existing) {
      addressId = existing.id;
    } else {
      // Create new address (using normalized URI)
      const addResult = await api.datastore.addAddress(normalizedUri, {
        title: options.title || '',
        mimeType: options.mimeType || 'text/html'
      });

      if (!addResult.success) {
        console.error('Failed to add address:', addResult.error);
        return null;
      }

      addressId = addResult.id;
      console.log('Created new address:', addressId, normalizedUri);
    }

    // Add visit
    const visitResult = await api.datastore.addVisit(addressId, {
      source: options.source || 'direct',
      sourceId: options.sourceId || '',
      windowType: options.windowType || 'main',
      duration: options.duration || 0,
      metadata: JSON.stringify(options.metadata || {}),
      scrollDepth: options.scrollDepth || 0,
      interacted: options.interacted || 0
    });

    if (!visitResult.success) {
      console.error('Failed to add visit:', visitResult.error);
      return null;
    }

    console.log('Tracked navigation:', {
      visitId: visitResult.id,
      addressId,
      uri: normalizedUri,
      source: options.source
    });

    return { visitId: visitResult.id, addressId };
  } catch (error) {
    console.error('Error tracking navigation:', error);
    return null;
  }
};

/**
 * Get navigation history
 * @param {Object} filter - Query filter options
 * @returns {Array} Array of visit records with address details
 */
export const getHistory = async (filter = {}) => {
  try {
    const visitsResult = await api.datastore.queryVisits(filter);
    if (!visitsResult.success) {
      console.error('Failed to query visits:', visitsResult.error);
      return [];
    }

    const visits = visitsResult.data;

    // Enrich with address details
    const enriched = await Promise.all(visits.map(async visit => {
      const addressResult = await api.datastore.getAddress(visit.addressId);
      return {
        ...visit,
        address: addressResult.success ? addressResult.data : null
      };
    }));

    return enriched;
  } catch (error) {
    console.error('Error getting history:', error);
    return [];
  }
};

/**
 * Get recent addresses sorted by visit frequency
 * @param {number} limit - Number of results to return
 * @returns {Array} Array of addresses with visit counts
 */
export const getFrequentAddresses = async (limit = 10) => {
  try {
    const result = await api.datastore.queryAddresses({
      sortBy: 'visitCount',
      limit
    });

    return result.success ? result.data : [];
  } catch (error) {
    console.error('Error getting frequent addresses:', error);
    return [];
  }
};

/**
 * Get recently visited addresses
 * @param {number} limit - Number of results to return
 * @returns {Array} Array of addresses sorted by last visit
 */
export const getRecentAddresses = async (limit = 10) => {
  try {
    const result = await api.datastore.queryAddresses({
      sortBy: 'lastVisit',
      limit
    });

    return result.success ? result.data : [];
  } catch (error) {
    console.error('Error getting recent addresses:', error);
    return [];
  }
};

export default {
  trackNavigation,
  getHistory,
  getFrequentAddresses,
  getRecentAddresses
};
