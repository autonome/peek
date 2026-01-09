/**
 * Example Extension - Hello World
 */

const api = window.app;

const extension = {
  id: 'example',
  labels: {
    name: 'Example'
  },

  init() {
    console.log('[example] init');

    // Register a command
    api.commands.register({
      name: 'hello',
      description: 'Say hello',
      execute: () => {
        console.log('[example] Hello from command!');
        alert('Hello World!');
      }
    });

    console.log('[example] Extension loaded');
  },

  uninit() {
    console.log('[example] Goodbye!');
    api.commands.unregister('hello');
  }
};

export default extension;
