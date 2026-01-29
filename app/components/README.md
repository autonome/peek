# Peek UI Components

A lightweight, themeable web component library with a "native-first" approach. Uses [Lit.js](https://lit.dev/) minimally for reactive rendering while maximizing native browser APIs and following [Open UI](https://open-ui.org/) specifications.

**Native APIs Used:**
- `<dialog>` - Dialogs
- `<details>`/`<summary>` - Disclosure/accordion
- Popover API - Floating content, dropdowns
- CSS scroll-snap - Carousels
- ARIA patterns - Accessibility

## Quick Start

```html
<!-- Import all components -->
<script type="module" src="peek://app/components/index.js"></script>

<!-- Or import individually -->
<script type="module" src="peek://app/components/peek-button.js"></script>
```

```html
<!-- Use components -->
<peek-button variant="primary">Save</peek-button>
<peek-card>
  <span slot="header">Card Title</span>
  <p>Card content here</p>
</peek-card>
```

## Theming

Components inherit from the Peek theme system (`peek://theme/variables.css`). Override component tokens via CSS custom properties:

```css
/* Global theming */
:root {
  --theme-accent: #ff6b35;
  --peek-radius-md: 8px;
}

/* Component-specific overrides */
peek-button {
  --peek-btn-bg: #333;
  --peek-btn-text: #fff;
}
```

### Design Tokens

All components share these tokens:

| Token | Default | Description |
|-------|---------|-------------|
| `--peek-space-xs` | 4px | Extra small spacing |
| `--peek-space-sm` | 8px | Small spacing |
| `--peek-space-md` | 12px | Medium spacing |
| `--peek-space-lg` | 16px | Large spacing |
| `--peek-space-xl` | 24px | Extra large spacing |
| `--peek-radius-sm` | 4px | Small border radius |
| `--peek-radius-md` | 6px | Medium border radius |
| `--peek-radius-lg` | 8px | Large border radius |
| `--peek-font-sm` | 13px | Small font size |
| `--peek-font-md` | 14px | Medium font size |
| `--peek-font-lg` | 16px | Large font size |
| `--peek-shadow-sm` | ... | Small shadow |
| `--peek-shadow-md` | ... | Medium shadow |
| `--peek-shadow-lg` | ... | Large shadow |
| `--peek-transition-fast` | 100ms ease | Fast transitions |
| `--peek-transition-normal` | 150ms ease | Normal transitions |

---

## Components

### `<peek-button>`

A themeable button built on native `<button>` for accessibility.

#### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'secondary'` | Button style variant |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Button size |
| `disabled` | `boolean` | `false` | Disable the button |
| `loading` | `boolean` | `false` | Show loading spinner |
| `type` | `'button' \| 'submit' \| 'reset'` | `'button'` | Button type |

#### Slots

| Slot | Description |
|------|-------------|
| (default) | Button label content |
| `prefix` | Content before label (e.g., icon) |
| `suffix` | Content after label (e.g., icon) |

#### CSS Parts

| Part | Description |
|------|-------------|
| `button` | The native button element |

#### CSS Custom Properties

| Property | Description |
|----------|-------------|
| `--peek-btn-bg` | Button background |
| `--peek-btn-text` | Button text color |
| `--peek-btn-border` | Button border color |
| `--peek-btn-hover-bg` | Hover background |
| `--peek-btn-active-bg` | Active/pressed background |

#### Examples

```html
<!-- Variants -->
<peek-button variant="primary">Primary</peek-button>
<peek-button variant="secondary">Secondary</peek-button>
<peek-button variant="ghost">Ghost</peek-button>
<peek-button variant="danger">Delete</peek-button>

<!-- Sizes -->
<peek-button size="sm">Small</peek-button>
<peek-button size="md">Medium</peek-button>
<peek-button size="lg">Large</peek-button>

<!-- States -->
<peek-button disabled>Disabled</peek-button>
<peek-button loading>Loading</peek-button>

<!-- With icons -->
<peek-button>
  <svg slot="prefix">...</svg>
  Save
</peek-button>
```

---

### `<peek-card>`

A flexible card container with header, body, and footer slots.

#### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `interactive` | `boolean` | `false` | Make card clickable/focusable |
| `selected` | `boolean` | `false` | Visual selected state |
| `elevated` | `boolean` | `false` | Add elevation shadow |
| `bordered` | `boolean` | `true` | Show border |

#### Slots

| Slot | Description |
|------|-------------|
| (default) | Card body content |
| `header` | Card header content |
| `footer` | Card footer content |
| `media` | Media content (images), displayed edge-to-edge |

#### CSS Parts

| Part | Description |
|------|-------------|
| `card` | The card container |
| `header` | Header section |
| `body` | Body section |
| `footer` | Footer section |
| `media` | Media section |

#### CSS Custom Properties

| Property | Description |
|----------|-------------|
| `--peek-card-bg` | Card background |
| `--peek-card-border` | Card border color |
| `--peek-card-radius` | Card border radius |
| `--peek-card-padding` | Content padding |
| `--peek-card-gap` | Gap between sections |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `card-click` | `{ originalEvent }` | Fired when interactive card is clicked |

#### Examples

```html
<!-- Basic card -->
<peek-card>
  <span slot="header">Card Title</span>
  <p>Card content goes here.</p>
  <span slot="footer">Updated 2 hours ago</span>
</peek-card>

<!-- Interactive card -->
<peek-card interactive elevated>
  <img slot="media" src="image.jpg" alt="Preview">
  <h3 slot="header">Clickable Card</h3>
  <p>Click anywhere on this card.</p>
</peek-card>

<!-- Selected card -->
<peek-card selected>
  <span slot="header">Selected Item</span>
  <p>This card is in selected state.</p>
</peek-card>
```

---

### `<peek-list>` and `<peek-list-item>`

A keyboard-navigable list with selection support.

#### `<peek-list>` Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `selection` | `'none' \| 'single' \| 'multiple'` | `'none'` | Selection mode |
| `selected-index` | `number` | `-1` | Selected index (single mode) |
| `selectedIndices` | `number[]` | `[]` | Selected indices (multiple mode) |
| `wrap` | `boolean` | `false` | Wrap navigation at ends |

#### `<peek-list-item>` Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `selected` | `boolean` | `false` | Whether item is selected |
| `disabled` | `boolean` | `false` | Whether item is disabled |
| `value` | `any` | `null` | Optional value for this item |

#### Slots

**`<peek-list>`:**
| Slot | Description |
|------|-------------|
| (default) | `<peek-list-item>` elements |

**`<peek-list-item>`:**
| Slot | Description |
|------|-------------|
| (default) | Item content |
| `prefix` | Content before item (e.g., icon) |
| `suffix` | Content after item (e.g., badge) |

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `list` | `<peek-list>` | The list container |
| `item` | `<peek-list-item>` | Individual item |

#### CSS Custom Properties

| Property | Description |
|----------|-------------|
| `--peek-list-gap` | Gap between items |
| `--peek-list-padding` | List container padding |
| `--peek-list-item-bg` | Item background |
| `--peek-list-item-hover-bg` | Item hover background |
| `--peek-list-item-selected-bg` | Selected item background |
| `--peek-list-item-padding-x` | Item horizontal padding |
| `--peek-list-item-padding-y` | Item vertical padding |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `selection-change` | `{ selectedIndex, selectedIndices, item }` | Selection changed |
| `item-activate` | `{ index, item }` | Item activated (Enter/click) |

#### Keyboard Navigation

| Key | Action |
|-----|--------|
| `ArrowDown` / `j` | Move to next item |
| `ArrowUp` / `k` | Move to previous item |
| `Home` / `gg` | Move to first item |
| `End` / `G` | Move to last item |
| `Enter` / `Space` | Activate/select focused item |
| `Escape` | Clear focus |

#### Examples

```html
<!-- Single selection -->
<peek-list selection="single" @selection-change=${handleChange}>
  <peek-list-item value="1">Option 1</peek-list-item>
  <peek-list-item value="2">Option 2</peek-list-item>
  <peek-list-item value="3">Option 3</peek-list-item>
</peek-list>

<!-- Multiple selection -->
<peek-list selection="multiple" wrap>
  <peek-list-item>
    <svg slot="prefix">...</svg>
    Item with icon
    <span slot="suffix">Badge</span>
  </peek-list-item>
  <peek-list-item disabled>Disabled item</peek-list-item>
</peek-list>

<!-- Navigation list (no selection) -->
<peek-list @item-activate=${navigate}>
  <peek-list-item value="/home">Home</peek-list-item>
  <peek-list-item value="/settings">Settings</peek-list-item>
</peek-list>
```

---

## Extending Components

Create custom components by extending `PeekElement`:

```javascript
import { html, css } from 'lit';
import { PeekElement, sharedStyles } from 'peek://app/components/base.js';

class MyComponent extends PeekElement {
  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }
      /* Component styles */
    `
  ];

  render() {
    return html`<div>My component</div>`;
  }
}

customElements.define('my-component', MyComponent);
```

### PeekElement Utilities

| Method | Description |
|--------|-------------|
| `emit(name, detail, options)` | Dispatch a composed custom event |
| `classMap(classes)` | Generate class string from condition map |

---

## Reactive System

### Signals

Reactive primitives for state management. Native JavaScript implementation following the TC39 Signals proposal pattern.

```javascript
import { signal, computed, effect, batch, watch } from 'peek://app/components/signals.js';

// Create reactive value
const count = signal(0);
console.log(count.value); // 0

// Computed values auto-update
const doubled = computed(() => count.value * 2);

// Effects run when dependencies change
const dispose = effect(() => {
  console.log(`Count: ${count.value}, Doubled: ${doubled.value}`);
});

// Update triggers effect
count.value = 5; // Logs: "Count: 5, Doubled: 10"

// Batch multiple updates
batch(() => {
  count.value = 10;
  // other updates...
}); // Effects run once at end

// Watch specific signal
const stop = watch(count, (newVal, oldVal) => {
  console.log(`Changed from ${oldVal} to ${newVal}`);
});

// Cleanup
dispose();
stop();
```

#### Signal API

| Function | Description |
|----------|-------------|
| `signal(value)` | Create reactive value with `.value` getter/setter |
| `computed(fn)` | Create derived value that auto-updates |
| `effect(fn)` | Run side effects when dependencies change |
| `batch(fn)` | Batch updates, run effects once at end |
| `watch(signal, handler)` | Watch specific signal for changes |
| `fromExternal(get, set, subscribe)` | Bridge external state to signals |

---

### Schema Validation

Lightweight JSON Schema validation for component data.

```javascript
import { validate, createValidator, Schema } from 'peek://app/components/schema.js';

// Define schema
const userSchema = {
  type: 'object',
  required: ['name', 'email'],
  properties: {
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 0, default: 0 }
  }
};

// Validate data
const result = validate({ name: 'Alice', email: 'alice@example.com' }, userSchema);
// { valid: true, errors: [], data: { name: 'Alice', email: 'alice@example.com', age: 0 } }

// Create reusable validator
const validateUser = createValidator(userSchema);
validateUser({ name: '', email: 'invalid' });
// { valid: false, errors: [...] }

// Schema builders
const schema = Schema.object({
  title: Schema.string({ minLength: 1 }),
  count: Schema.integer({ minimum: 0 }),
  tags: Schema.array(Schema.string())
}, { required: ['title'] });
```

#### Supported Keywords

| Keyword | Types | Description |
|---------|-------|-------------|
| `type` | all | `string`, `number`, `integer`, `boolean`, `array`, `object`, `null` |
| `required` | object | Array of required property names |
| `properties` | object | Property schemas |
| `items` | array | Schema for array items |
| `enum` | all | Allowed values |
| `minimum`, `maximum` | number | Number bounds |
| `minLength`, `maxLength` | string | String length |
| `minItems`, `maxItems` | array | Array length |
| `pattern` | string | Regex pattern |
| `format` | string | `email`, `uri`, `date`, `date-time`, `uuid` |
| `default` | all | Default value |

---

### Data Binding

Bind components to reactive data sources with automatic updates.

```javascript
import { DataBoundElement, createDataComponent } from 'peek://app/components/data-binding.js';
import { signal } from 'peek://app/components/signals.js';
import { html, css } from 'lit';

// Extend DataBoundElement
class UserCard extends DataBoundElement {
  static dataSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      avatar: { type: 'string', format: 'uri' }
    }
  };

  render() {
    return html`
      <img src=${this.data.avatar}>
      <span>${this.data.name}</span>
    `;
  }
}
customElements.define('user-card', UserCard);

// Bind to signal
const userData = signal({ name: 'Alice', avatar: 'https://...' });
const card = document.querySelector('user-card');
card.bindTo(userData);

// Updates automatically when signal changes
userData.value = { name: 'Bob', avatar: 'https://...' };

// Or create data component dynamically
const StatusBadge = createDataComponent('status-badge', {
  schema: { type: 'object', properties: { status: { type: 'string' } } },
  render: (data) => html`<span class=${data.status}>${data.status}</span>`
});
```

#### DataBoundElement API

| Method | Description |
|--------|-------------|
| `bindTo(source, options)` | Bind to signal, observable, or data source |
| `unbind()` | Disconnect from data source |
| `updateData(key, value)` | Update single property |
| `mergeData(partial)` | Merge partial data into current |
| `data` | Get/set the data object |
| `isBound` | Check if bound to a source |

---

### Event Bus

Cross-component communication that works across Shadow DOM.

```javascript
import { on, emit, channel, waitFor, EventBusMixin } from 'peek://app/components/events.js';

// Subscribe to events
const unsubscribe = on('user:login', (user) => {
  console.log('User logged in:', user.name);
});

// Emit events
emit('user:login', { name: 'Alice', id: 123 });

// Wildcard subscriptions
on('user:*', (data, eventName) => {
  console.log(`User event: ${eventName}`, data);
});

// Namespaced channels
const userChannel = channel('user');
userChannel.on('login', handler);
userChannel.emit('login', userData);
userChannel.onAny(handler); // All 'user:*' events

// Promise-based waiting
const user = await waitFor('user:login', { timeout: 5000 });

// Replay last value
emit('config:loaded', config, { retain: true });
on('config:loaded', handler, { replay: true }); // Gets config immediately

// Unsubscribe
unsubscribe.unsubscribe();
```

#### Component Integration

```javascript
import { EventBusMixin } from 'peek://app/components/events.js';
import { PeekElement } from 'peek://app/components/base.js';

class MyComponent extends EventBusMixin(PeekElement) {
  connectedCallback() {
    super.connectedCallback();
    // Auto-cleanup on disconnect
    this.subscribe('data:update', this.handleUpdate);
  }

  handleUpdate = (data) => {
    this.data = data;
  }

  save() {
    this.publish('data:saved', this.data);
  }
}
```

#### Event Bus API

| Function | Description |
|----------|-------------|
| `on(event, handler, options)` | Subscribe to event |
| `once(event, handler)` | Subscribe once |
| `emit(event, data, options)` | Emit event |
| `channel(namespace)` | Create namespaced channel |
| `waitFor(event, options)` | Promise-based event waiting |
| `typedEvent(name)` | Create typed event emitter |
| `EventBusMixin(Base)` | Mixin for auto-cleanup subscriptions |

---

## Theme System

Dynamic theme registration, switching, and token inheritance.

```javascript
import {
  registerTheme, setTheme, getTheme,
  onThemeChange, followSystemTheme,
  ThemeMixin
} from 'peek://app/components/theme.js';

// Built-in themes: 'light', 'dark'
setTheme('dark');

// Register custom theme (extends light by default)
registerTheme('brand', {
  'theme-accent': '#ff6b35',
  'theme-bg': '#fefefe',
  'peek-radius-md': '12px'
});

// Extend a specific theme
registerTheme('brand-dark', {
  'theme-accent': '#ff8c5a'
}, { extends: 'dark' });

// Listen for theme changes
const unsubscribe = onThemeChange(({ theme, previousTheme }) => {
  console.log(`Theme changed from ${previousTheme} to ${theme}`);
});

// Auto-follow system preference (light/dark)
const stopFollowing = followSystemTheme();

// Get/set individual tokens
import { getToken, setToken } from 'peek://app/components/theme.js';
const accent = getToken('theme-accent');
setToken('theme-accent', '#00ff00');
```

### Theme API

| Function | Description |
|----------|-------------|
| `registerTheme(name, tokens, options)` | Register a custom theme |
| `setTheme(name, target?)` | Switch to a theme |
| `getTheme()` | Get current theme name |
| `getThemeTokens(name)` | Get resolved tokens (with inheritance) |
| `getToken(name)` | Get single token value |
| `setToken(name, value, target?)` | Set single token at runtime |
| `onThemeChange(listener)` | Subscribe to theme changes |
| `followSystemTheme()` | Auto-switch based on OS preference |
| `getSystemTheme()` | Get OS color scheme preference |
| `generateThemeCSS(name, selector?)` | Generate CSS string |
| `injectThemeCSS(name, root, selector?)` | Inject theme into document/shadow |
| `scopedTheme(element, tokens)` | Apply tokens to specific element |
| `ThemeMixin(Base)` | Mixin for theme-aware components |

### Available Tokens

See [Design Tokens](#design-tokens) for the full list. Key theme tokens:

| Token | Description |
|-------|-------------|
| `theme-bg` | Primary background |
| `theme-bg-secondary` | Secondary background |
| `theme-bg-tertiary` | Tertiary background |
| `theme-text` | Primary text color |
| `theme-text-secondary` | Secondary text |
| `theme-text-muted` | Muted text |
| `theme-accent` | Accent/brand color |
| `theme-border` | Border color |
| `theme-danger` | Danger/error color |
| `theme-success` | Success color |
| `theme-warning` | Warning color |

---

## Extension System

Tools for extensions to register, inject styles, and create isolated component containers.

```javascript
import {
  registerExtension,
  initContentScript,
  initPopup
} from 'peek://app/components/extension.js';

// Register extension with custom theme
const ext = registerExtension('my-extension', {
  theme: {
    'theme-accent': '#9b59b6',
    'peek-card-bg': '#f8f8f8'
  }
});

// Inject styles into document
ext.injectStyles(document);

// Create isolated shadow DOM container
const container = ext.createContainer();
container.innerHTML = '<peek-card>...</peek-card>';

// Clean up when done
ext.destroy();
```

### Content Script Usage

```javascript
import { initContentScript } from 'peek://app/components/extension.js';

// One-call setup for content scripts
const { container, context, destroy } = initContentScript({
  id: 'my-content-script',
  theme: { 'theme-accent': '#e74c3c' },
  parent: document.body,
  render: (shadow) => {
    shadow.innerHTML = `
      <peek-card>
        <span slot="header">Injected Card</span>
        <p>Content script UI</p>
      </peek-card>
    `;
  }
});

// Later: cleanup
destroy();
```

### Popup/Sidebar Usage

```javascript
import { initPopup } from 'peek://app/components/extension.js';

// Initialize popup with theming
const context = initPopup({
  id: 'my-popup',
  theme: { 'theme-accent': '#3498db' }
});
```

### Extension API

| Function | Description |
|----------|-------------|
| `registerExtension(id, options)` | Register extension, get context |
| `getExtension(id)` | Get existing extension context |
| `unregisterExtension(id)` | Unregister and cleanup |
| `initContentScript(config)` | Quick setup for content scripts |
| `initPopup(config)` | Quick setup for popups/sidebars |
| `injectStyles(root, options)` | Inject component styles |
| `createContainer(options)` | Create isolated container |

### ExtensionContext Methods

| Method | Description |
|--------|-------------|
| `injectStyles(root, options)` | Inject styles into document/shadow |
| `createContainer(options)` | Create scoped shadow DOM container |
| `setToken(name, value)` | Override token in all containers |
| `getTokens()` | Get resolved theme tokens |
| `destroy()` | Clean up all resources |

---

## Complex Components

### `<peek-carousel>`

A scroll-snap based carousel for horizontal or vertical content.

#### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `direction` | `'horizontal' \| 'vertical'` | `'horizontal'` | Scroll direction |
| `snap` | `'start' \| 'center' \| 'end'` | `'start'` | Snap alignment |
| `loop` | `boolean` | `false` | Wrap at ends |
| `controls` | `boolean` | `false` | Show prev/next buttons |
| `indicators` | `boolean` | `false` | Show position dots |
| `gap` | `number` | `12` | Gap between items (px) |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `slide-change` | `{ index, element }` | Active slide changed |

#### Methods

| Method | Description |
|--------|-------------|
| `goTo(index)` | Navigate to slide |
| `next()` | Go to next slide |
| `prev()` | Go to previous slide |

#### Example

```html
<peek-carousel controls indicators loop>
  <img src="slide1.jpg" alt="Slide 1">
  <img src="slide2.jpg" alt="Slide 2">
  <img src="slide3.jpg" alt="Slide 3">
</peek-carousel>

<!-- Vertical carousel -->
<peek-carousel direction="vertical" style="--peek-carousel-height: 400px">
  <div>Item 1</div>
  <div>Item 2</div>
</peek-carousel>
```

---

### `<peek-input>`

Input field with autocomplete suggestions dropdown.

#### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `value` | `string` | `''` | Current value |
| `placeholder` | `string` | `''` | Placeholder text |
| `type` | `'text' \| 'search' \| 'email' \| 'url'` | `'text'` | Input type |
| `disabled` | `boolean` | `false` | Disable input |
| `suggestions` | `Array` | `[]` | Suggestion items |
| `suggestion-key` | `string` | `null` | Property for label (if objects) |
| `min-chars` | `number` | `1` | Min chars before suggestions |

#### Slots

| Slot | Description |
|------|-------------|
| `prefix` | Content before input (e.g., search icon) |
| `suffix` | Content after input (e.g., clear button) |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `suggestion-select` | `{ value, item }` | Suggestion selected |

#### Example

```html
<peek-input
  placeholder="Search tags..."
  .suggestions=${['work', 'personal', 'urgent', 'todo']}
  @suggestion-select=${(e) => addTag(e.detail.value)}
>
  <svg slot="prefix"><!-- search icon --></svg>
</peek-input>

<!-- With object suggestions -->
<peek-input
  .suggestions=${[{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]}
  suggestion-key="name"
></peek-input>
```

---

### `<peek-grid>`

Responsive CSS Grid layout with auto-fit columns.

#### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `min-item-width` | `number` | `250` | Min item width (px) |
| `gap` | `number` | `16` | Gap between items (px) |
| `columns` | `number` | `null` | Fixed columns (overrides auto-fit) |
| `align` | `'start' \| 'center' \| 'end' \| 'stretch'` | `'stretch'` | Item alignment |
| `dense` | `boolean` | `false` | Dense packing |

#### Example

```html
<!-- Auto-fit grid -->
<peek-grid min-item-width="300" gap="20">
  <peek-card>Card 1</peek-card>
  <peek-card>Card 2</peek-card>
  <peek-card>Card 3</peek-card>
</peek-grid>

<!-- Fixed 3-column grid -->
<peek-grid columns="3">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</peek-grid>

<!-- With spanning items -->
<peek-grid>
  <peek-grid-item col-span="2">Wide item</peek-grid-item>
  <peek-grid-item>Normal</peek-grid-item>
  <peek-grid-item row-span="2">Tall item</peek-grid-item>
</peek-grid>
```

---

### `<peek-dialog>`

Modal/non-modal dialog using native `<dialog>` element.

#### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `open` | `boolean` | `false` | Whether dialog is open |
| `modal` | `boolean` | `true` | Modal (with backdrop) vs non-modal |
| `close-on-backdrop` | `boolean` | `true` | Close on backdrop click |
| `close-on-escape` | `boolean` | `true` | Close on Escape key |
| `size` | `'sm' \| 'md' \| 'lg' \| 'full'` | `'md'` | Dialog size |

#### Slots

| Slot | Description |
|------|-------------|
| (default) | Dialog body content |
| `header` | Dialog header/title |
| `footer` | Footer with action buttons |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `open` | — | Dialog opened |
| `close` | `{ reason }` | Dialog closed (`'escape' \| 'backdrop' \| 'close' \| 'api'`) |

#### Methods

| Method | Description |
|--------|-------------|
| `show()` | Open the dialog |
| `showModal()` | Open as modal |
| `close()` | Close the dialog |

#### Example

```html
<peek-dialog id="confirmDialog" size="sm">
  <span slot="header">Confirm Delete</span>
  <p>Are you sure you want to delete this item?</p>
  <div slot="footer">
    <peek-button variant="ghost" onclick="confirmDialog.close()">
      Cancel
    </peek-button>
    <peek-button variant="danger" onclick="deleteItem()">
      Delete
    </peek-button>
  </div>
</peek-dialog>

<peek-button onclick="confirmDialog.show()">Delete Item</peek-button>
```

---

## Native/Open UI Components

### `<peek-popover>`

Native Popover API wrapper for tooltips, dropdowns, and floating content.

#### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `mode` | `'auto' \| 'manual'` | `'auto'` | 'auto' enables light-dismiss (click outside closes) |
| `open` | `boolean` | `false` | Whether popover is open |
| `position` | `'top' \| 'bottom' \| 'left' \| 'right'` | `'bottom'` | Position relative to trigger |
| `offset` | `number` | `8` | Offset from anchor (px) |

#### Slots

| Slot | Description |
|------|-------------|
| `trigger` | Element that triggers the popover (auto-wired) |
| (default) | Popover content |

#### CSS Parts

| Part | Description |
|------|-------------|
| `popover` | The popover container |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `toggle` | `{ open }` | When open state changes |

#### Methods

| Method | Description |
|--------|-------------|
| `show()` | Open the popover |
| `hide()` | Close the popover |
| `toggle()` | Toggle open state |

#### Example

```html
<!-- Basic popover -->
<peek-popover>
  <peek-button slot="trigger">Open Menu</peek-button>
  <div>Popover content here</div>
</peek-popover>

<!-- Tooltip-style (top position) -->
<peek-popover position="top" offset="4">
  <span slot="trigger">Hover target</span>
  <span>Tooltip text</span>
</peek-popover>

<!-- Manual control (no light-dismiss) -->
<peek-popover mode="manual" id="menuPopover">
  <peek-button slot="trigger">Settings</peek-button>
  <peek-list>
    <peek-list-item @click=${() => menuPopover.hide()}>Option 1</peek-list-item>
    <peek-list-item @click=${() => menuPopover.hide()}>Option 2</peek-list-item>
  </peek-list>
</peek-popover>
```

---

### `<peek-tabs>`, `<peek-tab>`, `<peek-tab-panel>`

Accessible tabs following Open UI tablist/tab/tabpanel pattern with full ARIA support.

#### `<peek-tabs>` Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `selected` | `number` | `0` | Selected tab index |
| `activation` | `'auto' \| 'manual'` | `'auto'` | 'auto' selects on arrow keys, 'manual' requires Enter |

#### `<peek-tab>` Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `selected` | `boolean` | `false` | Whether tab is selected (managed by parent) |
| `disabled` | `boolean` | `false` | Disable this tab |

#### Slots

**`<peek-tabs>`:** Contains `<peek-tab>` elements (in tablist) and `<peek-tab-panel>` elements

**`<peek-tab>`:** Tab label content

**`<peek-tab-panel>`:** Panel content

#### CSS Parts

| Part | Element | Description |
|------|---------|-------------|
| `tablist` | `<peek-tabs>` | The tablist container |
| `tab` | `<peek-tab>` | Individual tab button |
| `panel` | `<peek-tab-panel>` | Tab panel container |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `tab-change` | `{ index, tab, panel }` | When selected tab changes |

#### Keyboard Navigation

| Key | Action |
|-----|--------|
| `ArrowLeft` / `ArrowUp` | Previous tab |
| `ArrowRight` / `ArrowDown` | Next tab |
| `Home` | First tab |
| `End` | Last tab |

#### Methods

| Method | Description |
|--------|-------------|
| `select(index)` | Select tab by index |

#### Example

```html
<peek-tabs @tab-change=${handleTabChange}>
  <peek-tab>General</peek-tab>
  <peek-tab>Advanced</peek-tab>
  <peek-tab disabled>Locked</peek-tab>

  <peek-tab-panel>
    <p>General settings content</p>
  </peek-tab-panel>
  <peek-tab-panel>
    <p>Advanced settings content</p>
  </peek-tab-panel>
  <peek-tab-panel>
    <p>This panel is not accessible</p>
  </peek-tab-panel>
</peek-tabs>

<!-- Manual activation (requires Enter to select) -->
<peek-tabs activation="manual">
  <peek-tab>Tab 1</peek-tab>
  <peek-tab>Tab 2</peek-tab>
  <peek-tab-panel>Content 1</peek-tab-panel>
  <peek-tab-panel>Content 2</peek-tab-panel>
</peek-tabs>
```

---

### `<peek-details>`

Native `<details>`/`<summary>` wrapper with styling and accordion support.

#### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `open` | `boolean` | `false` | Whether expanded |
| `name` | `string` | `null` | Accordion group name (native exclusive behavior) |

#### Slots

| Slot | Description |
|------|-------------|
| `summary` | Trigger/header content |
| (default) | Expandable content |

#### CSS Parts

| Part | Description |
|------|-------------|
| `details` | The native details element |
| `summary` | The summary/trigger |
| `content` | The expandable content area |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `toggle` | `{ open }` | When open state changes |

#### Methods

| Method | Description |
|--------|-------------|
| `show()` | Expand the details |
| `hide()` | Collapse the details |
| `toggle()` | Toggle open state |

#### Example

```html
<!-- Single disclosure -->
<peek-details>
  <span slot="summary">Click to expand</span>
  <p>Hidden content revealed when expanded.</p>
</peek-details>

<!-- Initially open -->
<peek-details open>
  <span slot="summary">Already expanded</span>
  <p>This content is visible by default.</p>
</peek-details>

<!-- Exclusive accordion (native behavior) -->
<peek-details name="faq">
  <span slot="summary">Question 1</span>
  <p>Answer 1</p>
</peek-details>
<peek-details name="faq">
  <span slot="summary">Question 2</span>
  <p>Answer 2</p>
</peek-details>
<peek-details name="faq">
  <span slot="summary">Question 3</span>
  <p>Answer 3</p>
</peek-details>
```

---

## Phase 4 Components

### `<peek-select>`

Select/combobox with native and custom modes.

#### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `value` | `string` | `''` | Selected value |
| `placeholder` | `string` | `'Select...'` | Placeholder text |
| `disabled` | `boolean` | `false` | Disable the select |
| `required` | `boolean` | `false` | Mark as required |
| `multiple` | `boolean` | `false` | Allow multiple (native mode only) |
| `mode` | `'native' \| 'custom'` | `'native'` | Native `<select>` or custom Popover |
| `options` | `Array` | `[]` | Options: strings or `{ value, label, disabled }` |
| `name` | `string` | `''` | Form field name |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `change` | `{ value, option }` | When selection changes |

#### Example

```html
<!-- Native select -->
<peek-select
  placeholder="Choose a color"
  .options=${['Red', 'Green', 'Blue']}
  @change=${(e) => console.log(e.detail.value)}
></peek-select>

<!-- Custom styled select -->
<peek-select
  mode="custom"
  .options=${[
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Medium' },
    { value: 'lg', label: 'Large', disabled: true }
  ]}
></peek-select>
```

---

### `<peek-dropdown>`, `<peek-dropdown-item>`, `<peek-dropdown-divider>`

Action menu / context menu using Popover API.

#### `<peek-dropdown>` Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `open` | `boolean` | `false` | Whether dropdown is open |
| `position` | `'bottom-start' \| 'bottom-end' \| 'top-start' \| 'top-end'` | `'bottom-start'` | Position relative to trigger |
| `disabled` | `boolean` | `false` | Disable the trigger |

#### `<peek-dropdown-item>` Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `value` | `string` | `''` | Item value |
| `disabled` | `boolean` | `false` | Disable this item |
| `danger` | `boolean` | `false` | Style as destructive action |

#### Slots

**`<peek-dropdown>`:**
| Slot | Description |
|------|-------------|
| `trigger` | Element that triggers the dropdown |
| (default) | Menu content |

**`<peek-dropdown-item>`:**
| Slot | Description |
|------|-------------|
| `prefix` | Icon before label |
| (default) | Item label |
| `suffix` | Shortcut text after label |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `open` | — | When dropdown opens |
| `close` | — | When dropdown closes |
| `select` | `{ value, item }` | When item is selected |

#### Example

```html
<peek-dropdown @select=${(e) => handleAction(e.detail.value)}>
  <peek-button slot="trigger">Actions</peek-button>

  <peek-dropdown-item value="edit">
    <svg slot="prefix">...</svg>
    Edit
    <span slot="suffix">⌘E</span>
  </peek-dropdown-item>
  <peek-dropdown-item value="duplicate">Duplicate</peek-dropdown-item>
  <peek-dropdown-divider></peek-dropdown-divider>
  <peek-dropdown-item value="delete" danger>Delete</peek-dropdown-item>
</peek-dropdown>
```

---

### `<peek-switch>`

Toggle switch built on native checkbox.

#### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `checked` | `boolean` | `false` | Whether switch is on |
| `disabled` | `boolean` | `false` | Disable the switch |
| `name` | `string` | `''` | Form field name |
| `value` | `string` | `'on'` | Form value when checked |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Switch size |

#### Slots

| Slot | Description |
|------|-------------|
| (default) | Label text |
| `on` | Content shown when on (inside track) |
| `off` | Content shown when off (inside track) |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `change` | `{ checked }` | When checked state changes |

#### Methods

| Method | Description |
|--------|-------------|
| `toggle()` | Toggle checked state |

#### Example

```html
<!-- Basic switch -->
<peek-switch @change=${(e) => setDarkMode(e.detail.checked)}>
  Dark mode
</peek-switch>

<!-- With on/off labels -->
<peek-switch checked>
  <span slot="on">ON</span>
  <span slot="off">OFF</span>
  Notifications
</peek-switch>

<!-- Sizes -->
<peek-switch size="sm">Small</peek-switch>
<peek-switch size="lg">Large</peek-switch>
```

---

### `<peek-drawer>`

Slide-out panel using native `<dialog>`.

#### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `open` | `boolean` | `false` | Whether drawer is open |
| `position` | `'left' \| 'right' \| 'top' \| 'bottom'` | `'left'` | Slide direction |
| `size` | `'sm' \| 'md' \| 'lg' \| 'full'` or CSS value | `'md'` | Drawer size |
| `modal` | `boolean` | `true` | Show with backdrop |
| `close-on-backdrop` | `boolean` | `true` | Close on backdrop click |
| `close-on-escape` | `boolean` | `true` | Close on Escape key |
| `contained` | `boolean` | `false` | Constrain to parent instead of viewport |

#### Slots

| Slot | Description |
|------|-------------|
| `header` | Drawer header/title |
| (default) | Drawer content |
| `footer` | Footer with actions |

#### CSS Parts

| Part | Description |
|------|-------------|
| `drawer` | The dialog element |
| `header` | Header section |
| `body` | Body section |
| `footer` | Footer section |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `open` | — | When drawer opens |
| `close` | `{ reason }` | When drawer closes (`'escape' \| 'backdrop' \| 'close' \| 'api'`) |

#### Methods

| Method | Description |
|--------|-------------|
| `show()` | Open the drawer |
| `showModal()` | Open as modal |
| `close()` | Close the drawer |

#### Example

```html
<peek-drawer id="settingsDrawer" position="right" size="400px">
  <span slot="header">Settings</span>

  <peek-list>
    <peek-list-item>Profile</peek-list-item>
    <peek-list-item>Preferences</peek-list-item>
    <peek-list-item>Security</peek-list-item>
  </peek-list>

  <div slot="footer">
    <peek-button @click=${() => settingsDrawer.close()}>Close</peek-button>
  </div>
</peek-drawer>

<peek-button @click=${() => settingsDrawer.show()}>Open Settings</peek-button>
```

---

### `<peek-tooltip>`

Hover-triggered tooltip using Popover API.

#### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `content` | `string` | `''` | Tooltip text |
| `position` | `'top' \| 'bottom' \| 'left' \| 'right'` | `'top'` | Position relative to target |
| `delay` | `number` | `200` | Delay before showing (ms) |
| `disabled` | `boolean` | `false` | Disable the tooltip |

#### Slots

| Slot | Description |
|------|-------------|
| (default) | Target element |

#### Methods

| Method | Description |
|--------|-------------|
| `show()` | Show tooltip immediately |
| `hide()` | Hide tooltip |

#### Example

```html
<!-- Basic tooltip -->
<peek-tooltip content="Save your changes">
  <peek-button>Save</peek-button>
</peek-tooltip>

<!-- Different positions -->
<peek-tooltip content="Top" position="top">
  <span>Hover me</span>
</peek-tooltip>

<peek-tooltip content="Right side" position="right" delay="0">
  <span>Instant tooltip</span>
</peek-tooltip>
```

---

### `<peek-button-group>`, `<peek-button-group-item>`

Segmented controls and tag sets with selection.

#### `<peek-button-group>` Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `value` | `string` | `''` | Selected value (single selection) |
| `values` | `Array` | `[]` | Selected values (multiple selection) |
| `selection` | `'none' \| 'single' \| 'multiple'` | `'single'` | Selection mode |
| `variant` | `'outline' \| 'ghost'` | `'outline'` | Visual style |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Button size |
| `disabled` | `boolean` | `false` | Disable all buttons |

#### `<peek-button-group-item>` Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `value` | `string` | `''` | Item value |
| `disabled` | `boolean` | `false` | Disable this item |

#### Slots

**`<peek-button-group-item>`:**
| Slot | Description |
|------|-------------|
| `prefix` | Icon before label |
| (default) | Button label |
| `suffix` | Icon after label |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `change` | `{ value, values }` | When selection changes |

#### Methods

| Method | Description |
|--------|-------------|
| `select(value)` | Select an item |
| `deselect(value)` | Deselect an item |
| `clear()` | Clear all selections |

#### Example

```html
<!-- Segmented control (single selection) -->
<peek-button-group value="day" @change=${(e) => setView(e.detail.value)}>
  <peek-button-group-item value="day">Day</peek-button-group-item>
  <peek-button-group-item value="week">Week</peek-button-group-item>
  <peek-button-group-item value="month">Month</peek-button-group-item>
</peek-button-group>

<!-- Tag set (multiple selection) -->
<peek-button-group
  selection="multiple"
  variant="ghost"
  .values=${['urgent', 'work']}
>
  <peek-button-group-item value="urgent">Urgent</peek-button-group-item>
  <peek-button-group-item value="work">Work</peek-button-group-item>
  <peek-button-group-item value="personal">Personal</peek-button-group-item>
</peek-button-group>

<!-- With icons -->
<peek-button-group selection="single" size="sm">
  <peek-button-group-item value="list">
    <svg slot="prefix">...</svg>
  </peek-button-group-item>
  <peek-button-group-item value="grid">
    <svg slot="prefix">...</svg>
  </peek-button-group-item>
</peek-button-group>
```

---

## Browser Support

Components use modern CSS and HTML features:

**CSS:**
- CSS custom properties
- `color-mix()` for color adjustments
- `:focus-visible` for keyboard focus styles
- CSS Grid and Flexbox
- CSS scroll-snap (carousels)
- `@starting-style` for entry animations

**Native APIs:**
- Popover API (`popover` attribute, `showPopover()`) - Chrome 114+, Safari 17+, Firefox 125+
- `<dialog>` element - All modern browsers
- `<details>`/`<summary>` elements - All modern browsers
- `name` attribute for exclusive accordions - Chrome 120+, Safari 17.2+

Supported in all modern browsers (Chrome 120+, Firefox 125+, Safari 17.2+, Edge 120+).

---

## Extension Developer Guide

Complete guide for building Peek extensions with the component library.

### Getting Started

```javascript
// Import components you need
import {
  PeekButton, PeekCard, PeekList,
  registerExtension, setTheme
} from 'peek://app/components/index.js';

// Or import everything
import 'peek://app/components/index.js';
```

### Project Structure

```
my-extension/
├── manifest.json
├── background.js
├── content.js          # Content script
├── popup/
│   ├── popup.html
│   └── popup.js
└── styles/
    └── theme.js        # Custom theme tokens
```

### Content Script Pattern

Content scripts need style isolation to avoid conflicts with host pages:

```javascript
// content.js
import { initContentScript } from 'peek://app/components/extension.js';

const { container, destroy } = initContentScript({
  id: 'my-extension',
  theme: {
    'theme-accent': '#9b59b6'
  },
  render: (shadow) => {
    // Shadow DOM container - styles are isolated
    shadow.innerHTML = `
      <div class="my-extension-ui">
        <peek-card>
          <span slot="header">My Extension</span>
          <peek-list selection="single">
            <peek-list-item value="1">Item 1</peek-list-item>
            <peek-list-item value="2">Item 2</peek-list-item>
          </peek-list>
          <div slot="footer">
            <peek-button variant="primary">Action</peek-button>
          </div>
        </peek-card>
      </div>
    `;

    // Add event listeners
    shadow.querySelector('peek-list').addEventListener('selection-change', (e) => {
      console.log('Selected:', e.detail);
    });
  }
});

// Cleanup when extension unloads
window.addEventListener('unload', destroy);
```

### Popup Pattern

```html
<!-- popup.html -->
<!DOCTYPE html>
<html>
<head>
  <style>
    body { width: 320px; padding: 16px; margin: 0; }
  </style>
</head>
<body>
  <peek-card>
    <span slot="header">Settings</span>
    <peek-switch id="darkMode">Dark Mode</peek-switch>
    <peek-select id="theme" placeholder="Choose theme"></peek-select>
  </peek-card>
  <script type="module" src="popup.js"></script>
</body>
</html>
```

```javascript
// popup.js
import { initPopup, setTheme, getThemeNames } from 'peek://app/components/index.js';

initPopup({ id: 'my-popup' });

// Setup theme selector
const themeSelect = document.getElementById('theme');
themeSelect.options = getThemeNames();
themeSelect.addEventListener('change', (e) => setTheme(e.detail.value));

// Dark mode toggle
document.getElementById('darkMode').addEventListener('change', (e) => {
  setTheme(e.detail.checked ? 'dark' : 'light');
});
```

### Custom Theming

```javascript
// theme.js - Define your extension's theme
import { registerTheme } from 'peek://app/components/theme.js';

// Extend the light theme
registerTheme('my-brand', {
  'theme-accent': '#e74c3c',
  'theme-accent-hover': '#c0392b',
  'peek-radius-md': '8px',
  'peek-btn-height-md': '40px'
});

// Dark variant
registerTheme('my-brand-dark', {
  'theme-accent': '#e74c3c',
  'theme-bg': '#1e1e1e',
  'theme-text': '#f0f0f0'
}, { extends: 'dark' });

export { 'my-brand', 'my-brand-dark' };
```

### Data-Driven Components

```javascript
import { signal, effect } from 'peek://app/components/signals.js';
import { DataBoundElement } from 'peek://app/components/data-binding.js';

// Create reactive data
const items = signal([
  { id: 1, name: 'Task 1', done: false },
  { id: 2, name: 'Task 2', done: true }
]);

// Update UI automatically when data changes
effect(() => {
  const list = document.querySelector('peek-list');
  list.innerHTML = items.value.map(item => `
    <peek-list-item value="${item.id}" ${item.done ? 'selected' : ''}>
      ${item.name}
    </peek-list-item>
  `).join('');
});

// Add item
function addItem(name) {
  items.value = [...items.value, { id: Date.now(), name, done: false }];
}
```

### Cross-Component Communication

```javascript
import { on, emit, channel } from 'peek://app/components/events.js';

// Create namespaced channel
const taskChannel = channel('tasks');

// Subscribe to events
taskChannel.on('add', (task) => {
  console.log('Task added:', task);
});

taskChannel.on('complete', (taskId) => {
  console.log('Task completed:', taskId);
});

// Emit events
taskChannel.emit('add', { id: 1, name: 'New task' });

// Wait for event (async)
const task = await taskChannel.waitFor('add', { timeout: 5000 });
```

### Form Validation

```javascript
import { validate, Schema } from 'peek://app/components/schema.js';

const formSchema = Schema.object({
  email: Schema.string({ format: 'email' }),
  password: Schema.string({ minLength: 8 }),
  age: Schema.integer({ minimum: 18 })
}, { required: ['email', 'password'] });

function handleSubmit(formData) {
  const result = validate(formData, formSchema);

  if (!result.valid) {
    result.errors.forEach(err => {
      console.error(`${err.path}: ${err.message}`);
    });
    return;
  }

  // Process valid data
  submitForm(result.data);
}
```

### Responsive Layouts

```html
<!-- Auto-fit grid -->
<peek-grid min-item-width="200" gap="16">
  <peek-card>Card 1</peek-card>
  <peek-card>Card 2</peek-card>
  <peek-card>Card 3</peek-card>
</peek-grid>

<!-- Fixed columns -->
<peek-grid columns="2">
  <peek-grid-item col-span="2">Wide item</peek-grid-item>
  <peek-grid-item>Normal</peek-grid-item>
  <peek-grid-item>Normal</peek-grid-item>
</peek-grid>
```

### Accessibility Patterns

```html
<!-- Keyboard navigable list with selection -->
<peek-list selection="single" wrap>
  <peek-list-item value="opt1">Option 1</peek-list-item>
  <peek-list-item value="opt2">Option 2</peek-list-item>
  <peek-list-item value="opt3" disabled>Disabled</peek-list-item>
</peek-list>

<!-- Accessible tabs -->
<peek-tabs>
  <peek-tab>General</peek-tab>
  <peek-tab>Advanced</peek-tab>
  <peek-tab-panel>General content</peek-tab-panel>
  <peek-tab-panel>Advanced content</peek-tab-panel>
</peek-tabs>

<!-- Accessible dialog -->
<peek-dialog id="confirmDialog" size="sm" close-on-escape>
  <span slot="header">Confirm Action</span>
  <p>Are you sure?</p>
  <div slot="footer">
    <peek-button variant="ghost" onclick="confirmDialog.close()">Cancel</peek-button>
    <peek-button variant="danger" onclick="doAction()">Confirm</peek-button>
  </div>
</peek-dialog>
```

### Component Customization

#### Via CSS Custom Properties

```css
/* Global customization */
:root {
  --peek-radius-md: 12px;
  --peek-btn-height-md: 42px;
}

/* Component-specific */
peek-button {
  --peek-btn-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

peek-card {
  --peek-card-bg: #f8f9fa;
  --peek-card-border: transparent;
  --peek-card-radius: 16px;
}
```

#### Via CSS Parts

```css
/* Style shadow DOM parts */
peek-button::part(button) {
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

peek-card::part(header) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

peek-dialog::part(backdrop) {
  backdrop-filter: blur(4px);
}
```

#### Via Slots

```html
<!-- Replace default content with custom markup -->
<peek-card>
  <div slot="header">
    <img src="icon.png" alt="">
    <h3>Custom Header</h3>
  </div>
  <div slot="media">
    <video src="preview.mp4" autoplay muted loop></video>
  </div>
  <p>Card body with custom header and video media.</p>
</peek-card>
```

### Best Practices

1. **Use Shadow DOM for content scripts** - Always use `createContainer()` or `initContentScript()` to isolate styles from host pages.

2. **Prefer native elements** - Components wrap native elements (`<dialog>`, `<details>`, `<select>`) for maximum accessibility.

3. **Use signals for shared state** - Signals provide efficient reactive updates without framework overhead.

4. **Theme inheritance** - Extend existing themes rather than defining all tokens from scratch.

5. **Event composition** - Use `composed: true` for custom events that need to cross shadow boundaries.

6. **Cleanup resources** - Call `destroy()` on extension contexts when unloading to prevent memory leaks.

7. **Keyboard navigation** - All interactive components support keyboard navigation out of the box.

---

## Component Registry

Dynamic component registration, lazy loading, and dependency management.

```javascript
import {
  registry, defineComponent, loadComponent,
  createElement, whenDefined
} from 'peek://app/components/registry.js';

// Check registry stats
console.log(registry.stats());
// { version: '1.0.0', total: 22, pending: 22, loading: 0, loaded: 0, error: 0 }

// Load a component on demand
await loadComponent('peek-dialog');

// Load multiple components
await loadComponents(['peek-button', 'peek-card', 'peek-list']);

// Preload components without waiting
preloadComponents(['peek-drawer', 'peek-tabs']);

// Wait for component to be defined
const PeekButton = await whenDefined('peek-button');

// Create element with initial props
const button = await createElement('peek-button', {
  variant: 'primary',
  loading: true
});
document.body.appendChild(button);

// Register custom component
defineComponent('my-widget', {
  version: '1.0.0',
  module: () => import('./my-widget.js'),
  dependencies: ['peek-card', 'peek-button']
});
```

### Registry API

| Function | Description |
|----------|-------------|
| `defineComponent(name, def)` | Register a component |
| `undefineComponent(name)` | Unregister a component |
| `hasComponent(name)` | Check if registered |
| `getComponent(name)` | Get component definition |
| `loadComponent(name)` | Load component and dependencies |
| `loadComponents(names)` | Load multiple components |
| `preloadComponents(names)` | Preload without waiting |
| `whenDefined(name, timeout?)` | Wait for component definition |
| `createElement(name, props)` | Create and configure element |

---

## Version Management

Semantic versioning, compatibility checking, and migrations.

```javascript
import {
  version, LIBRARY_VERSION,
  checkCompatibility, satisfies,
  getChangelog, getBreakingChanges,
  registerMigration, migrate
} from 'peek://app/components/version.js';

// Current version
console.log(version.current); // '1.0.0'

// Check compatibility
if (checkCompatibility('>=1.0.0')) {
  // Safe to use current features
}

// Version constraint checking
satisfies('1.2.3', '>=1.0.0'); // true
satisfies('1.2.3', '^1.0.0');  // true (same major)
satisfies('1.2.3', '~1.2.0');  // true (same major.minor)

// Get changelog
const changes = getChangelog('0.9.0', '1.0.0');
const breaking = getBreakingChanges('0.9.0');

// Register migration
registerMigration('0.9.0', '1.0.0', async (data) => {
  // Transform data for new version
  return { ...data, newField: 'default' };
});

// Run migration
const migratedData = await migrate(oldData, '0.9.0', '1.0.0');
```

---

## Bundle Configuration

Configuration for building distribution bundles with any ESM bundler.

```javascript
import {
  bundleConfig, generateImportMap,
  getEntryPoints, PRESETS
} from 'peek://app/components/bundle.js';

// Available presets
console.log(Object.keys(PRESETS));
// ['full', 'core', 'minimal', 'basic', 'forms', 'layout', 'interactive']

// Get entry points for a preset
const entries = getEntryPoints('forms');
// { base: './base.js', 'peek-button': './peek-button.js', ... }

// Generate import map for native ESM
const importMap = generateImportMap('/components/', 'full');
// { imports: { 'peek://app/components/': '/components/', ... } }

// Get bundler-specific config
const config = bundleConfig({
  preset: 'full',
  format: 'esm',
  minify: true,
  outdir: 'dist'
});

// Use with esbuild
// esbuild.build(config.esbuild);

// Use with rollup
// rollup(config.rollup);

// Use with vite
// vite.build(config.vite);
```

### Bundle Presets

| Preset | Description | Size |
|--------|-------------|------|
| `full` | Complete library | ~50KB |
| `core` | Utilities only, no components | ~15KB |
| `minimal` | Base, signals, events | ~8KB |
| `basic` | Button, card, list | ~12KB |
| `forms` | Form components | ~18KB |
| `layout` | Layout components | ~20KB |
| `interactive` | Menus and popovers | ~16KB |

---

## Development Tools

Debugging and hot-reload utilities for development.

```javascript
// Only import in development
import { devTools, enableDevMode, enableHotReload } from 'peek://app/components/dev.js';

// Enable dev mode (adds window.__PEEK_DEV__)
enableDevMode();

// Connect to hot-reload server
enableHotReload({
  url: 'ws://localhost:35729/livereload',
  reconnectDelay: 1000
});

// Inspect a component
devTools.inspect('peek-button');
// Logs: definition, load state, properties, attributes, shadow root

// List all components
devTools.list();
// Table: name, state, defined, instances

// Get stats
devTools.stats();
// { version, components, theme, extensions, devMode, hotReload }

// Create scoped logger
const log = devTools.logger('my-component');
log.debug('Only in dev mode');
log.time('render');
// ... render ...
log.timeEnd('render');
```

### Performance Profiling

```javascript
import { ProfilerMixin, startTiming, endTiming } from 'peek://app/components/dev.js';

// Manual timing
startTiming('my-operation');
// ... operation ...
const duration = endTiming('my-operation');

// Mixin for automatic render timing
class MyComponent extends ProfilerMixin(PeekElement) {
  // Renders are automatically timed
  // Warns if render takes > 16ms (one frame)
}
```

### Console Access

When dev mode is enabled, access tools via browser console:

```javascript
// In browser console
__PEEK_DEV__.inspect('peek-card');
__PEEK_DEV__.list();
__PEEK_DEV__.stats();
__PEEK_DEV__.theme.current();
__PEEK_DEV__.registry.names();
```

---

## Testing

Component tests use Playwright with an embedded HTTP server for ESM module loading.

### Running Tests

```bash
npx playwright test tests/components/ --project=components
```

### Test Coverage

56 tests covering all 16 components:

| Component | Tests | Coverage |
|-----------|-------|----------|
| `peek-button` | 6 | variants, sizes, disabled, loading, events |
| `peek-card` | 3 | slots, interactive, selected |
| `peek-list` | 2 | items, disabled |
| `peek-input` | 2 | value, disabled |
| `peek-select` | 2 | native mode, custom mode |
| `peek-switch` | 3 | default, checked, toggle |
| `peek-dialog` | 2 | open, close |
| `peek-tabs` | 3 | selection, panel visibility |
| `peek-details` | 2 | closed, open |
| `peek-dropdown` | 1 | closed default |
| `peek-button-group` | 1 | initial selection |
| `peek-carousel` | 6 | slides, controls, indicators, navigation |
| `peek-grid` | 4 | container, auto-fit, fixed columns, gap |
| `peek-popover` | 3 | state, trigger slot, popover element |
| `peek-drawer` | 4 | state, dialog, open/close |
| `peek-tooltip` | 4 | content, mode, role, position |

Plus 4 component combo tests and 4 accessibility tests.

### Test Infrastructure

- `tests/components/test-page.html` - Test fixtures with all components
- `tests/components/components.spec.ts` - Playwright test suite
- Embedded HTTP server serves ESM modules with proper MIME types
- Import maps resolve `lit` and dependencies from `node_modules`

### Writing Tests

Tests use `waitForFunction` for deterministic state checks:

```typescript
// Wait for dialog to open (deterministic)
await page.waitForFunction(() => {
  const el = document.querySelector('#my-dialog') as any;
  return el?.open === true;
});

// Avoid arbitrary timeouts (flaky)
// await page.waitForTimeout(100);  // Don't do this
```

Access shadow DOM via `page.evaluate`:

```typescript
const hasSpinner = await page.evaluate(() => {
  const el = document.querySelector('#btn-loading');
  const spinner = el?.shadowRoot?.querySelector('.spinner');
  return !!spinner;
});
```
