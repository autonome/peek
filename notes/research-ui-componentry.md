# UI Componentry Research Report

## Executive Summary

The project seeks a flexible, reusable UI component system at the ./app layer for extensions to create/generate interfaces. Based on extensive 2026 research, the recommended approach is:

1. **Foundation**: Use Open UI standards as the specification baseline for components
2. **Core Library**: Lit.js for building fast, lightweight web components with reactive signals
3. **Enhancement Layer**: Shoelace (Web Awesome) for pre-built, professionally designed components
4. **Styling System**: CSS custom properties + design tokens for theming and customization
5. **Positioning**: Floating UI for dropdowns, popovers, tooltips, carousels
6. **Data Binding**: Vanilla observables/event system with Signals for reactive updates

This approach avoids React-style complexity while providing a modern, standards-based foundation that's framework-agnostic and suitable for extension-driven architecture.

---

## Part 1: Open UI Standard

**What is Open UI?**
- A W3C Community Group standardizing web UI component specs
- Establishes common patterns for components like buttons, select dropdowns, date pickers
- Specifies component anatomy (parts), states, behaviors, and accessibility requirements
- Actively maintained (latest updates January 2026)

**Relevance to Peek:**
- Open UI covers: buttons, button groups, carousels, popover, listbox, combobox, tabs
- Provides the standardization layer for "Card + JSON schema + data" reactive system
- Fills gaps with semantic specifications your components can build upon
- Ensures accessibility from the ground up (WCAG 2.2+ compliance by default)

**Key Components Specified by Open UI:**
- Buttons, button groups (for tag sets)
- Select/combobox (for command input with suggestions)
- Carousel (horizontal and vertical - documented native spec)
- Popover API (recently standardized for floating UI interactions)
- Tabs, listbox, grid

**Browser Support:**
- All major browsers; native Popover API support in all modern browsers (2026)
- Graceful degradation for older browsers possible with polyfills

---

## Part 2: Core Component Library - Lit.js

**Why Lit?**
- Ultra-lightweight (3KB gzipped)
- Fast reactive updates without virtual DOM
- First-class Shadow DOM support for style encapsulation
- Built-in lifecycle management (connectedCallback, etc.)
- Native TypeScript support
- Integrates with TC39 Signals proposal for reactive state

**Lit for Peek's Use Case:**

Template replacement pattern works perfectly:
```
- Caller instantiates component with schema + data
- Default template renders from schema
- Caller provides override template via slot or property
```

**Reactive Signals in Lit:**
- `@lit-labs/signals` integrates TC39 Signals (standardized reactive primitive)
- Signals are cross-framework compatible (React Signals, Preact Signals, etc.)
- When a signal changes, only affected DOM updates (pin-point updates, no full re-render)
- Event/stream binding becomes: `signal.value = newData` -> auto-update

**Lifecycle Patterns:**
- Constructor: set up initial state, default values, shadow root
- connectedCallback: async work, rendering, resource fetching
- New pattern: connectedMoveCallback for state-preserving DOM moves

**Shadow DOM Benefits:**
- CSS completely encapsulated to component
- Allows template slot-based customization
- CSS custom properties penetrate shadow DOM for theming

---

## Part 3: Pre-Built Components - Shoelace/Web Awesome

**What is Shoelace?**
- Forward-thinking library of 50+ web components built on Lit
- Web Awesome 3.0 released (2026) with simplified architecture
- Framework-agnostic: works with React, Vue, Angular, or vanilla JS
- Professionally designed, enterprise-ready styling

**Shoelace 3.0 Improvements:**
- Removed hundreds of lines by using native HTML elements (`<dialog>`, etc.)
- Modern CSS Grid for layouts
- Floating UI integration for positioning
- Full accessibility built-in

**Relevant Shoelace Components for Peek:**
- Button, button group
- Card, grid (responsive CSS Grid)
- Input, searchbox (for command/tag filtering)
- Dialog, popover
- Dropdown, select
- Tabs, switch
- Rating, range slider
- Drawer, sidebar

**Customization:**
- All components expose CSS custom properties for theming
- Slots for template replacement
- Parts API for fine-grained styling via `::part()` selector
- Complete style override capability without forking code

---

## Part 4: Schema-Driven Component Generation

**Existing Patterns (2026):**

1. **UI-Schema** (headless React library)
   - JSON Schema -> form generation
   - Customizable widget rendering
   - Validation codegen from schema

2. **JSON Typedef (RFC 8927)**
   - Alternative to JSON Schema
   - Code generation across languages
   - Schema validation without codegen complexity

3. **AJV (Another JSON Schema Validator)**
   - Compilation-based validation (CodeGen module)
   - Fast at runtime
   - Reduces code by 10.5% with optimization

**Approach for Peek:**
- Define component schema as JSON Schema subset
- Schema includes: component type, template URL, properties, events
- Codegen validators from schema
- At instantiation: merge user data + default template + user override template

```json
{
  "type": "card",
  "schema": {
    "title": { "type": "string" },
    "image": { "type": "string", "format": "uri" },
    "content": { "type": "string" }
  },
  "events": ["click", "close"],
  "defaultTemplate": "peek://templates/card-default.html",
  "parts": ["header", "body", "footer"]
}
```

---

## Part 5: Reactive Data Binding (No Heavy Framework)

**Core Options:**

**1. Observer Pattern + Vanilla Observables**
- Simple: object with subscribe/unsubscribe/notify
- Can build with ES6 Proxies for property intercepts
- Lite event system for data changes

**2. RxJS (if needed)**
- Full reactive streams library
- Observable pattern with operators
- 44KB minified, often too large for components
- **Not recommended** unless specific requirement

**3. TC39 Signals (Recommended)**
- Emerging standard for reactive primitives
- Lit integration available now
- Cross-framework compatible
- Minimal overhead

**4. Event-Driven Pattern**
- Components emit custom events on data change
- Parent listens and updates component
- Works well with feed system mentioned in TODO

**Example for Peek:**

```javascript
// Option 1: Signals
const cardData = signal({ title: "Test", content: "..." });
cardData.value = { title: "Updated" }; // Auto-update component

// Option 2: Custom events
component.addEventListener('data-change', (e) => {
  component.data = e.detail.newData;
});
component.dispatchEvent(new CustomEvent('data-change', {
  detail: { newData: { title: "..." } }
}));
```

---

## Part 6: Carousel Implementation

**CSS Scroll Snap (Preferred)**
- Native browser feature, no JavaScript
- `scroll-snap-type: x mandatory` (horizontal) or `y mandatory` (vertical)
- `scroll-snap-align: center` on items
- Works with accessibility, keyboard navigation built-in

**Floating UI + Positioning**
- For carousel "floating" elements (tooltips, active item badges)
- Handles collision detection automatically
- Only 3KB gzipped

**Shoelace Carousel**
- Pre-built component if custom CSS not desired
- Supports keyboard navigation (arrows, vim keys)
- Accessible focus management

**For Peek's Use Cases:**
- Command chaining -> horizontal carousel with `scroll-snap-type: x`
- Chat-style vertical carousel -> `scroll-snap-type: y` with arrow controls
- Day ribbons -> horizontal scroll with pinned behavior

---

## Part 7: Theming & Styling Strategy

**Design Tokens System:**
1. Define tokens: colors, spacing, typography, shadows
2. Export to CSS custom properties (Style Dictionary tool)
3. Components consume tokens via `var(--token-name)`
4. Theme switch: update CSS custom properties on `:root`

**Shadow DOM Styling:**
- CSS custom properties work across shadow boundaries
- CSS `::part()` API for external styling of shadow elements
- Never use `!important` in shadow DOM (breaks encapsulation)

**Override Patterns:**
- Slots for HTML replacement
- CSS custom properties for color/spacing
- `::part()` for fine-grained styling
- Never expose internal structure (don't leak shadow DOM specifics)

**Consumer Styling:**
```css
/* Token-based theming */
:root {
  --color-primary: #007bff;
  --color-surface: #ffffff;
  --spacing-unit: 8px;
}

/* Shoelace components use these automatically */
sl-button { /* inherits --color-primary */ }

/* Override for specific context */
.my-theme {
  --color-primary: #ff6b35;
}
```

---

## Part 8: Template Replacement Pattern

**Problem:** Extensions need to override component visuals without forking code

**Solution: Slots + Template Strategy**

**Approach 1: HTML Slots (Recommended)**
```html
<peek-card data='{"title": "..."}'>
  <template slot="custom-template">
    <h2>{{ title }}</h2>
    <p>{{ content }}</p>
  </template>
</peek-card>
```

**Approach 2: Template Property**
```javascript
const card = document.createElement('peek-card');
card.data = { title: "..." };
card.templateOverride = customTemplate; // HTML string or DocumentFragment
```

**Approach 3: Slot-Based Parts**
```html
<peek-card data='...'>
  <div slot="header">Custom header</div>
  <div slot="body">Custom body</div>
  <div slot="footer">Custom footer</div>
</peek-card>
```

**Best Practice for Peek:**
- Default slot usage for full template replacement
- Fallback to named slots for partial overrides
- Schema declares available slots
- Template binding with minimal rendering logic (data binding only)

---

## Part 9: Browser Extension UI Patterns

**Architecture:**
- Background script: manages core logic
- Content script: injects UI into pages
- Popup: extension toolbar UI (800x600px max)

**Shoelace + Plasmo Pattern (2026 Best Practice):**
- Plasmo wraps components in Shadow DOM for content script injection
- Shoelace components work perfectly in content scripts
- getStyle() hook for injecting component CSS into page
- getMountPoint() for choosing injection location

**Event Delegation Gotchas:**
- Custom events don't cross shadow DOM unless `composed: true`
- Use `event.composedPath()` to find actual target (not shadow host)
- Dispatch internal events with `{ bubbles: true, composed: true }`

**For Peek Extensions:**
- Import Shoelace components from CDN or bundled
- Use Shadow DOM for style isolation (critical in content scripts)
- Emit custom events to parent with `composed: true`
- Theme via CSS custom properties passed to popup/page context

---

## Part 10: Card Grid System

**Modern CSS Grid (2026 Best Practices):**

**Responsive auto-fit (no media queries):**
```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: clamp(1rem, 2.5vw, 2rem);
}
```

**Container Queries (for truly responsive components):**
```css
@container (min-width: 400px) {
  .card {
    display: grid;
    grid-template-columns: 100px 1fr;
  }
}
```

**Subgrid (new in 2025-2026):**
- Nested grids inherit parent tracks
- Perfect for aligning card content across rows
- Universal browser support now

**For Peek Use Cases:**
- Groups -> card grid (auto-fit with minmax)
- Tags -> button group inside card or standalone button group
- Window viewer -> card grid with subgrid for aligned content
- Day ribbons -> horizontal scroll snap carousel

---

## Part 11: Command Palette Pattern

**Core Implementation:**
1. Input field with autocomplete
2. Fuzzy search (Fuse.js library, 10KB)
3. Keyboard navigation (arrow keys, vim keys)
4. Tabs for categorization
5. Preview pane for selected command

**Components Needed:**
- Input with suggestions overlay
- Listbox (Open UI standard)
- Popover for positioning (Floating UI)
- Preview pane (flexbox grid)

**Shoelace Components:**
- `sl-input` with event listeners
- `sl-listbox` for searchable list
- `sl-popup` or native `<dialog>` for preview
- `sl-icon` for command icons

**Reactivity:**
- Signals: search input -> fuzzy filter -> listbox update
- Event delegation: keyboard handlers on input
- Custom event: dispatch 'command-selected' on enter

---

## Part 12: Accessibility Best Practices

**2026 Trends:**
1. Prefer native HTML elements (button, dialog, select) over custom
2. Use semantic HTML as foundation
3. ARIA only when necessary (first rule of ARIA)
4. Respect user preferences: `prefers-reduced-motion`, `prefers-contrast`, etc.

**Web Component Accessibility:**
- Shoelace handles WCAG 2.2 compliance automatically
- Shadow DOM doesn't break semantics if done right
- Keyboard navigation required (not mouse-only)
- ARIA live regions for dynamic updates
- Role, aria-label, aria-described-by for custom elements

**For Peek:**
- Use native button (not div+click)
- Use native dialog (not custom modal)
- List uses role="listbox" or native ul/li
- Card grid uses role="grid" or semantic article elements
- Command input uses role="combobox" with aria-autocomplete

---

## Part 13: Comparable Frameworks & Libraries

**Evaluated Alternatives:**

| Framework | Pros | Cons | Fit for Peek |
|-----------|------|------|--------------|
| **Lit** | Tiny, reactive, Shadow DOM | Requires JS | Ideal |
| **Shoelace** | Pre-built, styled, accessible | 50+ components bloat | Use selectively |
| **VanJS** | 1KB, vanilla JS | No Shadow DOM | Partial |
| **Riot.js** | Web Components, small | Less mature | Partial |
| **React** | Mature, huge ecosystem | Too heavy for extensions | Rejected |
| **Vue** | Good DX, smaller than React | Still framework overhead | Rejected |
| **Headless UI** | Unstyled, accessible | React-only | Framework-locked |
| **Radix UI** | Similar, more mature | React-only | Framework-locked |
| **Web Components native** | Standard, encapsulated | Verbose, less DX | Works but Lit better |

**Why not React:**
- Peek runs in browser extension context (lightweight critical)
- Component framework lock-in conflicts with extension architecture
- Virtual DOM overhead unnecessary for simple reactive updates
- Web Components give same encapsulation without React overhead

---

## Part 14: Image Viewer & Lightbox

**Recommended:** GLightbox or lightGallery

**GLightbox Features:**
- Pure JavaScript, no dependencies
- Supports images, iframes, inline HTML, videos
- Mobile/touch support
- Keyboard navigation
- 9KB gzipped

**lightGallery Features:**
- More plugins (social share, zoom, etc.)
- React.js, Vue.js, Angular support
- Responsive images + webP
- Browser history support

**For Peek:**
- Use GLightbox for lightweight image viewing
- Or build custom with Shoelace `sl-dialog` + CSS Grid carousel
- Keep dependencies minimal for extensions

---

## Part 15: Event & Stream Binding Patterns

**For Reactive "Feed System" (TODO mentions):**

**Simple Observable Implementation:**
```javascript
class Observable {
  constructor(value) {
    this.value = value;
    this.observers = [];
  }

  subscribe(callback) {
    this.observers.push(callback);
    return () => this.observers.splice(this.observers.indexOf(callback), 1);
  }

  notify(newValue) {
    this.value = newValue;
    this.observers.forEach(cb => cb(newValue));
  }
}

// Usage
const cardData = new Observable({ title: "..." });
cardData.subscribe(newData => {
  component.data = newData; // Re-render
});
```

**Signal-Based (Modern):**
```javascript
import { signal, effect } from '@lit-labs/signals';

const cardData = signal({ title: "..." });
const templateOverride = signal(null);

effect(() => {
  console.log('Data changed:', cardData.value);
  // Component re-renders automatically
});
```

**Event System:**
```javascript
// Component emits changes
component.addEventListener('data-change', (e) => {
  console.log('New data:', e.detail);
});

// Parent updates
component.updateData({ title: "New" });
```

**Stream/Feed Integration:**
```javascript
// From TODO: "binds to data source, is reactive to it (events, event-sources, streams, feeds)"
feed.subscribe((item) => {
  cardComponent.updateData(item);
  // Or with signals:
  // cardData.value = item; (auto-update)
});
```

---

## Part 16: Positioning & Floating Elements (Floating UI)

**Why Floating UI?**
- 3KB gzipped, framework-agnostic
- Handles collision detection (dropdown doesn't go offscreen)
- Responsive positioning (adapts to available space)
- Works with carousels, dropdowns, tooltips, popovers

**Use Cases for Peek:**
- Command palette suggestions dropdown
- Tag suggestions in tag input
- Tooltip on card hover
- Popover for card actions
- Carousel active item indicator

**Integration with Web Components:**
```javascript
import { computePosition, flip, shift } from '@floating-ui/dom';

class PeekDropdown extends LitElement {
  connectedCallback() {
    super.connectedCallback();

    const reference = this.parentElement;
    const floating = this.shadowRoot.querySelector('[role="listbox"]');

    computePosition(reference, floating, {
      middleware: [flip(), shift()]
    }).then(({ x, y }) => {
      floating.style.left = `${x}px`;
      floating.style.top = `${y}px`;
    });
  }
}
```

---

## Part 17: Micro Frontends & Component Distribution

**For Peek Extensions:**

**Module Federation (if using bundler):**
- Allows extensions to share components at runtime
- Each extension can load/update components independently
- Solves "replicating/forking html and js across extensions" problem from TODO

**Web Components as Distribution Unit:**
- Bundle Shoelace components as `.js` files
- Extensions import from CDN or local cache
- No build system required for consumers

**Shared Component Library:**
- `/app/components/` directory exports Web Components
- Extensions do: `<script src="/peek/components.js"></script>`
- Use immediately as `<peek-card>`, `<peek-button>`, etc.

---

## Part 18: Implementation Roadmap

**Phase 1: Foundation (Baseline)**
1. Set up Lit.js project with TypeScript
2. Create button, card, list components
3. Add CSS custom properties for theming
4. Document component API and slots

**Phase 2: Reactive System**
1. Integrate Signals for reactive state
2. Schema validation with AJV
3. Data binding between component + external source
4. Event system for component communication

**Phase 3: Complex Components**
1. Carousel (horizontal + vertical CSS scroll snap)
2. Command input with suggestions (Floating UI)
3. Grid with responsive CSS Grid
4. Dialog/modal with native `<dialog>`

**Phase 4: Component Completion & Extension System**
1. Build remaining components (native-first, Lit-based):
   - `peek-select` / `peek-combobox` - full select with native `<select>` or listbox
   - `peek-dropdown` - action menus, context menus (using Popover API)
   - `peek-switch` - toggle switch (native checkbox-based)
   - `peek-drawer` - slide-out sidebar/panel (using native `<dialog>`)
   - `peek-tooltip` - hover-triggered hints (using Popover API)
   - `peek-button-group` - segmented controls, tag sets
2. Create extension loader/theming system:
   - Theme registration API
   - Dynamic theme switching
   - Token inheritance (extensions extend base tokens)
   - CSS injection helpers for content scripts
3. Documentation for extension developers:
   - Component API reference
   - Extension integration guide
   - Theming/customization patterns
   - Usage examples

**Phase 5: Extension Distribution**
1. Bundle configuration for ESM distribution (esbuild, rollup, vite compatible)
2. Component registry API with lazy loading and dependency tracking
3. Development utilities with hot-reload support
4. Version management with semantic versioning and migration support

---

## Part 19: Security Considerations

**Shadow DOM Isolation:**
- Content script components won't leak styles to host page
- Good for preventing CSS conflicts
- Custom events with `composed: true` can pass through

**Data Binding Security:**
- No string evaluation (avoid `eval`)
- Use template literals or structured templates
- Schema validation ensures type safety

**Extension Component Sandboxing:**
- Consider iframe sandboxing for untrusted extensions
- Or iframe-less: rely on ShadowDOM isolation
- Component registration whitelist

---

## Part 20: Recommended Technology Stack

**Core:**
- **Component Framework**: Lit.js (3KB)
- **Reactivity**: @lit-labs/signals (from TC39 proposal)
- **Pre-built Components**: Shoelace Web Awesome 3.0 (selectively bundled)
- **Validation**: AJV (CodeGen mode)
- **Positioning**: Floating UI (3KB)
- **Image Viewer**: GLightbox (9KB)
- **Search**: Fuse.js (10KB)
- **Total Overhead**: ~35-40KB gzipped (acceptable for app)

**Design System:**
- CSS custom properties for theming
- Style Dictionary for token export
- Semantic HTML as foundation
- Native elements where available

**Accessibility:**
- WCAG 2.2 compliance (Shoelace provides)
- Keyboard navigation throughout
- ARIA labels where necessary
- Respect `prefers-*` user preferences

**Development:**
- TypeScript for type safety
- Storybook for component documentation
- Vitest for unit tests
- Web components testing library

---

## Part 21: Known Challenges & Mitigations

| Challenge | Mitigation |
|-----------|-----------|
| Shadow DOM styling complexity | Use CSS custom properties + ::part() API |
| Cross-component communication | Custom events with composed: true |
| Browser extension CSP conflicts | Load Shoelace from trusted CDN or bundle |
| Template binding complexity | Keep simple (data only, no logic) |
| Component versioning | Registry system tracks versions per extension |
| CSS encapsulation too strict | Slots and CSS vars provide escape hatches |
| Performance with many components | Signals enable targeted updates (not full re-render) |

---

## Part 22: Integration with Peek's Existing Systems

**With Feed System (TODO):**
- Components subscribe to feed via Observable/Signal
- Auto-update when feed emits new data
- No manual "refresh" needed

**With Command System (TODO):**
- Command palette component with suggestions
- Carousel for command chaining visualization
- Command preview pane (card with data from command)

**With Window Templates (TODO):**
- Template schema drives component instantiation
- Window template = JSON + component registry
- Override template per-extension capability

**With Chaining (TODO):**
- Card components pass data via custom events
- Preview pane shows intermediate results
- Connect components with data flow arrows (SVG overlay)

---

## Part 23: References & Resources

**Specifications:**
- [Open UI Home](https://open-ui.org/)
- [Web Components Standard - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)
- [Custom Elements - WHATWG](https://html.spec.whatwg.org/multipage/custom-elements.html)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)

**Libraries:**
- [Lit.js Official](https://lit.dev/)
- [Shoelace Web Components](https://shoelace.style/)
- [Floating UI Documentation](https://floating-ui.com/)
- [Shoelace Signals Integration](https://lit.dev/docs/data/signals/)

**Design Systems & Tokens:**
- [Design Tokens Explained - Penpot Blog](https://penpot.app/blog/the-developers-guide-to-design-tokens-and-css-variables/)
- [US Web Design System Tokens](https://designsystem.digital.gov/design-tokens/)
- [Style Dictionary Tool](https://amzn.github.io/style-dictionary/)

**Modern CSS:**
- [CSS Grid Layouts - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/)
- [Container Queries - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Container_queries)
- [CSS Scroll Snap - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Scroll_Snap)

**Frameworks & Patterns:**
- [VanJS - Lightweight Alternative](https://vanjs.org/)
- [Headless UI Pattern - Martin Fowler](https://martinfowler.com/articles/headless-component.html)
- [Micro Frontends - Martin Fowler](https://martinfowler.com/articles/micro-frontends.html)

**Form/Schema:**
- [JSON Schema Official](https://json-schema.org/)
- [AJV CodeGen Documentation](https://ajv.js.org/codegen.html)
- [JSON Typedef RFC 8927](https://jsontypedef.com/)

**Accessibility:**
- [Web Accessibility 2026 Guide](https://medium.com/design-bootcamp/modern-frontend-accessibility-a-2026-developers-guide-b2de10d01d22)
- [WebAIM 2026 Predictions](https://webaim.org/blog/2026-predictions/)

**Browser Extensions:**
- [Chrome Extension API Documentation](https://developer.chrome.com/docs/extensions/)
- [Plasmo Framework](https://www.plasmo.com/)
- [WebExtensions MDN Guide](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)

---

## Conclusion

The recommended architecture provides:
- **Simplicity**: Lit + Web Components avoid framework complexity
- **Reusability**: Components ship in shared library, no HTML/JS duplication
- **Theming**: CSS custom properties allow per-extension styling
- **Reactivity**: Signals provide reactive updates without virtual DOM
- **Standards**: Built on Open UI specs, native browser APIs
- **Lightweight**: ~40KB total overhead for full component system
- **Extensibility**: Shoelace provides pre-built options; Lit base allows custom components

This approach directly addresses the TODO's goals: flexible/reusable system, can override/inject styling, system-consistent UX, loosely coupled with deterministic management, not React-style complexity.
