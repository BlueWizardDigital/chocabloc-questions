import type { Choice, NormalizedQuestion } from '../types';
import { buildChoicePool } from '../helpers/choice-builder';
import { validateAnswer } from '../helpers/validators';
import './ChocaChoicePad';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_W = 400;
const SVG_H = 100;
const PAD_L = 30;
const PAD_R = 30;
const LINE_Y = 70;

function buildShell(): {
  fragment: DocumentFragment;
  promptEl: HTMLElement;
  svgContainer: HTMLElement;
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
    [part="number-line"] {
      align-self: center;
      width: 100%;
      max-width: var(--cq-number-line-max-width, 500px);
    }
    [part="number-line"] svg {
      width: 100%;
      height: auto;
    }
  `;
  const container = document.createElement('div');
  container.setAttribute('part', 'container');
  container.setAttribute('role', 'group');
  const promptEl = document.createElement('div');
  promptEl.setAttribute('part', 'prompt');
  const svgContainer = document.createElement('div');
  svgContainer.setAttribute('part', 'number-line');
  svgContainer.setAttribute('role', 'img');
  const pad = document.createElement('choca-choice-pad');
  pad.setAttribute('part', 'choices');
  container.append(promptEl, svgContainer, pad);
  fragment.append(style, container);
  return { fragment, promptEl, svgContainer, pad, container };
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export class ChocaNumberLineQuestion extends HTMLElement {
  private _shadow: ShadowRoot;
  private _question: NormalizedQuestion | null = null;
  private _renderedAt = 0;
  private _promptEl!: HTMLElement;
  private _svgContainer!: HTMLElement;
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
    this._svgContainer = shell.svgContainer;
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
    if (!this._question || this._question.format !== 'multiplication') return;
    const q = this._question;
    if (q.format !== 'multiplication') return;

    const [jumps, step] = q.content.operands;
    this._promptEl.textContent = q.prompt ?? `What is ${jumps} × ${step}?`;
    this._container.setAttribute('aria-label', `Question: ${this._promptEl.textContent}`);

    const effectiveStep = jumps < 0 ? -step : step;
    const points: number[] = [];
    for (let i = 0; i <= Math.abs(jumps); i++) points.push(i * effectiveStep);
    const allVals = [0, ...points];
    const minVal = Math.min(...allVals);
    const maxVal = Math.max(...allVals);
    const range = maxVal - minVal || 1;
    const lineW = SVG_W - PAD_L - PAD_R;
    const toX = (v: number) => PAD_L + ((v - minVal) / range) * lineW;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${SVG_W} ${SVG_H}`,
      'aria-hidden': 'true',
    });

    // Main line
    svg.appendChild(svgEl('line', {
      x1: String(PAD_L - 10), y1: String(LINE_Y),
      x2: String(SVG_W - PAD_R + 10), y2: String(LINE_Y),
      stroke: 'var(--cq-number-line-color, #555)',
      'stroke-width': '2',
    }));

    // Tick marks and labels
    const uniqueVals = [...new Set(allVals)].sort((a, b) => a - b);
    for (const v of uniqueVals) {
      const x = toX(v);
      svg.appendChild(svgEl('line', {
        x1: String(x), y1: String(LINE_Y - 5),
        x2: String(x), y2: String(LINE_Y + 5),
        stroke: 'var(--cq-number-line-color, #555)',
        'stroke-width': '2',
      }));
      const label = svgEl('text', {
        x: String(x), y: String(LINE_Y + 18),
        'text-anchor': 'middle',
        'font-size': '11',
        'font-weight': 'bold',
        fill: 'var(--cq-number-line-label-color, #555)',
      });
      label.textContent = String(v);
      svg.appendChild(label);
    }

    // Arc jumps
    const arcColor = 'var(--cq-number-line-arc-color, #42a5f5)';
    const arcH = 25;
    for (let i = 0; i < Math.abs(jumps); i++) {
      const from = i * effectiveStep;
      const to = (i + 1) * effectiveStep;
      const x1 = toX(from);
      const x2 = toX(to);
      const midX = (x1 + x2) / 2;
      const cpY = LINE_Y - arcH;
      svg.appendChild(svgEl('path', {
        d: `M ${x1} ${LINE_Y} Q ${midX} ${cpY} ${x2} ${LINE_Y}`,
        fill: 'none',
        stroke: arcColor,
        'stroke-width': '2',
      }));
      // Arrowhead
      const arrow = svgEl('polygon', {
        points: `${x2},${LINE_Y} ${x2 - 4},${LINE_Y - 6} ${x2 + 4},${LINE_Y - 6}`,
        fill: arcColor,
      });
      svg.appendChild(arrow);
    }

    this._svgContainer.replaceChildren(svg);
    this._svgContainer.setAttribute('aria-label',
      `Number line showing ${Math.abs(jumps)} jumps of ${step}`);

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

if (!customElements.get('choca-number-line-question')) {
  customElements.define('choca-number-line-question', ChocaNumberLineQuestion);
}
