/**
 * Fraction number line: one or two lines, stacked, sharing one start and one
 * length. Whole numbers are always labelled; fractions at the ticks only when
 * the spec asks. A point is a dot on its line, with its letter above.
 *
 * Fractions are never printed unless `tickLabels` is set, so a read task
 * ("what fraction is marked?") doesn't show its own answer.
 */
import type { FractionNumberLineSpec } from '../helpers/fraction-content';
import type { FractionColours } from './draw-fraction';

type Ctx = CanvasRenderingContext2D;

const PAD = 20; // canvas edge to the line's ends (room for the "0" and the last whole)
const LINE_W = 2;
const WHOLE_TICK = 10; // half-height of a whole-number tick
const PART_TICK = 6; // half-height of a fraction tick
const LABEL_GAP = 8; // tick end to its label
const DOT_R = 6;
const LETTER_GAP = 12; // dot edge to its letter
const WHOLE_FONT = 'bold 14px sans-serif';
const STAGGER_BELOW = 30; // tick spacing under which fraction labels alternate between two rows
const STAGGER_DROP = 13;
const LETTER_FONT = 'bold 15px sans-serif';

export function drawFractionNumberLine(
  ctx: Ctx, w: number, h: number, spec: FractionNumberLineSpec, c: FractionColours,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.setLineDash([]);
  const x0 = PAD;
  const len = w - 2 * PAD;
  const count = spec.lines.length;
  // One line sits just below the middle (letters above, labels below);
  // two lines split the height in thirds.
  const ys = count === 1 ? [h / 2 + 10] : [h / 3, (2 * h) / 3 + 8];

  spec.lines.forEach((ln, i) => drawLine(ctx, x0, len, ys[i]!, ln, spec.tickLabels, c));
  for (const p of spec.points) {
    const ln = spec.lines[p.line]!;
    drawPoint(ctx, x0 + (p.n / (ln.max * ln.d)) * len, ys[p.line]!, p.label, c);
  }
}

function drawLine(
  ctx: Ctx, x0: number, len: number, y: number, ln: { max: number; d: number }, tickLabels: boolean,
  c: FractionColours,
): void {
  const ticks = ln.max * ln.d;
  const step = len / ticks;
  ctx.strokeStyle = c.stroke;
  ctx.lineWidth = LINE_W;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0 + len, y);
  ctx.stroke();

  // Fraction labels shrink with the spacing so 16 intervals don't collide.
  const fracFont = `${Math.round(Math.max(8, Math.min(12, step * 0.7)))}px sans-serif`;
  for (let k = 0; k <= ticks; k++) {
    const x = x0 + k * step;
    const whole = k % ln.d === 0;
    const half = whole ? WHOLE_TICK : PART_TICK;
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = LINE_W;
    ctx.beginPath();
    ctx.moveTo(x, y - half);
    ctx.lineTo(x, y + half);
    ctx.stroke();
    if (whole) drawText(ctx, String(k / ln.d), WHOLE_FONT, x, y + WHOLE_TICK + LABEL_GAP, c);
    else if (tickLabels) {
      // Close ticks: every other label drops a row so neighbours don't collide.
      const drop = step < STAGGER_BELOW && k % 2 === 1 ? STAGGER_DROP : 0;
      drawText(ctx, `${k}/${ln.d}`, fracFont, x, y + WHOLE_TICK + LABEL_GAP + drop, c);
    }
  }
}

function drawPoint(ctx: Ctx, x: number, y: number, label: string | undefined, c: FractionColours): void {
  ctx.beginPath();
  ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
  ctx.fillStyle = c.guide;
  ctx.fill();
  ctx.strokeStyle = c.stroke;
  ctx.lineWidth = LINE_W;
  ctx.stroke();
  if (label) drawText(ctx, label, LETTER_FONT, x, y - DOT_R - LETTER_GAP, c);
}

function drawText(ctx: Ctx, s: string, font: string, x: number, y: number, c: FractionColours): void {
  ctx.fillStyle = c.text;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
