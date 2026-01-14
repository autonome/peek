/**
 * Example Extension - Image Gallery
 *
 * Demonstrates:
 * - Feature detection for the Peek API (works as extension or regular website)
 * - Command registration with mime type acceptance
 * - Receiving and storing image data
 * - Displaying stored images
 *
 * See docs/PEEK-API.md for the complete API reference.
 */

// Feature detection - check if Peek API is available
const hasPeekAPI = typeof window.app !== 'undefined';
const api = hasPeekAPI ? window.app : null;

// In-memory image storage (when running without Peek API)
// When Peek API is available, we use the datastore
const localImageStore = new Map();

/**
 * Store an image
 * @param {string} id - Unique image ID
 * @param {object} imageData - { data: base64, mimeType, name, timestamp }
 */
async function storeImage(id, imageData) {
  if (hasPeekAPI) {
    // Use Peek datastore for persistent storage
    await api.datastore.setRow('example_images', id, imageData);
    console.log('[example] Image stored in datastore:', id);
  } else {
    // Fall back to in-memory storage
    localImageStore.set(id, imageData);
    console.log('[example] Image stored locally:', id);
  }
}

/**
 * Get all stored images
 * @returns {Promise<object>} Map of id -> imageData
 */
async function getStoredImages() {
  if (hasPeekAPI) {
    const result = await api.datastore.getTable('example_images');
    return result.success ? result.data : {};
  } else {
    return Object.fromEntries(localImageStore);
  }
}

/**
 * Generate a unique image ID
 */
function generateImageId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Handle received image data from command execution
 * @param {object} ctx - Command execution context with input data
 */
async function handleImageReceived(ctx) {
  console.log('[example] Received image data:', ctx);

  // ctx.input contains the data passed to the command
  // For images, this would be { data: base64, mimeType, name }
  if (!ctx.input || !ctx.input.data) {
    console.error('[example] No image data in context');
    return;
  }

  const imageId = generateImageId();
  const imageData = {
    data: ctx.input.data,        // Base64 encoded image
    mimeType: ctx.input.mimeType || 'image/png',
    name: ctx.input.name || 'Untitled',
    timestamp: Date.now()
  };

  await storeImage(imageId, imageData);

  // Notify that a new image was added
  if (hasPeekAPI) {
    api.publish('example:image-added', { id: imageId, ...imageData }, api.scopes.GLOBAL);
  }

  // Open the gallery to show the new image
  openGallery();
}

/**
 * Open the image gallery window
 */
function openGallery() {
  if (hasPeekAPI) {
    api.window.open('peek://ext/example/gallery.html', {
      key: 'example-gallery',
      width: 800,
      height: 600,
      title: 'Image Gallery'
    });
  } else {
    // When running as a regular website, navigate or open in new tab
    window.open('./gallery.html', '_blank');
  }
}

const extension = {
  id: 'example',
  labels: {
    name: 'Example Gallery'
  },

  /**
   * Register commands - called when cmd extension is ready
   */
  registerCommands() {
    // Basic hello command
    api.commands.register({
      name: 'example:hello',
      description: 'Say hello',
      execute: () => {
        console.log('[example] Hello from command!');
        alert('Hello World!');
      }
    });

    // Command that accepts images
    // The 'accepts' array specifies which mime types this command can receive
    api.commands.register({
      name: 'example:save-image',
      description: 'Save an image to the gallery',
      accepts: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/*'],
      execute: handleImageReceived
    });

    // Command to open the gallery
    api.commands.register({
      name: 'example:gallery',
      description: 'Open the image gallery',
      execute: openGallery
    });

    console.log('[example] Commands registered');
  },

  init() {
    console.log('[example] init - Peek API available:', hasPeekAPI);

    if (!hasPeekAPI) {
      console.log('[example] Running without Peek API - limited functionality');
      return;
    }

    // Wait for cmd:ready before registering commands
    api.subscribe('cmd:ready', () => {
      this.registerCommands();
    }, api.scopes.GLOBAL);

    // Query in case cmd is already ready
    api.publish('cmd:query', {}, api.scopes.GLOBAL);

    // Register a global shortcut to open the gallery
    api.shortcuts.register('Option+G', openGallery, { global: true });

    console.log('[example] Extension loaded');
  },

  uninit() {
    console.log('[example] Cleaning up...');

    if (hasPeekAPI) {
      api.commands.unregister('example:hello');
      api.commands.unregister('example:save-image');
      api.commands.unregister('example:gallery');
      api.shortcuts.unregister('Option+G', { global: true });
    }
  }
};

// Export for ES module usage (Peek extension)
export default extension;

// Also expose utilities for the gallery page
export { hasPeekAPI, api, getStoredImages, storeImage, generateImageId };
