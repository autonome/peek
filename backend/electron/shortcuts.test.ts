/**
 * Unit tests for Shortcuts module
 * Tests shortcut parsing, registration, and mode-conditional behavior
 */

import { describe, it, before, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import type { InputEvent } from './shortcuts.js';

// Import will be done after ensuring module is compiled
let shortcuts: typeof import('./shortcuts.js');
let modes: typeof import('./modes.js');

describe('Shortcuts Module Tests', () => {
  before(async () => {
    // Dynamic import of the compiled modules
    shortcuts = await import('./shortcuts.js');
    modes = await import('./modes.js');
  });

  describe('parseShortcut', () => {
    it('should parse single key', () => {
      const parsed = shortcuts.parseShortcut('a');
      assert.strictEqual(parsed.code, 'KeyA');
      assert.strictEqual(parsed.ctrl, false);
      assert.strictEqual(parsed.alt, false);
      assert.strictEqual(parsed.shift, false);
      assert.strictEqual(parsed.meta, false);
    });

    it('should parse Ctrl modifier', () => {
      const parsed = shortcuts.parseShortcut('Ctrl+A');
      assert.strictEqual(parsed.code, 'KeyA');
      assert.strictEqual(parsed.ctrl, true);
    });

    it('should parse Alt modifier', () => {
      const parsed = shortcuts.parseShortcut('Alt+Q');
      assert.strictEqual(parsed.code, 'KeyQ');
      assert.strictEqual(parsed.alt, true);
    });

    it('should parse Shift modifier', () => {
      const parsed = shortcuts.parseShortcut('Shift+Enter');
      assert.strictEqual(parsed.code, 'Enter');
      assert.strictEqual(parsed.shift, true);
    });

    it('should parse multiple modifiers', () => {
      const parsed = shortcuts.parseShortcut('Ctrl+Shift+Alt+P');
      assert.strictEqual(parsed.code, 'KeyP');
      assert.strictEqual(parsed.ctrl, true);
      assert.strictEqual(parsed.alt, true);
      assert.strictEqual(parsed.shift, true);
    });

    it('should parse special keys', () => {
      assert.strictEqual(shortcuts.parseShortcut('Enter').code, 'Enter');
      assert.strictEqual(shortcuts.parseShortcut('Tab').code, 'Tab');
      assert.strictEqual(shortcuts.parseShortcut('Escape').code, 'Escape');
      assert.strictEqual(shortcuts.parseShortcut('Space').code, 'Space');
      assert.strictEqual(shortcuts.parseShortcut('Backspace').code, 'Backspace');
    });

    it('should parse arrow keys', () => {
      assert.strictEqual(shortcuts.parseShortcut('ArrowUp').code, 'ArrowUp');
      assert.strictEqual(shortcuts.parseShortcut('ArrowDown').code, 'ArrowDown');
      assert.strictEqual(shortcuts.parseShortcut('Up').code, 'ArrowUp');
      assert.strictEqual(shortcuts.parseShortcut('Down').code, 'ArrowDown');
    });

    it('should parse function keys', () => {
      assert.strictEqual(shortcuts.parseShortcut('F1').code, 'F1');
      assert.strictEqual(shortcuts.parseShortcut('F12').code, 'F12');
    });

    it('should parse number keys', () => {
      const parsed = shortcuts.parseShortcut('Alt+1');
      assert.strictEqual(parsed.code, 'Digit1');
      assert.strictEqual(parsed.alt, true);
    });

    it('should be case-insensitive', () => {
      const parsed1 = shortcuts.parseShortcut('CTRL+A');
      const parsed2 = shortcuts.parseShortcut('ctrl+a');
      assert.strictEqual(parsed1.ctrl, parsed2.ctrl);
      assert.strictEqual(parsed1.code, parsed2.code);
    });
  });

  describe('inputMatchesShortcut', () => {
    it('should match simple key', () => {
      const parsed = shortcuts.parseShortcut('a');
      const input: InputEvent = {
        type: 'keyDown',
        alt: false,
        shift: false,
        meta: false,
        control: false,
        code: 'KeyA'
      };
      assert.strictEqual(shortcuts.inputMatchesShortcut(input, parsed), true);
    });

    it('should not match with wrong modifiers', () => {
      const parsed = shortcuts.parseShortcut('Ctrl+A');
      const input: InputEvent = {
        type: 'keyDown',
        alt: false,
        shift: false,
        meta: false,
        control: false, // Missing ctrl!
        code: 'KeyA'
      };
      assert.strictEqual(shortcuts.inputMatchesShortcut(input, parsed), false);
    });

    it('should match with correct modifiers', () => {
      const parsed = shortcuts.parseShortcut('Ctrl+Shift+P');
      const input: InputEvent = {
        type: 'keyDown',
        alt: false,
        shift: true,
        meta: false,
        control: true,
        code: 'KeyP'
      };
      assert.strictEqual(shortcuts.inputMatchesShortcut(input, parsed), true);
    });

    it('should not match with extra modifiers', () => {
      const parsed = shortcuts.parseShortcut('Ctrl+A');
      const input: InputEvent = {
        type: 'keyDown',
        alt: true, // Extra alt!
        shift: false,
        meta: false,
        control: true,
        code: 'KeyA'
      };
      assert.strictEqual(shortcuts.inputMatchesShortcut(input, parsed), false);
    });
  });

  describe('registerLocalShortcut and handleLocalShortcut', () => {
    let callCount: number;

    beforeEach(() => {
      callCount = 0;
    });

    it('should register and trigger a shortcut', () => {
      shortcuts.registerLocalShortcut('Ctrl+T', 'test-source-1', () => {
        callCount++;
      });

      const input: InputEvent = {
        type: 'keyDown',
        alt: false,
        shift: false,
        meta: false,
        control: true,
        code: 'KeyT'
      };

      const handled = shortcuts.handleLocalShortcut(input);
      assert.strictEqual(handled, true);
      assert.strictEqual(callCount, 1);

      // Cleanup
      shortcuts.unregisterLocalShortcut('Ctrl+T', 'test-source-1');
    });

    it('should not trigger on keyUp', () => {
      shortcuts.registerLocalShortcut('Ctrl+U', 'test-source-2', () => {
        callCount++;
      });

      const input: InputEvent = {
        type: 'keyUp', // Not keyDown!
        alt: false,
        shift: false,
        meta: false,
        control: true,
        code: 'KeyU'
      };

      const handled = shortcuts.handleLocalShortcut(input);
      assert.strictEqual(handled, false);
      assert.strictEqual(callCount, 0);

      // Cleanup
      shortcuts.unregisterLocalShortcut('Ctrl+U', 'test-source-2');
    });

    it('should return false for unregistered shortcut', () => {
      const input: InputEvent = {
        type: 'keyDown',
        alt: false,
        shift: false,
        meta: false,
        control: true,
        code: 'KeyZ' // Not registered
      };

      const handled = shortcuts.handleLocalShortcut(input);
      assert.strictEqual(handled, false);
    });
  });

  describe('Mode-conditional shortcuts', () => {
    let pageCallCount: number;
    let groupCallCount: number;
    let defaultCallCount: number;

    beforeEach(() => {
      pageCallCount = 0;
      groupCallCount = 0;
      defaultCallCount = 0;

      // Set up test window mode
      modes.setMajorMode(10001, 'page');
    });

    afterEach(() => {
      // Cleanup shortcuts
      shortcuts.unregisterLocalShortcut('Ctrl+M', 'test-mode-page', { majorMode: 'page' });
      shortcuts.unregisterLocalShortcut('Ctrl+M', 'test-mode-group', { majorMode: 'group' });
      shortcuts.unregisterLocalShortcut('Ctrl+M', 'test-mode-default');
      modes.cleanupWindowMode(10001);
    });

    it('should trigger mode-conditional shortcut when mode matches', () => {
      shortcuts.registerLocalShortcut('Ctrl+M', 'test-mode-page', () => {
        pageCallCount++;
      }, { majorMode: 'page' });

      const input: InputEvent = {
        type: 'keyDown',
        alt: false,
        shift: false,
        meta: false,
        control: true,
        code: 'KeyM'
      };

      // Window 10001 is in 'page' mode
      const handled = shortcuts.handleLocalShortcut(input, 10001);
      assert.strictEqual(handled, true);
      assert.strictEqual(pageCallCount, 1);
    });

    it('should not trigger mode-conditional shortcut when mode does not match', () => {
      shortcuts.registerLocalShortcut('Ctrl+M', 'test-mode-group', () => {
        groupCallCount++;
      }, { majorMode: 'group' });

      const input: InputEvent = {
        type: 'keyDown',
        alt: false,
        shift: false,
        meta: false,
        control: true,
        code: 'KeyM'
      };

      // Window 10001 is in 'page' mode, not 'group'
      const handled = shortcuts.handleLocalShortcut(input, 10001);
      assert.strictEqual(handled, false);
      assert.strictEqual(groupCallCount, 0);
    });

    it('should allow same key with different mode conditions', () => {
      // Register same key for different modes
      shortcuts.registerLocalShortcut('Ctrl+M', 'test-mode-page', () => {
        pageCallCount++;
      }, { majorMode: 'page' });

      shortcuts.registerLocalShortcut('Ctrl+M', 'test-mode-group', () => {
        groupCallCount++;
      }, { majorMode: 'group' });

      const input: InputEvent = {
        type: 'keyDown',
        alt: false,
        shift: false,
        meta: false,
        control: true,
        code: 'KeyM'
      };

      // In page mode - should trigger page handler
      modes.setMajorMode(10001, 'page');
      let handled = shortcuts.handleLocalShortcut(input, 10001);
      assert.strictEqual(handled, true);
      assert.strictEqual(pageCallCount, 1);
      assert.strictEqual(groupCallCount, 0);

      // Switch to group mode - should trigger group handler
      modes.setMajorMode(10001, 'group');
      handled = shortcuts.handleLocalShortcut(input, 10001);
      assert.strictEqual(handled, true);
      assert.strictEqual(pageCallCount, 1); // No change
      assert.strictEqual(groupCallCount, 1);
    });

    it('should fall back to non-conditional shortcut when no mode match', () => {
      // Register mode-conditional for 'group'
      shortcuts.registerLocalShortcut('Ctrl+M', 'test-mode-group', () => {
        groupCallCount++;
      }, { majorMode: 'group' });

      // Register non-conditional fallback
      shortcuts.registerLocalShortcut('Ctrl+M', 'test-mode-default', () => {
        defaultCallCount++;
      });

      const input: InputEvent = {
        type: 'keyDown',
        alt: false,
        shift: false,
        meta: false,
        control: true,
        code: 'KeyM'
      };

      // In page mode - group doesn't match, should trigger default
      modes.setMajorMode(10001, 'page');
      const handled = shortcuts.handleLocalShortcut(input, 10001);
      assert.strictEqual(handled, true);
      assert.strictEqual(groupCallCount, 0);
      assert.strictEqual(defaultCallCount, 1);
    });
  });

  describe('unregisterShortcutsForAddress', () => {
    it('should unregister all shortcuts for an address', () => {
      let callCount = 0;
      const testSource = 'test-cleanup-source';

      shortcuts.registerLocalShortcut('Ctrl+1', testSource, () => callCount++);
      shortcuts.registerLocalShortcut('Ctrl+2', testSource, () => callCount++);
      shortcuts.registerLocalShortcut('Ctrl+3', 'other-source', () => callCount++);

      // Unregister all for testSource
      shortcuts.unregisterShortcutsForAddress(testSource);

      // Ctrl+1 and Ctrl+2 should not work
      const input1: InputEvent = {
        type: 'keyDown', alt: false, shift: false, meta: false, control: true, code: 'Digit1'
      };
      const input2: InputEvent = {
        type: 'keyDown', alt: false, shift: false, meta: false, control: true, code: 'Digit2'
      };
      const input3: InputEvent = {
        type: 'keyDown', alt: false, shift: false, meta: false, control: true, code: 'Digit3'
      };

      shortcuts.handleLocalShortcut(input1);
      shortcuts.handleLocalShortcut(input2);
      assert.strictEqual(callCount, 0);

      // Ctrl+3 from other-source should still work
      shortcuts.handleLocalShortcut(input3);
      assert.strictEqual(callCount, 1);

      // Cleanup
      shortcuts.unregisterShortcutsForAddress('other-source');
    });
  });
});
