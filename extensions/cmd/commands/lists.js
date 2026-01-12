/**
 * Lists command - produces sample list data for chaining demonstration
 *
 * This is a chaining-enabled command that produces JSON output
 * which can be piped to other commands like 'csv' or 'save'.
 *
 * Note: In a full implementation, this would detect lists from the
 * current page DOM. For now, it produces sample data to demonstrate
 * the chaining functionality.
 *
 * Usage:
 *   lists           - produce sample list data
 *   lists demo      - same as above
 */

export default {
  name: 'lists',
  description: 'Produce sample list data (chaining demo)',
  accepts: [], // This command starts chains, doesn't accept input
  produces: ['application/json'],

  execute: async (ctx) => {
    console.log('[lists] execute:', ctx);

    // Sample data to demonstrate chaining
    // In a full implementation, this would detect lists from the page DOM
    const sampleData = [
      { id: 1, name: 'Apple', category: 'Fruit', price: 1.20 },
      { id: 2, name: 'Banana', category: 'Fruit', price: 0.50 },
      { id: 3, name: 'Carrot', category: 'Vegetable', price: 0.80 },
      { id: 4, name: 'Broccoli', category: 'Vegetable', price: 1.50 },
      { id: 5, name: 'Milk', category: 'Dairy', price: 2.00 },
      { id: 6, name: 'Cheese', category: 'Dairy', price: 3.50 },
      { id: 7, name: 'Bread', category: 'Bakery', price: 2.25 },
      { id: 8, name: 'Eggs', category: 'Protein', price: 3.00 }
    ];

    console.log('[lists] Returning sample data for chaining demo');

    // Return sample data as JSON output for chaining
    return {
      success: true,
      output: {
        data: sampleData,
        mimeType: 'application/json',
        title: `Sample grocery list (${sampleData.length} items)`
      }
    };
  }
};
