import type {
  CADCoinName,
  Choice,
  MoneyQuestion,
  USDCoinName,
} from '../types';
import { syncChoicePad, handlePick } from './shared-pad';
import { formatCoinCountForScreenReader } from '../helpers/formatters';
import './ChocaChoicePad';

const TEMPLATE = `
  <style>
    :host {
      display: block;
      font-family: var(--cq-font, system-ui, sans-serif);
      color: var(--cq-text, #222);
      background: var(--cq-bg, transparent);
    }
    [part="container"] {
      display: flex;
      flex-direction: column;
      gap: var(--cq-section-gap, 16px);
      padding: var(--cq-container-padding, 16px);
      background: var(--cq-container-bg, transparent);
      border-radius: var(--cq-container-radius, 0);
      border: var(--cq-container-border, none);
      outline: 2px solid transparent;
    }
    [part="container"]:focus-visible {
      outline: 2px solid var(--cq-focus-ring, currentColor);
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: no-preference) {
      [part="container"] {
        transition: outline-color 120ms ease;
      }
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    [part="prompt"] {
      font-size: var(--cq-prompt-size, 1rem);
      font-weight: var(--cq-prompt-weight, 600);
    }
    [part="canvas"] {
      display: flex;
      flex-direction: column;
      gap: var(--cq-coin-row-gap, 8px);
      align-items: var(--cq-canvas-align, flex-start);
      justify-content: var(--cq-canvas-justify, flex-start);
    }
    [part~="coin-row"] {
      display: flex;
      flex-direction: row;
      align-items: center;
    }
    [part~="coin"] {
      --cq-coin-px: var(--cq-coin-size, 56px);
      width: var(--cq-coin-px);
      height: var(--cq-coin-px);
      border-radius: 50%;
      background-color: var(--cq-coin-fallback-bg, #d4af37);
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
      position: relative;
      flex: 0 0 auto;
    }
    [part~="coin"]:not(:first-child) {
      margin-left: calc(var(--cq-coin-px) * var(--cq-coin-overlap-frac, -0.25));
    }
    [part~="coin-toonie"]  { --cq-coin-px: var(--cq-coin-toonie-size, var(--cq-coin-size, 56px));  background-image: var(--cq-coin-toonie-img, none); }
    [part~="coin-loonie"]  { --cq-coin-px: var(--cq-coin-loonie-size, var(--cq-coin-size, 56px));  background-image: var(--cq-coin-loonie-img, none); }
    [part~="coin-quarter"] { --cq-coin-px: var(--cq-coin-quarter-size, var(--cq-coin-size, 56px)); background-image: var(--cq-coin-quarter-img, none); }
    [part~="coin-dime"]    { --cq-coin-px: var(--cq-coin-dime-size, 40px);    background-image: var(--cq-coin-dime-img, none); }
    [part~="coin-nickel"]  { --cq-coin-px: var(--cq-coin-nickel-size, 43px);  background-image: var(--cq-coin-nickel-img, none); }
    [part~="coin-penny"]   { --cq-coin-px: var(--cq-coin-penny-size, 43px);   background-image: var(--cq-coin-penny-img, none); }
  </style>
  <div part="container" role="group" tabindex="-1">
    <div part="prompt"></div>
    <div part="canvas"></div>
    <div class="sr-only" aria-live="polite"></div>
    <choca-choice-pad part="choices"></choca-choice-pad>
  </div>
`;

const COIN_ORDER: readonly (USDCoinName | CADCoinName)[] = [
  'toonie',
  'loonie',
  'quarter',
  'dime',
  'nickel',
  'penny',
];

const DEFAULT_PROMPT = 'How much money is shown?';

export class ChocaCoinPile extends HTMLElement {
  private _shadow: ShadowRoot;
  private _question: MoneyQuestion | null = null;
  private _prompt: string = DEFAULT_PROMPT;
  private _renderedAt = 0;
  private _defaultPad!: HTMLElement;
  private _canvas!: HTMLElement;
  private _promptEl!: HTMLElement;
  private _liveRegion!: HTMLElement;
  private _container!: HTMLElement;

  static get observedAttributes(): string[] {
    return ['answer-mode', 'disabled', 'locale', 'seed', 'student-answer'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = TEMPLATE;
    this._canvas = this._shadow.querySelector('[part="canvas"]') as HTMLElement;
    this._promptEl = this._shadow.querySelector('[part="prompt"]') as HTMLElement;
    this._defaultPad = this._shadow.querySelector('choca-choice-pad') as HTMLElement;
    this._liveRegion = this._shadow.querySelector('[aria-live="polite"]') as HTMLElement;
    this._container = this._shadow.querySelector('[part="container"]') as HTMLElement;
    // Listen on shadow root so picks bubble through composed paths
    this._shadow.addEventListener('picked', (e) =>
      this._onPicked((e as CustomEvent).detail as Choice),
    );
  }

  connectedCallback(): void {
    this._render();
  }

  attributeChangedCallback(): void {
    this._render();
  }

  set question(q: MoneyQuestion) {
    // Defensive: if a non-money question slipped through TypeScript at runtime,
    // log and skip rather than crash. The dispatcher (ChocablocQuestion) routes
    // by format, so this guard catches direct misuse only.
    if ((q as { format: string }).format !== 'money') {
      console.error(
        `[chocabloc-questions] ChocaCoinPile only renders money questions, got: ${(q as { format: string }).format}`,
      );
      return;
    }
    this._question = q;
    // Auto-bind prompt from the question if present. Caller can still
    // override via the `prompt` setter AFTER assigning question.
    if (typeof q.questionText === 'string' && q.questionText.length > 0) {
      this._prompt = q.questionText;
    }
    this._render();
  }

  get question(): MoneyQuestion | null {
    return this._question;
  }

  set prompt(text: string) {
    this._prompt = typeof text === 'string' ? text : DEFAULT_PROMPT;
    this._renderPrompt();
  }

  get prompt(): string {
    return this._prompt;
  }

  private _render(): void {
    if (!this._question) return;
    this._renderPrompt();
    this._renderCoins();
    this._renderChoices();
    this._renderLiveRegion();
    this._renderAria();
    this._renderedAt = performance.now();
    this.dispatchEvent(
      new CustomEvent('rendered', {
        detail: { renderedAt: this._renderedAt },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _renderPrompt(): void {
    // R2.8: textContent only
    this._promptEl.textContent = this._prompt;
  }

  private _renderCoins(): void {
    if (!this._question) return;
    const coins = this._question.content.coins as Partial<Record<USDCoinName | CADCoinName, number>>;
    this._canvas.replaceChildren();
    for (const name of COIN_ORDER) {
      const count = coins[name] ?? 0;
      if (count <= 0) continue;
      const row = document.createElement('div');
      row.setAttribute('part', `coin-row coin-row-${name}`);
      for (let i = 0; i < count; i++) {
        const span = document.createElement('span');
        span.setAttribute('part', `coin coin-${name}`);
        span.setAttribute('role', 'img');
        span.setAttribute('aria-label', name);
        span.style.zIndex = String(i + 1);
        row.appendChild(span);
      }
      this._canvas.appendChild(row);
    }
  }

  private _renderChoices(): void {
    if (!this._question) return;
    syncChoicePad(this._question, this._defaultPad, this);
  }

  private _renderLiveRegion(): void {
    if (!this._question) return;
    const coins = this._question.content.coins as Partial<Record<USDCoinName | CADCoinName, number>>;
    const text = formatCoinCountForScreenReader(coins, this._question.content.currency);
    // R2.8: textContent only
    this._liveRegion.textContent = text;
  }

  private _renderAria(): void {
    // R2.8: prompt is already textContent-safe; use as attribute value only
    this._container.setAttribute('aria-label', `Question: ${this._prompt}`);
  }

  private _onPicked(choice: Choice): void {
    if (!this._question) return;
    handlePick(this, this._question, choice, this._renderedAt, this._defaultPad);
  }
}

if (!customElements.get('choca-coin-pile')) {
  customElements.define('choca-coin-pile', ChocaCoinPile);
}
