/**
 * Template command - use this as a starting point for new commands
 * 
 * To create a new command:
 * 1. Copy this file to a new file named after your command (e.g., mycommand.js)
 * 2. Update the name and execute function
 * 3. Import the command in index.js and add it to the commands array
 */

export default {
  // Command name - what the user will type to execute this command
  name: 'template',
  
  // Execute function - called when the command is selected
  execute: async (msg) => {
    console.log('template command executed', msg);
    
    // Parse any arguments from the command
    const parts = msg.typed.split(' ');
    parts.shift(); // Remove the command name
    
    const args = parts.join(' ');
    
    // Implement your command logic here
    
    // Return a result object
    return {
      command: 'template',
      success: true,
      // Add other properties as needed
    };
  }
};