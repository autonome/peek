/**
 * Shared Backend Configuration
 *
 * Constants shared across all backend implementations (Electron, Tauri, etc.)
 */

// Default window dimensions
export const APP_DEF_WIDTH = 1024;
export const APP_DEF_HEIGHT = 768;

// Core application addresses (peek:// protocol URLs)
export const WEB_CORE_ADDRESS = 'peek://app/background.html';
export const SETTINGS_ADDRESS = 'peek://app/settings/settings.html';

// IPC message channels
export const IPC_CHANNELS = {
  REGISTER_SHORTCUT: 'registershortcut',
  UNREGISTER_SHORTCUT: 'unregistershortcut',
  PUBLISH: 'publish',
  SUBSCRIBE: 'subscribe',
  CLOSE_WINDOW: 'closewindow',
  CONSOLE: 'console',
  RENDERER_LOG: 'renderer-log',
  APP_QUIT: 'app-quit',
  APP_RESTART: 'app-restart',
  MODIFY_WINDOW: 'modifywindow',
} as const;

// PubSub topics
export const TOPICS = {
  PREFS: 'topic:core:prefs',
} as const;
