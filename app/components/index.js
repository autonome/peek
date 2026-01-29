/**
 * Peek UI Components
 *
 * A lightweight, themeable web component library built on Lit.js.
 * Components use Shadow DOM for style encapsulation and CSS custom
 * properties for theming integration.
 *
 * Usage:
 *   import 'peek://app/components/index.js';
 *
 * Or import individual components:
 *   import 'peek://app/components/peek-button.js';
 *   import 'peek://app/components/peek-card.js';
 *   import 'peek://app/components/peek-list.js';
 *
 * Components automatically register with the custom elements registry.
 *
 * Theming:
 *   Components inherit theme variables from peek://theme/variables.css
 *   Override component tokens via CSS custom properties on :root or component.
 */

// Base utilities
export { PeekElement, sharedStyles } from './base.js';

// Components
export { PeekButton } from './peek-button.js';
export { PeekCard } from './peek-card.js';
export { PeekList, PeekListItem } from './peek-list.js';

// Side-effect imports to register all components
import './peek-button.js';
import './peek-card.js';
import './peek-list.js';
