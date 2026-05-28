import type { Choice, NormalizedQuestion } from '../types';
import { syncChoicePad, handlePick } from './shared-pad';
import {
  drawShape2D, drawShape3D, drawBarGraph, drawPictograph,
  drawRightTriangle, drawTriangleAngles, drawPerimeterShape,
  drawAreaShape, drawCircumference, drawFractionVisual, drawAngle,
  drawCircleParts, drawCompoundShape, drawArray,
  drawAnalogClock, drawCoordinatePlane, drawBase10Blocks,
  type Base10Colors,
} from './canvas-draws';
import './ChocaChoicePad';

const CANVAS_W = 300;
const CANVAS_H = 200;

function buildShell(): {
  fragment: DocumentFragment;
  promptEl: HTMLElement;
  canvas: HTMLCanvasElement;
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
    [part="canvas"] {
      align-self: center;
      image-rendering: auto;
    }
  `;
  const container = document.createElement('div');
  container.setAttribute('part', 'container');
  container.setAttribute('role', 'group');
  const promptEl = document.createElement('div');
  promptEl.setAttribute('part', 'prompt');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('part', 'canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const pad = document.createElement('choca-choice-pad');
  pad.setAttribute('part', 'choices');
  container.append(promptEl, canvas, pad);
  fragment.append(style, container);
  return { fragment, promptEl, canvas, pad, container };
}

export class ChocaCanvasQuestion extends HTMLElement {
  private _shadow: ShadowRoot;
  private _question: NormalizedQuestion | null = null;
  private _renderedAt = 0;
  private _promptEl!: HTMLElement;
  private _canvas!: HTMLCanvasElement;
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
    this._canvas = shell.canvas;
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
    if (!this._question) return;
    this._renderPrompt();
    this._renderCanvas();
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

  private _renderPrompt(): void {
    const q = this._question!;
    let text = q.prompt ?? '';
    if (!text) {
      if (q.format === 'data_graph') text = q.content.question;
      else if (q.format === 'geometry_attributes') text = `Which shape has ${q.content.attribute}?`;
      else if (q.format === 'geometry_classify') text = 'Is this shape 2D or 3D?';
      else if (q.format === 'geometry_properties') text = `How many ${q.content.property} does a ${q.content.shape} have?`;
      else if (q.format === 'pythagorean') text = 'Find the hypotenuse.';
      else if (q.format === 'geometry_angle_classify') text = 'What type of angle is this?';
      else if (q.format === 'geometry_circle_parts') text = 'What part of the circle is highlighted?';
      else if (q.format === 'fraction_concept') text = 'What fraction is shaded?';
      else if (q.format === 'time') text = 'What time is shown?';
      else if (q.format === 'coordinate_distance') text = 'What is the distance between the points?';
      else if (q.format === 'multiplication') text = `What is ${q.content.operands[0]} × ${q.content.operands[1]}?`;
      else if (q.format === 'base10_blocks') {
        const op = q.content.operation;
        if (op === 'base10_compare') text = 'Which set shows a greater number?';
        else if (op === 'base10_block_count' && q.content.place) text = `How many ${q.content.place} blocks?`;
        else if (op === 'base10_regroup') text = 'How can you regroup these blocks?';
        else text = 'What number do these blocks show?';
      }
      else text = 'Solve:';
    }
    this._promptEl.textContent = text;
    this._container.setAttribute('aria-label', `Question: ${text}`);
  }

  private _renderCanvas(): void {
    const q = this._question!;
    const ctx = this._canvas.getContext('2d');
    if (!ctx) return;
    const w = this._canvas.width;
    const h = this._canvas.height;

    switch (q.format) {
      case 'geometry_attributes':
        drawShape2D(ctx, w, h, q.answer as string);
        break;
      case 'geometry_classify':
        if (q.content.dimension === '3D') drawShape3D(ctx, w, h, q.content.shape);
        else drawShape2D(ctx, w, h, q.content.shape);
        break;
      case 'geometry_properties':
        drawShape3D(ctx, w, h, q.content.shape);
        break;
      case 'pythagorean':
        drawRightTriangle(ctx, w, h, q.content.legs);
        break;
      case 'geometry_area':
        if (q.content.components && q.content.components.length >= 2)
          drawCompoundShape(ctx, w, h, q.content.components);
        else drawAreaShape(ctx, w, h, q.content);
        break;
      case 'geometry_angles':
        drawTriangleAngles(ctx, w, h, q.content.known_angles);
        break;
      case 'geometry_perimeter':
        drawPerimeterShape(ctx, w, h, q.content.operands);
        break;
      case 'geometry_circumference':
        drawCircumference(ctx, w, h, q.content.radius);
        break;
      case 'geometry_angle_classify':
        drawAngle(ctx, w, h, q.content.angle);
        break;
      case 'geometry_circle_parts':
        drawCircleParts(ctx, w, h, q.content.part);
        break;
      case 'data_graph':
        if (q.imageType === 'bar_graph') drawBarGraph(ctx, w, h, q.content.data);
        else drawPictograph(ctx, w, h, q.content.data);
        break;
      case 'multiplication':
        // Only array imageType reaches this component — number_line is routed
        // to ChocaNumberLineQuestion by the dispatcher.
        drawArray(ctx, w, h, q.content.operands);
        break;
      case 'fraction_concept':
        drawFractionVisual(ctx, w, h, q.content.fraction);
        break;
      case 'time':
        drawAnalogClock(ctx, w, h, q.content.hour, q.content.minute);
        break;
      case 'coordinate_distance':
        drawCoordinatePlane(ctx, w, h, q.content.point1, q.content.point2);
        break;
      case 'base10_blocks': {
        const cs = getComputedStyle(this);
        const rv = (name: string) => cs.getPropertyValue(name).trim();
        const b10Colors: Base10Colors = {};
        const ones = rv('--cq-b10-ones');     if (ones) b10Colors.fillOnes = ones;
        const tens = rv('--cq-b10-tens');      if (tens) b10Colors.fillTens = tens;
        const huns = rv('--cq-b10-hundreds');  if (huns) b10Colors.fillHundreds = huns;
        const thou = rv('--cq-b10-thousands'); if (thou) b10Colors.fillThousands = thou;
        const strk = rv('--cq-b10-stroke');    if (strk) b10Colors.stroke = strk;
        drawBase10Blocks(ctx, w, h, q.content, b10Colors);
        break;
      }
      default:
        break;
    }
  }

  private _renderChoices(): void {
    if (!this._question) return;
    syncChoicePad(this._question, this._pad, this);
  }

  private _onPicked(choice: Choice): void {
    if (!this._question) return;
    handlePick(this, this._question, choice, this._renderedAt, this._pad);
  }
}

if (!customElements.get('choca-canvas-question')) {
  customElements.define('choca-canvas-question', ChocaCanvasQuestion);
}
