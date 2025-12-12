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
  console.log('main sending updated commands out', Object.keys(commands));
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
 * Initializes all command sources and registers them
 */
async function initializeCommandSources() {
  console.log('initializeCommandSources');

  // Load commands from the commands module
  const moduleCommands = commandsModule.commands;
  moduleCommands.forEach(command => {
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
