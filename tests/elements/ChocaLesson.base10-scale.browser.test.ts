import { expect } from '@esm-bundle/chai';
import '../../src/lesson/index';
import type { Lesson } from '../../src/lesson/index';
import { cleanup, mount, parts, until } from './lesson-test-utils';

let fixture: Lesson;

before(async () => {
  const res = await fetch(new URL('../fixtures/lesson-compare-100.json', import.meta.url));
  fixture = (await res.json()) as Lesson;
});

afterEach(cleanup);

/** Records the uniform scale each canvas applies (ctx.scale(s, s) with s != the dpr transform). */
function watchScales(): Map<HTMLCanvasElement, number[]> {
  const seen = new Map<HTMLCanvasElement, number[]>();
  const real = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
    const ctx = (real as (...a: unknown[]) => RenderingContext | null).apply(this, args) as CanvasRenderingContext2D | null;
    if (ctx && !(ctx as unknown as { __spied?: boolean }).__spied) {
      const scale = ctx.scale.bind(ctx);
      (ctx as unknown as { __spied: boolean }).__spied = true;
      ctx.scale = (x: number, y: number): void => {
        (seen.get(this) ?? seen.set(this, []).get(this)!).push(x);
        scale(x, y);
      };
    }
    return ctx;
  } as typeof real;
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = real;
  });
  return seen;
}

async function ideaWith(numbers: number[]): Promise<{ canvases: HTMLCanvasElement[]; seen: Map<HTMLCanvasElement, number[]> }> {
  const seen = watchScales();
  const el = mount();
  el.style.display = 'block';
  el.style.width = '320px';
  el.mode = 'help';
  el.lesson = { ...fixture, idea: { ...fixture.idea, picture: { kind: 'base10', numbers } } } as Lesson;
  await until(() => parts(el, 'picture').length > 0, 'the picture');
  const canvases = Array.from(el.shadowRoot!.querySelectorAll('canvas'));
  await until(() => canvases.every((c) => seen.has(c)), 'every canvas drawn');
  return { canvases, seen };
}

describe('<chocabloc-lesson> base-ten picture scale', () => {
  it('256 and 133 are drawn at the same, shrunk, block size', async () => {
    const { canvases, seen } = await ideaWith([256, 133]);
    expect(canvases).to.have.length(2);
    const [a, b] = canvases.map((c) => seen.get(c)!.at(-1)!);
    expect(a).to.equal(b);
    expect(a, 'it had to shrink to fit').to.be.below(1);
  });

  it('one number draws at its own fit, as before', async () => {
    const { canvases, seen } = await ideaWith([12]);
    // 1 ten and 2 ones: natural height is a rod plus 20 (187), its own fit to the canvas height.
    const fit = Math.min((canvases[0]!.clientHeight - 8) / 187, 1);
    expect(seen.get(canvases[0]!)!.at(-1)).to.be.closeTo(fit, 1e-9);
  });
});
