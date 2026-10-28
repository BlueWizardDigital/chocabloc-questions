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

// Canvas output is asserted by spying on the 2D context, not by reading
// pixels (the pattern in geometry-shape-routing.browser.test.ts). `log` holds
// the watched calls and sets in order; a set is fn `set:<prop>`.
type CtxCall = { fn: string; args: unknown[] };
type CanvasProto = { getContext: (...a: unknown[]) => unknown };

const WATCHED_CALLS = new Set([
  'arc', 'rect', 'fillRect', 'strokeRect', 'moveTo', 'lineTo', 'fill', 'stroke', 'fillText', 'setLineDash',
]);
const WATCHED_SETS = new Set(['fillStyle', 'strokeStyle', 'lineWidth']);

function spyCanvas(): { calls: CtxCall[]; log: CtxCall[]; restore: () => void } {
  const calls: CtxCall[] = [];
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
        if (WATCHED_SETS.has(prop as string)) log.push({ fn: `set:${prop as string}`, args: [value] });
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  };
  return { calls, log, restore: () => { proto.getContext = orig; } };
}

type El = HTMLElement & { question: unknown };

/** Mount a canvas question with the spy installed, set `q`, return the draw calls. */
function render(q: unknown, style = ''): { calls: CtxCall[]; log: CtxCall[]; el: El } {
  const spy = spyCanvas();
  try {
    const el = mount(`<choca-canvas-question answer-mode="mc" seed="42" style="${style}"></choca-canvas-question>`) as El;
    el.question = q;
    return { calls: spy.calls, log: spy.log, el };
  } finally {
    spy.restore();
  }
}

function canvasOf(el: HTMLElement): HTMLCanvasElement {
  return el.shadowRoot!.querySelector('[part="canvas"]') as HTMLCanvasElement;
}

function choiceLabels(el: HTMLElement): string[] {
  const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
  return [...pad.shadowRoot!.querySelectorAll('[part~="choice"]')].map((b) => b.textContent ?? '');
}

function promptOf(el: HTMLElement): string {
  return el.shadowRoot!.querySelector('[part="prompt"]')!.textContent ?? '';
}

const named = (fn: string, calls: CtxCall[]) => calls.filter((c) => c.fn === fn);

type Part = { x: number; y: number; w: number; h: number; fill: unknown };

/** Every fillRect, with the fillStyle it was painted in. */
function parts(log: CtxCall[]): Part[] {
  let fill: unknown;
  const out: Part[] = [];
  for (const c of log) {
    if (c.fn === 'set:fillStyle') fill = c.args[0];
    else if (c.fn === 'fillRect') {
      const [x, y, w, h] = c.args as number[];
      out.push({ x: x!, y: y!, w: w!, h: h!, fill });
    }
  }
  return out;
}

/** Stack layout: one strip per distinct y, top to bottom. */
function strips(ps: Part[]): Part[][] {
  const ys = [...new Set(ps.map((p) => Math.round(p.y * 100) / 100))].sort((a, b) => a - b);
  return ys.map((y) => ps.filter((p) => Math.round(p.y * 100) / 100 === y).sort((a, b) => a.x - b.x));
}

/** Row layout: one model per equal box, left to right. */
function boxes(ps: Part[], count: number): Part[][] {
  const out: Part[][] = Array.from({ length: count }, () => []);
  for (const p of ps) out[Math.floor((p.x + p.w / 2) / (W / count))]!.push(p);
  return out.map((b) => b.sort((a, c) => a.x - c.x));
}

/** A model's wholes: runs of parts that touch, split where there is a gap. */
function wholesOf(model: Part[]): Part[][] {
  const out: Part[][] = [];
  for (const p of model) {
    const last = out[out.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && p.x - (prev.x + prev.w) < 1) last!.push(p);
    else out.push([p]);
  }
  return out;
}

const sumW = (ps: Part[]) => ps.reduce((s, p) => s + p.w, 0);
const shaded = (ps: Part[]) => ps.filter((p) => p.fill === FILL);
const textAt = (c: CtxCall) => ({ text: c.args[0], x: c.args[1] as number, y: c.args[2] as number });
const texts = (calls: CtxCall[]) => named('fillText', calls).map(textAt);

const W = 300, H = 200; // the element's canvas
const FILL = '#42a5f5';
const EMPTY = '#ffffff';

/* ---------- test data ---------- */

type Model = Record<string, unknown>;
const bar = (d: number, n: number, extra: Model = {}): Model => ({ shape: 'bar', d, n, wholes: 1, ...extra });
const circle = (d: number, n: number, extra: Model = {}): Model => ({ shape: 'circle', d, n, wholes: 1, ...extra });

/** A choices-only bank row, the way the platform serves it. */
const modelsWire = (content: Record<string, unknown>, choices = ['A', 'B', 'Same']) => normalizeQuestion({
  id: 'q9001',
  skillIds: ['FRAC-COMPARE-MODELS'],
  format: 'fraction_models',
  imageType: 'fraction_models',
  difficulty: 'medium',
  answerToken: 'test-token-not-real',
  content: { operation: 'fraction_compare_models', ...content },
  questionText: 'Which shaded part is bigger?',
  choices: choices.map((value) => ({ value })),
});

// The mockup's card 2: A = 3/4 over B = 2/3, captioned.
const compareStack = () => modelsWire({
  layout: 'stack',
  models: [bar(4, 3, { label: 'A', caption: '3/4' }), bar(3, 2, { label: 'B', caption: '2/3' })],
});

// The Codex finding: 7/4 in 2 wholes against 9/4 in 3 wholes.
const mixed = (layout: 'row' | 'stack') => modelsWire({
  operation: 'fraction_compare_mixed',
  layout,
  models: [
    { shape: 'bar', d: 4, n: 7, wholes: 2, label: 'A', caption: '7/4' },
    { shape: 'bar', d: 4, n: 9, wholes: 3, label: 'B', caption: '9/4' },
  ],
});

/* ================================================================
   Stack layout: strips share one start and one length
   ================================================================ */

describe('fraction_models stack layout', () => {
  it('stack compare: both strips have the same width', () => {
    const { log } = render(compareStack());
    const [a, b] = strips(parts(log));

    expect(a, 'strip A has 4 parts').to.have.lengthOf(4);
    expect(b, 'strip B has 3 parts').to.have.lengthOf(3);
    expect(sumW(a!)).to.be.closeTo(sumW(b!), 1e-6);
    expect(a![0]!.x, 'same x-start').to.be.closeTo(b![0]!.x, 1e-6);
  });

  it('parts within a strip are equal and touch', () => {
    const [a, b] = strips(parts(render(compareStack()).log));

    for (const s of [a!, b!]) {
      s.forEach((p, i) => {
        expect(p.w).to.be.closeTo(s[0]!.w, 1e-6);
        if (i > 0) expect(p.x).to.be.closeTo(s[i - 1]!.x + s[i - 1]!.w, 1e-6);
      });
    }
  });

  it('labels sit left of the strip and captions right of it', () => {
    const { calls, log } = render(compareStack());
    const [a, b] = strips(parts(log));
    const t = texts(calls);
    const at = (s: string) => t.find((x) => x.text === s)!;

    expect(t.map((x) => x.text)).to.have.members(['A', 'B', '3/4', '2/3']);
    for (const [label, caption, strip] of [['A', '3/4', a!], ['B', '2/3', b!]] as const) {
      const start = strip[0]!.x;
      const end = strip[strip.length - 1]!.x + strip[strip.length - 1]!.w;
      expect(at(label).x, `${label} left of its strip`).to.be.below(start);
      expect(at(caption).x, `${caption} right of its strip`).to.be.at.least(end);
      expect(at(label).y, `${label} level with its strip`).to.be.within(strip[0]!.y, strip[0]!.y + strip[0]!.h);
      expect(at(caption).y, `${caption} level with its strip`).to.be.within(strip[0]!.y, strip[0]!.y + strip[0]!.h);
    }
  });

  it('split widths are normalised to the bar length', () => {
    const { log } = render(modelsWire({
      operation: 'fraction_equal_parts',
      layout: 'stack',
      models: [bar(4, 0, { label: 'A' }), bar(4, 0, { label: 'B', split: [1, 1, 2, 1] })],
    }, ['A', 'B']));
    const [a, b] = strips(parts(log));

    expect(b, 'B has d parts').to.have.lengthOf(4);
    expect(sumW(b!)).to.be.closeTo(sumW(a!), 1e-6);
    const unit = sumW(b!) / 5; // the split adds up to 5
    b!.forEach((p, i) => expect(p.w, `part ${i}`).to.be.closeTo([1, 1, 2, 1][i]! * unit, 1e-6));
  });
});

/* ================================================================
   One whole, one size (Codex plan review, finding 1)
   ================================================================ */

describe('fraction_models one whole has one size across models', () => {
  for (const layout of ['stack', 'row'] as const) {
    it(`${layout}: 7/4 in 2 wholes and 9/4 in 3 wholes share one whole width, shaded 7:9`, () => {
      const ps = parts(render(mixed(layout)).log);
      const [a, b] = layout === 'stack' ? strips(ps) : boxes(ps, 2);
      const wa = wholesOf(a!), wb = wholesOf(b!);

      expect(wa, 'A draws 2 wholes').to.have.lengthOf(2);
      expect(wb, 'B draws 3 wholes').to.have.lengthOf(3);
      for (const whole of [...wa, ...wb]) {
        expect(whole, 'each whole has d parts').to.have.lengthOf(4);
        expect(sumW(whole), 'every whole is the same width').to.be.closeTo(sumW(wa[0]!), 1e-6);
      }
      expect(Math.abs(sumW(shaded(a!)) - sumW(shaded(b!)) * 7 / 9), 'shaded widths in the ratio 7:9').to.be.at.most(1);
      expect(shaded(a!)).to.have.lengthOf(7);
      expect(shaded(b!)).to.have.lengthOf(9);
    });
  }

  it('stack: the wholes of every strip line up', () => {
    const [a, b] = strips(parts(render(mixed('stack')).log));
    const wa = wholesOf(a!), wb = wholesOf(b!);

    wa.forEach((whole, i) => expect(whole[0]!.x).to.be.closeTo(wb[i]![0]!.x, 1e-6));
  });

  it('row: every circle has the same radius', () => {
    const { calls } = render(modelsWire({
      operation: 'fraction_pick',
      layout: 'row',
      models: [circle(4, 1, { label: 'A' }), circle(6, 2, { label: 'B' }), circle(8, 3, { label: 'C' })],
    }, ['A', 'B', 'C']));
    const radii = named('arc', calls).map((c) => c.args[2] as number);

    expect(radii).to.have.lengthOf(4 + 6 + 8);
    radii.forEach((r) => expect(r).to.be.closeTo(radii[0]!, 1e-6));
  });
});

/* ================================================================
   What each model shows
   ================================================================ */

describe('fraction_models shading and wholes', () => {
  it('shaded part count equals n for each model', () => {
    const models = [bar(4, 3, { label: 'A' }), bar(6, 2, { label: 'B' }), bar(8, 5, { label: 'C' }), bar(3, 0, { label: 'D' })];
    const ps = parts(render(modelsWire({ operation: 'fraction_pick', layout: 'row', models }, ['A', 'B', 'C', 'D'])).log);
    const bs = boxes(ps, 4);

    expect(bs.map((b) => b.length)).to.deep.equal([4, 6, 8, 3]);
    expect(bs.map((b) => shaded(b).length)).to.deep.equal([3, 2, 5, 0]);
    expect(ps.every((p) => p.fill === FILL || p.fill === EMPTY), 'every part is shaded or empty').to.equal(true);
  });

  it('shaded parts come first, left to right', () => {
    const [a] = strips(parts(render(compareStack()).log));

    expect(a!.map((p) => p.fill)).to.deep.equal([FILL, FILL, FILL, EMPTY]);
  });

  it('a circle shades n of its d sectors', () => {
    const { log } = render(modelsWire({ operation: 'fraction_read', layout: 'row', models: [circle(6, 4)] }, ['4/6', '2/6', '4/5', '6/4']));
    let fill: unknown;
    const fills: unknown[] = [];
    for (const c of log) {
      if (c.fn === 'set:fillStyle') fill = c.args[0];
      else if (c.fn === 'fill') fills.push(fill);
    }

    expect(named('arc', log)).to.have.lengthOf(6);
    expect(fills).to.have.lengthOf(6);
    expect(fills.filter((f) => f === FILL)).to.have.lengthOf(4);
  });

  it('wholes = 3 draws three wholes', () => {
    const ps = parts(render(modelsWire({
      operation: 'fraction_read_mixed',
      layout: 'row',
      models: [{ shape: 'bar', d: 4, n: 9, wholes: 3 }],
    }, ['2 1/4', '1 1/4', '2 3/4', '9/4'])).log);
    const ws = wholesOf(ps);

    expect(ws).to.have.lengthOf(3);
    expect(ws.map((w) => w.length)).to.deep.equal([4, 4, 4]);
    expect(ws.map((w) => shaded(w).length)).to.deep.equal([4, 4, 1]);
    ws.forEach((w) => expect(sumW(w)).to.be.closeTo(sumW(ws[0]!), 1e-6));
  });
});

/* ================================================================
   Labels, captions and the guide
   ================================================================ */

describe('fraction_models labels, captions and guide', () => {
  it('labels and captions are drawn', () => {
    const { calls } = render(mixed('row'));

    expect(texts(calls).map((t) => t.text)).to.have.members(['A', 'B', '7/4', '9/4']);
  });

  it('row: the label sits under its model and the caption under the label', () => {
    const { calls, log } = render(mixed('row'));
    const [a, b] = boxes(parts(log), 2);
    const t = texts(calls);
    const at = (s: string) => t.find((x) => x.text === s)!;

    for (const [label, caption, model] of [['A', '7/4', a!], ['B', '9/4', b!]] as const) {
      const bottom = Math.max(...model.map((p) => p.y + p.h));
      const left = model[0]!.x, right = model[model.length - 1]!.x + model[model.length - 1]!.w;
      expect(at(label).y, `${label} under its model`).to.be.above(bottom);
      expect(at(caption).y, `${caption} under its label`).to.be.above(at(label).y);
      expect(at(label).x, `${label} within its model's span`).to.be.within(left, right);
      expect(at(caption).x, `${caption} within its model's span`).to.be.within(left, right);
    }
  });

  it('a model with no label or caption writes no text', () => {
    const { calls } = render(modelsWire({ operation: 'fraction_read', layout: 'row', models: [bar(8, 3)] }, ['3/8', '5/8', '3/5', '1/3']));

    expect(texts(calls)).to.deep.equal([]);
  });

  it('guide draws a dashed line', () => {
    const { calls, log } = render(modelsWire({
      operation: 'fraction_equivalent_strips',
      layout: 'stack',
      models: [bar(2, 1, { caption: '1/2' }), bar(8, 0)],
      guide: [1, 2],
    }, ['4/8', '3/8', '5/8', '2/8']));
    const dashes = named('setLineDash', calls).map((c) => c.args[0] as number[]);
    const [top, bottom] = strips(parts(log));

    expect(dashes.some((d) => d.length > 0), 'a non-empty dash').to.equal(true);
    expect(dashes[dashes.length - 1], 'the dash is reset afterwards').to.deep.equal([]);

    // The line runs at 1/2 of the strip length, across both strips.
    const [from] = named('moveTo', calls);
    const [to] = named('lineTo', calls);
    const half = top![0]!.x + sumW(top!) / 2;
    expect(from!.args[0]).to.be.closeTo(half, 1e-6);
    expect(to!.args[0]).to.be.closeTo(half, 1e-6);
    expect(Math.min(from!.args[1] as number, to!.args[1] as number)).to.be.at.most(top![0]!.y);
    expect(Math.max(from!.args[1] as number, to!.args[1] as number)).to.be.at.least(bottom![0]!.y + bottom![0]!.h);
  });

  it('no guide, no dashed line', () => {
    const { calls } = render(compareStack());

    expect(named('setLineDash', calls).filter((c) => (c.args[0] as number[]).length > 0)).to.have.lengthOf(0);
  });
});

/* ================================================================
   Fits the 300x200 canvas
   ================================================================ */

describe('fraction_models fits the canvas', () => {
  const CASES: [string, Record<string, unknown>][] = [
    ['stack, 4 strips, 3 wholes, 8-character captions', {
      layout: 'stack',
      models: ['A', 'B', 'C', 'D'].map((label, i) => ({
        shape: 'bar', d: 12, n: 30 + i, wholes: 3, label, caption: '12 11/12',
      })),
      guide: [1, 2],
    }],
    ['row, 4 bars of 3 wholes, captioned', {
      layout: 'row',
      models: ['A', 'B', 'C', 'D'].map((label, i) => ({
        shape: 'bar', d: 4, n: 9 + i, wholes: 3, label, caption: '12 11/12',
      })),
    }],
    ['row, 4 circles, captioned', {
      layout: 'row',
      models: ['A', 'B', 'C', 'D'].map((label) => circle(8, 3, { label, caption: '3/8' })),
    }],
    ['row, one circle', { layout: 'row', models: [circle(8, 3)] }],
    ['stack, a bar and a circle', { layout: 'stack', models: [bar(4, 1, { label: 'A' }), circle(4, 1, { label: 'B' })] }],
  ];

  for (const [name, content] of CASES) {
    it(name, () => {
      const { calls, log, el } = render(modelsWire({ operation: 'fraction_pick', ...content }, ['A', 'B', 'C', 'D']));

      expect(canvasOf(el).hidden).to.equal(false);
      const models = (content['models'] as unknown[]).length;
      expect(parts(log).length + named('arc', calls).length, 'something is drawn').to.be.at.least(models);
      for (const p of parts(log)) {
        expect(p.x).to.be.at.least(0);
        expect(p.y).to.be.at.least(0);
        expect(p.x + p.w).to.be.at.most(W);
        expect(p.y + p.h).to.be.at.most(H);
      }
      for (const c of named('arc', calls)) {
        const [x, y, r] = c.args as number[];
        expect(x! - r!).to.be.at.least(0);
        expect(x! + r!).to.be.at.most(W);
        expect(y! - r!).to.be.at.least(0);
        expect(y! + r!).to.be.at.most(H);
      }
      for (const t of texts(calls)) {
        expect(t.x).to.be.within(0, W);
        expect(t.y).to.be.within(0, H);
      }
    });
  }
});

/* ================================================================
   Colours, prompt and routing
   ================================================================ */

describe('fraction_models colours and prompt', () => {
  it('colours come from the --cq-frac-* variables', () => {
    const { log } = render(compareStack(),
      '--cq-frac-fill: #ff0000; --cq-frac-empty: #00ff00; --cq-frac-stroke: #0000ff; --cq-frac-text: #123456');
    const ps = parts(log);
    const strokes = log.filter((c) => c.fn === 'set:strokeStyle').map((c) => c.args[0]);
    const fills = log.filter((c) => c.fn === 'set:fillStyle').map((c) => c.args[0]);

    expect(ps.filter((p) => p.fill === '#ff0000')).to.have.lengthOf(3 + 2);
    expect(ps.filter((p) => p.fill === '#00ff00')).to.have.lengthOf(1 + 1);
    expect(strokes).to.include('#0000ff');
    expect(fills, 'text colour').to.include('#123456');
  });

  it('the guide takes --cq-frac-guide', () => {
    const { log } = render(modelsWire({
      operation: 'fraction_equivalent_strips',
      layout: 'stack',
      models: [bar(2, 1), bar(4, 0)],
      guide: [1, 2],
    }), '--cq-frac-guide: #abcdef');

    expect(log.filter((c) => c.fn === 'set:strokeStyle').map((c) => c.args[0])).to.include('#abcdef');
  });

  it('with no question text, the prompt says to look at the shapes', () => {
    const { el } = render({
      id: 'FRAC-AREA-MODEL-3-8', skillIds: ['FRAC-AREA-MODEL'],
      format: 'fraction_models', imageType: 'fraction_models',
      content: { operation: 'fraction_read', layout: 'row', models: [bar(8, 3)] },
      answer: '3/8',
      distractors: [{ value: '5/8', errorType: 'counted-unshaded' }, { value: '3/5', errorType: 'parts-not-whole' }],
    });

    expect(promptOf(el)).to.equal('Look at the shapes.');
  });

  it('a choices-only row keeps its question text and draws', () => {
    const { el, calls } = render(compareStack());

    expect(promptOf(el)).to.equal('Which shaded part is bigger?');
    expect(canvasOf(el).hidden).to.equal(false);
    expect(named('fillRect', calls)).to.have.lengthOf(7);
    expect(choiceLabels(el)).to.have.members(['A', 'B', 'Same']);
  });
});

/* ================================================================
   Review Focus 3: malformed content costs the picture, never the question
   ================================================================ */

describe('fraction_models malformed content', () => {
  const BAD: [string, Record<string, unknown>][] = [
    ['no models', { layout: 'row' }],
    ['no content keys but operation', {}],
    ['d = 0', { layout: 'row', models: [bar(0, 0)] }],
    ['n > d x wholes', { layout: 'row', models: [{ shape: 'bar', d: 4, n: 9, wholes: 2 }] }],
    ['5 models', { layout: 'row', models: [1, 2, 3, 4, 5].map(() => bar(4, 1)) }],
    ['an unknown shape', { layout: 'row', models: [{ shape: 'triangle', d: 3, n: 1, wholes: 1 }] }],
    ['a guide in a row', { layout: 'row', models: [bar(2, 1)], guide: [1, 2] }],
    ['an unknown layout', { layout: 'grid', models: [bar(2, 1)] }],
  ];

  for (const [name, content] of BAD) {
    it(`${name}: no throw, nothing drawn, canvas hidden, buttons shown`, () => {
      let out: ReturnType<typeof render> | undefined;
      expect(() => { out = render(modelsWire(content)); }).to.not.throw();

      expect(out!.calls, 'nothing painted').to.have.lengthOf(0);
      expect(canvasOf(out!.el).hidden).to.equal(true);
      expect(choiceLabels(out!.el)).to.have.members(['A', 'B', 'Same']);
    });
  }

  it('content that is not an object at all', () => {
    let out: ReturnType<typeof render> | undefined;
    expect(() => {
      out = render({
        id: 'q1', skillIds: ['FRAC-TEST'], format: 'fraction_models', imageType: 'fraction_models',
        content: null, answer: '1/2', distractors: [{ value: '1/3', errorType: 'x' }],
      });
    }).to.not.throw();

    expect(out!.calls).to.have.lengthOf(0);
    expect(canvasOf(out!.el).hidden).to.equal(true);
    expect(choiceLabels(out!.el)).to.have.members(['1/2', '1/3']);
  });

  it('shows the canvas again for the next question with a good picture', () => {
    const { el } = render(modelsWire({ layout: 'row' }));
    el.question = compareStack();

    expect(canvasOf(el).hidden).to.equal(false);
  });

  it('clears the previous picture when the next one is malformed', () => {
    const { el } = render(compareStack());
    const canvas = canvasOf(el);
    el.question = modelsWire({ layout: 'row' });
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, W, H).data;

    expect(canvas.hidden).to.equal(true);
    expect(pixels.some((v) => v !== 0), 'the canvas is blank').to.equal(false);
  });
});
