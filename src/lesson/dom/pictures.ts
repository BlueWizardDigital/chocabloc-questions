import { base10FitScale, drawBase10Blocks } from '../../elements/draw-base10';
import { drawArray } from '../../elements/draw-array';
import { base10Blocks, base10Caption, focusColors } from '../layout/base10';
import { numberLineLayout } from '../layout/number-line';
import { columnsLayout } from '../layout/columns';
import type { LessonPicture, Place } from '../types';
import type { Msg } from '../messages';

type Pic<K extends LessonPicture['kind']> = Extract<LessonPicture, { kind: K }>;
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const CANVAS_H = 140;
const SVG_NS = 'http://www.w3.org/2000/svg';
const NL_W = 360;
const NL_H = 90;
/** Each extra label row (forced labels that would touch) adds this much height. */
const NL_ROW = 16;
const AXIS = 56;
const PLACE_OFFSET: Record<Place, number> = { ones: 0, tens: 1, hundreds: 2, thousands: 3 };

/** An element with an optional part, class and text. Text only ever goes in through textContent. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  part?: string,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (part) e.setAttribute('part', part);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** An SVG element made with createElementNS. */
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text != null) e.textContent = text;
  return e;
}

const round = (n: number): number => Math.round(n * 10) / 10;
const signed = (n: number): string => (n < 0 ? `−${-n}` : String(n));

/**
 * A canvas as wide as its box and 140 CSS px tall, drawn at devicePixelRatio
 * so it stays sharp on Chromebooks, and redrawn when the box changes size.
 */
function canvasDrawing(draw: Draw): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  // The box is set here, not left to a stylesheet: if the bitmap size could change
  // the box, every redraw would trigger the observer again.
  canvas.style.cssText = `display:block;width:100%;height:${CANVAS_H}px`;
  const ro = new ResizeObserver((entries) => {
    // A removed canvas reports one last zero size; stop watching it then.
    if (!canvas.isConnected) {
      ro.disconnect();
      return;
    }
    const w = entries[entries.length - 1]!.contentRect.width;
    const ctx = canvas.getContext('2d');
    if (w <= 0 || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(CANVAS_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, w, CANVAS_H);
  });
  ro.observe(canvas);
  return canvas;
}

function base10(pic: Pic<'base10'>, msg: Msg, lang: string): HTMLElement {
  const row = h('div', undefined, pic.numbers.length > 1 ? 'b10 two' : 'b10');
  const colors = focusColors(pic.focus);
  const sets = pic.numbers.map(base10Blocks);
  for (const n of pic.numbers) {
    const fig = h('div', undefined, 'fig');
    fig.append(
      h('span', undefined, 'num', String(n)),
      // One block size for every number: a kid reads size as value, so all use the smallest fit.
      canvasDrawing((ctx, w, ht) => {
        const scale = Math.min(...sets.map((b) => base10FitScale(b, w, ht)));
        drawBase10Blocks(ctx, w, ht, { blocks: base10Blocks(n), scale }, colors);
      }),
      h('span', 'caption', undefined, base10Caption(n, msg, lang)),
    );
    row.append(fig);
  }
  return row;
}

function numberLine(pic: Pic<'numberLine'>): SVGSVGElement {
  const { ticks, ends, rows, marks, jumps } = numberLineLayout(pic, NL_W);
  const line = svg('svg', { viewBox: `0 0 ${NL_W} ${NL_H + (rows - 1) * NL_ROW}`, class: 'nl', 'aria-hidden': 'true' });
  line.append(svg('line', { x1: 8, y1: AXIS, x2: NL_W - 8, y2: AXIS }));
  for (const t of ticks) {
    const x = round(t.x);
    line.append(svg('line', { x1: x, y1: AXIS - 7, x2: x, y2: AXIS + 7 }));
    if (t.label) line.append(svg('text', { x, y: AXIS + 26 + t.row * NL_ROW }, signed(t.value)));
  }
  for (const e of ends) line.append(svg('text', { x: round(e.x), y: AXIS + 26 + e.row * NL_ROW }, signed(e.value)));
  for (const j of jumps) {
    // A hop from `from` to `to`, with an arrowhead along the curve's last direction.
    const mid = (j.fromX + j.toX) / 2;
    const dx = j.toX - mid;
    const len = Math.hypot(dx, 44) || 1;
    const [ux, uy] = [dx / len, 44 / len];
    const [bx, by] = [j.toX - ux * 10, AXIS - uy * 10];
    line.append(
      svg('path', { class: 'jump', d: `M${round(j.fromX)} ${AXIS} Q${round(mid)} ${AXIS - 44} ${round(j.toX)} ${AXIS}` }),
      svg('polygon', {
        class: 'head',
        points: [j.toX, AXIS, bx - uy * 5, by + ux * 5, bx + uy * 5, by - ux * 5].map(round).join(' '),
      }),
      svg('text', { x: round(mid), y: AXIS - 28 }, j.label),
    );
  }
  for (const m of marks) line.append(svg('circle', { cx: round(m.x), cy: AXIS, r: 6 }));
  return line;
}

function columns(pic: Pic<'columns'>): HTMLElement {
  const { width, rows } = columnsLayout(pic);
  const grid = h('div', undefined, 'cols');
  grid.style.gridTemplateColumns = `repeat(${width}, 1em)`;
  // Smaller digits for wider sums, so up to 17 columns fit a 320 px screen.
  grid.style.fontSize = `${width <= 8 ? 32 : width <= 12 ? 22 : 16}px`;
  // The ones sit just left of the decimal point, or in the last column.
  const point = rows.reduce((at, r) => (at >= 0 ? at : r.cells.indexOf('.')), -1);
  const ones = point >= 0 ? point - 1 : width - 1;
  const focus = pic.focus == null ? -1 : ones - PLACE_OFFSET[pic.focus];
  for (const r of rows) {
    r.cells.forEach((c, i) => grid.append(h('span', undefined, i === focus ? `${r.role} on` : r.role, c)));
  }
  return grid;
}

/** The lazy young chunk (count pictures, animals, young text). */
export type Young = typeof import('./young');
/** The lazy pictures chunk (share pictures, counted rows of dots). */
export type Pictures = typeof import('./more-pictures');

/**
 * A lazy chunk: `y` is the chunk once it has loaded, `false` if it failed, null
 * while it loads; pictures that need it wait in `wait` and are called with true
 * when it arrives, false if it failed.
 */
export interface Chunk<X> {
  y: X | false | null;
  wait: ((ok: boolean) => void)[];
}

/** How pictures are drawn for this kid, with the young chunk (`y`, `wait`) and the pictures chunk. */
export interface PictureLook extends Chunk<Young> {
  young: boolean;
  base: string | null;
  skillId: string;
  pictures: Chunk<Pictures>;
}

/**
 * Draws with a lazy chunk: now if it is here, else the box holds its final
 * height (`height`, the largest it can be) until the chunk settles. A failed
 * chunk leaves the picture out and the box empty.
 */
function via<X>(
  box: HTMLElement,
  chunk: Chunk<X> | undefined,
  height: number,
  build: (x: X) => HTMLElement,
  late: (x: X) => HTMLElement = build,
): void {
  if (!chunk || chunk.y === false) return;
  if (chunk.y) {
    box.append(build(chunk.y));
    return;
  }
  box.style.minHeight = `${height}px`;
  chunk.wait.push((ok) => {
    // This screen was drawn with its normal words, so a chunk that arrives now draws it the standard way (`late`).
    if (ok) box.append(late(chunk.y as X));
    // Held height only keeps the page still while waiting: after, the box is as tall as what it holds.
    box.style.minHeight = '';
  });
}

/** Height of a count: each ten frame stands in a column (75 px at 30 px cells when apart, 99 px at 42), 10 px apart; apart, the taller group sets it. */
function countHeight(pic: Extract<LessonPicture, { kind: 'count' }>): number {
  const frames = (n: number): number => Math.max(1, Math.ceil(n / 10));
  const rows = pic.apart ? Math.max(...pic.groups.map(frames)) : frames(pic.groups.reduce((t, n) => t + n, 0) + (pic.empty ?? 0));
  return rows * (pic.apart ? 75 : 99) + (rows - 1) * 10;
}

/**
 * A lesson picture: base-ten and arrays on canvas, number lines in SVG, column sums as a grid, counts
 * and animal arrays from the young chunk, shares and counted arrays of dots from the pictures chunk.
 */
export function renderPicture(pic: LessonPicture, msg: Msg, lang: string, look?: PictureLook): HTMLElement {
  const box = h('div', 'picture');
  switch (pic.kind) {
    case 'base10':
      box.append(base10(pic, msg, lang));
      break;
    case 'array': {
      const squares = (): HTMLElement => canvasDrawing((ctx, w, ht) => drawArray(ctx, w, ht, [pic.rows, pic.cols]));
      if (look?.young && look.base != null && pic.rows * pic.cols <= 30) {
        // Before the chunk lands the screen has its normal words, so the picture that follows is the squares: the canvas height.
        via(box, look, CANVAS_H, (y) => y.array(pic, look, squares, msg), squares);
      } else if (pic.counted != null) {
        // A line of counted dots is 32 px at most, 6 px apart (counted-rows.ts).
        via(box, look?.pictures, pic.rows * 38 - 6, (p) => p.countedDots(pic, msg));
      } else box.append(squares());
      break;
    }
    case 'share':
      // Dots and long division side by side, the taller sets it (more-pictures.ts): 13 px a row of dots
      // plus their labels, or 2 written lines plus 3 (63 px) for each part given.
      via(box, look?.pictures, Math.max(pic.rows * 13 + 14, 56 + pic.shown * 63), (p) => p.share(pic, msg));
      break;
    case 'count':
      via(box, look, countHeight(pic), (y) => y.count(pic, look!), (y) => y.count(pic, { ...look!, base: null }));
      break;
    case 'numberLine':
      box.append(numberLine(pic));
      break;
    case 'columns':
      box.append(columns(pic));
      break;
  }
  return box;
}
