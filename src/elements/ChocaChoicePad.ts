import type { Choice } from '../types';

const TEMPLATE = `
  <style>
    :host {
      display: block;
      font-family: var(--cq-font, system-ui, sans-serif);
      color: var(--cq-text, #222);
    }
    [part="pad"] {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cq-choice-gap, 8px);
      padding: var(--cq-choices-padding, 0);
    }
    [part~="choice"] {
      font: inherit;
      cursor: pointer;
      padding: var(--cq-choice-padding, 12px 20px);
      background: var(--cq-choice-bg, #f0f0f0);
      color: var(--cq-choice-text, inherit);
      border: var(--cq-choice-border, 1px solid #ccc);
      border-radius: var(--cq-choice-radius, 8px);
    }
    [part~="choice"][aria-disabled="true"] {
      cursor: not-allowed;
      opacity: 0.6;
    }
  </style>
  <div part="pad" role="radiogroup"></div>
`;

export class ChocaChoicePad extends HTMLElement {
  private _choices: Choice[] = [];
  private _shadow: ShadowRoot;
  private _pad: HTMLElement;

  static get observedAttributes(): string[] {
    return ['mode', 'disabled'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = TEMPLATE;
    this._pad = this._shadow.querySelector('[part="pad"]') as HTMLElement;
  }

  connectedCallback(): void {
    this._render();
  }

  attributeChangedCallback(): void {
    this._render();
  }

  set choices(value: Choice[]) {
    this._choices = Array.isArray(value) ? value : [];
    this._render();
  }

  get choices(): Choice[] {
    return this._choices;
  }

  private _render(): void {
    const disabled = this.hasAttribute('disabled');
    this._pad.replaceChildren();
    this._choices.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.setAttribute('part', `choice${c.correct ? ' choice-correct' : ''}`);
      btn.setAttribute('role', 'radio');
      btn.setAttribute('type', 'button');
      btn.tabIndex = i === 0 ? 0 : -1;
      btn.setAttribute('aria-disabled', String(disabled));
      // R2.8: textContent only, never innerHTML
      btn.textContent = c.label ?? String(c.value);
      btn.addEventListener('click', () => this._pick(c));
      this._pad.appendChild(btn);
    });
  }

  private _pick(c: Choice): void {
    if (this.hasAttribute('disabled')) return;
    this.dispatchEvent(
      new CustomEvent('picked', {
        detail: c,
        bubbles: true,
        composed: true,
      }),
    );
  }
}

if (!customElements.get('choca-choice-pad')) {
  customElements.define('choca-choice-pad', ChocaChoicePad);
}
