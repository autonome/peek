/**
 * Peek Tabs - Open UI tablist/tab/tabpanel pattern
 *
 * @element peek-tabs
 * @prop {number} selected - Selected tab index
 * @prop {string} activation - 'auto' | 'manual'
 */

import { html, css } from 'lit';
import { PeekElement, sharedStyles } from './base.js';

let tabsIdCounter = 0;

export class PeekTabs extends PeekElement {
  static properties = { selected: { type: Number, reflect: true }, activation: { type: String } };
  static styles = [sharedStyles, css`
    :host { display: block; }
    .tablist { display: flex; gap: var(--peek-tabs-gap, var(--peek-space-xs)); border-bottom: 1px solid var(--peek-tabs-border, var(--theme-border, #e0e0e0)); margin-bottom: var(--peek-space-md); }
  `];

  constructor() { super(); this._tabsId = `peek-tabs-${++tabsIdCounter}`; this.selected = 0; this.activation = 'auto'; }
  get tabs() { return Array.from(this.querySelectorAll('peek-tab')); }
  get panels() { return Array.from(this.querySelectorAll('peek-tab-panel')); }

  firstUpdated() { this._setupTabs(); this._updateSelection(); }
  updated(changedProps) { if (changedProps.has('selected')) this._updateSelection(); }

  _setupTabs() {
    this.tabs.forEach((tab, i) => {
      tab.id = `${this._tabsId}-tab-${i}`; tab._index = i; tab._tabsElement = this;
      if (this.panels[i]) { this.panels[i].id = `${this._tabsId}-panel-${i}`; tab.setAttribute('aria-controls', this.panels[i].id); this.panels[i].setAttribute('aria-labelledby', tab.id); }
    });
  }

  _updateSelection() {
    this.tabs.forEach((tab, i) => { tab.selected = i === this.selected; tab.setAttribute('tabindex', i === this.selected ? '0' : '-1'); });
    this.panels.forEach((panel, i) => { panel.hidden = i !== this.selected; });
  }

  _handleKeydown(e) {
    const len = this.tabs.length; let idx = this.selected;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); idx = idx > 0 ? idx - 1 : len - 1; }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); idx = idx < len - 1 ? idx + 1 : 0; }
    else if (e.key === 'Home') { e.preventDefault(); idx = 0; }
    else if (e.key === 'End') { e.preventDefault(); idx = len - 1; }
    else return;
    if (this.activation === 'auto') this._selectTab(idx);
    this.tabs[idx]?.focus();
  }

  _selectTab(i) { if (i !== this.selected) { this.selected = i; this.emit('tab-change', { index: i, tab: this.tabs[i], panel: this.panels[i] }); } }
  select(i) { this._selectTab(i); }

  render() {
    return html`<div part="tablist" class="tablist" role="tablist" @keydown=${this._handleKeydown}><slot @slotchange=${() => { this._setupTabs(); this._updateSelection(); }}></slot></div>`;
  }
}

export class PeekTab extends PeekElement {
  static properties = { selected: { type: Boolean, reflect: true }, disabled: { type: Boolean, reflect: true } };
  static styles = [sharedStyles, css`
    :host { display: inline-block; }
    .tab { display: inline-flex; align-items: center; padding: var(--peek-tab-padding, var(--peek-space-sm) var(--peek-space-md)); background: transparent; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; font: inherit; font-weight: var(--peek-font-medium); color: var(--peek-tab-color, var(--theme-text-secondary, #666)); cursor: pointer; outline: none; }
    .tab:hover:not(:disabled) { color: var(--theme-text, #333); }
    .tab:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 2px; }
    :host([selected]) .tab { color: var(--theme-accent, #007aff); border-bottom-color: var(--theme-accent, #007aff); }
    :host([disabled]) .tab { opacity: 0.5; cursor: not-allowed; }
  `];
  constructor() { super(); this.selected = false; this.disabled = false; this._index = 0; this._tabsElement = null; }
  _handleClick() { if (!this.disabled) this._tabsElement?._selectTab(this._index); }
  render() { return html`<button part="tab" class="tab" role="tab" aria-selected=${this.selected} ?disabled=${this.disabled} @click=${this._handleClick}><slot></slot></button>`; }
  focus() { this.shadowRoot?.querySelector('.tab')?.focus(); }
}

export class PeekTabPanel extends PeekElement {
  static styles = [sharedStyles, css`:host { display: block; } :host([hidden]) { display: none; }`];
  render() { return html`<div part="panel" role="tabpanel"><slot></slot></div>`; }
}

customElements.define('peek-tabs', PeekTabs);
customElements.define('peek-tab', PeekTab);
customElements.define('peek-tab-panel', PeekTabPanel);
export default PeekTabs;
