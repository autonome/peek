/**
 * Commands module - exports all available commands
 */
import openCommand from './open.js';
import debugCommand from './debug.js';
import modalCommand from './modal.js';

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
import noteCommand from './note.js';

// Active commands - only these will be loaded
const activeCommands = [
  openCommand,
  debugCommand,
  modalCommand
];

// Inactive commands - these require browser extension APIs and are not loaded
const inactiveCommands = [
  // Individual commands
  bookmarkCommand,
  emailCommand,
  noteCommand,
  
  // Source commands that dynamically generate commands
  bookmarkletsSource,
  googleDocsSource,
  sendToWindowSource,
  switchToWindowSource,
  containerTabSource
];

// Array of all available commands
const commands = [...activeCommands];

// Source commands - these are modules that generate multiple commands
const sources = [];

/**
 * Initializes command sources that dynamically generate commands
 * @param {Function} addCommand - Function to register a command
 */
export const initializeSources = (addCommand) => {
  // Currently no active sources
  sources.forEach(source => {
    if (typeof source.initialize === 'function') {
      source.initialize(addCommand);
    }
  });
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