import type { AnswerValue, MoneyQuestion, NormalizedQuestion, ToolName } from '../types';
import { validateAnswer } from '../helpers/validators';
import './ChocaCoinPile';
import './ChocaCanvasQuestion';
import './ChocaTableQuestion';
import './ChocaPatternQuestion';
import './ChocaNumberLineQuestion';
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

  static get observedAttributes(): string[] {
    return ['answer-mode', 'disabled', 'locale', 'seed', ...TOOL_ATTRS];
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
    for (const a of ['seed', 'locale'] as const) {
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
    while (this._shadow.firstChild) this._shadow.removeChild(this._shadow.firstChild);

    const tools = this._enabledTools();
    if (tools.length > 0) this._addToolbar(tools);
    else this._panelContainer = null;

    if (this._question.format === 'text') {
      const { fragment, promptEl } = buildFallback();
      promptEl.textContent = this._question.content.stem;
      this._shadow.appendChild(fragment);
      return;
    }

    const isInput = this.getAttribute('answer-mode') === 'input';
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
      void validateAnswer(q, parsedValue).then((v) => {
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
