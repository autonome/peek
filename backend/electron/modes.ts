/**
 * Modes System
 *
 * Implements a hybrid Emacs-style major/minor mode system for context-aware
 * command dispatch and UI state management.
 *
 * Major Modes (exclusive, one per window):
 * - 'default': Standard browsing mode
 * - 'page': Viewing a web page
 * - 'group': Managing tab groups
 * - 'settings': In settings UI
 *
 * Minor Modes (stackable, multiple per window):
 * - 'preview': Preview mode (read-only)
 * - 'edit': Edit mode
 * - 'annotate': Annotation mode
 * - 'search': Search mode active
 *
 * The mode system enables:
 * 1. Mode-conditional shortcuts (same key does different things in different modes)
 * 2. Command availability guards (canExecute based on mode)
 * 3. UI state indicators (for future visual mode display)
 * 4. Scope-aware command targeting
 */

import { BrowserWindow } from 'electron';
import { publish, scopes as PubSubScopes } from './pubsub.js';
import { DEBUG } from './config.js';

// ============================================================================
// Types
// ============================================================================

export type MajorModeId = 'page' | 'group' | 'settings' | 'default';
export type MinorModeId = 'preview' | 'edit' | 'annotate' | 'search';
export type CommandScope = 'global' | 'window' | 'page';

export interface ModeInfo {
  id: MajorModeId | MinorModeId;
  name: string;
  description?: string;
  type: 'major' | 'minor';
}

export interface WindowModeState {
  major: MajorModeId;
  minors: MinorModeId[];
}

export interface CommandContext {
  windowId: number | null;
  mode: WindowModeState | null;
  url: string | null;
  title: string | null;
  hasSelection: boolean;
}

// ============================================================================
// Mode Definitions
// ============================================================================

const MAJOR_MODES: ModeInfo[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Standard browsing mode',
    type: 'major',
  },
  {
    id: 'page',
    name: 'Page',
    description: 'Viewing a web page',
    type: 'major',
  },
  {
    id: 'group',
    name: 'Group',
    description: 'Managing tab groups',
    type: 'major',
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'Application settings',
    type: 'major',
  },
];

const MINOR_MODES: ModeInfo[] = [
  {
    id: 'preview',
    name: 'Preview',
    description: 'Preview mode (read-only)',
    type: 'minor',
  },
  {
    id: 'edit',
    name: 'Edit',
    description: 'Edit mode',
    type: 'minor',
  },
  {
    id: 'annotate',
    name: 'Annotate',
    description: 'Annotation mode',
    type: 'minor',
  },
  {
    id: 'search',
    name: 'Search',
    description: 'Search mode active',
    type: 'minor',
  },
];

// ============================================================================
// Mode State Management
// ============================================================================

/**
 * Per-window mode state storage
 * Maps window ID to its mode state
 */
const windowModes = new Map<number, WindowModeState>();

/**
 * Default mode state for new windows
 */
function getDefaultModeState(): WindowModeState {
  return {
    major: 'default',
    minors: [],
  };
}

/**
 * Get the mode state for a window, creating default if not exists
 */
export function getWindowModeState(windowId: number): WindowModeState {
  let state = windowModes.get(windowId);
  if (!state) {
    state = getDefaultModeState();
    windowModes.set(windowId, state);
  }
  return { ...state, minors: [...state.minors] }; // Return copy
}

/**
 * Set the major mode for a window
 */
export function setMajorMode(windowId: number, mode: MajorModeId): void {
  DEBUG && console.log(`[modes] setMajorMode: windowId=${windowId}, mode=${mode}`);

  let state = windowModes.get(windowId);
  if (!state) {
    state = getDefaultModeState();
  }

  const oldMode = state.major;
  state.major = mode;
  windowModes.set(windowId, state);

  // Publish mode change event
  if (oldMode !== mode) {
    publishModeChange(windowId, state);
  }
}

/**
 * Enable a minor mode for a window
 */
export function enableMinorMode(windowId: number, mode: MinorModeId): void {
  DEBUG && console.log(`[modes] enableMinorMode: windowId=${windowId}, mode=${mode}`);

  let state = windowModes.get(windowId);
  if (!state) {
    state = getDefaultModeState();
  }

  if (!state.minors.includes(mode)) {
    state.minors.push(mode);
    windowModes.set(windowId, state);
    publishModeChange(windowId, state);
  }
}

/**
 * Disable a minor mode for a window
 */
export function disableMinorMode(windowId: number, mode: MinorModeId): void {
  DEBUG && console.log(`[modes] disableMinorMode: windowId=${windowId}, mode=${mode}`);

  const state = windowModes.get(windowId);
  if (!state) return;

  const index = state.minors.indexOf(mode);
  if (index !== -1) {
    state.minors.splice(index, 1);
    windowModes.set(windowId, state);
    publishModeChange(windowId, state);
  }
}

/**
 * Toggle a minor mode for a window
 * Returns true if mode is now enabled
 */
export function toggleMinorMode(windowId: number, mode: MinorModeId): boolean {
  const state = getWindowModeState(windowId);
  if (state.minors.includes(mode)) {
    disableMinorMode(windowId, mode);
    return false;
  } else {
    enableMinorMode(windowId, mode);
    return true;
  }
}

/**
 * Clean up mode state when a window is closed
 */
export function cleanupWindowMode(windowId: number): void {
  DEBUG && console.log(`[modes] cleanupWindowMode: windowId=${windowId}`);
  windowModes.delete(windowId);
}

/**
 * Publish mode change event via pubsub
 */
function publishModeChange(windowId: number, state: WindowModeState): void {
  publish('modes:changed', {
    windowId,
    major: state.major,
    minors: [...state.minors],
  }, PubSubScopes.GLOBAL);
}

// ============================================================================
// Mode Queries
// ============================================================================

/**
 * Get all available modes (major and minor)
 */
export function getAllModes(): ModeInfo[] {
  return [...MAJOR_MODES, ...MINOR_MODES];
}

/**
 * Check if a window is in a specific major mode
 */
export function isInMajorMode(windowId: number, mode: MajorModeId): boolean {
  const state = windowModes.get(windowId);
  return state?.major === mode;
}

/**
 * Check if a window has a specific minor mode enabled
 */
export function hasMinorMode(windowId: number, mode: MinorModeId): boolean {
  const state = windowModes.get(windowId);
  return state?.minors.includes(mode) ?? false;
}

// ============================================================================
// Mode Detection (Automatic Mode Assignment)
// ============================================================================

/**
 * Detect the appropriate major mode based on window URL
 * This provides automatic mode detection based on URL patterns
 */
export function detectModeFromUrl(url: string): MajorModeId {
  if (!url) return 'default';

  // Settings page
  if (url.includes('/settings/') || url.includes('settings.html')) {
    return 'settings';
  }

  // Groups extension
  if (url.includes('/groups/') || url.includes('groups.html')) {
    return 'group';
  }

  // Web pages
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return 'page';
  }

  return 'default';
}

/**
 * Auto-update mode when window navigates to a new URL
 * Call this from the navigation handler
 */
export function updateModeForNavigation(windowId: number, url: string): void {
  const detectedMode = detectModeFromUrl(url);
  const currentState = windowModes.get(windowId);

  if (!currentState || currentState.major !== detectedMode) {
    setMajorMode(windowId, detectedMode);
  }
}

// ============================================================================
// Command Context
// ============================================================================

/**
 * Build command context for the target window
 */
export function buildCommandContext(targetWindowId: number | null): CommandContext {
  const context: CommandContext = {
    windowId: targetWindowId,
    mode: null,
    url: null,
    title: null,
    hasSelection: false, // TODO: Implement selection tracking
  };

  if (targetWindowId !== null) {
    const win = BrowserWindow.fromId(targetWindowId);
    if (win && !win.isDestroyed()) {
      context.mode = getWindowModeState(targetWindowId);
      context.url = win.webContents.getURL();
      context.title = win.getTitle();
    }
  }

  return context;
}

// ============================================================================
// Mode-Conditional Shortcut Matching
// ============================================================================

/**
 * Check if shortcut mode conditions are satisfied
 */
export function checkModeConditions(
  windowId: number,
  requiredMajorMode?: MajorModeId,
  requiredMinorModes?: MinorModeId[]
): boolean {
  const state = windowModes.get(windowId);
  if (!state) {
    // No mode state = default mode, only match if no mode required or 'default'
    if (requiredMajorMode && requiredMajorMode !== 'default') {
      return false;
    }
    if (requiredMinorModes && requiredMinorModes.length > 0) {
      return false;
    }
    return true;
  }

  // Check major mode
  if (requiredMajorMode && state.major !== requiredMajorMode) {
    return false;
  }

  // Check minor modes (all required minors must be active)
  if (requiredMinorModes && requiredMinorModes.length > 0) {
    for (const minor of requiredMinorModes) {
      if (!state.minors.includes(minor)) {
        return false;
      }
    }
  }

  return true;
}
