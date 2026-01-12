/**
 * Example Extension - Hello World
 *
 * Demonstrates the pattern for registering commands:
 * Extensions must wait for cmd:ready before calling api.commands.register()
 */

const api = window.app;

const extension = {
  id: 'example',
  labels: {
    name: 'Example'
  },

  /**
   * Register commands - called when cmd extension is ready
   */
  registerCommands() {
    api.commands.register({
      name: 'hello',
      description: 'Say hello',
      execute: () => {
        console.log('[example] Hello from command!');
        alert('Hello World!');
      }
    });
    console.log('[example] Commands registered');
  },

  init() {
    console.log('[example] init');

    // Wait for cmd:ready before registering commands
    // The cmd extension loads first, so it should already be ready
    api.subscribe('cmd:ready', () => {
      this.registerCommands();
    }, api.scopes.GLOBAL);

    // Query in case cmd is already ready (it usually is since cmd loads first)
    api.publish('cmd:query', {}, api.scopes.GLOBAL);

    console.log('[example] Extension loaded');
  },

  uninit() {
    console.log('[example] Goodbye!');
    api.commands.unregister('hello');
  }
};

export default extension;
