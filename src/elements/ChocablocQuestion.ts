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
  container.append(promptEl);
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

    if (this._question.answerMode === 'input') {
      this._renderInputMode();
      return;
    }

    if (this._question.format === 'money') {
      const inner = document.createElement('choca-coin-pile');
      this._passAttrs(inner);
      (inner as HTMLElement & { question: MoneyQuestion }).question = this._question as MoneyQuestion;
      this._shadow.appendChild(inner);
      this._tapAnswered(inner);
      return;
    }

    if (this._question.format === 'text') {
      const { fragment, promptEl } = buildFallback();
      promptEl.textContent = this._question.content.stem;
      this._shadow.appendChild(fragment);
      return;
    }

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
    const inner = document.createElement(tag);
    this._passAttrs(inner);
    (inner as HTMLElement & { question: NormalizedQuestion }).question = this._question;
    this._shadow.appendChild(inner);
    this._tapAnswered(inner);
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

  private _renderInputMode(): void {
    const q = this._question!;
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; font-family: var(--cq-font, system-ui, sans-serif); }
      [part="container"] {
        display: flex; flex-direction: column; gap: var(--cq-section-gap, 16px);
        padding: var(--cq-container-padding, 16px);
      }
      [part="prompt"] { font-size: var(--cq-prompt-size, 1rem); font-weight: var(--cq-prompt-weight, 600); }
    `;
    const container = document.createElement('div');
    container.setAttribute('part', 'container');
    container.setAttribute('role', 'group');
    const prompt = document.createElement('div');
    prompt.setAttribute('part', 'prompt');
    prompt.textContent = q.prompt ?? 'Enter your answer:';

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

    container.append(prompt, inputEl);
    this._shadow.append(style, container);
  }
}

if (!customElements.get('chocabloc-question')) {
  customElements.define('chocabloc-question', ChocablocQuestion);
}
