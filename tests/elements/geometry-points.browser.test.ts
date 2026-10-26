import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaCanvasQuestion';
import { normalizeQuestion } from '../../src/helpers/normalizer';

afterEach(() => {
  document.body.innerHTML = '';
});

type CtxCall = { fn: string; args: unknown[] };
type CanvasProto = { getContext: (...a: unknown[]) => unknown };

const WATCHED = new Set(['moveTo', 'lineTo', 'closePath', 'fillText', 'setLineDash', 'rect', 'arc']);

// Canvas output is asserted by spying on the 2D context, not by reading pixels.
function spyCanvas(): { calls: CtxCall[]; restore: () => void } {
  const calls: CtxCall[] = [];
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
          if (WATCHED.has(prop as string)) calls.push({ fn: prop as string, args: a });
          return fn.apply(target, a);
        };
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  };
  return { calls, restore: () => { proto.getContext = orig; } };
}

function render(question: unknown) {
  const spy = spyCanvas();
  try {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>';
    document.body.appendChild(wrapper);
    const el = wrapper.firstElementChild as HTMLElement & { question: unknown };
    el.question = question;
    return { calls: spy.calls, el };
  } finally {
    spy.restore();
  }
}

const canvasOf = (el: HTMLElement) => el.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
const choiceLabels = (el: HTMLElement): string[] => {
  const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
  return [...pad.shadowRoot!.querySelectorAll('[part~="choice"]')].map((b) => b.textContent ?? '');
};
const named = (fn: string, calls: CtxCall[]) => calls.filter((c) => c.fn === fn);
const path = (calls: CtxCall[]) =>
  calls.filter((c) => c.fn === 'moveTo' || c.fn === 'lineTo').map((c) => c.args as [number, number]);

// A 300x200 canvas with a 12 px pad: the frame box is 176 px square, centred at (150, 100), 8.8 px per unit.
const K = 8.8, CX = 150, CY = 100;
const mapped = (pts: number[][]) => pts.map(([x, y]) => [CX + x! * K, CY - y! * K]);
const POINTS = [[-6, -2], [6, -2], [6, 2], [-6, 2]];

type Row = { format: string; imageType?: string; content: Record<string, unknown>; skill: string };
const ROWS: Record<string, Row> = {
  geometry_identify: { format: 'geometry_identify', imageType: 'shape_2d', skill: 'GEOM-2D-NAME-BASIC', content: { shape: 'rectangle' } },
  geometry_properties: { format: 'geometry_properties', imageType: 'shape_2d', skill: 'GEOM-POLYGON-SIDES', content: { shape: 'rectangle', property: 'sides' } },
  geometry_classify: { format: 'geometry_classify', imageType: 'shape_2d', skill: 'GEOM-2D-NAME-BASIC', content: { shape: 'rectangle', dimension: '2D' } },
  geometry_symmetry: { format: 'geometry_symmetry', skill: 'GEOM-SYMMETRY-BASIC', content: { shape: 'rectangle', lines_of_symmetry: 2 } },
};

const choicesOnly = (r: Row, extra: Record<string, unknown>) => normalizeQuestion({
  id: `GEOM-${r.format}`, skillIds: [r.skill], format: r.format, imageType: r.imageType,
  difficulty: 'medium', answerToken: 'test-token-not-real', questionText: 'q',
  content: { ...r.content, ...extra }, choices: ['a', 'b', 'c', 'd'].map((value) => ({ value })),
});
const withAnswer = (r: Row, extra: Record<string, unknown>) => normalizeQuestion({
  id: `GEOM-${r.format}`, skillIds: [r.skill], format: r.format, imageType: r.imageType,
  content: { ...r.content, ...extra }, answer: 'a',
  distractors: ['b', 'c', 'd'].map((value) => ({ value, errorType: 'x' })),
});

describe('points on the four 2D formats', () => {
  for (const [name, row] of Object.entries(ROWS)) {
    describe(name, () => {
      it('draws one path through the mapped corners', () => {
        const { calls } = render(choicesOnly(row, { points: POINTS }));
        const expected = mapped(POINTS);
        const got = path(calls);
        expect(got).to.have.lengthOf(4);
        got.forEach((p, i) => {
          expect(p[0]).to.be.closeTo(expected[i]![0]!, 0.001);
          expect(p[1]).to.be.closeTo(expected[i]![1]!, 0.001);
        });
        expect(named('closePath', calls)).to.have.lengthOf(1);
      });

      it('the answer-carrying path draws the same as the choices-only path', () => {
        expect(render(withAnswer(row, { points: POINTS })).calls).to.deep.equal(render(choicesOnly(row, { points: POINTS })).calls);
      });

      it('a 2-point row draws today\'s named shape and keeps the buttons', () => {
        const base = render(choicesOnly(row, {}));
        const { calls, el } = render(choicesOnly(row, { points: [[0, 0], [5, 5]] }));
        expect(calls).to.deep.equal(base.calls);
        expect(canvasOf(el).hidden).to.equal(false);
        expect(choiceLabels(el)).to.have.lengthOf(4);
      });

      it('an out-of-frame row draws today\'s named shape', () => {
        const base = render(choicesOnly(row, {}));
        expect(render(choicesOnly(row, { points: [[0, 0], [10.5, 0], [0, 5]] })).calls).to.deep.equal(base.calls);
      });
    });
  }

  it('a 3D geometry_properties row ignores points', () => {
    const row: Row = { format: 'geometry_properties', imageType: 'shape_3d', skill: 'GEOM-3D-EDGES', content: { shape: 'cube', property: 'edges' } };
    expect(render(choicesOnly(row, { points: POINTS })).calls).to.deep.equal(render(choicesOnly(row, {})).calls);
  });

  it('a 3D geometry_identify row ignores points', () => {
    const row: Row = { format: 'geometry_identify', imageType: 'shape_3d', skill: 'GEOM-3D-NAME', content: { shape: 'cube' } };
    expect(render(choicesOnly(row, { points: POINTS })).calls).to.deep.equal(render(choicesOnly(row, {})).calls);
  });

  it('a 3D geometry_classify row ignores points', () => {
    const row: Row = { format: 'geometry_classify', imageType: 'shape_3d', skill: 'GEOM-3D-NAME', content: { shape: 'cube', dimension: '3D' } };
    expect(render(choicesOnly(row, { points: POINTS })).calls).to.deep.equal(render(choicesOnly(row, {})).calls);
  });

  it('geometry_symmetry with points draws no dashed line and no text', () => {
    const { calls } = render(choicesOnly(ROWS['geometry_symmetry']!, { points: POINTS }));
    expect(named('setLineDash', calls)).to.have.lengthOf(0);
    expect(named('fillText', calls)).to.have.lengthOf(0);
  });

  it('smaller points draw smaller (one uniform scale)', () => {
    const widthOf = (r: number) => {
      const xs = path(render(choicesOnly(ROWS['geometry_identify']!, { points: [[-r, -r], [r, -r], [r, r], [-r, r]] })).calls).map((p) => p[0]);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(widthOf(5) / widthOf(10)).to.be.closeTo(0.5, 0.001);
  });
});
