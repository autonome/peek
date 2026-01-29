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

## Browser Support

Components use modern CSS features:
- CSS custom properties
- `color-mix()` for color adjustments
- `:focus-visible` for keyboard focus styles
- CSS Grid and Flexbox

Supported in all modern browsers (Chrome, Firefox, Safari, Edge).
