import type { Base10Blocks, Base10BlocksContent, Choice, NormalizedQuestion } from '../types';
import { syncChoicePad, handlePick } from './shared-pad';
import {
  drawShape2D, drawShape3D, drawBarGraph, drawPictograph,
  drawRightTriangle, drawTriangleAngles, drawPerimeterShape,
  drawAreaShape, drawCircumference, drawCircleGiven, drawFractionVisual, drawAngle,
  drawCircleParts, drawCompoundShape, drawArray,
  drawAnalogClock, drawCoordinatePlane, drawBase10Blocks,
  drawLabeled3D, drawFaceHighlight, drawClassifyTriangle,
  type Base10Colors,
} from './canvas-draws';
import './ChocaChoicePad';

const CANVAS_W = 300;
const CANVAS_H = 200;

// A generator row normalizes to base10_blocks. A choices-only bank row keeps
// its own format name and arrives with only the content keys the server's
// allow-list passes (today just `operation`: the blocks are stripped).
const BASE10_FORMATS = new Set([
  'base10_blocks', 'base10_count', 'base10_regroup', 'base10_compare', 'base10_block_count',
]);

/** The base-10 content of a question under any of those names, with its operation; else null. */
function base10Of(q: NormalizedQuestion): Base10BlocksContent | null {
  const format: string = q.format;
  if (!BASE10_FORMATS.has(format)) return null;
  const c = q.content as unknown as Partial<Base10BlocksContent>;
  return { ...c, operation: c.operation ?? (format === 'base10_blocks' ? 'base10_count' : format) };
}

type Piece = { width: number; height: number };

/**
 * A compound area's rectangles, or null when it has none. A bank row keeps
 * `components` but the server's allow-list drops each one's `width`, so the
 * pieces are rebuilt from `operands` (width, height, width, height …, the
 * order in every bank row).
 */
function compoundPieces(c: { components?: unknown; operands?: unknown }): Piece[] | null {
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const listed = Array.isArray(c.components) ? (c.components as Partial<Piece>[]) : [];
  if (listed.length < 2) return null;
  if (listed.every((p) => num(p?.width) && num(p?.height))) return listed as Piece[];
  const ops = Array.isArray(c.operands) ? (c.operands as unknown[]) : [];
  if (ops.length !== listed.length * 2 || !ops.every(num)) return null;
  return listed.map((_, i) => ({ width: ops[2 * i] as number, height: ops[2 * i + 1] as number }));
}

/** True when base-10 content carries blocks to draw. */
function hasBlocks(c: Base10BlocksContent): boolean {
  const some = (b?: Base10Blocks) =>
    !!b && ((b.thousands ?? 0) + (b.hundreds ?? 0) + (b.tens ?? 0) + (b.ones ?? 0)) > 0;
  if (c.operation === 'base10_compare') return some(c.set_a?.blocks) && some(c.set_b?.blocks);
  if (c.operation === 'base10_regroup') return (c.tens_shown ?? 0) + (c.ones_shown ?? 0) > 0;
  return some(c.blocks);
}

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
    return ['answer-mode', 'disabled', 'seed', 'student-answer'];
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
    let text = q.questionText ?? '';
    if (!text) {
      if (q.format === 'data_graph') text = q.content.question;
      else if (q.format === 'geometry_attributes') text = `Which shape has ${q.content.attribute}?`;
      else if (q.format === 'geometry_classify') text = 'Is this shape 2D or 3D?';
      else if (q.format === 'geometry_properties') text = `How many ${q.content.property} does a ${q.content.shape} have?`;
      else if (q.format === 'pythagorean') text = q.content.known_leg != null ? 'Find the missing leg.' : 'Find the hypotenuse.';
      else if (q.format === 'geometry_angle_classify') text = 'What type of angle is this?';
      else if (q.format === 'geometry_circle_parts') text = 'What part of the circle is highlighted?';
      else if (q.format === 'geometry_face_identify') text = `What is the shape of each face of a ${q.content.shape}?`;
      else if (q.format === 'geometry_identify') text = 'What shape is this?';
      else if (q.format === 'geometry_symmetry') text = `How many lines of symmetry does this shape have?`;
      else if (q.format === 'geometry_classify_triangle') text = 'Classify this triangle.';
      else if (q.format === 'geometry_volume') text = 'Find the volume.';
      else if (q.format === 'geometry_surface_area') text = 'Find the surface area.';
      else if (q.format === 'geometry_circle_convert') text = `Find the ${q.content.find_type}.`;
      else if (q.format === 'fraction_concept') text = 'What fraction is shaded?';
      else if (q.format === 'time') text = 'What time is shown?';
      else if (q.format === 'coordinate_distance') text = 'What is the distance between the points?';
      else if (q.format === 'multiplication') text = `What is ${q.content.operands[0]} × ${q.content.operands[1]}?`;
      else if (base10Of(q)) {
        const b10 = base10Of(q)!;
        const op = b10.operation;
        if (op === 'base10_compare') text = 'Which set shows a greater number?';
        else if (op === 'base10_block_count' && b10.place) {
          // No picture for this one, so the stem must name the number.
          const n = b10.number;
          text = n === undefined ? `How many ${b10.place} blocks?` : `How many ${b10.place} blocks are in ${n}?`;
        }
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
    // No picture, and the canvas hidden so there is no empty box above the
    // choices, where any picture would give the answer away:
    // - "Which shape has …?" asks for a shape, so a picture of one is the answer
    //   (and bank rows carry no `answer` to draw).
    // - "How many tens blocks are in 6378?" names the number; drawing it in
    //   blocks counts out the answer (beta.19).
    // A base-10 row with no blocks to draw (the bank strips them today) is
    // hidden too, with a warning, rather than shown as an empty box.
    const b10 = base10Of(q);
    const noPicture = q.format === 'geometry_attributes' || b10?.operation === 'base10_block_count';
    const nothingToDraw = !noPicture && b10 !== null && !hasBlocks(b10);
    if (nothingToDraw) {
      console.warn(`[chocabloc-questions] base-10 question ${q.id} has no blocks to draw; showing no picture`);
    }
    this._canvas.hidden = noPicture || nothingToDraw;
    const ctx = this._canvas.getContext('2d');
    if (!ctx) return;
    const w = this._canvas.width;
    const h = this._canvas.height;
    if (noPicture || nothingToDraw) {
      ctx.clearRect(0, 0, w, h);
      return;
    }
    if (b10) {
      drawBase10Blocks(ctx, w, h, b10, this._base10Colors());
      return;
    }

    switch (q.format) {
      case 'geometry_classify':
        if (q.content.dimension === '3D') drawShape3D(ctx, w, h, q.content.shape);
        else drawShape2D(ctx, w, h, q.content.shape);
        break;
      case 'geometry_properties':
        if (q.imageType === 'shape_2d') drawShape2D(ctx, w, h, q.content.shape);
        else drawShape3D(ctx, w, h, q.content.shape);
        break;
      case 'pythagorean':
        drawRightTriangle(ctx, w, h, q.content.operands, q.content.known_leg);
        break;
      case 'geometry_area': {
        const pieces = compoundPieces(q.content);
        if (pieces) drawCompoundShape(ctx, w, h, pieces);
        else drawAreaShape(ctx, w, h, q.content);
        break;
      }
      case 'geometry_angles':
        drawTriangleAngles(ctx, w, h, q.content.known_angles);
        break;
      case 'geometry_perimeter':
        drawPerimeterShape(ctx, w, h, q.content.operands);
        break;
      case 'geometry_circumference': {
        // A bank row skips the normalizer, so a diameter row arrives with
        // `diameter` and no `radius`: label the diameter it gives.
        const diameter = (q.content as { diameter?: unknown }).diameter;
        if (typeof q.content.radius !== 'number' && typeof diameter === 'number') {
          drawCircleGiven(ctx, w, h, 'diameter', diameter);
        } else {
          drawCircumference(ctx, w, h, q.content.radius);
        }
        break;
      }
      case 'geometry_angle_classify':
        drawAngle(ctx, w, h, q.content.angle);
        break;
      case 'geometry_circle_parts':
        drawCircleParts(ctx, w, h, q.content.part);
        break;
      case 'geometry_face_identify':
        drawFaceHighlight(ctx, w, h, q.content.shape, q.content.face_shape);
        break;
      case 'geometry_identify':
        if (q.imageType === 'shape_3d') drawShape3D(ctx, w, h, q.content.shape);
        else drawShape2D(ctx, w, h, q.content.shape);
        break;
      case 'geometry_symmetry':
        // The shape only: the child finds the lines. Drawing them (as before
        // beta.19) let the child count the answer off the picture. The bank's
        // trapezoid rows have 0 lines, but the usual trapezoid is drawn
        // isosceles (1 line), so these questions get a right trapezoid.
        drawShape2D(ctx, w, h, q.content.shape.toLowerCase() === 'trapezoid' ? 'right trapezoid' : q.content.shape);
        break;
      case 'geometry_classify_triangle':
        // The triangle its sides or angles describe. Measures that make no
        // triangle get no picture: a wrong one would point at a wrong answer.
        this._canvas.hidden = !drawClassifyTriangle(ctx, w, h, q.content.operands, q.content.classify_by);
        break;
      case 'geometry_volume':
        drawLabeled3D(ctx, w, h, q.content.shape, q.content.operands, 'volume');
        break;
      case 'geometry_surface_area':
        drawLabeled3D(ctx, w, h, q.content.shape, q.content.operands, 'surface_area');
        break;
      case 'geometry_circle_convert':
        drawCircleGiven(ctx, w, h, q.content.given_type, q.content.value);
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
      default:
        break;
    }
  }

  /** The page's --cq-b10-* colours, where set. */
  private _base10Colors(): Base10Colors {
    const cs = getComputedStyle(this);
    const rv = (name: string) => cs.getPropertyValue(name).trim();
    const b10Colors: Base10Colors = {};
    const ones = rv('--cq-b10-ones');     if (ones) b10Colors.fillOnes = ones;
    const tens = rv('--cq-b10-tens');      if (tens) b10Colors.fillTens = tens;
    const huns = rv('--cq-b10-hundreds');  if (huns) b10Colors.fillHundreds = huns;
    const thou = rv('--cq-b10-thousands'); if (thou) b10Colors.fillThousands = thou;
    const strk = rv('--cq-b10-stroke');    if (strk) b10Colors.stroke = strk;
    return b10Colors;
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
