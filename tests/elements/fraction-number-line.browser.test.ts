import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaCanvasQuestion';
import { normalizeQuestion } from '../../src/helpers/normalizer';

/* ---------- helpers (same spy pattern as fraction-models.browser.test.ts) ---------- */

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

type CtxCall = { fn: string; args: unknown[] };
type CanvasProto = { getContext: (...a: unknown[]) => unknown };

const WATCHED_CALLS = new Set([
  'arc', 'fillRect', 'moveTo', 'lineTo', 'fill', 'stroke', 'fillText',
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

function render(q: unknown): { calls: CtxCall[]; log: CtxCall[]; el: El } {
  const spy = spyCanvas();
  try {
    const el = mount('<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>') as El;
    el.question = q;
    return { calls: spy.calls, log: spy.log, el };
  } finally {
    spy.restore();
  }
}

const canvasOf = (el: HTMLElement) => el.shadowRoot!.querySelector('[part="canvas"]') as HTMLCanvasElement;
const promptOf = (el: HTMLElement) => el.shadowRoot!.querySelector('[part="prompt"]')!.textContent ?? '';
function choiceLabels(el: HTMLElement): string[] {
  const pad = el.shadowRoot!.querySelector('choca-choice-pad') as HTMLElement;
  return [...pad.shadowRoot!.querySelectorAll('[part~="choice"]')].map((b) => b.textContent ?? '');
}

type Seg = { x1: number; y1: number; x2: number; y2: number };

/** Every moveTo followed by a lineTo, as a segment. */
function segments(calls: CtxCall[]): Seg[] {
  const out: Seg[] = [];
  let from: [number, number] | undefined;
  for (const c of calls) {
    if (c.fn === 'moveTo') from = [c.args[0] as number, c.args[1] as number];
    else if (c.fn === 'lineTo' && from) {
      out.push({ x1: from[0], y1: from[1], x2: c.args[0] as number, y2: c.args[1] as number });
    }
  }
  return out;
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
const vertical = (s: Seg) => near(s.x1, s.x2) && !near(s.y1, s.y2);
const horizontal = (s: Seg) => near(s.y1, s.y2) && !near(s.x1, s.x2);
/** Tick segments, grouped into lines by y centre, each sorted by x. */
function tickRows(calls: CtxCall[]): Seg[][] {
  const ticks = segments(calls).filter(vertical);
  const ys = [...new Set(ticks.map((t) => Math.round((t.y1 + t.y2) / 2)))].sort((a, b) => a - b);
  return ys.map((y) => ticks.filter((t) => Math.round((t.y1 + t.y2) / 2) === y).sort((a, b) => a.x1 - b.x1));
}
const texts = (calls: CtxCall[]) => calls.filter((c) => c.fn === 'fillText')
  .map((c) => ({ text: c.args[0] as string, x: c.args[1] as number, y: c.args[2] as number }));
const dots = (calls: CtxCall[]) => calls.filter((c) => c.fn === 'arc')
  .map((c) => ({ x: c.args[0] as number, y: c.args[1] as number }));

const W = 300;

type Line = { max: number; d: number };
type Point = { line: number; n: number; label?: string };

const lineWire = (
  lines: Line[], points: Point[], extra: Record<string, unknown> = {}, choices = ['1/4', '2/4', '3/4', '1/2'],
) => normalizeQuestion({
  id: 'q9101',
  skillIds: ['FRAC-NUMBER-LINE'],
  format: 'fraction_number_line',
  imageType: 'fraction_number_line',
  difficulty: 'easy',
  answerToken: 'test-token-not-real',
  content: { operation: 'fraction_line_read', lines, points, ...extra },
  questionText: 'What fraction is marked?',
  choices: choices.map((value) => ({ value })),
});

/* ================================================================ */

describe('fraction_number_line ticks', () => {
  for (const [max, d] of [[1, 4], [2, 3], [3, 5], [1, 12], [1, 8]] as [number, number][]) {
    it(`max ${max}, d ${d}: ${max * d + 1} ticks, evenly spread`, () => {
      const { calls } = render(lineWire([{ max, d }], [{ line: 0, n: 1 }]));
      const rows = tickRows(calls);

      expect(rows).to.have.lengthOf(1);
      const xs = rows[0]!.map((t) => t.x1);
      expect(xs).to.have.lengthOf(max * d + 1);
      const step = xs[1]! - xs[0]!;
      expect(step).to.be.greaterThan(0);
      xs.forEach((x, i) => expect(x).to.be.closeTo(xs[0]! + i * step, 0.01));
    });
  }

  it('16 intervals still read clearly: at least 12 px apart, inside the canvas', () => {
    const { calls } = render(lineWire([{ max: 2, d: 8 }], [{ line: 0, n: 3 }]));
    const xs = tickRows(calls)[0]!.map((t) => t.x1);

    expect(xs).to.have.lengthOf(17);
    expect(xs[1]! - xs[0]!).to.be.at.least(12);
    expect(xs[0]!).to.be.at.least(0);
    expect(xs[16]!).to.be.at.most(W);
  });

  it('whole-number ticks are taller than the others', () => {
    const { calls } = render(lineWire([{ max: 2, d: 3 }], [{ line: 0, n: 1 }]));
    const lens = tickRows(calls)[0]!.map((t) => Math.abs(t.y2 - t.y1));

    lens.forEach((len, i) => {
      if (i % 3 === 0) expect(len, `tick ${i}`).to.equal(lens[0]);
      else expect(len, `tick ${i}`).to.be.lessThan(lens[0]!);
    });
  });

  it('dense tick labels do not collide: same-row labels stay 24 px apart', () => {
    const { calls } = render(lineWire([{ max: 2, d: 8 }], [{ line: 0, n: 3 }], { tick_labels: true }));
    const t = texts(calls);

    expect(t).to.have.lengthOf(17);
    const rows = new Map<number, number[]>();
    for (const x of t) rows.set(x.y, [...(rows.get(x.y) ?? []), x.x]);
    expect(rows.size).to.equal(2);
    for (const xs of rows.values()) {
      xs.sort((a, b) => a - b).slice(1).forEach((x, i) => expect(x - xs[i]!).to.be.at.least(24));
    }
  });

  it('a main line runs from the first tick to the last', () => {
    const { calls } = render(lineWire([{ max: 1, d: 4 }], [{ line: 0, n: 1 }]));
    const xs = tickRows(calls)[0]!.map((t) => t.x1);
    const main = segments(calls).filter(horizontal);

    expect(main).to.have.lengthOf(1);
    expect(Math.min(main[0]!.x1, main[0]!.x2)).to.be.closeTo(xs[0]!, 0.01);
    expect(Math.max(main[0]!.x1, main[0]!.x2)).to.be.closeTo(xs[xs.length - 1]!, 0.01);
  });
});

describe('fraction_number_line labels', () => {
  it('whole numbers 0..max are labelled even without tick labels', () => {
    const { calls } = render(lineWire([{ max: 3, d: 4 }], [{ line: 0, n: 1 }]));
    const t = texts(calls);

    expect(t.map((x) => x.text)).to.deep.equal(['0', '1', '2', '3']);
    const xs = tickRows(calls)[0]!.map((s) => s.x1);
    [0, 4, 8, 12].forEach((tick, i) => expect(t[i]!.x).to.be.closeTo(xs[tick]!, 0.01));
  });

  it('fractions at ticks are labelled only when tickLabels', () => {
    const off = texts(render(lineWire([{ max: 1, d: 4 }], [{ line: 0, n: 1 }])).calls).map((x) => x.text);
    const on = texts(render(lineWire([{ max: 1, d: 4 }], [{ line: 0, n: 1 }], { tick_labels: true })).calls)
      .map((x) => x.text);

    expect(off).to.deep.equal(['0', '1']);
    expect(on).to.deep.equal(['0', '1/4', '2/4', '3/4', '1']);
  });

  it('a read task prints no fraction text', () => {
    const { calls } = render(lineWire([{ max: 1, d: 6 }], [{ line: 0, n: 5 }]));

    expect(texts(calls).filter((t) => t.text.includes('/'))).to.have.lengthOf(0);
  });

  it('tick labels sit below the line, points and letters above it', () => {
    const { calls } = render(lineWire([{ max: 1, d: 4 }], [{ line: 0, n: 1, label: 'A' }]));
    const lineY = segments(calls).filter(horizontal)[0]!.y1;
    const t = texts(calls);

    t.filter((x) => x.text !== 'A').forEach((x) => expect(x.y).to.be.greaterThan(lineY));
    expect(t.find((x) => x.text === 'A')!.y).to.be.lessThan(lineY);
  });
});

describe('fraction_number_line stacked lines', () => {
  it('two lines share x-start and length', () => {
    const { calls } = render(lineWire(
      [{ max: 1, d: 2 }, { max: 1, d: 8 }],
      [{ line: 0, n: 1 }],
      { operation: 'fraction_line_equivalent' },
    ));
    const mains = segments(calls).filter(horizontal).sort((a, b) => a.y1 - b.y1);

    expect(mains).to.have.lengthOf(2);
    expect(mains[0]!.y1).to.be.lessThan(mains[1]!.y1);
    expect(mains[0]!.x1).to.be.closeTo(mains[1]!.x1, 0.01);
    expect(mains[0]!.x2).to.be.closeTo(mains[1]!.x2, 0.01);
    const rows = tickRows(calls);
    expect(rows.map((r) => r.length)).to.deep.equal([3, 9]);
    expect(rows[0]![0]!.x1).to.be.closeTo(rows[1]![0]!.x1, 0.01);
    expect(rows[0]![2]!.x1).to.be.closeTo(rows[1]![8]!.x1, 0.01);
  });

  it('lines of different max share one length too', () => {
    const { calls } = render(lineWire([{ max: 2, d: 2 }, { max: 1, d: 4 }], [{ line: 0, n: 1 }]));
    const mains = segments(calls).filter(horizontal).sort((a, b) => a.y1 - b.y1);

    expect(mains[0]!.x2 - mains[0]!.x1).to.be.closeTo(mains[1]!.x2 - mains[1]!.x1, 0.01);
  });
});

describe('fraction_number_line points', () => {
  it('a point draws one dot at n/d of the line, on the line', () => {
    const { calls } = render(lineWire([{ max: 1, d: 4 }], [{ line: 0, n: 3 }]));
    const xs = tickRows(calls)[0]!.map((t) => t.x1);
    const lineY = segments(calls).filter(horizontal)[0]!.y1;

    expect(dots(calls)).to.have.lengthOf(1);
    expect(dots(calls)[0]!.x).to.be.closeTo(xs[3]!, 0.01);
    expect(dots(calls)[0]!.y).to.be.closeTo(lineY, 0.01);
  });

  it('on a stacked pair the dot lands on its own line', () => {
    const { calls } = render(lineWire([{ max: 1, d: 2 }, { max: 1, d: 4 }], [{ line: 1, n: 2 }]));
    const mains = segments(calls).filter(horizontal).sort((a, b) => a.y1 - b.y1);

    expect(dots(calls)[0]!.y).to.be.closeTo(mains[1]!.y1, 0.01);
  });

  it('labelled points draw their letter over their dot', () => {
    const { calls } = render(lineWire(
      [{ max: 1, d: 5 }],
      [{ line: 0, n: 1, label: 'A' }, { line: 0, n: 3, label: 'B' }, { line: 0, n: 4 }],
      { operation: 'fraction_line_greatest' }, ['A', 'B', 'C'],
    ));
    const d = dots(calls);
    const letters = texts(calls).filter((t) => /^[A-D]$/.test(t.text));

    expect(d).to.have.lengthOf(3);
    expect(letters.map((l) => l.text)).to.deep.equal(['A', 'B']);
    expect(letters[0]!.x).to.be.closeTo(d[0]!.x, 0.01);
    expect(letters[1]!.x).to.be.closeTo(d[1]!.x, 0.01);
  });

  it('a point at 1/6 sits left of one at 5/6', () => {
    const { calls } = render(lineWire([{ max: 1, d: 6 }], [{ line: 0, n: 5 }, { line: 0, n: 1 }]));
    const d = dots(calls);

    expect(d[0]!.x).to.be.greaterThan(d[1]!.x);
  });
});

describe('fraction_number_line in the element', () => {
  it('shows the canvas and keeps the stem', () => {
    const { el } = render(lineWire([{ max: 1, d: 4 }], [{ line: 0, n: 1 }]));

    expect(canvasOf(el).hidden).to.equal(false);
    expect(promptOf(el)).to.equal('What fraction is marked?');
  });

  it('uses the fallback prompt when no stem is given', () => {
    const q = normalizeQuestion({
      id: 'q9102', skillIds: ['FRAC-NUMBER-LINE'], format: 'fraction_number_line',
      imageType: 'fraction_number_line', answerToken: 't',
      content: { operation: 'fraction_line_read', lines: [{ max: 1, d: 4 }], points: [{ line: 0, n: 1 }] },
      choices: [{ value: '1/4' }, { value: '1/2' }],
    });
    const { el } = render(q);

    expect(promptOf(el)).to.equal('Look at the number line.');
  });

  it('honours the --cq-frac-* colours', () => {
    const spy = spyCanvas();
    try {
      const el = mount(
        '<choca-canvas-question answer-mode="mc" style="--cq-frac-stroke: #00ff00; --cq-frac-guide: #ff00ff"></choca-canvas-question>',
      ) as El;
      el.question = lineWire([{ max: 1, d: 4 }], [{ line: 0, n: 1 }]);
      const sets = spy.log.filter((c) => c.fn === 'set:strokeStyle' || c.fn === 'set:fillStyle').map((c) => c.args[0]);

      expect(sets).to.include('#00ff00');
      expect(sets).to.include('#ff00ff');
    } finally {
      spy.restore();
    }
  });
});

describe('fraction_number_line malformed content', () => {
  const ok: Point[] = [{ line: 0, n: 1 }];
  const BAD: [string, Record<string, unknown>][] = [
    ['max x d = 18', { lines: [{ max: 3, d: 6 }], points: ok }],
    ['a point on a line that does not exist', { lines: [{ max: 1, d: 4 }], points: [{ line: 2, n: 1 }] }],
    ['no lines', { points: ok }],
    ['no points', { lines: [{ max: 1, d: 4 }] }],
    ['n beyond the line', { lines: [{ max: 1, d: 4 }], points: [{ line: 0, n: 5 }] }],
    ['d = 0', { lines: [{ max: 1, d: 0 }], points: ok }],
    ['three lines', { lines: [{ max: 1, d: 2 }, { max: 1, d: 2 }, { max: 1, d: 2 }], points: ok }],
  ];

  for (const [name, content] of BAD) {
    it(`${name}: no throw, nothing drawn, canvas hidden, buttons shown`, () => {
      let out: ReturnType<typeof render> | undefined;
      expect(() => {
        out = render(normalizeQuestion({
          id: 'q9103', skillIds: ['FRAC-NUMBER-LINE'], format: 'fraction_number_line',
          imageType: 'fraction_number_line', answerToken: 't',
          content: { operation: 'fraction_line_read', ...content },
          questionText: 'What fraction is marked?',
          choices: ['1/4', '1/2', '3/4'].map((value) => ({ value })),
        }));
      }).to.not.throw();

      expect(out!.calls, 'nothing painted').to.have.lengthOf(0);
      expect(canvasOf(out!.el).hidden).to.equal(true);
      expect(choiceLabels(out!.el)).to.have.members(['1/4', '1/2', '3/4']);
    });
  }

  it('clears the previous picture when the next one is malformed', () => {
    const { el } = render(lineWire([{ max: 1, d: 4 }], [{ line: 0, n: 1 }]));
    el.question = lineWire([{ max: 3, d: 6 }], [{ line: 0, n: 1 }]);
    const canvas = canvasOf(el);
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, W, 200).data;

    expect(canvas.hidden).to.equal(true);
    expect(pixels.some((v) => v !== 0)).to.equal(false);
  });
});
