# Peek UI Components

A lightweight, themeable web component library built on [Lit.js](https://lit.dev/). Components use Shadow DOM for style encapsulation and CSS custom properties for theming.

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

## Browser Support

Components use modern CSS features:
- CSS custom properties
- `color-mix()` for color adjustments
- `:focus-visible` for keyboard focus styles
- CSS Grid and Flexbox

Supported in all modern browsers (Chrome, Firefox, Safari, Edge).
