/**
 * Commands manager - loads and provides commands to the command panel
 *
 * Runs in panel window context (peek://ext/cmd/panel.html)
 * Queries cmd extension background for registered commands
 */
import { id, labels, schemas, storageKeys, defaults } from './config.js';
import commandsModule from './commands/index.js';

console.log('[cmd:commands] loaded');

const debug = window.app.debug;
const api = window.app;

// Command registry - uses an object map for legacy compatibility
let commands = {};

// Debounce timer for UI updates
let updateTimer = null;
const UPDATE_DELAY_MS = 16; // ~1 frame

/**
 * Notifies the UI that commands have been updated (debounced)
 */
function onCommandsUpdated() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    window.dispatchEvent(new CustomEvent('cmd-update-commands', { detail: commands }));
    debug && console.log('[cmd:commands] cmd-update-commands dispatched, commands:', Object.keys(commands).length);
  }, UPDATE_DELAY_MS);
}

/**
 * Adds a command to the registry
 * @param {Object} command - The command object with name and execute properties
 */
function addCommand(command) {
  commands[command.name] = command;
  onCommandsUpdated();
}

/**
 * Adds a command without triggering update (for batching)
 */
function addCommandSilent(command) {
  commands[command.name] = command;
}

/**
 * Removes a command from the registry
 * @param {string} name - The command name to remove
 */
function removeCommand(name) {
  if (commands[name]) {
    delete commands[name];
    onCommandsUpdated();
    debug && console.log('[cmd:commands] Command removed:', name);
  }
}

/**
 * Initializes all command sources and registers them
 */
async function initializeCommandSources() {
  debug && console.log('[cmd:commands] initializeCommandSources');

  // Load commands from the commands module
  const moduleCommands = commandsModule.commands;
  debug && console.log('[cmd:commands] moduleCommands:', moduleCommands.map(c => c.name));
  moduleCommands.forEach(command => {
    debug && console.log('[cmd:commands] adding command:', command.name);
    addCommandSilent(command); // Use silent add for batch loading
  });

  // Initialize any command sources that dynamically generate commands
  if (typeof commandsModule.initializeSources === 'function') {
    await commandsModule.initializeSources(addCommand);
  }

  // Notify that commands are ready
  onCommandsUpdated();
}

// Initialize commands when the DOM is loaded
window.addEventListener('DOMContentLoaded', () => initializeCommandSources());

/**
 * Create a proxy command that publishes execution back to the registering extension
 *
 * Proxy commands execute via pubsub (fire-and-forget). For chaining support,
 * extensions can subscribe to `cmd:execute:${name}:result` and publish their
 * result, which we capture here and return for the chaining flow.
 */
function createProxyCommand(cmdData) {
  return {
    name: cmdData.name,
    description: cmdData.description || '',
    source: cmdData.source,
    // Preserve connector metadata for chaining
    accepts: cmdData.accepts || [],
    produces: cmdData.produces || [],
    execute: async (ctx) => {
      return new Promise((resolve) => {
        const resultTopic = `cmd:execute:${cmdData.name}:result`;

        // Set up listener for result (one-time)
        const unsubscribe = api.subscribe(resultTopic, (result) => {
          // Got result from extension - pass it back for chaining
          resolve(result);
        }, api.scopes.GLOBAL);

        // Publish execution request to the extension
        // Include a flag so extension knows to publish result
        api.publish(`cmd:execute:${cmdData.name}`, {
          ...ctx,
          expectResult: true,
          resultTopic
        }, api.scopes.GLOBAL);

        // Timeout after 30 seconds - return undefined (no chaining)
        setTimeout(() => {
          resolve(undefined);
        }, 30000);
      });
    }
  };
}

/**
 * Subscribe to dynamic command registration from extensions
 */
function initializeCommandRegistration() {
  // Listen for response to our query
  api.subscribe('cmd:query-commands-response', (msg) => {
    debug && console.log('[cmd:commands] cmd:query-commands-response received', msg.commands?.length, 'commands');
    if (msg.commands) {
      msg.commands.forEach(cmdData => {
        const command = createProxyCommand(cmdData);
        addCommandSilent(command); // Use silent add for batch
      });
      onCommandsUpdated(); // Single update after batch
    }
  }, api.scopes.GLOBAL);

  // Handle batch registrations from preload batching
  api.subscribe('cmd:register-batch', (msg) => {
    debug && console.log('[cmd:commands] cmd:register-batch received', msg.commands?.length, 'commands');
    if (msg.commands) {
      msg.commands.forEach(cmdData => {
        const command = createProxyCommand(cmdData);
        addCommandSilent(command); // Use silent add for batch
      });
      onCommandsUpdated(); // Single update after batch
    }
  }, api.scopes.GLOBAL);

  // Also listen for individual registrations while panel is open
  api.subscribe('cmd:register', (msg) => {
    debug && console.log('[cmd:commands] cmd:register received (live)', msg);
    const command = createProxyCommand(msg);
    addCommand(command);
  }, api.scopes.GLOBAL);

  // Listen for unregistrations while panel is open
  api.subscribe('cmd:unregister', (msg) => {
    debug && console.log('[cmd:commands] cmd:unregister received', msg);
    removeCommand(msg.name);
  }, api.scopes.GLOBAL);

  // Query the background process for currently registered commands
  debug && console.log('[cmd:commands] Querying for registered commands...');
  api.publish('cmd:query-commands', {}, api.scopes.GLOBAL);

  debug && console.log('[cmd:commands] Command registration listeners initialized');
}

// Initialize command registration listeners
initializeCommandRegistration();

/**
 * Helper function for notifications (currently unused)
 */
function notify(title, content) {
  if (typeof browser !== 'undefined' && browser.notifications) {
    browser.notifications.create({
      "type": "basic",
      "iconUrl": browser.extension.getURL("images/icon.png"),
      "title": title,
      "message": content
    });
  } else {
    console.log('Notification:', title, content);
  }
}
