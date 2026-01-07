/**
 * Commands manager - loads and provides commands to the command panel
 */
import { id, labels, schemas, storageKeys, defaults } from './config.js';
import commandsModule from './commands/index.js';

console.log('commands');

const debug = window.app.debug;
const clear = false;

const api = window.app;

// Command registry - uses an object map for legacy compatibility
let commands = {};

/**
 * Notifies the UI that commands have been updated
 */
function onCommandsUpdated() {
  window.dispatchEvent(new CustomEvent('cmd-update-commands', { detail: commands }));
  console.log('cmd-update-commands dispatched, commands:', Object.keys(commands));
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
 * Removes a command from the registry
 * @param {string} name - The command name to remove
 */
function removeCommand(name) {
  if (commands[name]) {
    delete commands[name];
    onCommandsUpdated();
    console.log('Command removed:', name);
  }
}

/**
 * Initializes all command sources and registers them
 */
async function initializeCommandSources() {
  console.log('initializeCommandSources');

  // Load commands from the commands module
  const moduleCommands = commandsModule.commands;
  console.log('moduleCommands:', moduleCommands.map(c => c.name));
  moduleCommands.forEach(command => {
    console.log('adding command:', command.name);
    addCommand(command);
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
 */
function createProxyCommand(cmdData) {
  return {
    name: cmdData.name,
    description: cmdData.description || '',
    source: cmdData.source,
    execute: async (ctx) => {
      // Publish execution request to the extension that registered this command
      // Use GLOBAL scope so it reaches the extension in background.html
      api.publish(`cmd:execute:${cmdData.name}`, ctx, api.scopes.GLOBAL);
    }
  };
}

/**
 * Subscribe to dynamic command registration from extensions
 */
function initializeCommandRegistration() {
  // Listen for response to our query
  api.subscribe('cmd:query-commands-response', (msg) => {
    console.log('cmd:query-commands-response received', msg.commands?.length, 'commands');
    if (msg.commands) {
      msg.commands.forEach(cmdData => {
        const command = createProxyCommand(cmdData);
        addCommand(command);
      });
    }
  }, api.scopes.GLOBAL);

  // Also listen for new registrations while panel is open
  api.subscribe('cmd:register', (msg) => {
    console.log('cmd:register received (live)', msg);
    const command = createProxyCommand(msg);
    addCommand(command);
  }, api.scopes.GLOBAL);

  // Listen for unregistrations while panel is open
  api.subscribe('cmd:unregister', (msg) => {
    console.log('cmd:unregister received', msg);
    removeCommand(msg.name);
  }, api.scopes.GLOBAL);

  // Query the background process for currently registered commands
  console.log('Querying for registered commands...');
  api.publish('cmd:query-commands', {}, api.scopes.GLOBAL);

  console.log('Command registration listeners initialized');
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

/*
 * The following commented-out functions represent command sources
 * that were previously defined in this file. They've been moved to
 * individual module files in the commands/ directory.
 * 
 * If you need to re-enable any of these command sources, please
 * create a new module file for each in the commands/ directory
 * and update the commands/index.js file accordingly.
 */
