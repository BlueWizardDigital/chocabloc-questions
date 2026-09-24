import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaCanvasQuestion';

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

const WATCHED_CALLS = new Set(['arc', 'rect', 'moveTo', 'lineTo', 'fillText']);
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
function render(q: unknown): { calls: CtxCall[]; sets: CtxSet[] } {
  const spy = spyCanvas();
  try {
    const el = mount(`<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>`);
    (el as HTMLElement & { question: unknown }).question = q;
    return { calls: spy.calls, sets: spy.sets };
  } finally {
    spy.restore();
  }
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
