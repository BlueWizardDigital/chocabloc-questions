import type { Choice, NormalizedQuestion } from '../types';
import { buildChoicePool } from '../helpers/choice-builder';
import { validateAnswer } from '../helpers/validators';
import './ChocaChoicePad';

function buildShell(): {
  fragment: DocumentFragment;
  promptEl: HTMLElement;
  sequenceEl: HTMLElement;
  pad: HTMLElement;
  container: HTMLElement;
} {
  const fragment = document.createDocumentFragment();
  const style = document.createElement('style');
  style.textContent = `
    :host {
      display: block;
      font-family: var(--cq-font, system-ui, sans-serif);
      color: var(--cq-text, #222);
    }
    [part="container"] {
      display: flex;
      flex-direction: column;
      gap: var(--cq-section-gap, 16px);
      padding: var(--cq-container-padding, 16px);
    }
    [part="prompt"] {
      font-size: var(--cq-prompt-size, 1rem);
      font-weight: var(--cq-prompt-weight, 600);
    }
    [part="sequence"] {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--cq-pattern-item-gap, 8px);
      justify-content: center;
    }
    [part~="pattern-item"] {
      display: flex;
      align-items: center;
      justify-content: center;
      width: var(--cq-pattern-item-size, 48px);
      height: var(--cq-pattern-item-size, 48px);
      border-radius: 50%;
      background: var(--cq-pattern-item-bg, #e3f2fd);
      color: var(--cq-pattern-item-color, #1565c0);
      font-size: calc(var(--cq-pattern-item-size, 48px) * 0.45);
      font-weight: 700;
      border: var(--cq-pattern-item-border, 2px solid #2196f3);
      flex: 0 0 auto;
      user-select: none;
    }
    [part~="pattern-missing"] {
      background: var(--cq-pattern-missing-bg, #fff3e0);
      color: var(--cq-pattern-missing-color, #e65100);
      border-color: var(--cq-pattern-missing-border-color, #ff9800);
      font-size: calc(var(--cq-pattern-item-size, 48px) * 0.5);
    }
  `;
  const container = document.createElement('div');
  container.setAttribute('part', 'container');
  container.setAttribute('role', 'group');
  const promptEl = document.createElement('div');
  promptEl.setAttribute('part', 'prompt');
  const sequenceEl = document.createElement('div');
  sequenceEl.setAttribute('part', 'sequence');
  sequenceEl.setAttribute('role', 'list');
  sequenceEl.setAttribute('aria-label', 'Pattern sequence');
  const pad = document.createElement('choca-choice-pad');
  pad.setAttribute('part', 'choices');
  container.append(promptEl, sequenceEl, pad);
  fragment.append(style, container);
  return { fragment, promptEl, sequenceEl, pad, container };
}

export class ChocaPatternQuestion extends HTMLElement {
  private _shadow: ShadowRoot;
  private _question: NormalizedQuestion | null = null;
  private _renderedAt = 0;
  private _promptEl!: HTMLElement;
  private _sequenceEl!: HTMLElement;
  private _pad!: HTMLElement;
  private _container!: HTMLElement;

  static get observedAttributes(): string[] {
    return ['answer-mode', 'disabled', 'seed'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    const shell = buildShell();
    this._promptEl = shell.promptEl;
    this._sequenceEl = shell.sequenceEl;
    this._pad = shell.pad;
    this._container = shell.container;
    this._shadow.append(shell.fragment);
    this._shadow.addEventListener('picked', (e) =>
      this._onPicked((e as CustomEvent).detail as Choice),
    );
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
    if (!this._question || this._question.format !== 'pattern') return;
    const q = this._question;
    if (q.format !== 'pattern') return;

    this._promptEl.textContent = q.prompt ?? 'What comes next in the pattern?';
    this._container.setAttribute('aria-label', `Question: ${this._promptEl.textContent}`);

    this._sequenceEl.replaceChildren();
    q.content.sequence.forEach((el, i) => {
      const span = document.createElement('span');
      span.setAttribute('part', `pattern-item pattern-item-${i}`);
      span.setAttribute('role', 'listitem');
      span.textContent = el;
      this._sequenceEl.appendChild(span);
    });

    const missing = document.createElement('span');
    missing.setAttribute('part', 'pattern-item pattern-missing');
    missing.setAttribute('role', 'listitem');
    missing.setAttribute('aria-label', 'Missing element');
    missing.textContent = '?';
    this._sequenceEl.appendChild(missing);

    this._renderChoices();
    this._renderedAt = performance.now();
    this.dispatchEvent(
      new CustomEvent('rendered', {
        detail: { renderedAt: this._renderedAt },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _renderChoices(): void {
    if (!this._question) return;
    const seedAttr = this.getAttribute('seed');
    const seed = seedAttr !== null ? Number.parseInt(seedAttr, 10) : undefined;
    const opts: { shuffle: boolean; seed?: number } = { shuffle: true };
    if (typeof seed === 'number' && Number.isFinite(seed)) opts.seed = seed;
    const pool: Choice[] = buildChoicePool(this._question, opts);
    (this._pad as HTMLElement & { choices: Choice[] }).choices = pool;
    const mode = this.getAttribute('answer-mode') ?? 'mc';
    this._pad.setAttribute('mode', mode);
    if (this.hasAttribute('disabled')) this._pad.setAttribute('disabled', '');
    else this._pad.removeAttribute('disabled');
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
      this._pad.setAttribute('disabled', '');
    });
  }
}

if (!customElements.get('choca-pattern-question')) {
  customElements.define('choca-pattern-question', ChocaPatternQuestion);
}
