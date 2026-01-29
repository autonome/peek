/**
 * Peek Grid Component
 *
 * A responsive CSS Grid layout container with auto-fit behavior.
 * Items automatically flow into available columns based on min-width.
 *
 * @element peek-grid
 *
 * @prop {number} minItemWidth - Minimum item width in pixels (default: 250)
 * @prop {number} gap - Gap between items in pixels (default: 16)
 * @prop {number} columns - Fixed column count (overrides auto-fit if set)
 * @prop {string} align - Item alignment: 'start' | 'center' | 'end' | 'stretch'
 * @prop {boolean} dense - Enable dense packing algorithm
 *
 * @slot - Default slot for grid items
 *
 * @csspart grid - The grid container
 *
 * @cssprop --peek-grid-min-item-width - Minimum item width
 * @cssprop --peek-grid-gap - Gap between items
 * @cssprop --peek-grid-columns - Fixed column count
 *
 * @example
 * <peek-grid min-item-width="300" gap="20">
 *   <peek-card>Item 1</peek-card>
 *   <peek-card>Item 2</peek-card>
 *   <peek-card>Item 3</peek-card>
 * </peek-grid>
 */

import { html, css } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

export class PeekGrid extends PeekElement {
  static properties = {
    minItemWidth: { type: Number, attribute: 'min-item-width' },
    gap: { type: Number },
    columns: { type: Number },
    align: { type: String, reflect: true },
    dense: { type: Boolean }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .grid {
        display: grid;
        grid-template-columns: var(--_grid-columns);
        gap: var(--_grid-gap);
        align-items: var(--_grid-align, stretch);
      }

      :host([dense]) .grid {
        grid-auto-flow: dense;
      }

      /* Slot styling for items */
      ::slotted(*) {
        min-width: 0; /* Prevent overflow */
      }
    `
  ];

  constructor() {
    super();
    this.minItemWidth = 250;
    this.gap = 16;
    this.columns = null;
    this.align = 'stretch';
    this.dense = false;
  }

  _getGridColumns() {
    if (this.columns) {
      return `repeat(${this.columns}, 1fr)`;
    }
    const minWidth = this.minItemWidth;
    return `repeat(auto-fit, minmax(min(${minWidth}px, 100%), 1fr))`;
  }

  _getAlignValue() {
    const alignMap = {
      start: 'start',
      center: 'center',
      end: 'end',
      stretch: 'stretch'
    };
    return alignMap[this.align] || 'stretch';
  }

  render() {
    const gridColumns = this._getGridColumns();
    const alignItems = this._getAlignValue();

    return html`
      <div
        part="grid"
        class="grid"
        style="
          --_grid-columns: ${gridColumns};
          --_grid-gap: ${this.gap}px;
          --_grid-align: ${alignItems};
        "
      >
        <slot></slot>
      </div>
    `;
  }
}

/**
 * Peek Grid Item Component
 *
 * Optional wrapper for grid items with span control.
 *
 * @element peek-grid-item
 *
 * @prop {number} colSpan - Number of columns to span
 * @prop {number} rowSpan - Number of rows to span
 *
 * @slot - Default slot for item content
 *
 * @example
 * <peek-grid>
 *   <peek-grid-item col-span="2">Wide item</peek-grid-item>
 *   <peek-grid-item>Normal item</peek-grid-item>
 * </peek-grid>
 */
export class PeekGridItem extends PeekElement {
  static properties = {
    colSpan: { type: Number, attribute: 'col-span' },
    rowSpan: { type: Number, attribute: 'row-span' }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        grid-column: var(--_col-span, auto);
        grid-row: var(--_row-span, auto);
      }
    `
  ];

  constructor() {
    super();
    this.colSpan = null;
    this.rowSpan = null;
  }

  render() {
    const colStyle = this.colSpan ? `span ${this.colSpan}` : 'auto';
    const rowStyle = this.rowSpan ? `span ${this.rowSpan}` : 'auto';

    return html`
      <style>
        :host {
          --_col-span: ${colStyle};
          --_row-span: ${rowStyle};
        }
      </style>
      <slot></slot>
    `;
  }
}

customElements.define('peek-grid', PeekGrid);
customElements.define('peek-grid-item', PeekGridItem);

export default PeekGrid;
