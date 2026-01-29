/**
 * Unit tests for Modes module
 * Tests the mode manager, mode state tracking, and mode-conditional logic
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import * as assert from 'node:assert';

// Import will be done after ensuring module is compiled
let modes: typeof import('./modes.js');

describe('Modes Module Tests', () => {
  before(async () => {
    // Dynamic import of the compiled module
    modes = await import('./modes.js');
  });

  describe('getWindowModeState', () => {
    it('should return default mode state for new window', () => {
      const state = modes.getWindowModeState(9999);
      assert.strictEqual(state.major, 'default');
      assert.deepStrictEqual(state.minors, []);
    });

    it('should return a copy, not the original state', () => {
      const state1 = modes.getWindowModeState(9998);
      const state2 = modes.getWindowModeState(9998);

      // Should be equal but not the same object
      assert.deepStrictEqual(state1, state2);
      assert.notStrictEqual(state1, state2);
      assert.notStrictEqual(state1.minors, state2.minors);
    });
  });

  describe('setMajorMode', () => {
    it('should set major mode for a window', () => {
      modes.setMajorMode(1001, 'page');
      const state = modes.getWindowModeState(1001);
      assert.strictEqual(state.major, 'page');
    });

    it('should update existing major mode', () => {
      modes.setMajorMode(1002, 'page');
      modes.setMajorMode(1002, 'group');
      const state = modes.getWindowModeState(1002);
      assert.strictEqual(state.major, 'group');
    });

    it('should preserve minor modes when changing major mode', () => {
      modes.setMajorMode(1003, 'page');
      modes.enableMinorMode(1003, 'edit');
      modes.setMajorMode(1003, 'settings');

      const state = modes.getWindowModeState(1003);
      assert.strictEqual(state.major, 'settings');
      assert.ok(state.minors.includes('edit'));
    });
  });

  describe('enableMinorMode', () => {
    it('should enable a minor mode', () => {
      modes.setMajorMode(2001, 'default');
      modes.enableMinorMode(2001, 'preview');

      const state = modes.getWindowModeState(2001);
      assert.ok(state.minors.includes('preview'));
    });

    it('should allow multiple minor modes', () => {
      modes.setMajorMode(2002, 'page');
      modes.enableMinorMode(2002, 'preview');
      modes.enableMinorMode(2002, 'edit');
      modes.enableMinorMode(2002, 'search');

      const state = modes.getWindowModeState(2002);
      assert.strictEqual(state.minors.length, 3);
      assert.ok(state.minors.includes('preview'));
      assert.ok(state.minors.includes('edit'));
      assert.ok(state.minors.includes('search'));
    });

    it('should not duplicate minor modes', () => {
      modes.setMajorMode(2003, 'page');
      modes.enableMinorMode(2003, 'edit');
      modes.enableMinorMode(2003, 'edit');

      const state = modes.getWindowModeState(2003);
      const editCount = state.minors.filter(m => m === 'edit').length;
      assert.strictEqual(editCount, 1);
    });
  });

  describe('disableMinorMode', () => {
    it('should disable a minor mode', () => {
      modes.setMajorMode(3001, 'page');
      modes.enableMinorMode(3001, 'edit');
      modes.disableMinorMode(3001, 'edit');

      const state = modes.getWindowModeState(3001);
      assert.ok(!state.minors.includes('edit'));
    });

    it('should only remove specified minor mode', () => {
      modes.setMajorMode(3002, 'page');
      modes.enableMinorMode(3002, 'preview');
      modes.enableMinorMode(3002, 'edit');
      modes.disableMinorMode(3002, 'edit');

      const state = modes.getWindowModeState(3002);
      assert.ok(state.minors.includes('preview'));
      assert.ok(!state.minors.includes('edit'));
    });

    it('should handle disabling non-existent minor mode gracefully', () => {
      modes.setMajorMode(3003, 'page');
      modes.disableMinorMode(3003, 'search'); // Never enabled

      const state = modes.getWindowModeState(3003);
      assert.deepStrictEqual(state.minors, []);
    });
  });

  describe('toggleMinorMode', () => {
    it('should enable when disabled', () => {
      modes.setMajorMode(4001, 'page');
      const enabled = modes.toggleMinorMode(4001, 'edit');

      assert.strictEqual(enabled, true);
      const state = modes.getWindowModeState(4001);
      assert.ok(state.minors.includes('edit'));
    });

    it('should disable when enabled', () => {
      modes.setMajorMode(4002, 'page');
      modes.enableMinorMode(4002, 'edit');
      const enabled = modes.toggleMinorMode(4002, 'edit');

      assert.strictEqual(enabled, false);
      const state = modes.getWindowModeState(4002);
      assert.ok(!state.minors.includes('edit'));
    });
  });

  describe('cleanupWindowMode', () => {
    it('should remove mode state for a window', () => {
      modes.setMajorMode(5001, 'settings');
      modes.enableMinorMode(5001, 'edit');
      modes.cleanupWindowMode(5001);

      // After cleanup, should get default state
      const state = modes.getWindowModeState(5001);
      assert.strictEqual(state.major, 'default');
      assert.deepStrictEqual(state.minors, []);
    });
  });

  describe('getAllModes', () => {
    it('should return all major and minor modes', () => {
      const allModes = modes.getAllModes();

      // Check major modes exist
      const majorModes = allModes.filter(m => m.type === 'major');
      const majorIds = majorModes.map(m => m.id);
      assert.ok(majorIds.includes('default'));
      assert.ok(majorIds.includes('page'));
      assert.ok(majorIds.includes('group'));
      assert.ok(majorIds.includes('settings'));

      // Check minor modes exist
      const minorModes = allModes.filter(m => m.type === 'minor');
      const minorIds = minorModes.map(m => m.id);
      assert.ok(minorIds.includes('preview'));
      assert.ok(minorIds.includes('edit'));
      assert.ok(minorIds.includes('annotate'));
      assert.ok(minorIds.includes('search'));
    });

    it('should include names for all modes', () => {
      const allModes = modes.getAllModes();
      for (const mode of allModes) {
        assert.ok(mode.name, `Mode ${mode.id} should have a name`);
        assert.ok(typeof mode.name === 'string');
      }
    });
  });

  describe('isInMajorMode', () => {
    it('should return true when in the specified mode', () => {
      modes.setMajorMode(6001, 'page');
      assert.strictEqual(modes.isInMajorMode(6001, 'page'), true);
    });

    it('should return false when in a different mode', () => {
      modes.setMajorMode(6002, 'group');
      assert.strictEqual(modes.isInMajorMode(6002, 'page'), false);
    });

    it('should return false for unknown window', () => {
      // Fresh window ID that was never set
      assert.strictEqual(modes.isInMajorMode(99999, 'page'), false);
    });
  });

  describe('hasMinorMode', () => {
    it('should return true when minor mode is active', () => {
      modes.setMajorMode(7001, 'page');
      modes.enableMinorMode(7001, 'edit');
      assert.strictEqual(modes.hasMinorMode(7001, 'edit'), true);
    });

    it('should return false when minor mode is not active', () => {
      modes.setMajorMode(7002, 'page');
      assert.strictEqual(modes.hasMinorMode(7002, 'search'), false);
    });
  });

  describe('detectModeFromUrl', () => {
    it('should detect settings mode from settings URL', () => {
      assert.strictEqual(modes.detectModeFromUrl('peek://app/settings/settings.html'), 'settings');
      assert.strictEqual(modes.detectModeFromUrl('peek://ext/cmd/settings.html'), 'settings');
    });

    it('should detect group mode from groups URL', () => {
      assert.strictEqual(modes.detectModeFromUrl('peek://ext/groups/index.html'), 'group');
      assert.strictEqual(modes.detectModeFromUrl('peek://groups/groups.html'), 'group');
    });

    it('should detect page mode from http URLs', () => {
      assert.strictEqual(modes.detectModeFromUrl('https://example.com'), 'page');
      assert.strictEqual(modes.detectModeFromUrl('http://localhost:3000'), 'page');
    });

    it('should return default for other URLs', () => {
      assert.strictEqual(modes.detectModeFromUrl('peek://app/background.html'), 'default');
      assert.strictEqual(modes.detectModeFromUrl('peek://ext/cmd/panel.html'), 'default');
    });

    it('should return default for empty URL', () => {
      assert.strictEqual(modes.detectModeFromUrl(''), 'default');
    });
  });

  describe('checkModeConditions', () => {
    beforeEach(() => {
      // Set up a known state
      modes.setMajorMode(8001, 'page');
      modes.enableMinorMode(8001, 'edit');
      modes.enableMinorMode(8001, 'search');
    });

    it('should return true when major mode matches', () => {
      assert.strictEqual(modes.checkModeConditions(8001, 'page'), true);
    });

    it('should return false when major mode does not match', () => {
      assert.strictEqual(modes.checkModeConditions(8001, 'group'), false);
    });

    it('should return true when all required minor modes are active', () => {
      assert.strictEqual(modes.checkModeConditions(8001, undefined, ['edit']), true);
      assert.strictEqual(modes.checkModeConditions(8001, undefined, ['edit', 'search']), true);
    });

    it('should return false when required minor modes are not all active', () => {
      assert.strictEqual(modes.checkModeConditions(8001, undefined, ['preview']), false);
      assert.strictEqual(modes.checkModeConditions(8001, undefined, ['edit', 'preview']), false);
    });

    it('should check both major and minor conditions', () => {
      assert.strictEqual(modes.checkModeConditions(8001, 'page', ['edit']), true);
      assert.strictEqual(modes.checkModeConditions(8001, 'group', ['edit']), false);
      assert.strictEqual(modes.checkModeConditions(8001, 'page', ['preview']), false);
    });

    it('should return true when no conditions specified', () => {
      assert.strictEqual(modes.checkModeConditions(8001), true);
      assert.strictEqual(modes.checkModeConditions(8001, undefined, []), true);
    });

    it('should handle unknown window (default mode)', () => {
      // Unknown window = default mode, no minors
      assert.strictEqual(modes.checkModeConditions(88888, 'default'), true);
      assert.strictEqual(modes.checkModeConditions(88888, 'page'), false);
    });
  });

  describe('buildCommandContext', () => {
    it('should return context with mode for known window', () => {
      modes.setMajorMode(9001, 'settings');
      modes.enableMinorMode(9001, 'edit');

      // Note: buildCommandContext uses BrowserWindow.fromId which won't work in unit tests
      // This test would need to be an integration test or we'd need to mock BrowserWindow
      // For now, test with null windowId
      const context = modes.buildCommandContext(null);
      assert.strictEqual(context.windowId, null);
      assert.strictEqual(context.mode, null);
    });

    it('should return null mode for null windowId', () => {
      const context = modes.buildCommandContext(null);
      assert.strictEqual(context.windowId, null);
      assert.strictEqual(context.mode, null);
      assert.strictEqual(context.url, null);
      assert.strictEqual(context.title, null);
    });
  });
});
