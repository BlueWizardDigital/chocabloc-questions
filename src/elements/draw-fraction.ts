/**
 * Fraction models: bars and circles, one to four of them, in a row or
 * stacked, with optional letters, captions and a dashed guide line.
 *
 * One whole has one size across every model in a question: one length for a
 * bar's whole, one radius for a circle. It is worked out once, from the model
 * with the most wholes, so 7/4 drawn in 2 wholes never looks bigger than 9/4
 * drawn in 3. A model with fewer wholes leaves the rest of its space empty.
 */
import type { FractionModel, FractionModelsSpec } from '../helpers/fraction-content';

/** The colours of the fraction pictures (models, and the number line). */
export type FractionColours = {
  /** A shaded part. */
  fill: string;
  /** An unshaded part. */
  empty: string;
  /** Part outlines. */
  stroke: string;
  /** The dashed guide line. */
  guide: string;
  /** Letters and captions. */
  text: string;
};

/** The colours where the page sets no `--cq-frac-*` variable. */
export const FRACTION_COLOURS: FractionColours = {
  fill: '#42a5f5', empty: '#ffffff', stroke: '#1976d2', guide: '#ef4444', text: '#1d1d1f',
};

type Ctx = CanvasRenderingContext2D;

const PAD = 10; // canvas edge to the picture
const LINE_W = 1.5;
const WHOLE_GAP = 8; // between the wholes of one model
const LABEL_FONT = 'bold 15px sans-serif';
const CAPTION_FONT = '14px sans-serif';
// Stack
const STRIP_GAP = 10;
const MAX_STRIP_H = 36;
const LABEL_W = 24; // the column left of the strips that holds the letters
const CAPTION_GAP = 8; // strip end to caption
const GUIDE_OVERHANG = 6;
// Row
const BOX_GAP = 12;
const MAX_BAR_H = 40;
const UNDER_GAP = 6; // model to the text under it
const LABEL_H = 20;
const CAPTION_H = 18;

export function drawFractionModels(
  ctx: Ctx, w: number, h: number, spec: FractionModelsSpec, colours: FractionColours,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.setLineDash([]);
  if (spec.layout === 'stack') drawStack(ctx, w, h, spec, colours);
  else drawRow(ctx, w, h, spec.models, colours);
}

/** The most wholes any bar has. Every whole in the question is sized from it. */
function mostWholes(models: FractionModel[]): number {
  return Math.max(1, ...models.filter((m) => m.shape === 'bar').map((m) => m.wholes));
}

/** One whole's length when `wholes` of them, with gaps between, fill `space`. */
function wholeLength(space: number, wholes: number): number {
  return (space - (wholes - 1) * WHOLE_GAP) / wholes;
}

/** How far a bar of `wholes` wholes reaches. */
function barSpan(whole: number, wholes: number): number {
  return wholes * whole + (wholes - 1) * WHOLE_GAP;
}

/**
 * Strips one above another. Every strip starts at the same x and has the
 * same length; letters sit in a column on the left, captions in a column on
 * the right, and the guide runs down through all of them.
 */
function drawStack(ctx: Ctx, w: number, h: number, spec: FractionModelsSpec, c: FractionColours): void {
  const { models } = spec;
  ctx.font = CAPTION_FONT;
  const captionW = Math.max(0, ...models.map((m) => (m.caption ? ctx.measureText(m.caption).width : 0)));
  const x0 = PAD + (models.some((m) => m.label) ? LABEL_W : 0);
  const len = w - PAD - (captionW > 0 ? captionW + CAPTION_GAP : 0) - x0;
  const stripH = Math.min(MAX_STRIP_H, (h - 2 * PAD - (models.length - 1) * STRIP_GAP) / models.length);
  const total = models.length * stripH + (models.length - 1) * STRIP_GAP;
  const top = (h - total) / 2;
  const whole = wholeLength(len, mostWholes(models));

  models.forEach((m, i) => {
    const y = top + i * (stripH + STRIP_GAP);
    const mid = y + stripH / 2;
    if (m.shape === 'circle') drawCircle(ctx, x0 + stripH / 2, mid, stripH / 2, m, c);
    else drawBar(ctx, x0, y, whole, stripH, m, c);
    if (m.label) drawText(ctx, m.label, LABEL_FONT, 'center', PAD + LABEL_W / 2, mid, c);
    if (m.caption) drawText(ctx, m.caption, CAPTION_FONT, 'left', x0 + len + CAPTION_GAP, mid, c);
  });

  if (spec.guide) {
    // At n/d of one whole (guide n <= d, so it stays in the first whole).
    // That is n/d of the strip length when every strip is one whole, as in
    // the equivalent-strips questions.
    const [gn, gd] = spec.guide;
    const gx = x0 + (gn / gd) * whole;
    ctx.strokeStyle = c.guide;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(gx, top - GUIDE_OVERHANG);
    ctx.lineTo(gx, top + total + GUIDE_OVERHANG);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Models side by side, each in an equal box, centred in it. The letter goes
 * under the model and the caption under the letter.
 */
function drawRow(ctx: Ctx, w: number, h: number, models: FractionModel[], c: FractionColours): void {
  const count = models.length;
  const boxW = (w - 2 * PAD - (count - 1) * BOX_GAP) / count;
  const labelH = models.some((m) => m.label) ? LABEL_H : 0;
  const captionH = models.some((m) => m.caption) ? CAPTION_H : 0;
  const under = labelH + captionH > 0 ? UNDER_GAP + labelH + captionH : 0;
  const areaH = h - 2 * PAD - under;
  const whole = wholeLength(boxW, mostWholes(models));
  const barH = Math.min(MAX_BAR_H, areaH);
  // The stroke reaches half a line width past the radius.
  const r = Math.min(boxW, areaH) / 2 - LINE_W / 2;
  const modelH = Math.max(
    models.some((m) => m.shape === 'bar') ? barH : 0,
    models.some((m) => m.shape === 'circle') ? 2 * r : 0,
  );
  const top = (h - modelH - under) / 2;
  const mid = top + modelH / 2;
  const textTop = top + modelH + UNDER_GAP;

  models.forEach((m, i) => {
    const cx = PAD + i * (boxW + BOX_GAP) + boxW / 2;
    if (m.shape === 'circle') drawCircle(ctx, cx, mid, r, m, c);
    else drawBar(ctx, cx - barSpan(whole, m.wholes) / 2, mid - barH / 2, whole, barH, m, c);
    if (m.label) drawText(ctx, m.label, LABEL_FONT, 'center', cx, textTop + labelH / 2, c, boxW);
    if (m.caption) drawText(ctx, m.caption, CAPTION_FONT, 'center', cx, textTop + labelH + captionH / 2, c, boxW);
  });
}

/** A bar's wholes side by side from x, the first n parts shaded, left to right. */
function drawBar(
  ctx: Ctx, x: number, y: number, whole: number, barH: number, m: FractionModel, c: FractionColours,
): void {
  // Equal parts, or the widths `split` gives, scaled to the whole's length.
  const split = m.split ?? new Array<number>(m.d).fill(1);
  const sum = split.reduce((s, v) => s + v, 0);
  const widths = split.map((v) => (v / sum) * whole);
  ctx.strokeStyle = c.stroke;
  ctx.lineWidth = LINE_W;
  let part = 0;
  for (let k = 0; k < m.wholes; k++) {
    let px = x + k * (whole + WHOLE_GAP);
    for (const pw of widths) {
      ctx.fillStyle = part < m.n ? c.fill : c.empty;
      ctx.fillRect(px, y, pw, barH);
      ctx.strokeRect(px, y, pw, barH);
      px += pw;
      part++;
    }
  }
}

/** A circle cut into d sectors from 12 o'clock, the first n shaded, clockwise. */
function drawCircle(ctx: Ctx, cx: number, cy: number, r: number, m: FractionModel, c: FractionColours): void {
  const step = (Math.PI * 2) / m.d;
  ctx.strokeStyle = c.stroke;
  ctx.lineWidth = LINE_W;
  for (let i = 0; i < m.d; i++) {
    const a = -Math.PI / 2 + i * step;
    ctx.beginPath();
    // One part is the whole disc: no radius line.
    if (m.d > 1) ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a, a + step);
    ctx.closePath();
    ctx.fillStyle = i < m.n ? c.fill : c.empty;
    ctx.fill();
    ctx.stroke();
  }
}

function drawText(
  ctx: Ctx, s: string, font: string, align: CanvasTextAlign, x: number, y: number, c: FractionColours,
  maxWidth?: number,
): void {
  ctx.fillStyle = c.text;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (maxWidth === undefined) ctx.fillText(s, x, y);
  else ctx.fillText(s, x, y, maxWidth);
}
