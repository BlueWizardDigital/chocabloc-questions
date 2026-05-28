import type { AnswerValue, QuestionFormat } from '../types';
import { parseInputAnswer } from '../helpers/input-parser';

const PLACEHOLDERS: Partial<Record<QuestionFormat, string>> = {
  money: '$0.00', money_budget_adjust: '$0.00',
  geometry_angles: '0°', geometry_angle_classify: '0°',
  time: '0:00', fraction_concept: '1/2',
};

export class ChocaAnswerInput extends HTMLElement {
  private _shadow: ShadowRoot;
  private _inputEl: HTMLInputElement;
  private _submitBtn: HTMLButtonElement;
  private _feedbackEl: HTMLElement;
  private _format: QuestionFormat = 'text';

  static get observedAttributes(): string[] { return ['disabled']; }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; font-family: var(--cq-font, system-ui, sans-serif); }
      .wrap { display: flex; gap: 8px; align-items: center; }
      [part="input-field"] {
        font-family: var(--cq-input-font, inherit);
        font-size: var(--cq-input-size, 1.25rem);
        padding: 10px 14px; border: var(--cq-input-border, 2px solid #ccc);
        border-radius: 8px; outline: none; flex: 1; min-width: 0;
      }
      [part="input-field"]:focus {
        border-color: var(--cq-input-focus, #4a90d9);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--cq-input-focus, #4a90d9) 25%, transparent);
      }
      [part="input-field"]:disabled, [part="input-submit"]:disabled {
        opacity: 0.6; cursor: not-allowed;
      }
      [part="input-submit"] {
        font-family: var(--cq-input-font, inherit); font-size: var(--cq-input-size, 1.25rem);
        padding: 10px 20px; background: var(--cq-choice-bg, #4a90d9);
        color: var(--cq-choice-text, #fff); border: none; border-radius: 8px; cursor: pointer;
      }
      [part="input-feedback"] { margin-top: 8px; font-size: 0.95rem; min-height: 1.4em; }
      [part="input-feedback"].correct { color: var(--cq-input-success, #2a7d2a); }
      [part="input-feedback"].incorrect { color: var(--cq-input-error, #c0392b); }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'wrap';

    this._inputEl = document.createElement('input');
    this._inputEl.setAttribute('part', 'input-field');
    this._inputEl.type = 'text';
    this._inputEl.autocomplete = 'off';
    this._inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._submit(); }
    });

    this._submitBtn = document.createElement('button');
    this._submitBtn.setAttribute('part', 'input-submit');
    this._submitBtn.type = 'button';
    this._submitBtn.textContent = 'Submit';
    this._submitBtn.addEventListener('click', () => this._submit());

    wrap.append(this._inputEl, this._submitBtn);

    this._feedbackEl = document.createElement('div');
    this._feedbackEl.setAttribute('part', 'input-feedback');
    this._feedbackEl.setAttribute('aria-live', 'polite');

    this._shadow.append(style, wrap, this._feedbackEl);
  }

  set format(f: QuestionFormat) {
    this._format = f;
    this._inputEl.placeholder = PLACEHOLDERS[f] ?? '0';
  }
  get format(): QuestionFormat { return this._format; }

  attributeChangedCallback(): void {
    const d = this.hasAttribute('disabled');
    this._inputEl.disabled = d;
    this._submitBtn.disabled = d;
  }
  connectedCallback(): void { this.attributeChangedCallback(); }

  showFeedback(correct: boolean, expected?: AnswerValue): void {
    this._feedbackEl.className = correct ? 'correct' : 'incorrect';
    this._feedbackEl.textContent = correct
      ? 'Correct!'
      : expected !== undefined ? `Incorrect. The answer is ${String(expected)}.` : 'Incorrect.';
    this.setAttribute('disabled', '');
  }

  private _submit(): void {
    if (this.hasAttribute('disabled')) return;
    const raw = this._inputEl.value;
    this.dispatchEvent(new CustomEvent('submitted', {
      detail: { parsedValue: parseInputAnswer(raw, this._format), rawInput: raw },
      bubbles: true, composed: true,
    }));
  }
}

if (!customElements.get('choca-answer-input'))
  customElements.define('choca-answer-input', ChocaAnswerInput);
