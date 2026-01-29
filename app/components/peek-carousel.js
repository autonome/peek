/**
 * Peek Carousel Component
 *
 * A scroll-snap based carousel supporting horizontal and vertical layouts.
 * Uses native CSS scroll-snap for smooth, accessible scrolling.
 *
 * @element peek-carousel
 *
 * @prop {string} direction - Scroll direction: 'horizontal' | 'vertical'
 * @prop {string} snap - Snap alignment: 'start' | 'center' | 'end'
 * @prop {boolean} loop - Enable infinite loop (wraps at ends)
 * @prop {boolean} controls - Show prev/next navigation buttons
 * @prop {boolean} indicators - Show position indicators
 * @prop {number} gap - Gap between items in pixels
 *
 * @slot - Default slot for carousel items
 *
 * @csspart container - The scroll container
 * @csspart prev - Previous button
 * @csspart next - Next button
 * @csspart indicators - Indicators container
 * @csspart indicator - Individual indicator dot
 *
 * @cssprop --peek-carousel-gap - Gap between items
 * @cssprop --peek-carousel-height - Container height (vertical mode)
 *
 * @fires slide-change - When active slide changes. Detail: { index, element }
 *
 * @example
 * <peek-carousel controls indicators>
 *   <div>Slide 1</div>
 *   <div>Slide 2</div>
 *   <div>Slide 3</div>
 * </peek-carousel>
 */

import { html, css, nothing } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

export class PeekCarousel extends PeekElement {
  static properties = {
    direction: { type: String, reflect: true },
    snap: { type: String, reflect: true },
    loop: { type: Boolean },
    controls: { type: Boolean },
    indicators: { type: Boolean },
    gap: { type: Number },
    _activeIndex: { type: Number, state: true },
    _itemCount: { type: Number, state: true }
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        position: relative;
      }

      .carousel {
        display: flex;
        overflow: auto;
        scroll-behavior: smooth;
        scrollbar-width: none;
        -ms-overflow-style: none;
        gap: var(--peek-carousel-gap, var(--peek-space-md));
      }

      .carousel::-webkit-scrollbar {
        display: none;
      }

      /* Horizontal (default) */
      :host([direction="horizontal"]) .carousel,
      :host(:not([direction])) .carousel {
        flex-direction: row;
        scroll-snap-type: x mandatory;
      }

      /* Vertical */
      :host([direction="vertical"]) .carousel {
        flex-direction: column;
        scroll-snap-type: y mandatory;
        height: var(--peek-carousel-height, 300px);
      }

      /* Snap alignment */
      ::slotted(*) {
        scroll-snap-align: start;
        flex-shrink: 0;
      }

      :host([snap="center"]) ::slotted(*) {
        scroll-snap-align: center;
      }

      :host([snap="end"]) ::slotted(*) {
        scroll-snap-align: end;
      }

      /* Controls */
      .controls {
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        transform: translateY(-50%);
        display: flex;
        justify-content: space-between;
        pointer-events: none;
        padding: 0 var(--peek-space-sm);
      }

      :host([direction="vertical"]) .controls {
        top: 0;
        bottom: 0;
        left: 50%;
        right: auto;
        transform: translateX(-50%);
        flex-direction: column;
        justify-content: space-between;
        padding: var(--peek-space-sm) 0;
      }

      .control-btn {
        pointer-events: auto;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: var(--peek-radius-full);
        background: var(--theme-bg-secondary, rgba(255, 255, 255, 0.9));
        color: var(--theme-text, #333);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        box-shadow: var(--peek-shadow-md);
        transition: background var(--peek-transition-fast),
                    transform var(--peek-transition-fast);
      }

      .control-btn:hover {
        background: var(--theme-bg-tertiary, #f0f0f0);
        transform: scale(1.05);
      }

      .control-btn:active {
        transform: scale(0.95);
      }

      .control-btn:disabled {
        opacity: 0.3;
        cursor: default;
        transform: none;
      }

      /* Indicators */
      .indicators {
        display: flex;
        justify-content: center;
        gap: var(--peek-space-sm);
        padding: var(--peek-space-md);
      }

      :host([direction="vertical"]) .indicators {
        position: absolute;
        right: var(--peek-space-sm);
        top: 50%;
        transform: translateY(-50%);
        flex-direction: column;
        padding: var(--peek-space-sm);
      }

      .indicator {
        width: 8px;
        height: 8px;
        border-radius: var(--peek-radius-full);
        background: var(--theme-border, #ccc);
        border: none;
        padding: 0;
        cursor: pointer;
        transition: background var(--peek-transition-fast),
                    transform var(--peek-transition-fast);
      }

      .indicator:hover {
        background: var(--theme-text-muted, #999);
        transform: scale(1.2);
      }

      .indicator.active {
        background: var(--theme-accent, #007aff);
      }
    `
  ];

  constructor() {
    super();
    this.direction = 'horizontal';
    this.snap = 'start';
    this.loop = false;
    this.controls = false;
    this.indicators = false;
    this.gap = 12;
    this._activeIndex = 0;
    this._itemCount = 0;
    this._scrollTimeout = null;
  }

  get items() {
    const slot = this.shadowRoot?.querySelector('slot');
    return slot?.assignedElements() || [];
  }

  firstUpdated() {
    this._updateItemCount();
    this._setupScrollListener();
  }

  _setupScrollListener() {
    const container = this.shadowRoot?.querySelector('.carousel');
    if (!container) return;

    container.addEventListener('scroll', () => {
      // Debounce scroll updates
      clearTimeout(this._scrollTimeout);
      this._scrollTimeout = setTimeout(() => {
        this._updateActiveIndex();
      }, 50);
    });
  }

  _updateItemCount() {
    this._itemCount = this.items.length;
  }

  _updateActiveIndex() {
    const container = this.shadowRoot?.querySelector('.carousel');
    const items = this.items;
    if (!container || items.length === 0) return;

    const isVertical = this.direction === 'vertical';
    const containerRect = container.getBoundingClientRect();
    const containerCenter = isVertical
      ? containerRect.top + containerRect.height / 2
      : containerRect.left + containerRect.width / 2;

    let closestIndex = 0;
    let closestDistance = Infinity;

    items.forEach((item, index) => {
      const rect = item.getBoundingClientRect();
      const itemCenter = isVertical
        ? rect.top + rect.height / 2
        : rect.left + rect.width / 2;
      const distance = Math.abs(containerCenter - itemCenter);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex !== this._activeIndex) {
      this._activeIndex = closestIndex;
      this.emit('slide-change', {
        index: closestIndex,
        element: items[closestIndex]
      });
    }
  }

  _scrollTo(index) {
    const items = this.items;
    if (index < 0 || index >= items.length) return;

    const container = this.shadowRoot?.querySelector('.carousel');
    const item = items[index];
    if (!container || !item) return;

    item.scrollIntoView({
      behavior: 'smooth',
      block: this.direction === 'vertical' ? this.snap : 'nearest',
      inline: this.direction === 'horizontal' ? this.snap : 'nearest'
    });
  }

  _handlePrev() {
    let newIndex = this._activeIndex - 1;
    if (newIndex < 0) {
      newIndex = this.loop ? this._itemCount - 1 : 0;
    }
    this._scrollTo(newIndex);
  }

  _handleNext() {
    let newIndex = this._activeIndex + 1;
    if (newIndex >= this._itemCount) {
      newIndex = this.loop ? 0 : this._itemCount - 1;
    }
    this._scrollTo(newIndex);
  }

  _handleIndicatorClick(index) {
    this._scrollTo(index);
  }

  _handleKeydown(e) {
    const isVertical = this.direction === 'vertical';

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        if ((isVertical && e.key === 'ArrowUp') || (!isVertical && e.key === 'ArrowLeft')) {
          e.preventDefault();
          this._handlePrev();
        }
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        if ((isVertical && e.key === 'ArrowDown') || (!isVertical && e.key === 'ArrowRight')) {
          e.preventDefault();
          this._handleNext();
        }
        break;
      case 'Home':
        e.preventDefault();
        this._scrollTo(0);
        break;
      case 'End':
        e.preventDefault();
        this._scrollTo(this._itemCount - 1);
        break;
    }
  }

  render() {
    const prevDisabled = !this.loop && this._activeIndex === 0;
    const nextDisabled = !this.loop && this._activeIndex === this._itemCount - 1;
    const isVertical = this.direction === 'vertical';

    return html`
      <div
        class="carousel"
        part="container"
        role="region"
        aria-label="Carousel"
        tabindex="0"
        style="gap: ${this.gap}px"
        @keydown=${this._handleKeydown}
      >
        <slot @slotchange=${this._updateItemCount}></slot>
      </div>

      ${this.controls ? html`
        <div class="controls">
          <button
            part="prev"
            class="control-btn"
            @click=${this._handlePrev}
            ?disabled=${prevDisabled}
            aria-label="Previous slide"
          >
            ${isVertical ? '▲' : '◀'}
          </button>
          <button
            part="next"
            class="control-btn"
            @click=${this._handleNext}
            ?disabled=${nextDisabled}
            aria-label="Next slide"
          >
            ${isVertical ? '▼' : '▶'}
          </button>
        </div>
      ` : nothing}

      ${this.indicators && this._itemCount > 0 ? html`
        <div part="indicators" class="indicators" role="tablist">
          ${Array.from({ length: this._itemCount }, (_, i) => html`
            <button
              part="indicator"
              class="indicator ${i === this._activeIndex ? 'active' : ''}"
              role="tab"
              aria-selected=${i === this._activeIndex}
              aria-label="Go to slide ${i + 1}"
              @click=${() => this._handleIndicatorClick(i)}
            ></button>
          `)}
        </div>
      ` : nothing}
    `;
  }

  /**
   * Navigate to a specific slide
   * @param {number} index - Slide index
   */
  goTo(index) {
    this._scrollTo(index);
  }

  /**
   * Go to next slide
   */
  next() {
    this._handleNext();
  }

  /**
   * Go to previous slide
   */
  prev() {
    this._handlePrev();
  }

  /**
   * Get current active index
   */
  get activeIndex() {
    return this._activeIndex;
  }
}

customElements.define('peek-carousel', PeekCarousel);

export default PeekCarousel;
