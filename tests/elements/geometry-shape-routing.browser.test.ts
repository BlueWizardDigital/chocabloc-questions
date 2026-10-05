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
