import { FIGURE_FRAME, type FigureLine, type FigurePanel, type FigurePoint, type FigureSpec } from '../helpers/figure-content';

const STROKE = '#2196f3';
const FILL = '#e3f2fd';
const LINE_COLOUR = '#555';
const LETTER_COLOUR = '#333';

const PANEL_LETTER_H = 20; // room kept under each panel for its letter
const PANEL_PAD = 4;
const SINGLE_PAD = 12;
const BADGE_R = 9;

type Box = { x: number; y: number; w: number; h: number };

/** Canvas height: 260 for a 3–4 panel figure (a 2×2 grid), 200 for one panel. */
export function figureCanvasHeight(spec: FigureSpec): number {
  return spec.panels.length > 1 ? 260 : 200;
}

/** Maps the −10..10 frame (y up) into a box with one uniform scale. */
function frameMap(box: Box): (p: FigurePoint) => [number, number] {
  const k = Math.min(box.w, box.h) / (2 * FIGURE_FRAME);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return ([x, y]) => [cx + x * k, cy - y * k];
}

function strokePolygon(ctx: CanvasRenderingContext2D, map: (p: FigurePoint) => [number, number], pts: readonly FigurePoint[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = map(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function setPolygonStyle(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = STROKE;
  ctx.fillStyle = FILL;
  ctx.lineWidth = 3;
}

function drawLine(ctx: CanvasRenderingContext2D, map: (p: FigurePoint) => [number, number], line: FigureLine): void {
  const [x1, y1] = map(line.from);
  const [x2, y2] = map(line.to);
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = LINE_COLOUR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
  if (line.label === undefined) return;
  // The letter sits in a small white circle just beyond the line's end.
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  // Clamped so a line ending at the frame edge keeps its badge on the canvas.
  const lo = BADGE_R + 1;
  const bx = Math.min(Math.max(x2 + ((x2 - x1) / len) * (BADGE_R + 3), lo), ctx.canvas.width - lo);
  const by = Math.min(Math.max(y2 + ((y2 - y1) / len) * (BADGE_R + 3), lo), ctx.canvas.height - lo);
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = LINE_COLOUR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(bx, by, BADGE_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = LETTER_COLOUR;
  ctx.font = '700 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(line.label, bx, by + 0.5);
  ctx.restore();
}

function drawPanel(ctx: CanvasRenderingContext2D, box: Box, panel: FigurePanel): void {
  const map = frameMap(box);
  setPolygonStyle(ctx);
  for (const poly of panel.polygons) strokePolygon(ctx, map, poly);
  for (const line of panel.lines) drawLine(ctx, map, line);
}

/**
 * A figure: one panel fills the canvas, 3–4 panels go in a 2×2 grid with
 * each one's letter under it. Each panel maps −10..10 with one uniform scale,
 * so a smaller shape draws smaller.
 */
export function drawFigure(ctx: CanvasRenderingContext2D, w: number, h: number, spec: FigureSpec): void {
  ctx.clearRect(0, 0, w, h);
  if (spec.panels.length === 1) {
    drawPanel(ctx, { x: SINGLE_PAD, y: SINGLE_PAD, w: w - 2 * SINGLE_PAD, h: h - 2 * SINGLE_PAD }, spec.panels[0]!);
    return;
  }
  const cellW = w / 2;
  const cellH = h / 2;
  spec.panels.forEach((panel, i) => {
    const cx = (i % 2) * cellW;
    const cy = Math.floor(i / 2) * cellH;
    drawPanel(ctx, {
      x: cx + PANEL_PAD, y: cy + PANEL_PAD,
      w: cellW - 2 * PANEL_PAD, h: cellH - PANEL_LETTER_H - PANEL_PAD,
    }, panel);
    ctx.save();
    ctx.fillStyle = LETTER_COLOUR;
    ctx.font = '700 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(panel.label ?? '', cx + cellW / 2, cy + cellH - PANEL_LETTER_H / 2);
    ctx.restore();
  });
}

/** One polygon from `points`, centred on the canvas in the same frame (the `points` rows of the 2D formats). */
export function drawPolygonInFrame(ctx: CanvasRenderingContext2D, w: number, h: number, pts: FigurePoint[]): void {
  ctx.clearRect(0, 0, w, h);
  setPolygonStyle(ctx);
  strokePolygon(ctx, frameMap({ x: SINGLE_PAD, y: SINGLE_PAD, w: w - 2 * SINGLE_PAD, h: h - 2 * SINGLE_PAD }), pts);
}
