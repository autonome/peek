/**
 * Modal command - opens a URL in a modal window that hides on blur or escape
 */
import windows from '../../windows.js';

export default {
  name: 'modal',
  execute: async (msg) => {
    console.log('modal command', msg);

    const parts = msg.typed.split(' ');
    parts.shift();

    const address = parts.shift();

    if (!address) {
      return;
    }

    // Use the modal window API
    try {
      const result = await windows.openModalWindow(address, {
        width: 700,
        height: 500
      });
      console.log('Modal window opened:', result);
    } catch (error) {
      console.error('Failed to open modal window:', error);
    }

    return {
      command: 'modal',
      address
    };
  }
};