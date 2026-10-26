import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaCanvasQuestion';
import { normalizeQuestion } from '../../src/helpers/normalizer';
import { FIGURE_EXAMPLE } from '../helpers/figure-fixture';

afterEach(() => {
  document.body.innerHTML = '';
});

type CtxCall = { fn: string; args: unknown[] };
type CanvasProto = { getContext: (...a: unknown[]) => unknown };

const WATCHED = new Set(['moveTo', 'lineTo', 'closePath', 'fillText', 'setLineDash', 'arc']);

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

const wire = (content: unknown, choices: string[] = ['A', 'B', 'C', 'D']) =>
  normalizeQuestion({
    id: 'GEOM-FIGURE-test', skillIds: ['GEOM-FIGURE-TEST'], format: 'geometry_figure',
    imageType: 'shape_2d', difficulty: 'medium', answerToken: 'test-token-not-real',
    content, questionText: '', choices: choices.map((value) => ({ value })),
  });

function mount(width?: number): HTMLElement & { question: unknown } {
  const wrapper = document.createElement('div');
  if (width) wrapper.style.width = `${width}px`;
  wrapper.innerHTML = '<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>';
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement & { question: unknown };
}

function render(content: unknown, width?: number) {
  const spy = spyCanvas();
  try {
    const el = mount(width);
    el.question = wire(content);
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
const texts = (calls: CtxCall[]) => calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0]);

const square = (r: number) => ({ points: [[-r, -r], [r, -r], [r, r], [-r, r]] });
const panels = (n: number, r = 10) => ({
  panels: ['A', 'B', 'C', 'D'].slice(0, n).map((label) => ({ label, polygons: [square(r)] })),
});

describe('geometry_figure drawing', () => {
  it('one panel draws each polygon', () => {
    const { calls } = render({ panels: [{ polygons: [square(4), { points: [[0, 5], [3, 9], [-3, 9]] }] }] });
    expect(calls.filter((c) => c.fn === 'closePath')).to.have.lengthOf(2);
  });

  it('four panels draw four letters A-D', () => {
    const { calls } = render(panels(4));
    expect(texts(calls)).to.deep.equal(['A', 'B', 'C', 'D']);
    expect(calls.filter((c) => c.fn === 'closePath')).to.have.lengthOf(4);
  });

  it('lines are dashed and lettered', () => {
    const { calls } = render(FIGURE_EXAMPLE);
    const dashes = calls.filter((c) => c.fn === 'setLineDash' && (c.args[0] as number[]).length === 2);
    expect(dashes.map((d) => d.args[0])).to.deep.equal([[6, 4], [6, 4], [6, 4], [6, 4]]);
    expect(texts(calls)).to.deep.equal(['A', 'B', 'C', 'D']);
  });

  it('size is kept: a square spanning -5..5 draws half the width of one spanning -10..10', () => {
    const widthOf = (r: number) => {
      const xs = render({ panels: [{ polygons: [square(r)] }] }).calls
        .filter((c) => c.fn === 'moveTo' || c.fn === 'lineTo').map((c) => c.args[0] as number);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(widthOf(5) / widthOf(10)).to.be.closeTo(0.5, 0.001);
  });

  it('other formats keep a 200 px canvas after a figure', () => {
    const el = mount();
    el.question = wire(panels(4));
    expect(canvasOf(el).height).to.equal(260);
    el.question = wire({ panels: [{ polygons: [square(5)] }] });
    expect(canvasOf(el).height).to.equal(200);
    el.question = wire(panels(3));
    expect(canvasOf(el).height).to.equal(260);
    el.question = normalizeQuestion({
      id: 'GEOM-IDENT-x', skillIds: ['GEOM-2D-NAME-BASIC'], format: 'geometry_identify', imageType: 'shape_2d',
      content: { shape: 'square' }, answer: 'square', distractors: [{ value: 'circle', errorType: 'x' }],
    });
    expect(canvasOf(el).height).to.equal(200);
    expect(canvasOf(el).hidden).to.equal(false);
  });

  it('shows the prompt fallback when the row has no stem', () => {
    const { el } = render(panels(3));
    expect(el.shadowRoot!.querySelector('[part="prompt"]')!.textContent).to.equal('Look at the shapes.');
  });
});

describe('geometry_figure malformed content (Review Focus 3)', () => {
  const ok = panels(3);
  const cases: Record<string, unknown> = {
    'two panels': panels(2),
    'labels on both panels and lines': {
      panels: [{ label: 'A', polygons: [square(5)], lines: ['A', 'B', 'C'].map((label) => ({ from: [0, 0], to: [1, 1], label })) }, ...ok.panels.slice(1)],
    },
    'a 49-point polygon': {
      panels: [{ polygons: [{ points: Array.from({ length: 49 }, (_, i) => [Math.cos(i) * 5, Math.sin(i) * 5]) }] }],
    },
    'a coordinate of 10.5': { panels: [{ polygons: [{ points: [[0, 0], [10.5, 0], [0, 5]] }] }] },
    'a NaN coordinate': { panels: [{ polygons: [{ points: [[0, 0], [NaN, 0], [0, 5]] }] }] },
    'an unlabelled panel among labelled ones': {
      panels: [ok.panels[0]!, ok.panels[1]!, { polygons: [square(5)] }],
    },
    'no content': undefined,
  };
  for (const [name, content] of Object.entries(cases)) {
    it(`${name}: no throw, canvas hidden, buttons shown`, () => {
      const { el } = render(content);
      expect(canvasOf(el).hidden).to.equal(true);
      expect(canvasOf(el).height).to.equal(200);
      expect(choiceLabels(el)).to.deep.equal(['A', 'B', 'C', 'D']);
    });
  }
});

describe('geometry_figure at a 320 px viewport (Review Focus 5)', () => {
  it('a 4-panel figure stays inside its container and each shape is at least 60 px tall', () => {
    // 320 px viewport less the element's 16 px padding either side.
    const { el, calls } = render(panels(4), 288);
    const canvas = canvasOf(el);
    const container = el.shadowRoot!.querySelector('[part="container"]') as HTMLElement;
    const rect = canvas.getBoundingClientRect();
    expect(rect.width).to.be.at.most(container.getBoundingClientRect().width);
    expect(rect.height).to.be.closeTo(rect.width * (canvas.height / canvas.width), 1);
    // Each panel's polygon is one moveTo + 3 lineTo + closePath: its y extent, scaled to CSS px.
    const scale = rect.width / canvas.width;
    const ys = calls.filter((c) => c.fn === 'moveTo' || c.fn === 'lineTo').map((c) => c.args[1] as number);
    expect(ys).to.have.lengthOf(16);
    for (let i = 0; i < 16; i += 4) {
      const panelYs = ys.slice(i, i + 4);
      expect((Math.max(...panelYs) - Math.min(...panelYs)) * scale).to.be.at.least(60);
    }
  });
});

describe('geometry_figure lettered-line badge stays on the canvas', () => {
  for (const y of [10, -10]) {
    it(`a line ending at y = ${y} keeps its badge circle fully inside`, () => {
      const lines = ['A', 'B', 'C'].map((label, i) => ({ from: [0, 0], to: i === 0 ? [0, y] : [3 * i, 2], label }));
      const { calls, el } = render({ panels: [{ polygons: [square(4)], lines }] });
      const cv = canvasOf(el);
      const arcs = calls.filter((c) => c.fn === 'arc');
      expect(arcs).to.have.lengthOf(3);
      for (const a of arcs) {
        const [x, ay, r] = a.args as [number, number, number];
        expect(x - r).to.be.at.least(0);
        expect(ay - r).to.be.at.least(0);
        expect(x + r).to.be.at.most(cv.width);
        expect(ay + r).to.be.at.most(cv.height);
      }
    });
  }
});
