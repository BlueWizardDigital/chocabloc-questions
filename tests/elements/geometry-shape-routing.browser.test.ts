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

const WATCHED_CALLS = new Set(['arc', 'rect', 'fillRect', 'strokeRect', 'moveTo', 'lineTo', 'fillText']);
const WATCHED_SETS = new Set(['strokeStyle', 'lineWidth']);

function spyCanvas(): { calls: CtxCall[]; sets: CtxSet[]; restore: () => void } {
  const calls: CtxCall[] = [];
  const sets: CtxSet[] = [];
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
          if (WATCHED_CALLS.has(prop as string)) calls.push({ fn: prop as string, args: a });
          return fn.apply(target, a);
        };
      },
      set(target, prop, value) {
        if (WATCHED_SETS.has(prop as string)) sets.push({ prop: prop as string, value });
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  };
  return { calls, sets, restore: () => { proto.getContext = orig; } };
}

/** Mount a canvas question with the spy installed, set `q`, return the draw calls. */
function render(q: unknown): { calls: CtxCall[]; sets: CtxSet[]; el: HTMLElement } {
  const spy = spyCanvas();
  try {
    const el = mount(`<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>`);
    (el as HTMLElement & { question: unknown }).question = q;
    return { calls: spy.calls, sets: spy.sets, el };
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
