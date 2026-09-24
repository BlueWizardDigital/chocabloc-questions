import { expect } from '@esm-bundle/chai';
import type { ChocaWhiteboard } from '../../src/elements/ChocaWhiteboard';
import '../../src/elements/ChocaWhiteboard';

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.firstElementChild as HTMLElement;
}

function asWb(el: HTMLElement): ChocaWhiteboard {
  return el as unknown as ChocaWhiteboard;
}

async function frame(): Promise<void> { await new Promise((r) => requestAnimationFrame(r)); }
afterEach(() => { document.body.innerHTML = ''; });

describe('<choca-whiteboard>', () => {
  it('registers', () => {
    expect(customElements.get('choca-whiteboard')).to.not.be.undefined;
  });

  it('renders canvas', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    expect(el.shadowRoot!.querySelector('[part="wb-canvas"]')!.tagName.toLowerCase()).to.equal('canvas');
  });

  it('renders tool buttons', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    expect(el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]').length).to.be.at.least(4);
  });

  it('renders color + width buttons', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    expect(el.shadowRoot!.querySelectorAll('[part~="wb-color-btn"]').length).to.be.at.least(4);
    expect(el.shadowRoot!.querySelectorAll('[part~="wb-width-btn"]').length).to.be.at.least(2);
  });

  it('pen is default tool', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    expect(asWb(el).activeTool).to.equal('pen');
  });

  it('eraser click switches tool', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    const btns = el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]');
    const eraser = Array.from(btns).find((b) => (b as HTMLElement).dataset.tool === 'eraser') as HTMLButtonElement;
    eraser.click();
    expect(asWb(el).activeTool).to.equal('eraser');
  });

  it('pointer events create strokes', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    const c = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(asWb(el).strokeCount).to.equal(1);
  });

  it('undo removes last stroke', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    const c = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 60, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(asWb(el).strokeCount).to.equal(2);
    const undo = Array.from(el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]'))
      .find((b) => (b as HTMLElement).dataset.tool === 'undo') as HTMLButtonElement;
    undo.click();
    expect(asWb(el).strokeCount).to.equal(1);
  });

  it('clear() resets everything', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    const c = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    asWb(el).clear();
    expect(asWb(el).strokeCount).to.equal(0);
  });
});

describe('math template', () => {
  it('math-expression attribute sets template', async () => {
    const el = mount(`<choca-whiteboard math-expression="343 + 46"></choca-whiteboard>`);
    await frame();
    expect(asWb(el).hasMathTemplate).to.equal(true);
  });

  it('setMathExpression dispatches success event for addition', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    let detail: Record<string, unknown> | null = null;
    el.addEventListener('choca-whiteboard-math-set', ((e: CustomEvent) => { detail = e.detail; }) as EventListener);
    asWb(el).setMathExpression('343 + 46');
    expect(detail).to.not.be.null;
    expect((detail as Record<string, unknown>).expression).to.equal('343 + 46');
    expect(((detail as Record<string, unknown>).layout as Record<string, unknown>).kind).to.equal('stacked');
  });

  it('setMathExpression dispatches success event for subtraction', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    let detail: Record<string, unknown> | null = null;
    el.addEventListener('choca-whiteboard-math-set', ((e: CustomEvent) => { detail = e.detail; }) as EventListener);
    asWb(el).setMathExpression('100 - 37');
    expect(detail).to.not.be.null;
    expect(((detail as Record<string, unknown>).layout as Record<string, unknown>).operator).to.equal('-');
  });

  it('unsupported layout (multiplication) dispatches error', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    let detail: Record<string, unknown> | null = null;
    el.addEventListener('choca-whiteboard-math-error', ((e: CustomEvent) => { detail = e.detail; }) as EventListener);
    asWb(el).setMathExpression('12 x 4');
    expect(detail).to.not.be.null;
    expect((detail as Record<string, unknown>).reason).to.equal('unsupported-layout');
    expect(asWb(el).hasMathTemplate).to.equal(false);
  });

  it('invalid expression dispatches error without throwing', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    let detail: Record<string, unknown> | null = null;
    el.addEventListener('choca-whiteboard-math-error', ((e: CustomEvent) => { detail = e.detail; }) as EventListener);
    asWb(el).setMathExpression('garbage');
    expect(detail).to.not.be.null;
    expect((detail as Record<string, unknown>).reason).to.equal('parse-failed');
  });

  it('empty expression dispatches error', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    let detail: Record<string, unknown> | null = null;
    el.addEventListener('choca-whiteboard-math-error', ((e: CustomEvent) => { detail = e.detail; }) as EventListener);
    asWb(el).setMathExpression('');
    expect(detail).to.not.be.null;
    expect((detail as Record<string, unknown>).reason).to.equal('empty-expression');
  });

  it('clearMathTemplate removes template', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    asWb(el).setMathExpression('343 + 46');
    expect(asWb(el).hasMathTemplate).to.equal(true);
    asWb(el).clearMathTemplate();
    expect(asWb(el).hasMathTemplate).to.equal(false);
  });

  it('clear() removes strokes but preserves template', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    asWb(el).setMathExpression('343 + 46');
    const c = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(asWb(el).strokeCount).to.equal(1);
    asWb(el).clear();
    expect(asWb(el).strokeCount).to.equal(0);
    expect(asWb(el).hasMathTemplate).to.equal(true);
  });

  it('undo does not remove template', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    asWb(el).setMathExpression('343 + 46');
    const c = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const undo = Array.from(el.shadowRoot!.querySelectorAll('[part~="wb-tool-btn"]'))
      .find((b) => (b as HTMLElement).dataset.tool === 'undo') as HTMLButtonElement;
    undo.click();
    expect(asWb(el).strokeCount).to.equal(0);
    expect(asWb(el).hasMathTemplate).to.equal(true);
  });

  it('removing math-expression attribute clears template', async () => {
    const el = mount(`<choca-whiteboard math-expression="5 + 3"></choca-whiteboard>`);
    await frame();
    expect(asWb(el).hasMathTemplate).to.equal(true);
    el.removeAttribute('math-expression');
    expect(asWb(el).hasMathTemplate).to.equal(false);
  });
});

// --- stacked-math rendering -------------------------------------------------
// Canvas output is asserted by spying on the 2D context's drawing calls, not by
// reading pixels. The whiteboard grabs its context in the constructor, so the
// spy has to be installed on the prototype before the element is mounted.

type CtxCall = { fn: 'fillText' | 'moveTo' | 'lineTo'; args: unknown[]; align: string };

type CanvasProto = { getContext: (...a: unknown[]) => unknown };

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
          if (prop === 'fillText' || prop === 'moveTo' || prop === 'lineTo') {
            calls.push({ fn: prop as CtxCall['fn'], args: a, align: target.textAlign });
          }
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

/** Mount a whiteboard with the canvas spy installed, set `expr`, return the draw calls. */
function renderMath(expr: string): { calls: CtxCall[]; canvas: HTMLCanvasElement } {
  const spy = spyCanvas();
  try {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    const canvas = el.shadowRoot!.querySelector('[part="wb-canvas"]') as HTMLCanvasElement;
    spy.calls.length = 0;
    asWb(el).setMathExpression(expr);
    return { calls: spy.calls, canvas };
  } finally {
    spy.restore();
  }
}

function texts(calls: CtxCall[]): CtxCall[] {
  return calls.filter((c) => c.fn === 'fillText');
}

// fillText is (text, x, y); moveTo / lineTo are (x, y).
function textOf(c: CtxCall): string { return c.args[0] as string; }
function xOf(c: CtxCall): number { return c.args[1] as number; }
function yOf(c: CtxCall): number { return c.args[2] as number; }
function ptX(c: CtxCall): number { return c.args[0] as number; }
function ptY(c: CtxCall): number { return c.args[1] as number; }

/**
 * x of the left edge of an operand's decimal point, measured from the glyphs
 * themselves rather than re-deriving the renderer's own arithmetic. The operand
 * is drawn right-aligned, so its left edge is `x - width(text)`; the point's
 * left edge is `x - width(text from the point onwards)`.
 */
function decimalPointX(ctx: CanvasRenderingContext2D, call: CtxCall): number {
  const text = textOf(call);
  const dot = text.indexOf('.');
  if (dot === -1) throw new Error(`no decimal point in "${text}"`);
  return xOf(call) - ctx.measureText(text.slice(dot)).width;
}

function metricsCtx(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')!;
  ctx.font = '24px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  return ctx;
}

describe('stacked math rendering', () => {
  it('draws the canonical 2-operand sequence (back-compat golden)', async () => {
    const { calls, canvas } = renderMath('343 + 46');
    await frame();

    // Golden coordinates below were captured from the pre-change renderer and
    // depend on this metric. If the browser's monospace metrics move, this
    // assertion fails first and explains the coordinate mismatches below it.
    expect(metricsCtx(canvas).measureText('0').width).to.be.closeTo(14.40234375, 1e-6);

    expect(calls).to.deep.equal([
      { fn: 'fillText', args: ['343', 236.005859375, 40], align: 'right' },
      { fn: 'fillText', args: ['46', 236.005859375, 72], align: 'right' },
      { fn: 'fillText', args: ['+', 163.994140625, 72], align: 'left' },
      { fn: 'moveTo', args: [149.591796875, 104], align: 'left' },
      { fn: 'lineTo', args: [243.20703125, 104], align: 'left' },
    ]);
  });

  it('puts the operator beside the LAST operand in a 3-operand stack', async () => {
    const { calls } = renderMath('4 + 5 + 5');
    await frame();

    const drawn = texts(calls);
    expect(drawn.map(textOf)).to.deep.equal(['4', '5', '5', '+']);

    const rows = drawn.filter((c) => c.align === 'right').map(yOf);
    const op = drawn.find((c) => c.align === 'left')!;
    expect(rows).to.deep.equal([40, 72, 104]);
    expect(yOf(op)).to.equal(rows[rows.length - 1]);
    expect(yOf(op)).to.not.equal(rows[1]); // the defect: it used to sit on the middle row
  });

  it('keeps the operator beside operand 1 in a 2-operand stack', async () => {
    const { calls } = renderMath('343 + 46');
    await frame();
    const drawn = texts(calls);
    const rows = drawn.filter((c) => c.align === 'right').map(yOf);
    const op = drawn.find((c) => c.align === 'left')!;
    expect(yOf(op)).to.equal(rows[1]);
  });

  it('draws decimal operands at all', async () => {
    const { calls } = renderMath('4.39 + 26.86');
    await frame();
    expect(texts(calls).map(textOf)).to.deep.equal(['4.39', '26.86', '+']);
  });

  it('aligns decimal points across operands of different scale', async () => {
    const { calls, canvas } = renderMath('4.5 + 26.86');
    await frame();
    const ctx = metricsCtx(canvas);

    const drawn = texts(calls).filter((c) => c.align === 'right');
    expect(drawn.map(textOf)).to.deep.equal(['4.5', '26.86']);

    const [short, long] = drawn as [CtxCall, CtxCall];
    expect(decimalPointX(ctx, short)).to.be.closeTo(decimalPointX(ctx, long), 1e-6);

    // Ragged right edge, not right-alignment: the short operand stops earlier.
    expect(xOf(short)).to.be.lessThan(xOf(long));
  });

  it('does not zero-pad the shorter decimal', async () => {
    const { calls } = renderMath('4.5 + 26.86');
    await frame();
    expect(texts(calls).map(textOf)).to.deep.equal(['4.5', '26.86', '+']);
  });

  it('aligns an integer operand on the ones column, not the point column', async () => {
    const { calls, canvas } = renderMath('4 + 26.86');
    await frame();
    const ctx = metricsCtx(canvas);
    const drawn = texts(calls).filter((c) => c.align === 'right');
    expect(drawn.map(textOf)).to.deep.equal(['4', '26.86']);

    // The integer's right edge must land on the decimal point's left edge, so
    // its units digit sits under the long operand's units digit.
    expect(xOf(drawn[0]!)).to.be.closeTo(decimalPointX(ctx, drawn[1]!), 1e-6);
  });

  it('rule line spans the full width of the widest rendered row', async () => {
    const { calls, canvas } = renderMath('4.5 + 26.86');
    await frame();
    const ctx = metricsCtx(canvas);

    const move = calls.find((c) => c.fn === 'moveTo')!;
    const line = calls.find((c) => c.fn === 'lineTo')!;
    const drawn = texts(calls);

    const rightMost = Math.max(...drawn.filter((c) => c.align === 'right').map(xOf));
    const leftMost = Math.min(
      ...drawn.map((c) => (c.align === 'right' ? xOf(c) - ctx.measureText(textOf(c)).width : xOf(c)))
    );

    expect(ptY(move)).to.equal(ptY(line));
    expect(ptX(line)).to.be.at.least(rightMost);
    expect(ptX(move)).to.be.at.most(leftMost);
  });

  it('rule line still spans the widest row for integers', async () => {
    const { calls, canvas } = renderMath('343 + 46');
    await frame();
    const ctx = metricsCtx(canvas);
    const move = calls.find((c) => c.fn === 'moveTo')!;
    const line = calls.find((c) => c.fn === 'lineTo')!;
    const drawn = texts(calls);
    const rightMost = Math.max(...drawn.filter((c) => c.align === 'right').map(xOf));
    const leftMost = Math.min(
      ...drawn.map((c) => (c.align === 'right' ? xOf(c) - ctx.measureText(textOf(c)).width : xOf(c)))
    );
    expect(ptX(line)).to.be.at.least(rightMost);
    expect(ptX(move)).to.be.at.most(leftMost);
  });

  it('point-aligns AND puts the operator last in a 3-operand decimal stack', async () => {
    const { calls, canvas } = renderMath('1.5 + 2.25 + 3');
    await frame();
    const ctx = metricsCtx(canvas);

    const drawn = texts(calls);
    expect(drawn.map(textOf)).to.deep.equal(['1.5', '2.25', '3', '+']);

    const rows = drawn.filter((c) => c.align === 'right');
    const op = drawn.find((c) => c.align === 'left')!;

    // Operator beside the last operand, not the middle one.
    expect(yOf(op)).to.equal(yOf(rows[2]!));

    // Both decimal operands share a decimal-point x ...
    expect(decimalPointX(ctx, rows[0]!)).to.be.closeTo(decimalPointX(ctx, rows[1]!), 1e-6);
    // ... and the bare integer's right edge lands on that same column.
    expect(xOf(rows[2]!)).to.be.closeTo(decimalPointX(ctx, rows[1]!), 1e-6);

    // Rule still spans the widest row.
    const line = calls.find((c) => c.fn === 'lineTo')!;
    expect(ptX(line)).to.be.at.least(Math.max(...rows.map(xOf)));
  });

  it('rejects a malformed decimal without setting a template', async () => {
    const el = mount(`<choca-whiteboard></choca-whiteboard>`);
    await frame();
    let detail: Record<string, unknown> | null = null;
    el.addEventListener('choca-whiteboard-math-error', ((e: CustomEvent) => { detail = e.detail; }) as EventListener);
    asWb(el).setMathExpression('4. + 1');
    expect(detail).to.not.be.null;
    expect((detail as Record<string, unknown>).reason).to.equal('parse-failed');
    expect(asWb(el).hasMathTemplate).to.equal(false);
  });
});
