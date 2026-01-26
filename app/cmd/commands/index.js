/**
 * Commands module - exports all available commands
 * Note: groups commands are now provided by the groups extension
 */
import openCommand from './open.js';
import debugCommand from './debug.js';
import modalCommand from './modal.js';
import noteModule from './note.js';
import historyModule from './history.js';
import tagModule from './tag.js';
import pinModule from './pin.js';
import urlModule from './url.js';
import tagsetModule from './tagset.js';

console.log('tagModule.commands:', tagModule.commands?.map(c => c.name));

// Source commands (commented out as they need browser extension APIs)
// These modules contain command sources that dynamically generate commands
import bookmarkletsSource from './bookmarklets.js';
import googleDocsSource from './googledocs.js';
import sendToWindowSource from './sendtowindow.js';
import switchToWindowSource from './switchtowindow.js';
import containerTabSource from './containertab.js';

// Individual commands (commented out as they need browser extension APIs)
import bookmarkCommand from './bookmark.js';
import emailCommand from './email.js';

// Active commands - only these will be loaded
// Note: groups commands are dynamically registered by the groups extension
const activeCommands = [
  openCommand,
  debugCommand,
  modalCommand,
  ...noteModule.commands,
  ...historyModule.commands,
  ...tagModule.commands,
  ...pinModule.commands,
  ...urlModule.commands,
  ...tagsetModule.commands
];

console.log('activeCommands:', activeCommands.map(c => c.name));

// Inactive commands - these require browser extension APIs and are not loaded
const inactiveCommands = [
  // Individual commands
  bookmarkCommand,
  emailCommand,

  // Source commands that dynamically generate commands
  bookmarkletsSource,
  googleDocsSource,
  sendToWindowSource,
  switchToWindowSource,
  containerTabSource
];

// Array of all available commands
const commands = [...activeCommands];

// Source commands - these are modules that generate multiple commands dynamically
const sources = [
  historyModule
];

/**
 * Initializes command sources that dynamically generate commands
 * @param {Function} addCommand - Function to register a command
 */
export const initializeSources = async (addCommand) => {
  for (const source of sources) {
    if (typeof source.initializeSources === 'function') {
      await source.initializeSources(addCommand);
    }
  }
};

/**
 * Gets a command by name
 * @param {string} name - The command name to look for
 * @returns {Object|null} The command object or null if not found
 */
export const getCommand = (name) => {
  return commands.find(cmd => cmd.name === name) || null;
};

/**
 * Gets all active commands
 * @returns {Array} Array of command objects
 */
export const getAllCommands = () => {
  return commands;
};

/**
 * Converts commands array to object map for legacy compatibility
 * @returns {Object} Map of command name to command object
 */
export const getCommandsMap = () => {
  const commandMap = {};
  commands.forEach(cmd => {
    commandMap[cmd.name] = cmd;
  });
  return commandMap;
};

export default {
  commands,
  sources,
  getCommand,
  getAllCommands,
  getCommandsMap,
  initializeSources
};