import type {
  CADCoinName,
  Choice,
  MoneyQuestion,
  USDCoinName,
} from '../types';
import { buildChoicePool } from '../helpers/choice-builder';
import { validateAnswer } from '../helpers/validators';
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
      flex-wrap: wrap;
      gap: var(--cq-coin-gap, 8px);
      align-items: center;
      justify-content: var(--cq-canvas-justify, flex-start);
    }
    [part~="coin"] {
      width: var(--cq-coin-size, 48px);
      height: var(--cq-coin-size, 48px);
      border-radius: 50%;
      background-color: var(--cq-coin-fallback-bg, #d4af37);
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
    }
    [part~="coin-penny"]   { background-image: var(--cq-coin-penny-img, none); }
    [part~="coin-nickel"]  { background-image: var(--cq-coin-nickel-img, none); }
    [part~="coin-dime"]    { background-image: var(--cq-coin-dime-img, none); }
    [part~="coin-quarter"] { background-image: var(--cq-coin-quarter-img, none); }
    [part~="coin-loonie"]  { background-image: var(--cq-coin-loonie-img, none); }
    [part~="coin-toonie"]  { background-image: var(--cq-coin-toonie-img, none); }
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

const DEFAULT_PROMPT = 'TEST RELOAD';

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
    return ['answer-mode', 'disabled', 'locale', 'seed'];
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
      for (let i = 0; i < count; i++) {
        const span = document.createElement('span');
        span.setAttribute('part', `coin coin-${name}`);
        span.setAttribute('role', 'img');
        span.setAttribute('aria-label', name);
        this._canvas.appendChild(span);
      }
    }
  }

  private _renderChoices(): void {
    if (!this._question) return;
    const seedAttr = this.getAttribute('seed');
    const seed = seedAttr !== null ? Number.parseInt(seedAttr, 10) : undefined;
    const opts: { shuffle: boolean; seed?: number } = { shuffle: true };
    if (typeof seed === 'number' && Number.isFinite(seed)) {
      opts.seed = seed;
    }
    const pool: Choice[] = buildChoicePool(this._question, opts);
    (this._defaultPad as HTMLElement & { choices: Choice[] }).choices = pool;
    const mode = this.getAttribute('answer-mode') ?? 'mc';
    this._defaultPad.setAttribute('mode', mode);
    if (this.hasAttribute('disabled')) {
      this._defaultPad.setAttribute('disabled', '');
    } else {
      this._defaultPad.removeAttribute('disabled');
    }
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
    const studentAnswer = choice.value;
    void validateAnswer(this._question, studentAnswer).then((verdict) => {
      const timeToAnswerMs = performance.now() - this._renderedAt;
      this.dispatchEvent(
        new CustomEvent('answered', {
          detail: {
            questionId: this._question!.id,
            studentAnswer,
            correct: verdict.correct,
            distractorMatched: verdict.distractorMatched,
            skillTags: verdict.skillTags,
            expected: verdict.expected,
            timeToAnswerMs,
          },
          bubbles: true,
          composed: true,
        }),
      );
      this._defaultPad.setAttribute('disabled', '');
    });
  }
}

if (!customElements.get('choca-coin-pile')) {
  customElements.define('choca-coin-pile', ChocaCoinPile);
}
