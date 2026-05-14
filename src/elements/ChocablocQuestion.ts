import type { MoneyQuestion, NormalizedQuestion } from '../types';
import './ChocaCoinPile';

// Fallback template built via DOM API, not template strings, to make the
// no-innerHTML rule trivially auditable (R2.8).
function buildFallback(): { fragment: DocumentFragment; promptEl: HTMLElement } {
  const fragment = document.createDocumentFragment();
  const style = document.createElement('style');
  style.textContent = `
    :host { display: block; font-family: var(--cq-font, system-ui); }
    [part="container"] { padding: var(--cq-container-padding, 16px); }
    [part="prompt"] { font-size: var(--cq-prompt-size, 1rem); }
  `;
  const container = document.createElement('div');
  container.setAttribute('part', 'container');
  container.setAttribute('role', 'group');
  const promptEl = document.createElement('div');
  promptEl.setAttribute('part', 'prompt');
  const canvas = document.createElement('div');
  canvas.setAttribute('part', 'canvas');
  container.append(promptEl, canvas);
  fragment.append(style, container);
  return { fragment, promptEl };
}

export class ChocablocQuestion extends HTMLElement {
  private _shadow: ShadowRoot;
  private _question: NormalizedQuestion | null = null;

  static get observedAttributes(): string[] {
    return ['answer-mode', 'disabled', 'locale', 'seed'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  set question(q: NormalizedQuestion) {
    this._question = q;
    this._render();
  }

  get question(): NormalizedQuestion | null {
    return this._question;
  }

  attributeChangedCallback(): void {
    this._render();
  }

  private _render(): void {
    if (!this._question) return;
    // Wipe shadow root by removing all children to avoid innerHTML assignment
    while (this._shadow.firstChild) {
      this._shadow.removeChild(this._shadow.firstChild);
    }
    if (this._question.format === 'money') {
      const inner = document.createElement('choca-coin-pile');
      inner.setAttribute('answer-mode', this.getAttribute('answer-mode') ?? 'mc');
      const seed = this.getAttribute('seed');
      if (seed !== null) inner.setAttribute('seed', seed);
      const locale = this.getAttribute('locale');
      if (locale !== null) inner.setAttribute('locale', locale);
      if (this.hasAttribute('disabled')) inner.setAttribute('disabled', '');
      (inner as HTMLElement & { question: MoneyQuestion }).question = this._question as MoneyQuestion;
      this._shadow.appendChild(inner);
      // Inner element dispatches with bubbles:true + composed:true so events
      // cross the shadow DOM boundary and reach a consumer listener on the
      // host naturally. No re-dispatch needed — _wireEvents would double-fire.
      return;
    }
    if (this._question.format === 'text') {
      const { fragment, promptEl } = buildFallback();
      // R2.8: textContent only
      promptEl.textContent = this._question.content.stem;
      this._shadow.appendChild(fragment);
      return;
    }
    // R2.9: unknown format — v0 only supports money + text.
    const { fragment, promptEl } = buildFallback();
    const fmt = (this._question as { format: string }).format;
    console.warn(`[chocabloc-questions] Unsupported format in v0: ${fmt}`);
    promptEl.textContent = `Unsupported format: ${fmt}`;
    this._shadow.appendChild(fragment);
  }

}

if (!customElements.get('chocabloc-question')) {
  customElements.define('chocabloc-question', ChocablocQuestion);
}
