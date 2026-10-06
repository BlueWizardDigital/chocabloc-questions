import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaCanvasQuestion';
import { normalizeQuestion } from '../../src/helpers/normalizer';

/* ---------- helpers ---------- */

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

// Canvas output is asserted by spying on the 2D context, not by reading pixels.
// `drawShape2D` and `drawShape3D` are told apart by the stroke colour each one
// sets (#2196f3 vs #7c4dff) and by the primitives they call; both fall back to
// fillText('?') for a shape they do not know.
type CtxCall = { fn: string; args: unknown[] };
type CtxSet = { prop: string; value: unknown };

type CanvasProto = { getContext: (...a: unknown[]) => unknown };

const WATCHED_CALLS = new Set([
  'arc', 'ellipse', 'rect', 'fillRect', 'strokeRect', 'moveTo', 'lineTo', 'closePath', 'fillText', 'setLineDash',
]);
const WATCHED_SETS = new Set(['strokeStyle', 'lineWidth']);

// `log` holds the watched calls and sets in the order they happened; a set
// appears as fn `set:<prop>` with the value as its only arg.
function spyCanvas(): { calls: CtxCall[]; sets: CtxSet[]; log: CtxCall[]; restore: () => void } {
  const calls: CtxCall[] = [];
  const sets: CtxSet[] = [];
  const log: CtxCall[] = [];
  const proto = HTMLCanvasElement.prototype as unknown as CanvasProto;
  const orig = proto.getContext;
  proto.getContext = function (this: HTMLCanvasElement, ...args: unknown[]): unknown {
    const ctx = orig.apply(this, args) as CanvasRenderingContext2D | null;
    if (args[0] !== '2d' || !ctx) return ctx;
    return new Proxy(ctx, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target) as unknown;
        if (typeof value !== 'function') return value;
        const fn = value as (...a: unknown[]) => unknown;
        return (...a: unknown[]): unknown => {
          if (WATCHED_CALLS.has(prop as string)) {
            calls.push({ fn: prop as string, args: a });
            log.push({ fn: prop as string, args: a });
          }
          return fn.apply(target, a);
        };
      },
      set(target, prop, value) {
        if (WATCHED_SETS.has(prop as string)) {
          sets.push({ prop: prop as string, value });
          log.push({ fn: `set:${prop as string}`, args: [value] });
        }
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  };
  return { calls, sets, log, restore: () => { proto.getContext = orig; } };
}

/** Mount a canvas question with the spy installed, set `q`, return the draw calls. */
function render(q: unknown): { calls: CtxCall[]; sets: CtxSet[]; log: CtxCall[]; el: HTMLElement } {
  const spy = spyCanvas();
  try {
    const el = mount(`<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>`);
    (el as HTMLElement & { question: unknown }).question = q;
    return { calls: spy.calls, sets: spy.sets, log: spy.log, el };
  } finally {
    spy.restore();
  }
}

function canvasOf(el: HTMLElement): HTMLCanvasElement {
  return el.shadowRoot!.querySelector('[part="canvas"]') as HTMLCanvasElement;
}

/** The text of every answer button the choice pad rendered. */
function choiceLabels(el: HTMLElement): string[] {
  const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
  return [...pad.shadowRoot!.querySelectorAll('[part~="choice"]')].map((b) => b.textContent ?? '');
}

/** Everything written on the canvas with fillText, in order. */
function labels(calls: CtxCall[]): unknown[] {
  return calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0]);
}

function strokeStyles(sets: CtxSet[]): unknown[] {
  return sets.filter((s) => s.prop === 'strokeStyle').map((s) => s.value);
}

function fallbackGlyphs(calls: CtxCall[]): CtxCall[] {
  return calls.filter((c) => c.fn === 'fillText' && c.args[0] === '?');
}

function named(fn: string, calls: CtxCall[]): CtxCall[] {
  return calls.filter((c) => c.fn === fn);
}

// drawShape2D: stroke #2196f3. drawShape3D: stroke #7c4dff.
const STROKE_2D = '#2196f3';
const STROKE_3D = '#7c4dff';

// The element's canvas is 300x200, so drawShape2D uses cx=150, cy=100,
// size = min(300, 200) * 0.4 = 80.
const CX = 150, CY = 100, SIZE = 80;

/* ---------- test data ---------- */

// "How many sides does a circle have?" — the grade-K row that shipped a grey "?".
const properties2D = (shape: string) => ({
  id: `GEOM-2D-SHAPE-PROPERTIES-BASIC-${shape}-sides`,
  skillIds: ['GEOM-2D-SHAPE-PROPERTIES-BASIC'],
  format: 'geometry_properties' as const,
  imageType: 'shape_2d' as const,
  content: { shape, property: 'sides' },
  answer: '0',
  distractors: [
    { value: '1', errorType: 'off-by-one' },
    { value: '4', errorType: 'wrong-shape' },
  ],
});

// "How many edges does a cube have?" — same format, genuinely 3D.
const properties3D = (shape: string) => ({
  id: `GEOM-3D-EDGES-${shape}`,
  skillIds: ['GEOM-3D-EDGES'],
  format: 'geometry_properties' as const,
  imageType: 'shape_3d' as const,
  content: { shape, property: 'edges' },
  answer: '12',
  distractors: [
    { value: '6', errorType: 'confused-faces' },
    { value: '8', errorType: 'confused-vertices' },
  ],
});

const identify = (shape: string, imageType: 'shape_2d' | 'shape_3d') => ({
  id: `GEOM-NAME-${shape}`,
  skillIds: ['GEOM-2D-NAME-BASIC'],
  format: 'geometry_identify' as const,
  imageType,
  content: { shape },
  answer: shape,
  distractors: [{ value: 'square', errorType: 'wrong-classification' }],
});

const faceIdentify = () => ({
  id: 'GEOM-3D-FACES-IDENTIFY-cube',
  skillIds: ['GEOM-3D-FACES-IDENTIFY'],
  format: 'geometry_face_identify' as const,
  imageType: 'shape_3d' as const,
  content: { shape: 'cube', face_shape: 'square' },
  answer: 'square',
  distractors: [{ value: 'circle', errorType: 'wrong-classification' }],
});

/* ================================================================
   geometry_properties — routes on imageType
   ================================================================ */

describe('geometry_properties shape routing', () => {
  it('draws a 2D circle, not the "?" fallback', () => {
    const { calls, sets } = render(properties2D('circle'));

    expect(fallbackGlyphs(calls)).to.have.lengthOf(0);
    expect(strokeStyles(sets)).to.include(STROKE_2D);
    expect(strokeStyles(sets)).to.not.include(STROKE_3D);

    const arcs = named('arc', calls);
    expect(arcs).to.have.lengthOf(1);
    expect(arcs[0]!.args.slice(0, 3)).to.deep.equal([CX, CY, SIZE]);
  });

  it('draws a 2D square as a four-sided polygon', () => {
    const { calls, sets } = render(properties2D('square'));

    expect(fallbackGlyphs(calls)).to.have.lengthOf(0);
    expect(strokeStyles(sets)).to.include(STROKE_2D);
    expect(named('arc', calls)).to.have.lengthOf(0);
    // drawRegularPolygon(sides=4) emits moveTo once then lineTo for each vertex.
    expect(named('moveTo', calls)).to.have.lengthOf(1);
    expect(named('lineTo', calls)).to.have.lengthOf(4);
  });

  it('still draws a cube with the 3D renderer', () => {
    const { calls, sets } = render(properties3D('cube'));

    expect(fallbackGlyphs(calls)).to.have.lengthOf(0);
    expect(strokeStyles(sets)).to.include(STROKE_3D);
    expect(strokeStyles(sets)).to.not.include(STROKE_2D);
    expect(named('arc', calls)).to.have.lengthOf(0);
    // drawCube draws 3 quad faces: moveTo + 3 lineTo each.
    expect(named('moveTo', calls)).to.have.lengthOf(3);
    expect(named('lineTo', calls)).to.have.lengthOf(9);
  });

  it('still draws a cylinder with the 3D renderer', () => {
    const { sets, calls } = render(properties3D('cylinder'));

    expect(fallbackGlyphs(calls)).to.have.lengthOf(0);
    expect(strokeStyles(sets)).to.include(STROKE_3D);
    expect(strokeStyles(sets)).to.not.include(STROKE_2D);
  });

  it('falls back to the 3D renderer when the row carries no imageType', () => {
    const q = properties3D('cube') as Record<string, unknown>;
    delete q['imageType'];
    const { sets, calls } = render(q);

    expect(fallbackGlyphs(calls)).to.have.lengthOf(0);
    expect(strokeStyles(sets)).to.include(STROKE_3D);
    expect(strokeStyles(sets)).to.not.include(STROKE_2D);
  });
});

/* ================================================================
   Formats that must not move
   ================================================================ */

describe('geometry routing — unchanged formats', () => {
  it('geometry_identify 2D still draws 2D', () => {
    const { calls, sets } = render(identify('circle', 'shape_2d'));
    expect(strokeStyles(sets)).to.include(STROKE_2D);
    expect(named('arc', calls)).to.have.lengthOf(1);
    expect(fallbackGlyphs(calls)).to.have.lengthOf(0);
  });

  it('geometry_identify 3D still draws 3D', () => {
    const { calls, sets } = render(identify('cube', 'shape_3d'));
    expect(strokeStyles(sets)).to.include(STROKE_3D);
    expect(strokeStyles(sets)).to.not.include(STROKE_2D);
    expect(fallbackGlyphs(calls)).to.have.lengthOf(0);
  });

  it('geometry_face_identify still draws the 3D shape plus the face highlight', () => {
    const { calls, sets } = render(faceIdentify());
    expect(strokeStyles(sets)).to.include(STROKE_3D);
    expect(strokeStyles(sets)).to.include('#e65100');
    expect(strokeStyles(sets)).to.not.include(STROKE_2D);
    expect(fallbackGlyphs(calls)).to.have.lengthOf(0);
  });
});

/* ================================================================
   Real bank rows. The platform serves the bank choices-only: no `answer`,
   a pre-shuffled `choices` list of strings and an `answerToken`. These go
   through normalizeQuestion, like a game's rows do.
   Sources: dev, signed out, 2026-10-05 (geometry-blocs-default), and the
   generator output for the two rectangle skills a guest can't reach.
   ================================================================ */

const wire = (r: Record<string, unknown>) =>
  normalizeQuestion({ imageType: 'shape_2d', difficulty: 'medium', answerToken: 'test-token-not-real', ...r });

const attributesWire = () => wire({
  id: 'GEOM-2D-ATTRIBUTES-trapezoid-4-sides-with-exactly',
  skillIds: ['GEOM-2D-ATTRIBUTES'],
  format: 'geometry_attributes',
  content: { attribute: '4 sides with exactly one pair of parallel sides', operation: 'geometry_attributes' },
  questionText: 'Which shape has 4 sides with exactly one pair of parallel sides?',
  choices: [{ value: 'rhombus' }, { value: 'trapezoid' }, { value: 'parallelogram' }, { value: 'rectangle' }],
});

const perimeterWire = (
  skill: string, content: Record<string, unknown>, questionText: string, choices: string[],
) => wire({
  id: `${skill}-${(content['operands'] as number[]).join('-')}`,
  skillIds: [skill],
  format: 'geometry_perimeter',
  content: { ...content, operation: 'geometry_perimeter' },
  questionText,
  choices: choices.map((value) => ({ value })),
});

// GEOM-PERIMETER-RECTANGLE (200 rows): always shape "rectangle", two operands.
const rectangleWire = () => perimeterWire('GEOM-PERIMETER-RECTANGLE',
  { shape: 'rectangle', operands: [14, 2], dimensions: 'length 14 and width 2' },
  'Find the perimeter of a rectangle with length 14 and width 2.', ['28', '32', '16', '34']);

// GEOM-PERIMETER-DECIMAL (150 in the generator, 148 on dev): the same shape, decimal lengths.
const decimalWire = () => perimeterWire('GEOM-PERIMETER-DECIMAL',
  { shape: 'rectangle', operands: [17.4, 17.8], dimensions: 'length 17.4 and width 17.8' },
  'Find the perimeter of a rectangle with length 17.4 and width 17.8.', ['704', '70.4', '7.04', '7040']);

// GEOM-PERIMETER-POLYGON (100 rows): 3 to 6 sides, `shape` names the polygon.
const polygonWire = (shape: string, operands: number[], choices: string[]) =>
  perimeterWire('GEOM-PERIMETER-POLYGON',
    { shape, sides: operands.join(', '), operands, dimensions: `sides ${operands.join(', ')}` },
    `Find the perimeter. Side lengths: ${operands.join(', ')}`, choices);

const POLYGONS: { shape: string; operands: number[]; perimeter: number; choices: string[] }[] = [
  { shape: 'triangle', operands: [13, 17, 20], perimeter: 50, choices: ['50', '49', '39', '51'] },
  { shape: 'quadrilateral', operands: [2, 6, 17, 3], perimeter: 28, choices: ['26', '28', '25', '27'] },
  { shape: 'pentagon', operands: [13, 2, 4, 15, 11], perimeter: 45, choices: ['45', '44', '34', '58'] },
  { shape: 'hexagon', operands: [8, 1, 6, 3, 7, 11], perimeter: 36, choices: ['36', '35', '25', '37'] },
];

const W = 300, H = 200; // the element's canvas

type Pt = { x: number; y: number };
const pt = (c: CtxCall): Pt => ({ x: c.args[0] as number, y: c.args[1] as number });
const textAt = (c: CtxCall): Pt => ({ x: c.args[1] as number, y: c.args[2] as number });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Midpoint of each side of the one path the polygon draw traced. */
function sideMidpoints(calls: CtxCall[]): Pt[] {
  const verts = [pt(named('moveTo', calls)[0]!), ...named('lineTo', calls).map(pt)];
  return verts.slice(0, -1).map((v, i) => ({ x: (v.x + verts[i + 1]!.x) / 2, y: (v.y + verts[i + 1]!.y) / 2 }));
}

/* ================================================================
   geometry_attributes — "Which shape has …?" The answer is a shape, so
   any picture of one gives it away. No picture, and no empty box.
   ================================================================ */

describe('geometry_attributes never draws the answer', () => {
  it('a choices-only row renders its four choices without throwing', () => {
    let out: ReturnType<typeof render> | undefined;
    expect(() => { out = render(attributesWire()); }).to.not.throw();

    expect(choiceLabels(out!.el)).to.have.members(['rhombus', 'trapezoid', 'parallelogram', 'rectangle']);
    expect(out!.el.shadowRoot!.querySelector('[part="prompt"]')!.textContent)
      .to.equal('Which shape has 4 sides with exactly one pair of parallel sides?');
  });

  it('a row that carries the answer draws no shape', () => {
    const { calls, el } = render({
      id: 'GEOM-2D-ATTRIBUTES-circle',
      skillIds: ['GEOM-2D-ATTRIBUTES'],
      format: 'geometry_attributes',
      imageType: 'shape_2d',
      content: { attribute: 'no sides and no corners' },
      answer: 'circle',
      distractors: [{ value: 'triangle', errorType: 'wrong-classification' }],
    });

    expect(calls, 'nothing may be painted on the canvas').to.have.lengthOf(0);
    expect(choiceLabels(el)).to.include('circle');
  });

  it('hides the canvas, so there is no empty box between the prompt and the choices', () => {
    const { el } = render(attributesWire());
    const canvas = canvasOf(el);

    expect(canvas.hidden).to.equal(true);
    expect(getComputedStyle(canvas).display).to.equal('none');
    expect(canvas.getBoundingClientRect().height).to.equal(0);
  });

  it('shows the canvas again when the same element gets a question with a picture', () => {
    const { el } = render(attributesWire());
    (el as HTMLElement & { question: unknown }).question = identify('circle', 'shape_2d');

    expect(canvasOf(el).hidden).to.equal(false);
    expect(getComputedStyle(canvasOf(el)).display).to.not.equal('none');
  });
});

/* ================================================================
   geometry_perimeter — the picture must match the side list, and never
   show the perimeter (the answer).
   ================================================================ */

describe('geometry_perimeter draws the shape its sides describe', () => {
  it('GEOM-PERIMETER-RECTANGLE: a rectangle with the length and width labelled', () => {
    const { calls, el } = render(rectangleWire());

    const rects = named('strokeRect', calls);
    expect(rects).to.have.lengthOf(1);
    const [, , rw, rh] = rects[0]!.args as number[];
    expect(rw! / rh!).to.be.closeTo(14 / 2, 1e-9);
    expect(named('lineTo', calls), 'no polygon outline').to.have.lengthOf(0);
    expect(labels(calls)).to.deep.equal(['14', '2']);
    expect(choiceLabels(el)).to.have.lengthOf(4);
  });

  it('GEOM-PERIMETER-DECIMAL: decimal lengths label as given', () => {
    const { calls } = render(decimalWire());

    expect(named('strokeRect', calls)).to.have.lengthOf(1);
    expect(labels(calls)).to.deep.equal(['17.4', '17.8']);
  });

  for (const p of POLYGONS) {
    const n = p.operands.length;

    describe(`GEOM-PERIMETER-POLYGON ${p.shape} (${p.operands.join(', ')})`, () => {
      it(`draws a ${n}-sided outline, not a rectangle`, () => {
        const { calls, el } = render(polygonWire(p.shape, p.operands, p.choices));

        expect(named('strokeRect', calls)).to.have.lengthOf(0);
        expect(named('fillRect', calls)).to.have.lengthOf(0);
        expect(named('moveTo', calls)).to.have.lengthOf(1);
        expect(named('lineTo', calls)).to.have.lengthOf(n);
        expect(choiceLabels(el)).to.have.members(p.choices);
      });

      it('labels every side with its own length, in order, and nothing else', () => {
        const { calls } = render(polygonWire(p.shape, p.operands, p.choices));

        expect(labels(calls)).to.deep.equal(p.operands.map(String));
        expect(labels(calls), 'the perimeter is the answer').to.not.include(String(p.perimeter));
      });

      it('puts each label beside its side, on the canvas', () => {
        const { calls } = render(polygonWire(p.shape, p.operands, p.choices));
        const mids = sideMidpoints(calls);
        const placed = named('fillText', calls).map(textAt);

        expect(mids).to.have.lengthOf(n);
        placed.forEach((at, i) => {
          expect(at.x, `label ${i} x`).to.be.within(10, W - 10);
          expect(at.y, `label ${i} y`).to.be.within(8, H - 8);
          const nearest = mids.reduce((best, m, j) => (dist(at, m) < dist(at, mids[best]!) ? j : best), 0);
          expect(nearest, `label ${i} sits nearest side ${nearest}`).to.equal(i);
          expect(dist(at, mids[i]!)).to.be.below(24);
        });
      });
    });
  }

  it('a row that carries the answer draws the same outline and never the perimeter', () => {
    const { calls } = render(normalizeQuestion({
      id: 'GEOM-PERIMETER-POLYGON-2-6-17-3',
      skillIds: ['GEOM-PERIMETER-POLYGON'],
      format: 'geometry_perimeter',
      image_type: 'shape_2d',
      content: { shape: 'quadrilateral', sides: '2, 6, 17, 3', operands: [2, 6, 17, 3] },
      answer: 28,
      distractors: [{ value: 26, error_type: 'missed-side' }],
    }));

    expect(named('strokeRect', calls)).to.have.lengthOf(0);
    expect(named('lineTo', calls)).to.have.lengthOf(4);
    expect(labels(calls)).to.deep.equal(['2', '6', '17', '3']);
  });
});

/* ================================================================
   beta.19 — pictures that showed the answer. Rows are the real ones
   (dev, BlocHero's recipe, 2026-10-05, and the generator output), sent
   choices-only the way the bank sends them.
   ================================================================ */

const HIGHLIGHT_STROKE = '#e65100';

/** Index in `log` where the face highlight set its stroke colour, or -1. */
function highlightStart(log: CtxCall[]): number {
  return log.map((c) => c.fn === 'set:strokeStyle' && c.args[0] === HIGHLIGHT_STROKE).lastIndexOf(true);
}

/** The draw calls after the highlight colour was set: the highlight itself. */
function highlightCalls(log: CtxCall[]): CtxCall[] {
  const at = highlightStart(log);
  return at < 0 ? [] : log.slice(at + 1).filter((c) => !c.fn.startsWith('set:'));
}

/** Every point the shape's own outlines passed through, before the highlight. */
function shapePoints(log: CtxCall[]): Pt[] {
  const at = highlightStart(log);
  return log.slice(0, at < 0 ? log.length : at)
    .filter((c) => c.fn === 'moveTo' || c.fn === 'lineTo').map(pt);
}

/* ---------- geometry_symmetry: "How many lines of symmetry …?" ---------- */

const symmetryWire = (shape: string, lines: number, choices: number[]) => wire({
  id: `GEOM-SYMMETRY-BASIC-${shape}`,
  skillIds: ['GEOM-SYMMETRY-BASIC'],
  format: 'geometry_symmetry',
  content: { shape, operation: 'geometry_symmetry', lines_of_symmetry: lines },
  questionText: `How many lines of symmetry does a ${shape} have?`,
  choices: [lines, ...choices].map((v) => ({ value: String(v) })),
});

// GEOM-SYMMETRY-BASIC: all eight rows. The answer is lines_of_symmetry.
const SYMMETRY: { shape: string; lines: number; distractors: number[] }[] = [
  { shape: 'triangle', lines: 3, distractors: [4, 2, 5] },
  { shape: 'square', lines: 4, distractors: [3, 2, 5] },
  { shape: 'rectangle', lines: 2, distractors: [3, 4, 5] },
  { shape: 'pentagon', lines: 5, distractors: [3, 4, 2] },
  { shape: 'hexagon', lines: 6, distractors: [3, 4, 2] },
  { shape: 'octagon', lines: 8, distractors: [3, 4, 2] },
  { shape: 'rhombus', lines: 2, distractors: [3, 4, 5] },
  { shape: 'trapezoid', lines: 0, distractors: [3, 4, 2] },
];

/** The drawn outline's corners: a rect's four, or the path's points without the closing repeat. */
function outlineCorners(calls: CtxCall[]): Pt[] {
  const rect = named('rect', calls)[0];
  if (rect) {
    const [x, y, w, h] = rect.args as number[];
    return [{ x: x!, y: y! }, { x: x! + w!, y: y! }, { x: x! + w!, y: y! + h! }, { x: x!, y: y! + h! }];
  }
  const path = calls.filter((c) => c.fn === 'moveTo' || c.fn === 'lineTo').map(pt);
  return path.filter((p, i) => !path.slice(0, i).some((q) => dist(p, q) < 1e-6));
}

/**
 * How many lines of symmetry a convex polygon has. Every axis passes through
 * the centre of the corners and through a corner or the middle of a side, so
 * those are the only candidates. An axis counts when reflecting every corner
 * across it lands on a corner.
 */
function symmetryLines(corners: Pt[]): number {
  const n = corners.length;
  const c = { x: corners.reduce((s, p) => s + p.x, 0) / n, y: corners.reduce((s, p) => s + p.y, 0) / n };
  const through = [...corners, ...corners.map((p, i) => ({
    x: (p.x + corners[(i + 1) % n]!.x) / 2, y: (p.y + corners[(i + 1) % n]!.y) / 2,
  }))];
  const angles: number[] = [];
  for (const q of through) {
    if (dist(q, c) < 1e-9) continue;
    const a = ((Math.atan2(q.y - c.y, q.x - c.x) % Math.PI) + Math.PI) % Math.PI;
    if (!angles.some((b) => Math.abs(b - a) < 1e-6 || Math.abs(Math.abs(b - a) - Math.PI) < 1e-6)) angles.push(a);
  }
  return angles.filter((a) => {
    const ux = Math.cos(a), uy = Math.sin(a);
    return corners.every((p) => {
      const vx = p.x - c.x, vy = p.y - c.y;
      const d = vx * ux + vy * uy;
      const mirrored = { x: c.x + 2 * d * ux - vx, y: c.y + 2 * d * uy - vy };
      return corners.some((q) => dist(q, mirrored) < 1e-6);
    });
  }).length;
}

describe('geometry_symmetry draws the shape, not its lines of symmetry', () => {
  for (const s of SYMMETRY) {
    describe(s.shape, () => {
      it('draws one outline and nothing else: no dashed lines, no text', () => {
        const { calls, el } = render(symmetryWire(s.shape, s.lines, s.distractors));

        expect(named('setLineDash', calls), 'no dashed lines').to.have.lengthOf(0);
        expect(labels(calls)).to.deep.equal([]);
        expect(named('moveTo', calls).length + named('rect', calls).length, 'one outline').to.equal(1);
        expect(choiceLabels(el)).to.have.lengthOf(4);
      });

      it(`the drawn shape has ${s.lines} lines of symmetry, the row's answer`, () => {
        const { calls } = render(symmetryWire(s.shape, s.lines, s.distractors));

        expect(symmetryLines(outlineCorners(calls))).to.equal(s.lines);
      });
    });
  }

  it('every shape but the trapezoid is the same picture as "What shape is this?"', () => {
    for (const s of SYMMETRY.filter((x) => x.shape !== 'trapezoid')) {
      expect(render(symmetryWire(s.shape, s.lines, s.distractors)).calls, s.shape)
        .to.deep.equal(render(identify(s.shape, 'shape_2d')).calls);
    }
  });

  it('a row that carries the answer draws the same', () => {
    const { calls } = render({
      id: 'GEOM-SYMMETRY-BASIC-square', skillIds: ['GEOM-SYMMETRY-BASIC'],
      format: 'geometry_symmetry', imageType: 'shape_2d',
      content: { shape: 'square', lines_of_symmetry: 4 },
      answer: 4, distractors: [{ value: 3, errorType: 'confused-with-triangle' }],
    });

    expect(calls).to.deep.equal(render(identify('square', 'shape_2d')).calls);
  });
});

/* ---------- geometry_face_identify: "What shape is the highlighted face …?" ---------- */

const faceWire = (shape: string, face: string, choices: string[]) => wire({
  id: `GEOM-3D-FACES-IDENTIFY-${shape}-${face}`.replace(/ /g, '-'),
  skillIds: ['GEOM-3D-FACES-IDENTIFY'],
  format: 'geometry_face_identify',
  imageType: 'shape_3d',
  content: { shape, face_shape: face, operation: 'geometry_face_identify' },
  questionText: `What shape is the highlighted face of this ${shape}?`,
  choices: choices.map((value) => ({ value })),
});

// GEOM-3D-FACES-IDENTIFY: all eight rows. `corners` is the highlighted outline's
// vertex count; 0 means an ellipse (a circle seen at an angle). The pyramid and
// the triangular prism each have two rows, and each row offers the other true
// face as a wrong choice, so only the highlight says which face is meant.
const FACES: { shape: string; face: string; corners: number; choices: string[] }[] = [
  { shape: 'cube', face: 'square', corners: 4, choices: ['square', 'rectangle', 'circle', 'triangle'] },
  { shape: 'rectangular prism', face: 'rectangle', corners: 4, choices: ['rectangle', 'square', 'triangle', 'circle'] },
  { shape: 'pyramid', face: 'square', corners: 4, choices: ['square', 'triangle', 'circle', 'rectangle'] },
  { shape: 'pyramid', face: 'triangle', corners: 3, choices: ['triangle', 'square', 'circle', 'rectangle'] },
  { shape: 'triangular prism', face: 'triangle', corners: 3, choices: ['triangle', 'square', 'circle', 'rectangle'] },
  { shape: 'triangular prism', face: 'rectangle', corners: 4, choices: ['rectangle', 'square', 'triangle', 'circle'] },
  { shape: 'cylinder', face: 'circle', corners: 0, choices: ['circle', 'rectangle', 'square', 'triangle'] },
  { shape: 'cone', face: 'circle', corners: 0, choices: ['circle', 'triangle', 'square', 'rectangle'] },
];

describe('geometry_face_identify highlights the face and never names it', () => {
  for (const f of FACES) {
    describe(`${f.shape}, ${f.face} face`, () => {
      it('writes nothing on the canvas', () => {
        const { calls, el } = render(faceWire(f.shape, f.face, f.choices));

        expect(labels(calls), `"face: ${f.face}" is the answer`).to.deep.equal([]);
        expect(choiceLabels(el)).to.have.members(f.choices);
      });

      it(`outlines one ${f.face}-shaped face`, () => {
        const h = highlightCalls(render(faceWire(f.shape, f.face, f.choices)).log);

        if (f.corners === 0) {
          expect(named('ellipse', h)).to.have.lengthOf(1);
          expect(named('lineTo', h)).to.have.lengthOf(0);
        } else {
          expect(named('moveTo', h)).to.have.lengthOf(1);
          expect(named('lineTo', h)).to.have.lengthOf(f.corners - 1);
          expect(named('closePath', h)).to.have.lengthOf(1);
          expect(named('ellipse', h)).to.have.lengthOf(0);
        }
      });

      it('the outlined face is a face of the drawn shape', () => {
        const { log } = render(faceWire(f.shape, f.face, f.choices));
        const h = highlightCalls(log);

        if (f.corners === 0) {
          const [x, y, rx, ry] = named('ellipse', h)[0]!.args as number[];
          const before = log.slice(0, highlightStart(log)).filter((c) => c.fn === 'ellipse');
          const same = before.filter((c) => {
            const [bx, by, brx, bry] = c.args as number[];
            return Math.abs(bx! - x!) < 0.01 && Math.abs(by! - y!) < 0.01
              && Math.abs(brx! - rx!) < 0.01 && Math.abs(bry! - ry!) < 0.01;
          });
          expect(same, 'the highlight ellipse matches one the shape drew').to.not.have.lengthOf(0);
          return;
        }
        const corners = h.filter((c) => c.fn === 'moveTo' || c.fn === 'lineTo').map(pt);
        const drawn = shapePoints(log);
        corners.forEach((c, i) => {
          const nearest = Math.min(...drawn.map((d) => dist(c, d)));
          expect(nearest, `corner ${i} is a corner of the shape`).to.be.below(0.01);
        });
      });
    });
  }

  it('a row that carries the answer is drawn the same way', () => {
    const { calls, log } = render({
      id: 'GEOM-3D-FACES-IDENTIFY-pyramid-square', skillIds: ['GEOM-3D-FACES-IDENTIFY'],
      format: 'geometry_face_identify', imageType: 'shape_3d',
      content: { shape: 'pyramid', face_shape: 'square' },
      answer: 'square', distractors: [{ value: 'triangle', errorType: 'wrong-classification' }],
    });

    expect(labels(calls)).to.deep.equal([]);
    expect(named('lineTo', highlightCalls(log))).to.have.lengthOf(3);
  });

  it('a face the shape does not have: the shape alone, no highlight, no text', () => {
    const { calls, log } = render({
      ...faceIdentify(), id: 'GEOM-3D-FACES-IDENTIFY-sphere',
      content: { shape: 'sphere', face_shape: 'circle' }, answer: 'circle',
    });

    expect(labels(calls)).to.deep.equal([]);
    expect(highlightStart(log)).to.equal(-1);
    expect(named('arc', calls), 'the sphere is still drawn').to.have.lengthOf(1);
  });
});

/* ---------- geometry_circle_convert: "A circle has a diameter of 48. What is the radius?" ---------- */

const convertWire = (given: 'radius' | 'diameter', value: number, choices: number[]) => wire({
  id: `GEOM-CIRCLE-RADIUS-DIAMETER-${given === 'radius' ? 'r' : 'd'}${value}`,
  skillIds: ['GEOM-CIRCLE-RADIUS-DIAMETER'],
  format: 'geometry_circle_convert',
  content: {
    value, given_type: given, find_type: given === 'radius' ? 'diameter' : 'radius',
    operation: 'geometry_circle_convert',
  },
  questionText: `A circle has a ${given} of ${value}. What is the ${given === 'radius' ? 'diameter' : 'radius'}?`,
  choices: choices.map((v) => ({ value: String(v) })),
});

// The element's canvas is 300x200; the circle is centred with r = 200 * 0.35.
const CIRCLE_R = 70;

describe('geometry_circle_convert labels what it gives, never what it asks', () => {
  it('given a diameter of 48: draws and labels the diameter, never the radius 24', () => {
    const { calls } = render(convertWire('diameter', 48, [24, 48, 96, 25]));

    expect(labels(calls)).to.deep.equal(['d=48']);
    expect(labels(calls).join(' '), 'the radius is the answer').to.not.match(/\b24\b/);
    const [from] = named('moveTo', calls);
    const [to] = named('lineTo', calls);
    expect(pt(from!)).to.deep.equal({ x: CX - CIRCLE_R, y: CY });
    expect(pt(to!)).to.deep.equal({ x: CX + CIRCLE_R, y: CY });
  });

  it('given a radius of 17: draws and labels the radius, never the diameter 34', () => {
    const { calls } = render(convertWire('radius', 17, [34, 17, 35, 19]));

    expect(labels(calls)).to.deep.equal(['r=17']);
    const [from] = named('moveTo', calls);
    const [to] = named('lineTo', calls);
    expect(pt(from!)).to.deep.equal({ x: CX, y: CY });
    expect(pt(to!)).to.deep.equal({ x: CX + CIRCLE_R, y: CY });
  });

  it('a row that carries the answer labels the same way', () => {
    const { calls } = render(normalizeQuestion({
      id: 'GEOM-CIRCLE-RADIUS-DIAMETER-d18', skill_ids: ['GEOM-CIRCLE-RADIUS-DIAMETER'],
      format: 'geometry_circle_convert', image_type: 'shape_2d',
      content: { value: 18, given_type: 'diameter', find_type: 'radius' },
      answer: 9, distractors: [{ value: 18, error_type: 'gave-same-value' }],
    }));

    expect(labels(calls)).to.deep.equal(['d=18']);
  });

  it('an unknown given type: the circle alone, no label', () => {
    const { calls } = render(wire({
      id: 'GEOM-CIRCLE-CONVERT-unknown',
      skillIds: ['GEOM-CIRCLE-RADIUS-DIAMETER'],
      format: 'geometry_circle_convert',
      content: { value: 5, given_type: 'circumference', find_type: 'radius' },
      choices: [{ value: '1' }, { value: '2' }],
    }));

    expect(labels(calls)).to.deep.equal([]);
    expect(named('arc', calls)).to.have.lengthOf(1);
  });
});

/* ---------- geometry_angle_classify: "What type of angle is 129°?" ---------- */

const angleWire = (angle: number, choices: string[]) => wire({
  id: `GEOM-ANGLE-CLASSIFY-${angle}`,
  skillIds: ['GEOM-ANGLE-CLASSIFY'],
  format: 'geometry_angle_classify',
  imageType: 'angle',
  content: { angle, operation: 'geometry_angle_classify' },
  questionText: `What type of angle is ${angle}°?`,
  choices: choices.map((value) => ({ value })),
});

const ANGLE_TYPES = ['acute', 'right', 'obtuse', 'straight'];

describe('geometry_angle_classify draws every type of angle the same colour', () => {
  // One of each type: acute, right, obtuse, straight.
  const angles = [40, 90, 129, 180];

  it('the stroke colour does not depend on the answer', () => {
    const colours = angles.map((a) => strokeStyles(render(angleWire(a, ANGLE_TYPES)).sets));

    colours.slice(1).forEach((c, i) => {
      expect(c, `${angles[i + 1]}° is drawn in a different colour from ${angles[0]}°`).to.deep.equal(colours[0]);
    });
  });

  it('labels only the angle the stem gives, never its type', () => {
    for (const a of angles) {
      expect(labels(render(angleWire(a, ANGLE_TYPES)).calls)).to.deep.equal([`${a}°`]);
    }
  });
});

/* ---------- base10_block_count: "How many tens blocks are in 6378?" ----------
   The picture drew the number in blocks with the asked place highlighted, so
   counting the highlighted blocks was the answer. The stem names the number,
   so it is answerable alone: no picture, as for geometry_attributes. */

// What the bank sends: its content allow-list keeps only `operation` here.
const blockCountWire = () => wire({
  id: 'BASE10-BLOCK-COUNT-6378-tens',
  skillIds: ['BASE10-BLOCK-COUNT'],
  format: 'base10_block_count',
  imageType: 'base10_blocks',
  content: { operation: 'base10_block_count' },
  questionText: 'How many tens blocks are in 6378?',
  choices: ['7', '6', '3', '8'].map((value) => ({ value })),
});

// The generator's row, as an assignment snapshot carries it: number and place.
const blockCountRow = (extra: Record<string, unknown> = {}) => normalizeQuestion({
  id: 'BASE10-BLOCK-COUNT-347-tens',
  skill_ids: ['BASE10-BLOCK-COUNT'],
  format: 'base10_block_count',
  content: { number: 347, place: 'tens', operation: 'base10_block_count' },
  answer: 4,
  distractors: [{ value: 3, error_type: 'wrong-place' }, { value: 7, error_type: 'wrong-place' }],
  ...extra,
});

describe('base10_block_count draws no picture', () => {
  it('a choices-only row renders its prompt and four choices', () => {
    const { el } = render(blockCountWire());

    expect(el.shadowRoot!.querySelector('[part="prompt"]')!.textContent).to.equal('How many tens blocks are in 6378?');
    expect(choiceLabels(el)).to.have.members(['7', '6', '3', '8']);
  });

  it('a row that carries the number paints nothing', () => {
    const { calls, el } = render(blockCountRow({ questionText: 'How many tens blocks are in 347?' }));

    expect(calls, 'the blocks for 347 count out the answer').to.have.lengthOf(0);
    expect(choiceLabels(el)).to.include('4');
  });

  it('hides the canvas, so there is no empty box between the prompt and the choices', () => {
    for (const [label, q] of [['choices-only', blockCountWire()], ['with number', blockCountRow()]] as const) {
      const canvas = canvasOf(render(q).el);
      expect(canvas.hidden, `${label}: hidden`).to.equal(true);
      expect(getComputedStyle(canvas).display, `${label}: display`).to.equal('none');
    }
  });

  it('shows the canvas again for a base-10 question that has a picture', () => {
    const { el } = render(blockCountRow());
    (el as HTMLElement & { question: unknown }).question = normalizeQuestion({
      id: 'BASE10-ONES-TENS-VISUAL-34', skill_ids: ['BASE10-ONES-TENS-VISUAL'], format: 'base10_count',
      content: { number: 34, blocks: { tens: 3, ones: 4 }, operation: 'base10_count' },
      answer: 34, distractors: [{ value: 43, error_type: 'swapped-places' }],
    });

    expect(canvasOf(el).hidden).to.equal(false);
  });

  it('with no question text, the stem names the number', () => {
    const { el } = render(blockCountRow());

    expect(el.shadowRoot!.querySelector('[part="prompt"]')!.textContent).to.equal('How many tens blocks are in 347?');
  });
});

/* ================================================================
   beta.19, part 3 — pictures that pointed at a wrong answer, or were
   labelled wrongly. Real rows from mathSkills' generator output.
   ================================================================ */

/** Each moveTo starts a path; the lineTo calls after it are its points. */
function paths(calls: CtxCall[]): Pt[][] {
  const out: Pt[][] = [];
  for (const c of calls) {
    if (c.fn === 'moveTo') out.push([pt(c)]);
    else if (c.fn === 'lineTo' && out.length > 0) out[out.length - 1]!.push(pt(c));
  }
  return out;
}

/** A closed outline's side lengths, in drawing order. */
function sideLengths(corners: Pt[]): number[] {
  return corners.map((p, i) => dist(p, corners[(i + 1) % corners.length]!));
}

/** A closed outline's interior angles in degrees, in drawing order. */
function interiorAngles(corners: Pt[]): number[] {
  const n = corners.length;
  return corners.map((p, i) => {
    const a = corners[(i + n - 1) % n]!, b = corners[(i + 1) % n]!;
    const v1 = { x: a.x - p.x, y: a.y - p.y }, v2 = { x: b.x - p.x, y: b.y - p.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  });
}

const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

/** What a triangle is, read off the drawn picture. */
function classifyDrawn(corners: Pt[], by: string): string {
  if (by === 'sides') {
    const s = sideLengths(corners);
    const equalPairs = [[0, 1], [1, 2], [0, 2]].filter(([i, j]) => near(s[i]!, s[j]!)).length;
    return equalPairs === 3 ? 'equilateral' : equalPairs === 1 ? 'isosceles' : 'scalene';
  }
  const biggest = Math.max(...interiorAngles(corners));
  return Math.abs(biggest - 90) < 0.01 ? 'right' : biggest > 90 ? 'obtuse' : 'acute';
}

const allOnCanvas = (pts: Pt[]) => pts.every((p) => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H);

/* ---------- geometry_classify_triangle: "Classify this triangle by its sides." ---------- */

const triangleWire = (operands: number[], by: 'sides' | 'angles') => wire({
  id: `GEOM-CLASSIFY-TRIANGLES-${by}-${operands.join('-')}`,
  skillIds: ['GEOM-CLASSIFY-TRIANGLES'],
  format: 'geometry_classify_triangle',
  content: {
    operands, operation: 'geometry_classify_triangle', classify_by: by,
    ...(by === 'angles' ? { known_angles: operands } : {}),
  },
  questionText: `Classify this triangle by its ${by}.`,
  choices: (by === 'sides' ? ['scalene', 'isosceles', 'equilateral'] : ['acute', 'right', 'obtuse'])
    .map((value) => ({ value })),
});

// GEOM-CLASSIFY-TRIANGLES: all eighteen rows.
const TRIANGLES: { operands: number[]; by: 'sides' | 'angles'; answer: string }[] = [
  { operands: [3, 4, 5], by: 'sides', answer: 'scalene' },
  { operands: [5, 5, 8], by: 'sides', answer: 'isosceles' },
  { operands: [6, 6, 6], by: 'sides', answer: 'equilateral' },
  { operands: [7, 10, 12], by: 'sides', answer: 'scalene' },
  { operands: [8, 8, 5], by: 'sides', answer: 'isosceles' },
  { operands: [9, 9, 9], by: 'sides', answer: 'equilateral' },
  { operands: [3, 5, 7], by: 'sides', answer: 'scalene' },
  { operands: [10, 10, 4], by: 'sides', answer: 'isosceles' },
  { operands: [4, 4, 4], by: 'sides', answer: 'equilateral' },
  { operands: [60, 70, 50], by: 'angles', answer: 'acute' },
  { operands: [90, 45, 45], by: 'angles', answer: 'right' },
  { operands: [120, 30, 30], by: 'angles', answer: 'obtuse' },
  { operands: [80, 60, 40], by: 'angles', answer: 'acute' },
  { operands: [90, 60, 30], by: 'angles', answer: 'right' },
  { operands: [100, 40, 40], by: 'angles', answer: 'obtuse' },
  { operands: [70, 55, 55], by: 'angles', answer: 'acute' },
  { operands: [90, 50, 40], by: 'angles', answer: 'right' },
  { operands: [110, 35, 35], by: 'angles', answer: 'obtuse' },
];

const sortNum = (xs: number[]) => [...xs].sort((a, b) => a - b);

describe('geometry_classify_triangle draws the triangle its row describes', () => {
  for (const t of TRIANGLES) {
    describe(`${t.by} ${t.operands.join(', ')} (${t.answer})`, () => {
      it(`draws a triangle with exactly these ${t.by}`, () => {
        const { calls, el } = render(triangleWire(t.operands, t.by));
        const outline = paths(calls)[0]!;

        expect(outline).to.have.lengthOf(3);
        if (t.by === 'sides') {
          const drawn = sortNum(sideLengths(outline));
          const given = sortNum(t.operands);
          drawn.forEach((d, i) => expect(d / drawn[0]!).to.be.closeTo(given[i]! / given[0]!, 1e-9));
        } else {
          sortNum(interiorAngles(outline)).forEach((a, i) => expect(a).to.be.closeTo(sortNum(t.operands)[i]!, 1e-6));
        }
        expect(allOnCanvas(outline), 'the triangle fits the canvas').to.equal(true);
        expect(canvasOf(el).hidden).to.equal(false);
      });

      it(`the picture is a ${t.answer} triangle, the row's answer`, () => {
        const outline = paths(render(triangleWire(t.operands, t.by)).calls)[0]!;

        expect(classifyDrawn(outline, t.by)).to.equal(t.answer);
      });

      it(`labels each given ${t.by === 'sides' ? 'side' : 'angle'}, and never the answer`, () => {
        const { calls } = render(triangleWire(t.operands, t.by));
        const unit = t.by === 'angles' ? '°' : '';

        expect([...labels(calls)].sort()).to.deep.equal(t.operands.map((n) => `${n}${unit}`).sort());
        const placed = named('fillText', calls).map(textAt);
        expect(allOnCanvas(placed), 'every label is on the canvas').to.equal(true);
      });
    });
  }

  it('a row that carries the answer draws the same triangle', () => {
    const wireCalls = render(triangleWire([5, 5, 8], 'sides')).calls;
    const { calls } = render(normalizeQuestion({
      id: 'GEOM-CLASSIFY-TRIANGLES-sides-5-5-8', skill_ids: ['GEOM-CLASSIFY-TRIANGLES'],
      format: 'geometry_classify_triangle', image_type: 'shape_2d',
      content: { operands: [5, 5, 8], classify_by: 'sides' },
      answer: 'isosceles', distractors: [{ value: 'scalene', error_type: 'wrong-classification' }],
    }));

    expect(calls).to.deep.equal(wireCalls);
  });

  // Content that cannot make the triangle it names: no picture, so nothing
  // points at a wrong answer.
  for (const [label, operands, by] of [
    ['sides that cannot close (1, 2, 10)', [1, 2, 10], 'sides'],
    ['angles that do not add to 180 (90, 90, 30)', [90, 90, 30], 'angles'],
    ['only two sides', [5, 5], 'sides'],
    ['an unknown classify_by', [3, 4, 5], 'colour'],
  ] as const) {
    it(`${label}: no picture, the canvas hidden`, () => {
      const { calls, el } = render(wire({
        id: 'GEOM-CLASSIFY-TRIANGLES-bad', skillIds: ['GEOM-CLASSIFY-TRIANGLES'],
        format: 'geometry_classify_triangle',
        content: { operands, classify_by: by, operation: 'geometry_classify_triangle' },
        questionText: 'Classify this triangle.', choices: [{ value: 'acute' }, { value: 'right' }],
      }));

      expect(calls, 'nothing painted').to.have.lengthOf(0);
      expect(canvasOf(el).hidden).to.equal(true);
      expect(choiceLabels(el)).to.have.lengthOf(2);
    });
  }

  it('shows the canvas again for the next triangle that can be drawn', () => {
    const { el } = render(wire({
      id: 'GEOM-CLASSIFY-TRIANGLES-bad', skillIds: ['GEOM-CLASSIFY-TRIANGLES'],
      format: 'geometry_classify_triangle',
      content: { operands: [1, 2, 10], classify_by: 'sides' },
      choices: [{ value: 'scalene' }],
    }));
    (el as HTMLElement & { question: unknown }).question = triangleWire([3, 4, 5], 'sides');

    expect(canvasOf(el).hidden).to.equal(false);
  });
});

/* ---------- geometry_area: triangles, parallelograms and trapezoids ---------- */

const areaWire = (skill: string, content: Record<string, unknown>, questionText: string) => wire({
  id: `${skill}-${(content['operands'] as number[]).join('-')}`,
  skillIds: [skill],
  format: 'geometry_area',
  content: { ...content, operation: 'geometry_area' },
  questionText,
  choices: [{ value: '1' }, { value: '2' }, { value: '3' }, { value: '4' }],
});

const top = (pts: Pt[]) => pts.filter((p) => near(p.y, Math.min(...pts.map((q) => q.y))));
const bottom = (pts: Pt[]) => pts.filter((p) => near(p.y, Math.max(...pts.map((q) => q.y))));
const span = (pts: Pt[]) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
const tall = (pts: Pt[]) => Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));

describe('geometry_area draws the shape it asks about, never its area', () => {
  it('GEOM-AREA-TRIANGLE (base 12, height 9): a triangle to scale, base and height labelled', () => {
    const { calls } = render(areaWire('GEOM-AREA-TRIANGLE',
      { shape: 'triangle', operands: [12, 9], dimensions: 'base 12 and height 9' },
      'Find the area of a triangle with base 12 and height 9.'));
    const [outline] = paths(calls);

    expect(outline, 'three corners').to.have.lengthOf(3);
    expect(bottom(outline!), 'a flat base').to.have.lengthOf(2);
    expect(span(bottom(outline!)) / tall(outline!)).to.be.closeTo(12 / 9, 1e-9);
    expect(named('strokeRect', calls), 'not a rectangle').to.have.lengthOf(0);
    expect([...labels(calls)].sort()).to.deep.equal(['12', '9']);
    expect(allOnCanvas(outline!)).to.equal(true);
  });

  it('GEOM-AREA-PARALLELOGRAM (base 6, height 2): a slanted parallelogram, base and height labelled', () => {
    const { calls } = render(areaWire('GEOM-AREA-PARALLELOGRAM',
      { shape: 'parallelogram', operands: [6, 2], dimensions: 'base 6 and height 2', slant: 5 },
      'Find the area of a parallelogram with base 6 and height 2.'));
    const [outline] = paths(calls);

    expect(outline, 'four corners').to.have.lengthOf(4);
    const [b0, b1] = bottom(outline!), [t0, t1] = top(outline!);
    expect(span([b0!, b1!])).to.be.closeTo(span([t0!, t1!]), 1e-9);
    expect(span([b0!, b1!]) / tall(outline!)).to.be.closeTo(6 / 2, 1e-9);
    expect(Math.min(t0!.x, t1!.x), 'slanted, not a rectangle').to.not.be.closeTo(Math.min(b0!.x, b1!.x), 1);
    expect([...labels(calls)].sort(), 'the slant (5) is not in the question').to.deep.equal(['2', '6']);
  });

  it('GEOM-AREA-TRAPEZOID (bases 3 and 12, height 4): a trapezoid to scale, every measure labelled', () => {
    const { calls } = render(areaWire('GEOM-AREA-TRAPEZOID',
      { shape: 'trapezoid', operands: [3, 12, 4], dimensions: 'bases 3 and 12 and height 4' },
      'Find the area of a trapezoid with bases 3 and 12 and height 4.'));
    const [outline] = paths(calls);

    expect(outline, 'four corners').to.have.lengthOf(4);
    const shortBase = span(top(outline!)), longBase = span(bottom(outline!));
    expect(shortBase / longBase).to.be.closeTo(3 / 12, 1e-9);
    expect(tall(outline!) / longBase).to.be.closeTo(4 / 12, 1e-9);
    expect([...labels(calls)].sort()).to.deep.equal(['12', '3', '4']);
  });

  it('never labels the area', () => {
    const rows = [
      [areaWire('GEOM-AREA-TRIANGLE', { shape: 'triangle', operands: [12, 9] }, 't'), '54'],
      [areaWire('GEOM-AREA-PARALLELOGRAM', { shape: 'parallelogram', operands: [13, 18] }, 'p'), '234'],
      [areaWire('GEOM-AREA-TRAPEZOID', { shape: 'trapezoid', operands: [3, 12, 4] }, 'z'), '30'],
    ] as const;
    for (const [q, area] of rows) expect(labels(render(q).calls)).to.not.include(area);
  });

  it('a rectangle is unchanged: length and width to scale and labelled', () => {
    const { calls } = render(areaWire('GEOM-AREA-SQUARE-RECT',
      { shape: 'rectangle', operands: [8, 3] }, 'Find the area of a rectangle with length 8 and width 3.'));

    expect(named('strokeRect', calls)).to.have.lengthOf(1);
    expect(labels(calls)).to.deep.equal(['8', '3']);
  });
});

/* ---------- geometry_volume / geometry_surface_area: label what the question gives ---------- */

const solidWire = (format: 'geometry_volume' | 'geometry_surface_area', skill: string, shape: string,
  operands: number[], questionText: string) => wire({
  id: `${skill}-${operands.join('-')}`,
  skillIds: [skill],
  format,
  imageType: 'shape_3d',
  content: { shape, operands, operation: format },
  questionText,
  choices: [{ value: '1' }, { value: '2' }],
});

describe('volume and surface area label what the question gives', () => {
  const ROWS: { format: 'geometry_volume' | 'geometry_surface_area'; skill: string; shape: string;
    operands: number[]; text: string; expected: string[]; answer: string }[] = [
    { format: 'geometry_volume', skill: 'GEOM-VOLUME-TRIANGULAR-PRISM', shape: 'triangular prism', operands: [16, 10],
      text: 'Find the volume of a triangular prism with base area 16 and height 10.',
      expected: ['base area=16', 'h=10'], answer: '160' },
    { format: 'geometry_surface_area', skill: 'GEOM-SURFACE-AREA-TRIANGULAR-PRISM', shape: 'triangular prism',
      operands: [7, 2, 3], text: 'Find the surface area of a triangular prism with base 7, height 2, and length 3.',
      expected: ['b=7', 'h=2', 'l=3'], answer: '59' },
    { format: 'geometry_surface_area', skill: 'GEOM-SURFACE-AREA-PYRAMID', shape: 'pyramid', operands: [10, 5],
      text: 'Find the surface area of a square pyramid with base side 10 and slant height 5.',
      expected: ['side=10', 'slant=5'], answer: '200' },
    { format: 'geometry_volume', skill: 'GEOM-VOLUME-RECT-PRISM', shape: 'rectangular prism', operands: [11, 18, 14],
      text: 'Find the volume of a rectangular prism with length 11, width 18, and height 14.',
      expected: ['l=11', 'w=18', 'h=14'], answer: '2772' },
    { format: 'geometry_surface_area', skill: 'GEOM-SURFACE-AREA-RECT-PRISM', shape: 'rectangular prism',
      operands: [6, 5, 9], text: 'Find the surface area of a rectangular prism with length 6, width 5, and height 9.',
      expected: ['l=6', 'w=5', 'h=9'], answer: '258' },
    { format: 'geometry_volume', skill: 'GEOM-VOLUME-CYLINDER', shape: 'cylinder', operands: [7, 6],
      text: 'Find the volume of a cylinder with radius 7 and height 6.', expected: ['r=7', 'h=6'], answer: '923.16' },
  ];

  for (const r of ROWS) {
    it(`${r.skill}: ${r.expected.join(', ')}, on the canvas, never the answer`, () => {
      const { calls } = render(solidWire(r.format, r.skill, r.shape, r.operands, r.text));

      expect([...labels(calls)].sort()).to.deep.equal([...r.expected].sort());
      expect(labels(calls).join(' ')).to.not.include(r.answer);
      expect(allOnCanvas(named('fillText', calls).map(textAt)), 'every label is on the canvas').to.equal(true);
    });
  }

  it('a pyramid volume (no such row yet): the operands have no known meaning, so no labels', () => {
    const { calls } = render(solidWire('geometry_volume', 'GEOM-VOLUME-PYRAMID', 'pyramid', [4, 6], 'x'));

    expect(labels(calls)).to.deep.equal([]);
  });

  it('the triangular prism surface area draws its triangle height as a dashed line', () => {
    const { calls } = render(solidWire('geometry_surface_area', 'GEOM-SURFACE-AREA-TRIANGULAR-PRISM',
      'triangular prism', [7, 2, 3], 'x'));

    expect(named('setLineDash', calls).some((c) => (c.args[0] as number[]).length > 0)).to.equal(true);
  });
});

/* ---------- the pyramid: a readable size ---------- */

describe('the pyramid is drawn at a readable size', () => {
  it('fills most of the canvas height, and stays on it', () => {
    const pts = paths(render(identify('pyramid', 'shape_3d')).calls).flat();

    expect(tall(pts), 'at least two thirds of the 200px canvas').to.be.at.least(H * 2 / 3);
    expect(allOnCanvas(pts)).to.equal(true);
  });

  it('the face-identify base highlight is a face, not a thin strip', () => {
    const h = highlightCalls(render(faceWire('pyramid', 'square', FACES[2]!.choices)).log);
    const base = h.filter((c) => c.fn === 'moveTo' || c.fn === 'lineTo').map(pt);

    expect(tall(base), 'at least 30px deep').to.be.at.least(30);
    expect(span(base), 'at least 90px wide').to.be.at.least(90);
  });
});

/* ================================================================
   beta.19, part 4 — 3D shapes fit the canvas; base-10 bank rows.
   ================================================================ */

/** Every point a draw touched: path corners, plus the extremes of arcs and ellipses. */
function drawnExtent(calls: CtxCall[]): Pt[] {
  const out: Pt[] = [];
  for (const c of calls) {
    const a = c.args as number[];
    if (c.fn === 'moveTo' || c.fn === 'lineTo') out.push(pt(c));
    else if (c.fn === 'arc') out.push({ x: a[0]! - a[2]!, y: a[1]! - a[2]! }, { x: a[0]! + a[2]!, y: a[1]! + a[2]! });
    else if (c.fn === 'ellipse') out.push({ x: a[0]! - a[2]!, y: a[1]! - a[3]! }, { x: a[0]! + a[2]!, y: a[1]! + a[3]! });
  }
  return out;
}

const MARGIN = 10;

describe('3D shapes fit the canvas', () => {
  for (const shape of ['cube', 'rectangular prism', 'triangular prism', 'pyramid', 'cylinder', 'cone', 'sphere']) {
    it(`${shape}: every point at least ${MARGIN}px inside the canvas`, () => {
      const pts = drawnExtent(render(identify(shape, 'shape_3d')).calls);

      expect(pts.length).to.be.greaterThan(0);
      for (const p of pts) {
        expect(p.x, `${shape} x`).to.be.within(MARGIN, W - MARGIN);
        expect(p.y, `${shape} y`).to.be.within(MARGIN, H - MARGIN);
      }
    });
  }

  it('the triangular prism is drawn at a readable size, like the pyramid', () => {
    const pts = drawnExtent(render(identify('triangular prism', 'shape_3d')).calls);

    expect(tall(pts), 'at least two thirds of the 200px canvas').to.be.at.least(H * 2 / 3);
  });

  it('the cube and rectangular prism still fill most of the canvas height', () => {
    for (const shape of ['cube', 'rectangular prism']) {
      expect(tall(drawnExtent(render(identify(shape, 'shape_3d')).calls)), shape).to.be.at.least(H * 0.75);
    }
  });
});

/* ---------- base-10 rows as the bank sends them ----------
   The bank keeps each row's own format name (base10_count, base10_regroup,
   base10_compare), and its content allow-list keeps only `operation`: the
   blocks are stripped. */

const base10Bank = (format: string, content: Record<string, unknown>, questionText: string) => wire({
  id: `BANK-${format}`,
  skillIds: ['BASE10-REPRESENT-WITHIN-100'],
  format,
  imageType: 'base10_blocks',
  content: { operation: format, ...content },
  questionText,
  choices: ['21', '12', '31', '20'].map((value) => ({ value })),
});

// The generator's rows, which normalize to base10_blocks and draw today.
const base10Legacy = (format: string, content: Record<string, unknown>, answer: number) => normalizeQuestion({
  id: `LEGACY-${format}`, skill_ids: ['BASE10-REPRESENT-WITHIN-100'], format,
  content: { operation: format, ...content }, answer,
  distractors: [{ value: answer + 1, error_type: 'off-by-1' }],
});

// Block data with no `number`: for a count or a regroup the number is the answer.
const BASE10_BANK: { format: string; blocks: Record<string, unknown>; text: string; answer: number }[] = [
  { format: 'base10_count', blocks: { blocks: { tens: 2, ones: 1 } }, text: 'What number do these blocks show?', answer: 21 },
  { format: 'base10_regroup', blocks: { tens_shown: 4, ones_shown: 12, blocks: { tens: 4, ones: 12 } },
    text: '4 tens rods and 12 ones cubes. What number after regrouping?', answer: 52 },
  { format: 'base10_compare', blocks: {
    set_a: { number: 71, blocks: { tens: 7, ones: 1 } }, set_b: { number: 54, blocks: { tens: 5, ones: 4 } },
  }, text: 'Which set of blocks shows a bigger number? Set A: 7 tens and 1 one. Set B: 5 tens and 4 ones.', answer: 71 },
];

describe('base-10 rows under their bank format names', () => {
  for (const b of BASE10_BANK) {
    describe(b.format, () => {
      it('as the bank sends it today (no blocks): no picture box, prompt and choices render', () => {
        const { calls, el } = render(base10Bank(b.format, {}, b.text));

        expect(calls, 'nothing to draw').to.have.lengthOf(0);
        expect(canvasOf(el).hidden, 'an empty box is hidden').to.equal(true);
        expect(el.shadowRoot!.querySelector('[part="prompt"]')!.textContent).to.equal(b.text);
        expect(choiceLabels(el)).to.have.lengthOf(4);
      });

      it('with its blocks: the same picture as the generator row', () => {
        const { calls, el } = render(base10Bank(b.format, b.blocks, b.text));
        const legacy = render(base10Legacy(b.format, b.blocks, b.answer)).calls;

        expect(calls.length, 'the blocks are drawn').to.be.greaterThan(0);
        expect(calls).to.deep.equal(legacy);
        expect(canvasOf(el).hidden).to.equal(false);
      });

      it('never prints the answer', () => {
        const { calls } = render(base10Bank(b.format, b.blocks, b.text));

        expect(labels(calls).filter((t) => t !== 'Set A' && t !== 'Set B')).to.deep.equal([]);
        expect(labels(calls).join(' ')).to.not.include(String(b.answer));
      });
    });
  }

  it('base10_block_count under its bank name stays hidden even with blocks', () => {
    const { calls, el } = render(base10Bank('base10_block_count', { number: 347, place: 'tens' },
      'How many tens blocks are in 347?'));

    expect(calls).to.have.lengthOf(0);
    expect(canvasOf(el).hidden).to.equal(true);
  });
});

/* ---------- geometry_classify_triangle without usable operands ---------- */

describe('geometry_classify_triangle with no usable operands', () => {
  for (const [label, content] of [
    ['no operands', { classify_by: 'sides', operation: 'geometry_classify_triangle' }],
    ['operands that are not a list', { operands: '3, 4, 5', classify_by: 'sides' }],
  ] as const) {
    it(`${label}: no picture, no throw, the choices render`, () => {
      let out: ReturnType<typeof render> | undefined;
      expect(() => {
        out = render(wire({
          id: 'GEOM-CLASSIFY-TRIANGLES-no-operands', skillIds: ['GEOM-CLASSIFY-TRIANGLES'],
          format: 'geometry_classify_triangle', content,
          questionText: 'Classify this triangle by its sides.',
          choices: ['scalene', 'isosceles', 'equilateral'].map((value) => ({ value })),
        }));
      }).to.not.throw();

      expect(out!.calls, 'nothing painted').to.have.lengthOf(0);
      expect(canvasOf(out!.el).hidden).to.equal(true);
      expect(choiceLabels(out!.el)).to.have.members(['scalene', 'isosceles', 'equilateral']);
    });
  }
});

/* ---------- labels the answer-label sweep fixed (pins) ---------- */

describe('labels found by the answer-label sweep', () => {
  it('GEOM-PYTHAGOREAN-LEG, older row (hypotenuse among operands, no known_leg): known leg inferred, "?" on the missing leg', () => {
    const { calls } = render(wire({
      id: 'GEOM-PYTHAGOREAN-LEG-4-5', skillIds: ['GEOM-PYTHAGOREAN-LEG'], format: 'pythagorean',
      imageType: 'right_triangle', content: { operands: [4, 5], hypotenuse: 5, legs: [3, 4], operation: 'pythagorean' },
      questionText: 'A right triangle has a leg of 4 and a hypotenuse of 5. Find the other leg.',
      answer: 3, distractors: [{ value: '4', errorType: 'x' }],
    }));

    expect(labels(calls)).to.have.members(['4', '5', '?']);
    expect(labels(calls)).to.not.include('3');
    // "?" sits on the missing leg (drawn second), not on the hypotenuse.
    expect(labels(calls)).to.deep.equal(['4', '?', '5']);
  });

  it('a row with neither known_leg nor a hypotenuse among its operands takes the find-hypotenuse picture', () => {
    const { calls } = render(wire({
      id: 'GEOM-PYTHAGOREAN-BASIC-3-4-nohyp', skillIds: ['GEOM-PYTHAGOREAN-BASIC'], format: 'pythagorean',
      imageType: 'right_triangle', content: { operands: [3, 4], hypotenuse: 5, operation: 'pythagorean' },
      questionText: 'Find the hypotenuse.', answer: 5, distractors: [{ value: '7', errorType: 'x' }],
    }));

    expect(labels(calls)).to.deep.equal(['3', '4', '?']);
  });

  it('GEOM-PYTHAGOREAN-BASIC is unchanged: both legs labelled, "?" on the hypotenuse', () => {
    const { calls } = render(wire({
      id: 'GEOM-PYTHAGOREAN-BASIC-3-4', skillIds: ['GEOM-PYTHAGOREAN-BASIC'], format: 'pythagorean',
      imageType: 'right_triangle', content: { operands: [3, 4], hypotenuse: 5, legs: [3, 4], operation: 'pythagorean' },
      questionText: 'Find the hypotenuse.', choices: ['5', '7'].map((value) => ({ value })),
    }));

    expect(labels(calls)).to.deep.equal(['3', '4', '?']);
  });

  describe('pythagorean from operands + known_leg (no legs/hypotenuse/answer on the wire)', () => {
    const bankRow = (content: Record<string, unknown>, extra: Record<string, unknown> = {}): unknown => wire({
      id: 'GEOM-PYTHAGOREAN-bank', skillIds: ['GEOM-PYTHAGOREAN-LEG'], format: 'pythagorean',
      imageType: 'right_triangle', content, questionText: 'Find it.',
      choices: ['3', '4', '5', '9'].map((value) => ({ value })), answerToken: 'tok', ...extra,
    });

    it('missing-leg bank row: 4, 5 and "?" drawn, and never the answer 3', () => {
      const { calls } = render(bankRow({ operands: [4, 5], known_leg: 4 }));
      expect(labels(calls)).to.have.members(['4', '5', '?']);
      expect(labels(calls)).to.not.include('3');
    });

    it('find-hypotenuse bank row: 3, 4 and "?" drawn, and never the answer 5', () => {
      const { calls } = render(bankRow({ operands: [3, 4] }));
      expect(labels(calls)).to.have.members(['3', '4', '?']);
      expect(labels(calls)).to.not.include('5');
    });

    it('assignment-style row with answer: same labels as the bank missing-leg row', () => {
      const { calls } = render(wire({
        id: 'GEOM-PYTHAGOREAN-assign', skillIds: ['GEOM-PYTHAGOREAN-LEG'], format: 'pythagorean',
        imageType: 'right_triangle', questionText: 'Find the other leg.',
        content: { legs: [3, 4], hypotenuse: 5, operands: [4, 5], known_leg: 4 }, answer: 3,
        distractors: [{ value: '4', errorType: 'x' }],
      }));
      expect(labels(calls)).to.have.members(['4', '5', '?']);
      expect(labels(calls)).to.not.include('3');
    });

    it('the "?" leg is drawn at its real length, not the hypotenuse length', () => {
      const { calls } = render(bankRow({ operands: [4, 5], known_leg: 4 }));
      const lines = named('lineTo', calls).map((c) => c.args as number[]);
      const moves = named('moveTo', calls).map((c) => c.args as number[]);
      const [x0, y0] = moves[0]!;
      const [x1] = lines[0]!;
      const [, y1] = lines[1]!;
      const base = x1! - x0!;
      const vertical = y0! - y1!;
      const hyp = Math.hypot(base, vertical);
      expect(vertical).to.not.be.closeTo(hyp, 0.5);
      expect(vertical / base).to.be.closeTo(3 / 4, 0.01);
    });

    for (const [label, content] of [
      ['hyp <= known', { operands: [5, 4], known_leg: 5 }],
      ['one operand', { operands: [4], known_leg: 4 }],
      ['non-finite operand', { operands: [4, Infinity] }],
    ] as const) {
      it(`${label}: draws nothing and does not throw`, () => {
        let out: ReturnType<typeof render> | undefined;
        expect(() => { out = render(bankRow(content)); }).to.not.throw();
        expect(labels(out!.calls)).to.deep.equal([]);
      });
    }

    it('default stem: missing leg with known_leg, hypotenuse without', () => {
      const stemOf = (content: Record<string, unknown>): string => {
        const { el } = render(wire({
          id: 'GEOM-PYTHAGOREAN-stem', skillIds: ['GEOM-PYTHAGOREAN-LEG'], format: 'pythagorean',
          imageType: 'right_triangle', content, choices: ['3', '4'].map((value) => ({ value })), answerToken: 't',
        }));
        return el.shadowRoot!.querySelector('[part="prompt"]')?.textContent?.trim() ?? '';
      };
      expect(stemOf({ operands: [4, 5], known_leg: 4 })).to.equal('Find the missing leg.');
      expect(stemOf({ operands: [3, 4] })).to.equal('Find the hypotenuse.');
    });
  });

  it('GEOM-AREA-COMPOUND as the bank sends it (no widths): pieces rebuilt from operands', () => {
    const { calls } = render(wire({
      id: 'GEOM-AREA-COMPOUND-4-10-13-13', skillIds: ['GEOM-AREA-COMPOUND'], format: 'geometry_area',
      imageType: 'compound_shape',
      content: { operands: [4, 10, 13, 13], shape: 'compound', components: [{ height: 10 }, { height: 13 }] },
      questionText: 'Find the total area of the figure.', choices: ['209', '210'].map((value) => ({ value })),
    }));

    expect([...labels(calls)].sort()).to.deep.equal(['10', '13', '13', '4']);
  });

  it('GEOM-CIRCUMFERENCE-DIAMETER as the bank sends it: the diameter labelled', () => {
    const { calls } = render(wire({
      id: 'GEOM-CIRCUMFERENCE-DIAMETER-d10', skillIds: ['GEOM-CIRCUMFERENCE-DIAMETER'], format: 'geometry_circumference',
      content: { diameter: 10, pi_value: 3.14, method: 'diameter', operation: 'geometry_circumference' },
      questionText: 'Find the circumference of a circle with diameter 10.', choices: ['31.4', '62.8'].map((value) => ({ value })),
    }));

    expect(labels(calls)).to.deep.equal(['d=10']);
  });
});
