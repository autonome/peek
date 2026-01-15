/**
 * Shortcut management for Electron
 *
 * Handles:
 * - Global shortcuts (work even when app doesn't have focus)
 * - Local shortcuts (only work when app has focus)
 * - Shortcut parsing and matching
 */

import { globalShortcut } from 'electron';
import { DEBUG } from './config.js';

// Maps for tracking shortcuts
// Global shortcuts: shortcut string -> source address
const globalShortcuts = new Map<string, string>();

// Local shortcuts: shortcut string -> { source, parsed, callback }
interface ParsedShortcut {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  code: string;
}

interface LocalShortcutEntry {
  source: string;
  parsed: ParsedShortcut;
  callback: () => void;
}

const localShortcuts = new Map<string, LocalShortcutEntry>();

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
 */
export function registerLocalShortcut(
  shortcut: string,
  source: string,
  callback: () => void
): void {
  DEBUG && console.log('registerLocalShortcut', shortcut);

  if (localShortcuts.has(shortcut)) {
    DEBUG && console.log('local shortcut already registered, replacing:', shortcut);
  }

  const parsed = parseShortcut(shortcut);
  localShortcuts.set(shortcut, { source, parsed, callback });
}

/**
 * Unregister a local shortcut
 */
export function unregisterLocalShortcut(shortcut: string): void {
  DEBUG && console.log('unregisterLocalShortcut', shortcut);

  if (!localShortcuts.has(shortcut)) {
    console.error('local shortcut not registered:', shortcut);
    return;
  }

  localShortcuts.delete(shortcut);
}

/**
 * Handle local shortcuts from any focused window
 * Called from before-input-event handler
 * Returns true if shortcut was handled
 */
export function handleLocalShortcut(input: InputEvent): boolean {
  // Only handle keyDown events
  if (input.type !== 'keyDown') return false;

  for (const [, data] of localShortcuts) {
    if (inputMatchesShortcut(input, data.parsed)) {
      data.callback();
      return true;
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

  // Unregister local shortcuts
  for (const [shortcut, data] of localShortcuts) {
    if (data.source === address) {
      DEBUG && console.log('unregistering local shortcut', shortcut, 'for', address);
      localShortcuts.delete(shortcut);
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
  return globalShortcut.isRegistered(shortcut);
}
