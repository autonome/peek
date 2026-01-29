/**
 * Shortcut management for Electron
 *
 * Handles:
 * - Global shortcuts (work even when app doesn't have focus)
 * - Local shortcuts (only work when app has focus)
 * - Mode-conditional shortcuts (only trigger in specific modes)
 * - Shortcut parsing and matching
 */

import { DEBUG } from './config.js';
import { checkModeConditions, type MajorModeId, type MinorModeId } from './modes.js';

// Lazy-load Electron modules to allow testing without Electron
let globalShortcut: typeof import('electron').globalShortcut | null = null;
let BrowserWindow: typeof import('electron').BrowserWindow | null = null;

try {
  const electron = await import('electron');
  globalShortcut = electron.globalShortcut;
  BrowserWindow = electron.BrowserWindow;
} catch {
  // Electron not available (e.g., in unit tests)
  DEBUG && console.log('[shortcuts] Running without Electron (test mode)');
}

// Maps for tracking shortcuts
// Global shortcuts: shortcut string -> source address
const globalShortcuts = new Map<string, string>();

// Local shortcuts: shortcut string -> { source, parsed, callback, modeConditions }
interface ParsedShortcut {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  code: string;
}

interface ModeConditions {
  majorMode?: MajorModeId;
  minorModes?: MinorModeId[];
}

interface LocalShortcutEntry {
  source: string;
  parsed: ParsedShortcut;
  callback: () => void;
  modeConditions?: ModeConditions;
}

// Local shortcuts now stored as array to support same key with different mode conditions
const localShortcuts = new Map<string, LocalShortcutEntry[]>();

// Map key names to physical key codes (for before-input-event matching)
// Electron's input.code follows the USB HID spec
const keyToCode: Record<string, string> = {
  // Letters
  'a': 'KeyA', 'b': 'KeyB', 'c': 'KeyC', 'd': 'KeyD', 'e': 'KeyE',
  'f': 'KeyF', 'g': 'KeyG', 'h': 'KeyH', 'i': 'KeyI', 'j': 'KeyJ',
  'k': 'KeyK', 'l': 'KeyL', 'm': 'KeyM', 'n': 'KeyN', 'o': 'KeyO',
  'p': 'KeyP', 'q': 'KeyQ', 'r': 'KeyR', 's': 'KeyS', 't': 'KeyT',
  'u': 'KeyU', 'v': 'KeyV', 'w': 'KeyW', 'x': 'KeyX', 'y': 'KeyY',
  'z': 'KeyZ',
  // Numbers
  '0': 'Digit0', '1': 'Digit1', '2': 'Digit2', '3': 'Digit3', '4': 'Digit4',
  '5': 'Digit5', '6': 'Digit6', '7': 'Digit7', '8': 'Digit8', '9': 'Digit9',
  // Punctuation
  ',': 'Comma', '.': 'Period', '/': 'Slash', ';': 'Semicolon', "'": 'Quote',
  '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', '`': 'Backquote',
  '-': 'Minus', '=': 'Equal',
  // Special keys
  'enter': 'Enter', 'return': 'Enter',
  'tab': 'Tab',
  'space': 'Space', ' ': 'Space',
  'backspace': 'Backspace',
  'delete': 'Delete',
  'escape': 'Escape', 'esc': 'Escape',
  'up': 'ArrowUp', 'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight',
  'arrowup': 'ArrowUp', 'arrowdown': 'ArrowDown', 'arrowleft': 'ArrowLeft', 'arrowright': 'ArrowRight',
  'home': 'Home', 'end': 'End',
  'pageup': 'PageUp', 'pagedown': 'PageDown',
  // Function keys
  'f1': 'F1', 'f2': 'F2', 'f3': 'F3', 'f4': 'F4', 'f5': 'F5', 'f6': 'F6',
  'f7': 'F7', 'f8': 'F8', 'f9': 'F9', 'f10': 'F10', 'f11': 'F11', 'f12': 'F12',
};

/**
 * Parse shortcut string to match Electron's input event format
 * e.g., 'Alt+Q' -> { alt: true, code: 'KeyQ' }
 * e.g., 'CommandOrControl+Shift+P' -> { meta: true, shift: true, code: 'KeyP' } (on Mac)
 */
export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+');
  const result: ParsedShortcut = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    code: ''
  };

  for (const part of parts) {
    const p = part.trim();
    if (p === 'ctrl' || p === 'control') {
      result.ctrl = true;
    } else if (p === 'alt' || p === 'option') {
      result.alt = true;
    } else if (p === 'shift') {
      result.shift = true;
    } else if (p === 'meta' || p === 'cmd' || p === 'command' || p === 'super') {
      result.meta = true;
    } else if (p === 'commandorcontrol' || p === 'cmdorctrl') {
      // On Mac, use meta (Cmd), on others use ctrl
      if (process.platform === 'darwin') {
        result.meta = true;
      } else {
        result.ctrl = true;
      }
    } else {
      // This is the key itself - convert to code
      result.code = keyToCode[p] || p;
    }
  }

  return result;
}

/**
 * Check if an input event matches a parsed shortcut
 */
export interface InputEvent {
  type: string;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  control: boolean;
  code: string;
}

export function inputMatchesShortcut(input: InputEvent, parsed: ParsedShortcut): boolean {
  // Check modifiers
  if (input.alt !== parsed.alt) return false;
  if (input.shift !== parsed.shift) return false;
  if (input.meta !== parsed.meta) return false;
  if (input.control !== parsed.ctrl) return false;

  // Check physical key code (case-insensitive comparison)
  return input.code.toLowerCase() === parsed.code.toLowerCase();
}

/**
 * Register a global shortcut (works even when app doesn't have focus)
 */
export function registerGlobalShortcut(
  shortcut: string,
  source: string,
  callback: () => void
): Error | undefined {
  DEBUG && console.log('registerGlobalShortcut', shortcut);

  // globalShortcut not available in test mode
  if (!globalShortcut) {
    globalShortcuts.set(shortcut, source);
    return undefined;
  }

  if (globalShortcut.isRegistered(shortcut)) {
    console.error('Shortcut already registered, unregistering first:', shortcut);
    globalShortcut.unregister(shortcut);
  }

  const ret = globalShortcut.register(shortcut, () => {
    DEBUG && console.log('shortcut executed', shortcut);
    callback();
  });

  if (ret !== true) {
    console.error('registerGlobalShortcut FAILED:', shortcut);
    return new Error(`Failed to register shortcut: ${shortcut}`);
  }

  globalShortcuts.set(shortcut, source);
  return undefined;
}

/**
 * Unregister a global shortcut
 */
export function unregisterGlobalShortcut(shortcut: string): Error | undefined {
  DEBUG && console.log('unregisterGlobalShortcut', shortcut);

  // globalShortcut not available in test mode
  if (!globalShortcut) {
    globalShortcuts.delete(shortcut);
    return undefined;
  }

  if (!globalShortcut.isRegistered(shortcut)) {
    console.error('Unable to unregister shortcut because not registered:', shortcut);
    return new Error(`Shortcut not registered: ${shortcut}`);
  }

  globalShortcut.unregister(shortcut);
  globalShortcuts.delete(shortcut);
  return undefined;
}

/**
 * Register a local shortcut (only works when app has focus)
 * Supports mode-conditional shortcuts: same key can have different handlers for different modes
 */
export function registerLocalShortcut(
  shortcut: string,
  source: string,
  callback: () => void,
  modeConditions?: ModeConditions
): void {
  DEBUG && console.log('registerLocalShortcut', shortcut, modeConditions ? `mode:${modeConditions.majorMode}` : '');

  const parsed = parseShortcut(shortcut);
  const entry: LocalShortcutEntry = { source, parsed, callback, modeConditions };

  // Get or create the array for this shortcut
  const entries = localShortcuts.get(shortcut) || [];

  // If mode-conditional, add to array (allows same key with different modes)
  // If not mode-conditional, replace any existing non-conditional entry
  if (modeConditions?.majorMode || modeConditions?.minorModes?.length) {
    // Mode-conditional: add to array
    entries.push(entry);
  } else {
    // Non-conditional: find and replace any existing non-conditional entry
    const nonConditionalIndex = entries.findIndex(e => !e.modeConditions?.majorMode && !e.modeConditions?.minorModes?.length);
    if (nonConditionalIndex >= 0) {
      entries[nonConditionalIndex] = entry;
    } else {
      entries.push(entry);
    }
  }

  localShortcuts.set(shortcut, entries);
}

/**
 * Unregister a local shortcut
 * If modeConditions provided, only removes matching entry; otherwise removes non-conditional entry
 */
export function unregisterLocalShortcut(shortcut: string, source?: string, modeConditions?: ModeConditions): void {
  DEBUG && console.log('unregisterLocalShortcut', shortcut);

  const entries = localShortcuts.get(shortcut);
  if (!entries || entries.length === 0) {
    DEBUG && console.log('local shortcut not registered:', shortcut);
    return;
  }

  // Filter out the matching entry
  const filtered = entries.filter(entry => {
    // If source specified, must match
    if (source && entry.source !== source) return true;

    // If mode conditions specified, must match
    if (modeConditions?.majorMode) {
      return entry.modeConditions?.majorMode !== modeConditions.majorMode;
    }

    // No mode conditions - remove non-conditional entries
    return entry.modeConditions?.majorMode || entry.modeConditions?.minorModes?.length;
  });

  if (filtered.length > 0) {
    localShortcuts.set(shortcut, filtered);
  } else {
    localShortcuts.delete(shortcut);
  }
}

/**
 * Handle local shortcuts from any focused window
 * Called from before-input-event handler
 * Returns true if shortcut was handled
 *
 * Mode-conditional shortcuts are checked first, falling back to non-conditional
 */
export function handleLocalShortcut(input: InputEvent, focusedWindowId?: number): boolean {
  // Only handle keyDown events
  if (input.type !== 'keyDown') return false;

  for (const [, entries] of localShortcuts) {
    for (const entry of entries) {
      if (inputMatchesShortcut(input, entry.parsed)) {
        // Check mode conditions if specified
        if (entry.modeConditions?.majorMode || entry.modeConditions?.minorModes?.length) {
          // Need a window ID to check mode
          if (focusedWindowId === undefined && BrowserWindow) {
            // Try to get focused window
            const focused = BrowserWindow.getFocusedWindow();
            focusedWindowId = focused?.id;
          }

          if (focusedWindowId !== undefined) {
            const modeMatches = checkModeConditions(
              focusedWindowId,
              entry.modeConditions.majorMode,
              entry.modeConditions.minorModes
            );

            if (modeMatches) {
              entry.callback();
              return true;
            }
            // Mode doesn't match - continue to check other entries
            continue;
          }
        } else {
          // Non-conditional shortcut - execute immediately
          entry.callback();
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Unregister all shortcuts registered by a specific address
 */
export function unregisterShortcutsForAddress(address: string): void {
  // Unregister global shortcuts
  for (const [shortcut, source] of globalShortcuts) {
    if (source === address) {
      DEBUG && console.log('unregistering global shortcut', shortcut, 'for', address);
      unregisterGlobalShortcut(shortcut);
    }
  }

  // Unregister local shortcuts for this address
  for (const [shortcut, entries] of localShortcuts) {
    const filtered = entries.filter(entry => entry.source !== address);
    if (filtered.length > 0) {
      localShortcuts.set(shortcut, filtered);
    } else {
      localShortcuts.delete(shortcut);
    }
    if (entries.length !== filtered.length) {
      DEBUG && console.log('unregistered local shortcut(s)', shortcut, 'for', address);
    }
  }
}

/**
 * Get the source address for a global shortcut
 */
export function getGlobalShortcutSource(shortcut: string): string | undefined {
  return globalShortcuts.get(shortcut);
}

/**
 * Check if a global shortcut is registered
 */
export function isGlobalShortcutRegistered(shortcut: string): boolean {
  if (!globalShortcut) {
    return globalShortcuts.has(shortcut);
  }
  return globalShortcut.isRegistered(shortcut);
}
