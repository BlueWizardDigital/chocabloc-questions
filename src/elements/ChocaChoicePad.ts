import type { Choice } from '../types';

/**
 * v0.2.0 PC-3: choice values may be raw scalars OR `{value, error_type}` objects.
 * Extract a comparable string regardless of shape so review-mode comparisons
 * don't stringify the whole object as "[object Object]".
 */
function choiceValue(choice: unknown): string {
  if (choice != null && typeof choice === 'object' && 'value' in choice) {
    return String((choice as { value: unknown }).value);
  }
  return String(choice);
}

const TEMPLATE = `
  <style>
    :host {
      display: block;
      font-family: var(--cq-font, system-ui, sans-serif);
      color: var(--cq-text, #222);
    }
    :host([mode="input"]) { display: none; }
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
      outline: 2px solid transparent;
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: no-preference) {
      [part~="choice"] {
        transition: transform 120ms ease, outline-color 120ms ease;
      }
      [part~="choice"]:hover:not([aria-disabled="true"]) {
        transform: translateY(-1px);
      }
    }
    [part~="choice"]:focus-visible {
      outline: 2px solid var(--cq-focus-ring, currentColor);
      outline-offset: 2px;
    }
    [part~="choice"][aria-disabled="true"] {
      cursor: not-allowed;
      opacity: 0.6;
    }
    /* v0.2.0 review mode: read-only display with correct/wrong/other marks */
    :host([mode="review"]) [part~="choice-correct"] {
      border: 2px solid var(--cq-choice-correct-border, #10b981);
    }
    :host([mode="review"]) [part~="choice-wrong"] {
      border: 2px solid var(--cq-choice-wrong-border, #ef4444);
    }
    :host([mode="review"]) [part~="choice-other"] {
      opacity: var(--cq-choice-disabled-opacity, 0.5);
    }
    :host([mode="review"]) [part~="choice"] {
      pointer-events: none;
    }
  </style>
  <div part="pad" role="radiogroup"></div>
`;

export class ChocaChoicePad extends HTMLElement {
  private _choices: Choice[] = [];
  private _shadow: ShadowRoot;
  private _pad: HTMLElement;
  private _activeIndex = 0;
  private _pickedValueKey: string | null = null;

  static get observedAttributes(): string[] {
    return ['mode', 'disabled', 'aria-label', 'student-answer'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = TEMPLATE;
    this._pad = this._shadow.querySelector('[part="pad"]') as HTMLElement;
    this._pad.addEventListener('keydown', this._onKeydown);
  }

  connectedCallback(): void {
    this._render();
  }

  attributeChangedCallback(): void {
    this._render();
  }

  set choices(value: Choice[]) {
    this._choices = Array.isArray(value) ? value : [];
    this._activeIndex = 0;
    this._pickedValueKey = null;
    this._render();
  }

  get choices(): Choice[] {
    return this._choices;
  }

  private _render(): void {
    const mode = this.getAttribute('mode');
    const isReview = mode === 'review';
    const studentAnswer = this.getAttribute('student-answer');
    // Review mode is always non-interactive regardless of `disabled` attr.
    const disabled = this.hasAttribute('disabled') || isReview;
    this._pad.setAttribute('aria-disabled', String(disabled));
    if (this.hasAttribute('aria-label')) {
      this._pad.setAttribute('aria-label', this.getAttribute('aria-label')!);
    }
    this._pad.replaceChildren();
    this._choices.forEach((c, i) => {
      const btn = document.createElement('button');
      let part = 'choice';
      if (c.correct) part += ' choice-correct';
      if (isReview) {
        if (!c.correct) {
          const asString = choiceValue(c.value);
          if (studentAnswer != null && asString === studentAnswer) {
            part += ' choice-wrong';
          } else {
            part += ' choice-other';
          }
        }
      }
      btn.setAttribute('part', part);
      btn.setAttribute('role', 'radio');
      btn.setAttribute('type', 'button');
      btn.tabIndex = isReview ? -1 : (i === this._activeIndex ? 0 : -1);
      const key = JSON.stringify(c.value);
      const isChecked = this._pickedValueKey === key;
      btn.setAttribute('aria-checked', String(isChecked));
      btn.setAttribute('aria-disabled', String(disabled));
      // R2.8: textContent only, never innerHTML
      btn.textContent = c.label ?? String(c.value);
      if (!isReview) btn.addEventListener('click', () => this._pick(i));
      this._pad.appendChild(btn);
    });
  }

  private _pick(index: number): void {
    if (this.hasAttribute('disabled')) return;
    const c = this._choices[index];
    if (!c) return;
    this._activeIndex = index;
    this._pickedValueKey = JSON.stringify(c.value);
    this._render();
    this.dispatchEvent(
      new CustomEvent('picked', {
        detail: c,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _moveActive(delta: number): void {
    if (this._choices.length === 0) return;
    const len = this._choices.length;
    const next = (this._activeIndex + delta + len) % len;
    this._setActive(next);
  }

  private _setActive(index: number): void {
    this._activeIndex = index;
    const buttons = this._pad.querySelectorAll('button');
    buttons.forEach((b, i) => {
      (b as HTMLButtonElement).tabIndex = i === index ? 0 : -1;
    });
    (buttons[index] as HTMLButtonElement | undefined)?.focus();
  }

  private _onKeydown = (e: KeyboardEvent): void => {
    if (this.hasAttribute('disabled')) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        this._moveActive(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        this._moveActive(-1);
        break;
      case 'Home':
        e.preventDefault();
        this._setActive(0);
        break;
      case 'End':
        e.preventDefault();
        this._setActive(this._choices.length - 1);
        break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        this._pick(this._activeIndex);
        break;
      default:
        break;
    }
  };
}

if (!customElements.get('choca-choice-pad')) {
  customElements.define('choca-choice-pad', ChocaChoicePad);
}
