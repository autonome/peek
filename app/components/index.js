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
 * Or import individual modules:
 *   import { signal, effect } from 'peek://app/components/signals.js';
 *   import { on, emit } from 'peek://app/components/events.js';
 *   import { DataBoundElement } from 'peek://app/components/data-binding.js';
 *
 * Components automatically register with the custom elements registry.
 *
 * Theming:
 *   Components inherit theme variables from peek://theme/variables.css
 *   Override component tokens via CSS custom properties on :root or component.
 */

// Base utilities
export { PeekElement, sharedStyles } from './base.js';

// Reactive system
export { signal, computed, effect, batch, watch, fromExternal } from './signals.js';

// Schema validation
export { validate, createValidator, assertValid, isValid, Schema } from './schema.js';

// Data binding
export { DataBoundElement, DataBindingMixin, createDataComponent } from './data-binding.js';

// Event bus
export { bus, on, once, emit, channel, typedEvent, waitFor, EventBusMixin } from './events.js';

// Components - Basic
export { PeekButton } from './peek-button.js';
export { PeekCard } from './peek-card.js';
export { PeekList, PeekListItem } from './peek-list.js';

// Components - Complex
export { PeekCarousel } from './peek-carousel.js';
export { PeekInput } from './peek-input.js';
export { PeekGrid, PeekGridItem } from './peek-grid.js';
export { PeekDialog } from './peek-dialog.js';

// Components - Native/Open UI
export { PeekPopover } from './peek-popover.js';
export { PeekTabs, PeekTab, PeekTabPanel } from './peek-tabs.js';
export { PeekDetails } from './peek-details.js';

// Components - Phase 4
export { PeekSelect } from './peek-select.js';
export { PeekDropdown, PeekDropdownItem, PeekDropdownDivider } from './peek-dropdown.js';
export { PeekSwitch } from './peek-switch.js';
export { PeekDrawer } from './peek-drawer.js';
export { PeekTooltip } from './peek-tooltip.js';
export { PeekButtonGroup, PeekButtonGroupItem } from './peek-button-group.js';

// Side-effect imports to register all components
import './peek-button.js';
import './peek-card.js';
import './peek-list.js';
import './peek-carousel.js';
import './peek-input.js';
import './peek-grid.js';
import './peek-dialog.js';
import './peek-popover.js';
import './peek-tabs.js';
import './peek-details.js';
import './peek-select.js';
import './peek-dropdown.js';
import './peek-switch.js';
import './peek-drawer.js';
import './peek-tooltip.js';
import './peek-button-group.js';
