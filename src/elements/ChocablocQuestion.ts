import type {
  AnswerValue,
  MoneyQuestion,
  NormalizedQuestion,
  ToolName,
  ValidateAnswer,
} from '../types';
// Aliased so the public `validateAnswer` class field below doesn't shadow
// the import inside class methods. Without the alias a future refactor
// that drops the `this.` prefix from a method body would silently pick
// up the import instead of the host-provided override.
import { validateAnswer as defaultValidate } from '../helpers/validators';
import { syncChoicePad, handlePick } from './shared-pad';
import './ChocaCoinPile';
import './ChocaCanvasQuestion';
import './ChocaTableQuestion';
import './ChocaPatternQuestion';
import './ChocaNumberLineQuestion';
import './ChocaChoicePad';
import './ChocaToolbar';
import './ChocaAnswerInput';

const TOOL_ATTRS: readonly ToolName[] = ['whiteboard', 'calculator', 'place-value-chart'];

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
  private _toolsUsed = new Set<ToolName>();
  private _toolPanels = new Map<ToolName, HTMLElement>();
  private _panelContainer: HTMLElement | null = null;
  private _innerFormatEl: HTMLElement | null = null;
  private _validateAnswer: ValidateAnswer | undefined = undefined;

  /**
   * Optional host-provided validator (v0.3.0+). When set, replaces the
   * built-in client-side compare for every MC pick + every input submission.
   * Must return `Promise<ValidationResult>`; rejections are swallowed and
   * routed through the built-in helper as a fail-safe so the choice pad
   * doesn't lock up.
   *
   * Can be set before OR after `question` — the setter forwards the
   * current value to whichever inner format element is rendered.
   */
  public get validateAnswer(): ValidateAnswer | undefined {
    return this._validateAnswer;
  }
  public set validateAnswer(fn: ValidateAnswer | undefined) {
    this._validateAnswer = fn;
    if (this._innerFormatEl) {
      (this._innerFormatEl as HTMLElement & { validateAnswer: ValidateAnswer | undefined })
        .validateAnswer = fn;
    }
  }

  static get observedAttributes(): string[] {
    return ['answer-mode', 'disabled', 'locale', 'seed', 'student-answer', ...TOOL_ATTRS];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  set question(q: NormalizedQuestion) {
    this._question = q;
    this._toolsUsed.clear();
    for (const [, el] of this._toolPanels) {
      if (typeof (el as HTMLElement & { clear?: () => void }).clear === 'function') {
        (el as HTMLElement & { clear: () => void }).clear();
      }
    }
    this._render();
  }

  get question(): NormalizedQuestion | null {
    return this._question;
  }

  attributeChangedCallback(): void {
    this._render();
  }

  private _enabledTools(): ToolName[] {
    return TOOL_ATTRS.filter((t) => this.hasAttribute(t));
  }

  private _passAttrs(el: HTMLElement): void {
    el.setAttribute('answer-mode', this.getAttribute('answer-mode') ?? 'mc');
    for (const a of ['seed', 'locale', 'student-answer'] as const) {
      const v = this.getAttribute(a);
      if (v !== null) el.setAttribute(a, v);
    }
    if (this.hasAttribute('disabled')) el.setAttribute('disabled', '');
  }

  private _tapAnswered(inner: HTMLElement): void {
    inner.addEventListener('answered', (e) => {
      if (this._toolsUsed.size === 0) return;
      const d = (e as CustomEvent).detail;
      if (d && typeof d === 'object') {
        (d as Record<string, unknown>).toolsUsed = [...this._toolsUsed];
      }
    });
  }

  private _render(): void {
    if (!this._question) return;
    // Reset the inner-element handle — a stale reference would let the
    // validateAnswer setter forward to a detached element.
    this._innerFormatEl = null;
    while (this._shadow.firstChild) this._shadow.removeChild(this._shadow.firstChild);

    const tools = this._enabledTools();
    if (tools.length > 0) this._addToolbar(tools);
    else this._panelContainer = null;

    const isInput = this.getAttribute('answer-mode') === 'input';

    if (this._question.format === 'text') {
      const { fragment, promptEl } = buildFallback();
      promptEl.textContent = this._question.content.stem;

      if (!isInput) {
        const pad = document.createElement('choca-choice-pad');
        pad.setAttribute('part', 'choices');
        const container = fragment.querySelector('[part="container"]')!;
        container.appendChild(pad);
        syncChoicePad(this._question, pad, this);

        const renderedAt = performance.now();
        const toolsUsed = this._toolsUsed;
        pad.addEventListener('picked', (e) => {
          const choice = (e as CustomEvent).detail as import('../types').Choice;
          handlePick(this, this._question!, choice, renderedAt, pad,
            toolsUsed.size > 0 ? { toolsUsed: [...toolsUsed] } : undefined);
        });
      }

      this._shadow.appendChild(fragment);
      if (isInput) this._appendInputAnswer();
      return;
    }

    let inner: HTMLElement;

    if (this._question.format === 'money') {
      inner = document.createElement('choca-coin-pile');
      this._passAttrs(inner);
      (inner as HTMLElement & { question: MoneyQuestion }).question = this._question as MoneyQuestion;
    } else {
      let tag: string;
      if (this._question.format === 'money_budget_adjust') {
        tag = 'choca-table-question';
      } else if (this._question.format === 'pattern') {
        tag = 'choca-pattern-question';
      } else if (this._question.format === 'multiplication' && this._question.imageType === 'number_line') {
        tag = 'choca-number-line-question';
      } else {
        tag = 'choca-canvas-question';
      }
      inner = document.createElement(tag);
      this._passAttrs(inner);
      (inner as HTMLElement & { question: NormalizedQuestion }).question = this._question;
    }

    // v0.3.0+: track the inner element so the validateAnswer setter can
    // propagate later assignments, and forward the current value if any.
    this._innerFormatEl = inner;
    if (this._validateAnswer) {
      (inner as HTMLElement & { validateAnswer?: ValidateAnswer }).validateAnswer = this._validateAnswer;
    }

    this._shadow.appendChild(inner);
    if (!isInput) this._tapAnswered(inner);

    if (isInput) this._appendInputAnswer();
  }

  private _addToolbar(tools: ToolName[]): void {
    const toolbar = document.createElement('choca-toolbar') as HTMLElement & { tools: ToolName[] };
    toolbar.tools = tools;

    this._panelContainer = document.createElement('div');
    this._panelContainer.setAttribute('part', 'tool-panels');

    toolbar.addEventListener('tool-toggled', ((e: CustomEvent) => {
      const { tool, active } = e.detail as { tool: ToolName; active: boolean };
      if (active) {
        this._toolsUsed.add(tool);
        void this._showPanel(tool);
      } else {
        this._hidePanel(tool);
      }
      this.dispatchEvent(new CustomEvent('tool-used', {
        detail: { tool, action: active ? 'opened' : 'closed' },
        bubbles: true, composed: true,
      }));
    }) as EventListener);

    this._shadow.append(toolbar, this._panelContainer);
  }

  private async _showPanel(tool: ToolName): Promise<void> {
    if (!this._panelContainer) return;
    let el = this._toolPanels.get(tool);
    if (!el) {
      if (tool === 'whiteboard') {
        const { ChocaWhiteboard } = await import('./ChocaWhiteboard');
        if (!customElements.get('choca-whiteboard')) {
          customElements.define('choca-whiteboard', ChocaWhiteboard);
        }
        el = document.createElement('choca-whiteboard');
      }
      if (el) this._toolPanels.set(tool, el);
    }
    if (el) {
      el.style.display = '';
      if (!el.parentNode) this._panelContainer.appendChild(el);
    }
  }

  private _hidePanel(tool: ToolName): void {
    const el = this._toolPanels.get(tool);
    if (el) el.style.display = 'none';
  }

  private _appendInputAnswer(): void {
    const q = this._question!;
    const inputEl = document.createElement('choca-answer-input') as HTMLElement & {
      format: string;
      showFeedback: (correct: boolean, expected?: AnswerValue) => void;
    };
    inputEl.format = q.format;
    if (this.hasAttribute('disabled')) inputEl.setAttribute('disabled', '');

    const t0 = performance.now();
    inputEl.addEventListener('submitted', ((e: CustomEvent) => {
      const { parsedValue, rawInput } = e.detail as { parsedValue: AnswerValue; rawInput: string };
      // Read at submit time so a host that assigns `validateAnswer` after
      // `question` still takes effect for the input-mode path. If a host
      // validator rejects, fall back to the built-in helper so the input
      // doesn't appear hung.
      const hostValidate = this.validateAnswer;
      // v0.4.0+: same misconfigured signal as shared-pad.handlePick — a
      // choices-only question with no host validator cannot be graded.
      if (!hostValidate && q.answer === undefined) {
        this.dispatchEvent(new CustomEvent('chocabloc-misconfigured', {
          detail: {
            reason: 'choices-only-without-host-validator',
            questionId: q.id,
          },
          bubbles: true, composed: true,
        }));
      }
      // v0.5.0-beta.2: don't fall through to defaultValidate when the question
      // is choices-only AND the host validator rejects. See shared-pad.ts for
      // the full rationale — fall-through silently marks correct answers wrong
      // during a validate-endpoint outage.
      const choicesOnly = q.answer === undefined;
      const verdictPromise: Promise<Awaited<ReturnType<typeof defaultValidate>> | null> = hostValidate
        ? hostValidate(q, parsedValue).catch((err) => {
            if (choicesOnly) {
              console.warn(
                '[chocabloc-question] host validateAnswer rejected and no local answer to fall back on:',
                err,
              );
              this.dispatchEvent(new CustomEvent('chocabloc-validation-unavailable', {
                detail: {
                  reason: 'host-validator-rejected',
                  questionId: q.id,
                  error: err,
                },
                bubbles: true, composed: true,
              }));
              return null;
            }
            console.warn('[chocabloc-question] host validateAnswer rejected — falling back:', err);
            return defaultValidate(q, parsedValue);
          })
        : defaultValidate(q, parsedValue);
      void verdictPromise.then((v) => {
        if (v === null) return; // validation unavailable: no feedback, no `answered` event
        inputEl.showFeedback(v.correct, v.expected);
        this.dispatchEvent(new CustomEvent('answered', {
          detail: {
            questionId: q.id, studentAnswer: parsedValue, correct: v.correct,
            distractorMatched: v.distractorMatched ?? null, skillTags: v.skillTags ?? [],
            expected: v.expected, timeToAnswerMs: performance.now() - t0, rawInput,
            ...(this._toolsUsed.size > 0 ? { toolsUsed: [...this._toolsUsed] } : {}),
          },
          bubbles: true, composed: true,
        }));
      });
    }) as EventListener);

    this._shadow.appendChild(inputEl);
  }
}

if (!customElements.get('chocabloc-question')) {
  customElements.define('chocabloc-question', ChocablocQuestion);
}
