export function drawRegularPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, radius: number, sides: number, startAngle = 0,
): void {
  const angleStep = (Math.PI * 2) / sides;
  for (let i = 0; i <= sides; i++) {
    const angle = startAngle + i * angleStep;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function drawShape2D(
  ctx: CanvasRenderingContext2D, w: number, h: number, shapeName: string,
): void {
  const cx = w / 2;
  const cy = h / 2;
  const size = Math.min(w, h) * 0.4;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#2196f3';
  ctx.lineWidth = 3;
  ctx.fillStyle = '#e3f2fd';
  ctx.beginPath();
  switch (shapeName.toLowerCase()) {
    case 'circle':
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
      break;
    case 'triangle':
      drawRegularPolygon(ctx, cx, cy, size, 3, -Math.PI / 2);
      break;
    case 'square':
      drawRegularPolygon(ctx, cx, cy, size, 4, -Math.PI / 4);
      break;
    case 'rectangle': {
      const rw = size * 1.4;
      const rh = size * 0.9;
      ctx.rect(cx - rw / 2, cy - rh / 2, rw, rh);
      break;
    }
    case 'pentagon':
      drawRegularPolygon(ctx, cx, cy, size, 5, -Math.PI / 2);
      break;
    case 'hexagon':
      drawRegularPolygon(ctx, cx, cy, size, 6, 0);
      break;
    case 'octagon':
      drawRegularPolygon(ctx, cx, cy, size, 8, Math.PI / 8);
      break;
    case 'rhombus': {
      const rd = size * 0.9;
      ctx.moveTo(cx, cy - rd);
      ctx.lineTo(cx + rd * 0.7, cy);
      ctx.lineTo(cx, cy + rd);
      ctx.lineTo(cx - rd * 0.7, cy);
      ctx.closePath();
      break;
    }
    case 'trapezoid': {
      const tw = size * 1.2;
      const th = size * 0.8;
      ctx.moveTo(cx - tw * 0.35, cy - th / 2);
      ctx.lineTo(cx + tw * 0.35, cy - th / 2);
      ctx.lineTo(cx + tw / 2, cy + th / 2);
      ctx.lineTo(cx - tw / 2, cy + th / 2);
      ctx.closePath();
      break;
    }
    // The same size as 'trapezoid', but with a square left side: no line of
    // symmetry. Symmetry questions draw this one (see ChocaCanvasQuestion).
    case 'right trapezoid': {
      const tw = size * 1.2;
      const th = size * 0.8;
      ctx.moveTo(cx - tw / 2, cy - th / 2);
      ctx.lineTo(cx + tw * 0.2, cy - th / 2);
      ctx.lineTo(cx + tw / 2, cy + th / 2);
      ctx.lineTo(cx - tw / 2, cy + th / 2);
      ctx.closePath();
      break;
    }
    case 'parallelogram': {
      const pw = size * 1.3;
      const ph = size * 0.8;
      const skew = size * 0.3;
      ctx.moveTo(cx - pw / 2 + skew, cy - ph / 2);
      ctx.lineTo(cx + pw / 2 + skew, cy - ph / 2);
      ctx.lineTo(cx + pw / 2 - skew, cy + ph / 2);
      ctx.lineTo(cx - pw / 2 - skew, cy + ph / 2);
      ctx.closePath();
      break;
    }
    default:
      ctx.font = '40px Arial';
      ctx.fillStyle = '#999';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', cx, cy);
      return;
  }
  ctx.fill();
  ctx.stroke();
}

type Pt = { x: number; y: number };
type IsoFn = (x: number, y: number, z: number) => Pt;

// The 3D shapes' geometry lives in the *Points / *Geom helpers below, so the
// face highlight (drawFaceHighlight) outlines exactly the face that was drawn.

/** Centre and scale every 3D shape is drawn at. */
function frame3D(w: number, h: number): { cx: number; cy: number; s: number } {
  return { cx: w / 2, cy: h / 2, s: Math.min(w, h) * 0.3 };
}

function isoProjection(cx: number, cy: number, s: number): IsoFn {
  return (x, y, z) => ({
    x: cx + (x - z) * 0.866 * s,
    y: cy - y * s + (x + z) * 0.5 * s,
  });
}

// Half-sizes along x, y, z.
const CUBE_DIMS: readonly [number, number, number] = [1, 1, 1];
const RECT_PRISM_DIMS: readonly [number, number, number] = [1.3, 0.7, 0.7];

/** A box's eight corners: the bottom face is 0–3, the top face 4–7. */
function boxCorners(iso: IsoFn, [sx, sy, sz]: readonly [number, number, number]): Pt[] {
  return [
    iso(-sx, -sy, -sz), iso(sx, -sy, -sz), iso(sx, -sy, sz), iso(-sx, -sy, sz),
    iso(-sx, sy, -sz), iso(sx, sy, -sz), iso(sx, sy, sz), iso(-sx, sy, sz),
  ];
}

// Space kept clear around a box, so it and its labels stay on the canvas.
const BOX_MARGIN = 18;

/**
 * A cube's or a rectangular prism's corners, as large as fits inside the
 * canvas with BOX_MARGIN to spare (before beta.19 the cube ran 20px off the top
 * and bottom). Its projection reaches (sy + (sx + sz) / 2) · s above and below
 * the centre, and (sx + sz) · 0.866 · s to either side.
 */
function boxFor(shape: 'cube' | 'rectangular prism', w: number, h: number): Pt[] {
  const dims = shape === 'cube' ? CUBE_DIMS : RECT_PRISM_DIMS;
  const [sx, sy, sz] = dims;
  const { cx, cy, s } = frame3D(w, h);
  const fit = Math.min(s, (h / 2 - BOX_MARGIN) / (sy + (sx + sz) / 2), (w / 2 - BOX_MARGIN) / ((sx + sz) * 0.866));
  return boxCorners(isoProjection(cx, cy, fit), dims);
}

function tracePath(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
}

function fillFaces(ctx: CanvasRenderingContext2D, faces: readonly [Pt[], string][]): void {
  for (const [pts, fill] of faces) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    tracePath(ctx, pts);
    ctx.fill();
    ctx.stroke();
  }
}

/** A cube or a rectangular prism: its top, front and right faces. */
function drawBox(ctx: CanvasRenderingContext2D, v: readonly Pt[]): void {
  fillFaces(ctx, [
    [[v[4]!, v[5]!, v[6]!, v[7]!], '#ede7f6'],
    [[v[3]!, v[2]!, v[6]!, v[7]!], '#d1c4e9'],
    [[v[2]!, v[1]!, v[5]!, v[6]!], '#b39ddb'],
  ]);
}

function drawSphere(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const r = s * 0.9;
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
  grad.addColorStop(0, '#ede7f6');
  grad.addColorStop(0.7, '#d1c4e9');
  grad.addColorStop(1, '#b39ddb');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

type RoundGeom = { rx: number; ry: number; top: number; bot: number };

function cylinderGeom(cy: number, s: number): RoundGeom {
  const h = s * 1.4;
  return { rx: s * 0.7, ry: s * 0.25, top: cy - h / 2, bot: cy + h / 2 };
}

function coneGeom(cy: number, s: number): RoundGeom {
  return { rx: s * 0.7, ry: s * 0.25, top: cy - s * 0.8, bot: cy + s * 0.6 };
}

function drawCylinder(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const { rx, ry, top, bot } = cylinderGeom(cy, s);
  ctx.fillStyle = '#d1c4e9';
  ctx.beginPath(); ctx.ellipse(cx, bot, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ede7f6';
  ctx.beginPath();
  ctx.moveTo(cx - rx, top); ctx.lineTo(cx - rx, bot);
  ctx.ellipse(cx, bot, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(cx + rx, top);
  ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI, true);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#b39ddb';
  ctx.beginPath(); ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawCone(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const { rx, ry, top, bot } = coneGeom(cy, s);
  ctx.fillStyle = '#ede7f6';
  ctx.beginPath();
  ctx.moveTo(cx, top); ctx.lineTo(cx + rx, bot);
  ctx.ellipse(cx, bot, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d1c4e9';
  ctx.beginPath(); ctx.ellipse(cx, bot, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

/** The apex, and the base corners: back-left, back-right, front-right, front-left. */
// A square pyramid seen from the front, a little to the right and above: the
// base is a parallelogram and the apex sits over its centre. It fills about
// 70% of the canvas height (beta.19; it used to be half that, with a base 18px
// deep).
function pyramidPoints(cx: number, cy: number, s: number): { apex: Pt; base: Pt[] } {
  return {
    apex: { x: cx, y: cy - s * 1.25 },
    base: [
      { x: cx - s * 0.6, y: cy + s * 0.45 }, { x: cx + s * 1.1, y: cy + s * 0.45 },
      { x: cx + s * 0.6, y: cy + s * 1.1 }, { x: cx - s * 1.1, y: cy + s * 1.1 },
    ],
  };
}

function drawPyramid(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const { apex, base } = pyramidPoints(cx, cy, s);
  const [bl, br, fr, fl] = base as [Pt, Pt, Pt, Pt];
  // Back to front: the back and left faces end up hidden behind the front and
  // right ones, as they would be.
  fillFaces(ctx, [
    [[apex, bl, br], '#ede7f6'],
    [[apex, fl, bl], '#ede7f6'],
    [[apex, br, fr], '#b39ddb'],
    [[apex, fl, fr], '#d1c4e9'],
  ]);
}

/**
 * The two triangular ends, corners in the same order: bottom-left,
 * bottom-right, top. The shape is 1.5 × 1.4 units; it is drawn 1.65 units to
 * the s and centred, about 70% of the canvas height like the pyramid (before
 * beta.19 it was 84px tall and sat off-centre).
 */
function triPrismPoints(cx: number, cy: number, s: number): { front: Pt[]; back: Pt[] } {
  const k = s * 1.65;
  // Unit corners; the whole shape spans x −0.5…1.0 and y −0.8…0.6, centre (0.25, −0.1).
  const at = (ux: number, uy: number): Pt => ({ x: cx + (ux - 0.25) * k, y: cy + (uy + 0.1) * k });
  const unitFront: [number, number][] = [[-0.5, 0.6], [0.5, 0.6], [0, -0.4]];
  return {
    front: unitFront.map(([x, y]) => at(x, y)),
    back: unitFront.map(([x, y]) => at(x + 0.5, y - 0.4)),
  };
}

function drawTriangularPrism(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const { front, back } = triPrismPoints(cx, cy, s);
  fillFaces(ctx, [
    [[back[0]!, back[1]!, back[2]!], '#ede7f6'],
    [[front[2]!, back[2]!, back[1]!, front[1]!], '#d1c4e9'],
    [[front[0]!, front[1]!, front[2]!], '#b39ddb'],
  ]);
  ctx.beginPath();
  ctx.moveTo(front[0]!.x, front[0]!.y); ctx.lineTo(back[0]!.x, back[0]!.y);
  ctx.stroke();
}

export function drawShape3D(
  ctx: CanvasRenderingContext2D, w: number, h: number, shapeName: string,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#7c4dff';
  ctx.lineWidth = 2;
  const { cx, cy, s } = frame3D(w, h);
  switch (shapeName.toLowerCase()) {
    case 'cube': drawBox(ctx, boxFor('cube', w, h)); break;
    case 'rectangular prism': drawBox(ctx, boxFor('rectangular prism', w, h)); break;
    case 'sphere': drawSphere(ctx, cx, cy, s); break;
    case 'cylinder': drawCylinder(ctx, cx, cy, s); break;
    case 'cone': drawCone(ctx, cx, cy, s); break;
    case 'pyramid': drawPyramid(ctx, cx, cy, s); break;
    case 'triangular prism': drawTriangularPrism(ctx, cx, cy, s); break;
    default:
      ctx.font = '40px Arial'; ctx.fillStyle = '#999';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', cx, cy);
  }
}

export function drawBarGraph(
  ctx: CanvasRenderingContext2D, w: number, h: number, data: Record<string, number>,
): void {
  const margin = { top: 15, right: 10, bottom: 25, left: 30 };
  ctx.clearRect(0, 0, w, h);
  const labels = Object.keys(data);
  const values = Object.values(data);
  const maxVal = Math.max(...values);
  const barWidth = (w - margin.left - margin.right) / labels.length - 8;
  const chartHeight = h - margin.top - margin.bottom;
  ctx.fillStyle = '#42a5f5'; ctx.strokeStyle = '#1976d2'; ctx.lineWidth = 1;
  const tickCount = 5;
  ctx.fillStyle = '#666'; ctx.font = '9px Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let t = 0; t <= tickCount; t++) {
    const val = Math.round((maxVal / tickCount) * t);
    const y = h - margin.bottom - (t / tickCount) * chartHeight;
    ctx.fillText(String(val), margin.left - 4, y);
    ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(w - margin.right, y); ctx.stroke();
  }
  ctx.fillStyle = '#42a5f5'; ctx.strokeStyle = '#1976d2'; ctx.lineWidth = 1;
  labels.forEach((label, i) => {
    const barH = (values[i]! / maxVal) * chartHeight;
    const x = margin.left + i * (barWidth + 8) + 4;
    const y = h - margin.bottom - barH;
    ctx.fillRect(x, y, barWidth, barH);
    ctx.strokeRect(x, y, barWidth, barH);
    ctx.fillStyle = '#333'; ctx.font = '9px Arial'; ctx.textAlign = 'center';
    ctx.fillText(label, x + barWidth / 2, h - 8);
    ctx.fillStyle = '#42a5f5';
  });
  ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, h - margin.bottom);
  ctx.lineTo(w - margin.right, h - margin.bottom);
  ctx.stroke();
}

const EMOJI_MAP: Record<string, string> = {
  apples: '🍎', apple: '🍎', mangoes: '🥭', mango: '🥭',
  peaches: '🍑', peach: '🍑', strawberries: '🍓', strawberry: '🍓',
  grapes: '🍇', grape: '🍇', cherries: '🍒', cherry: '🍒',
  bananas: '🍌', banana: '🍌', oranges: '🍊', orange: '🍊',
  watermelons: '🍉', watermelon: '🍉', pineapples: '🍍', pineapple: '🍍',
  lemons: '🍋', lemon: '🍋', pears: '🍐', pear: '🍐',
  cats: '🐱', cat: '🐱', dogs: '🐶', dog: '🐶',
  stars: '⭐', star: '⭐', hearts: '❤️', heart: '❤️',
  books: '📚', book: '📚', pencils: '✏️', pencil: '✏️',
};

function emojiFor(label: string): string {
  return EMOJI_MAP[label.toLowerCase()] ?? '●';
}

export function drawPictograph(
  ctx: CanvasRenderingContext2D, w: number, h: number, data: Record<string, number>,
): void {
  ctx.clearRect(0, 0, w, h);
  const labels = Object.keys(data);
  const values = Object.values(data);
  const rowHeight = 24, iconSize = 14, labelWidth = 70;
  ctx.textBaseline = 'middle';
  labels.forEach((label, i) => {
    const y = 15 + i * rowHeight;
    ctx.fillStyle = '#333'; ctx.font = '10px Arial'; ctx.textAlign = 'right';
    ctx.fillText(label, labelWidth - 5, y);
    const emoji = emojiFor(label);
    if (emoji === '●') {
      ctx.fillStyle = '#ffb74d'; ctx.strokeStyle = '#f57c00'; ctx.lineWidth = 1;
      for (let j = 0; j < values[i]!; j++) {
        const x = labelWidth + 5 + j * (iconSize + 3);
        ctx.beginPath(); ctx.arc(x + iconSize / 2, y, iconSize / 2 - 1, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    } else {
      ctx.font = `${iconSize}px Arial`; ctx.textAlign = 'center';
      for (let j = 0; j < values[i]!; j++) {
        const x = labelWidth + 5 + j * (iconSize + 3) + iconSize / 2;
        ctx.fillText(emoji, x, y);
      }
    }
  });
}

/**
 * pythagorean. "Find the hypotenuse" rows label both legs and put "?" on the
 * hypotenuse. "Find the missing leg" rows (GEOM-PYTHAGOREAN-LEG) give one leg
 * and the hypotenuse, so `operands` holds the hypotenuse; `legs` still holds
 * both legs, one of them the answer. Those label the known leg and the
 * hypotenuse, and put "?" on the other leg (before beta.19 they labelled the
 * answer and put "?" on the given hypotenuse).
 */
export function drawRightTriangle(
  ctx: CanvasRenderingContext2D, w: number, h: number, legs: [number, number],
  hypotenuse?: number, operands?: readonly number[],
): void {
  ctx.clearRect(0, 0, w, h);
  const margin = 20;
  const scale = Math.min((w - 2 * margin) / legs[0], (h - 2 * margin) / legs[1]) * 0.8;
  const x0 = margin, y0 = h - margin;
  const x1 = margin + legs[0] * scale;
  const y1 = h - margin - legs[1] * scale;
  ctx.fillStyle = '#e3f2fd'; ctx.strokeStyle = '#2196f3'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x0, y1);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  const findLeg = hypotenuse !== undefined && Array.isArray(operands) && operands.includes(hypotenuse);
  const known = findLeg ? operands!.find((o) => o !== hypotenuse) : undefined;
  const leg = (n: number) => (!findLeg || n === known ? String(n) : '?');
  ctx.fillStyle = '#333'; ctx.font = '11px Arial'; ctx.textAlign = 'center';
  ctx.fillText(leg(legs[0]), (x0 + x1) / 2, y0 + 12);
  ctx.fillText(leg(legs[1]), x0 - 12, (y0 + y1) / 2);
  ctx.fillText(findLeg ? String(hypotenuse) : '?', (x0 + x1) / 2 + 15, (y0 + y1) / 2 - 5);
}

export function drawTriangleAngles(
  ctx: CanvasRenderingContext2D, w: number, h: number, knownAngles: number[],
): void {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 10, size = Math.min(w, h) * 0.35;
  ctx.fillStyle = '#e8f5e9'; ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx - size * 0.8, cy + size * 0.6);
  ctx.lineTo(cx + size * 0.8, cy + size * 0.6);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#333'; ctx.font = '10px Arial'; ctx.textAlign = 'center';
  ctx.fillText(knownAngles[0] + '°', cx, cy - size - 8);
  if (knownAngles.length > 1)
    ctx.fillText(knownAngles[1] + '°', cx - size * 0.8 - 12, cy + size * 0.6 + 5);
  ctx.fillText('?', cx + size * 0.8 + 10, cy + size * 0.6 + 5);
}

// A polygon's sides in order, as a regular outline with each side labelled
// just outside its midpoint. Not to scale: bank side lists often can't close a
// real shape (a "triangle" with sides 20, 2, 9).
function drawLabeledPolygon(
  ctx: CanvasRenderingContext2D, w: number, h: number, sides: readonly number[],
): void {
  const n = sides.length;
  const r = Math.min(w, h) * 0.36;
  const apothem = r * Math.cos(Math.PI / n);
  // Vertices at π/2 ± π/n straddle straight down, so the bottom edge is flat.
  const start = Math.PI / 2 + Math.PI / n;
  // An odd polygon has a vertex on top, not an edge: nudge it down to centre it.
  const cx = w / 2;
  const cy = h / 2 + ((n % 2 === 1 ? r : apothem) - apothem) / 2;
  ctx.fillStyle = '#fff3e0'; ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 2;
  ctx.beginPath();
  drawRegularPolygon(ctx, cx, cy, r, n, start);
  ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.fillStyle = '#333'; ctx.font = '11px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const step = (Math.PI * 2) / n;
  const labelR = apothem + 14;
  sides.forEach((len, i) => {
    // Side i runs from vertex i to vertex i + 1.
    const a = start + (i + 0.5) * step;
    ctx.fillText(String(len), cx + labelR * Math.cos(a), cy + labelR * Math.sin(a));
  });
  ctx.restore();
}

/**
 * Two operands are a length and a width (GEOM-PERIMETER-RECTANGLE / -DECIMAL):
 * a rectangle to scale. Three or more are a polygon's sides in order
 * (GEOM-PERIMETER-POLYGON). The perimeter is the answer, so it is never drawn.
 */
export function drawPerimeterShape(
  ctx: CanvasRenderingContext2D, w: number, h: number, operands: readonly number[],
): void {
  ctx.clearRect(0, 0, w, h);
  if (operands.length >= 3) {
    drawLabeledPolygon(ctx, w, h, operands);
    return;
  }
  const l = operands[0]!, wd = operands[1]!;
  const scale = Math.min((w - 60) / l, (h - 40) / wd);
  const rectW = l * scale, rectH = wd * scale;
  const x = (w - rectW) / 2, y = (h - rectH) / 2;
  ctx.fillStyle = '#fff3e0'; ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 2;
  ctx.fillRect(x, y, rectW, rectH); ctx.strokeRect(x, y, rectW, rectH);
  ctx.fillStyle = '#333'; ctx.font = '11px Arial'; ctx.textAlign = 'center';
  ctx.fillText(String(l), x + rectW / 2, y + rectH + 15);
  ctx.save();
  ctx.translate(x - 10, y + rectH / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText(String(wd), 0, 0);
  ctx.restore();
}

/**
 * Maps a shape given in its own units (y up) onto the canvas, as large as fits
 * inside the margins, centred, y flipped so "up" is up.
 */
function fitToCanvas(pts: readonly Pt[], w: number, h: number, mx: number, my: number): (p: Pt) => Pt {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min((w - 2 * mx) / (maxX - minX || 1), (h - 2 * my) / (maxY - minY || 1));
  const offX = (w - (maxX - minX) * scale) / 2, offY = (h - (maxY - minY) * scale) / 2;
  return (p) => ({ x: offX + (p.x - minX) * scale, y: offY + (maxY - p.y) * scale });
}

/** Text centred `gap` px from `at`, on the side away from `centre`. */
function labelAway(ctx: CanvasRenderingContext2D, text: string, at: Pt, centre: Pt, gap: number): void {
  const dx = at.x - centre.x, dy = at.y - centre.y;
  const len = Math.hypot(dx, dy) || 1;
  ctx.fillText(text, at.x + (dx / len) * gap, at.y + (dy / len) * gap);
}

const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function centroid(pts: readonly Pt[]): Pt {
  return { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length };
}

/**
 * An area question's shape, to scale: the outline, a dashed height from
 * `heightFrom` straight down to the base, and every given measure labelled.
 * `corners` are in the shape's own units with the base on y = 0.
 */
function drawAreaPolygon(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  corners: readonly Pt[], heightFrom: Pt, baseLabel: string, heightLabel: string, topLabel?: string,
): void {
  const toCanvas = fitToCanvas(corners, w, h, 30, 22);
  const pts = corners.map(toCanvas);
  ctx.save();
  ctx.fillStyle = '#e8f5e9'; ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 2;
  ctx.beginPath(); tracePath(ctx, pts); ctx.fill(); ctx.stroke();
  const top = toCanvas(heightFrom), foot = toCanvas({ x: heightFrom.x, y: 0 });
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#333'; ctx.font = '11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // The base is the bottom edge, corners 0 → 1.
  ctx.fillText(baseLabel, (pts[0]!.x + pts[1]!.x) / 2, pts[0]!.y + 14);
  if (topLabel !== undefined) ctx.fillText(topLabel, (pts[2]!.x + pts[3]!.x) / 2, pts[2]!.y - 12);
  ctx.textAlign = 'left';
  ctx.fillText(heightLabel, top.x + 6, (top.y + foot.y) / 2);
  ctx.restore();
}

/**
 * geometry_classify_triangle: "Classify this triangle by its sides." The
 * triangle the row's three sides or three angles describe, to scale, sitting
 * on its longest side, with each given measure labelled (before beta.19 every
 * row drew the same equilateral triangle). Returns false, having drawn
 * nothing, when the measures can't make a triangle or `classifyBy` is neither
 * 'sides' nor 'angles': the caller then shows no picture.
 */
export function drawClassifyTriangle(
  ctx: CanvasRenderingContext2D, w: number, h: number, operands: readonly number[] | undefined, classifyBy: string,
): boolean {
  ctx.clearRect(0, 0, w, h);
  // A bank row skips the normalizer, so operands may be missing or not a list.
  if (!Array.isArray(operands) || operands.length !== 3
    || !operands.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) return false;
  // Index of the side (or angle) that goes on the base (or at the apex).
  const big = operands.indexOf(Math.max(...operands));
  const [i, j] = [0, 1, 2].filter((k) => k !== big) as [number, number];
  let lengths: [number, number, number]; // opposite A, B, C; AB is the base
  if (classifyBy === 'sides') {
    if (operands[i]! + operands[j]! <= operands[big]!) return false;
    lengths = [operands[i]!, operands[j]!, operands[big]!];
  } else if (classifyBy === 'angles') {
    if (Math.abs(operands[0]! + operands[1]! + operands[2]! - 180) > 0.01) return false;
    const sin = (deg: number) => Math.sin((deg * Math.PI) / 180);
    lengths = [sin(operands[i]!), sin(operands[j]!), sin(operands[big]!)];
  } else {
    return false;
  }
  const [a, b, c] = lengths;
  const apexX = (b * b + c * c - a * a) / (2 * c);
  const unit = [{ x: 0, y: 0 }, { x: c, y: 0 }, { x: apexX, y: Math.sqrt(Math.max(0, b * b - apexX * apexX)) }];
  const pts = unit.map(fitToCanvas(unit, w, h, 32, 26));
  const [A, B, C] = pts as [Pt, Pt, Pt];
  const centre = centroid(pts);
  ctx.save();
  ctx.fillStyle = '#e3f2fd'; ctx.strokeStyle = '#2196f3'; ctx.lineWidth = 3;
  ctx.beginPath(); tracePath(ctx, pts); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#333'; ctx.font = '12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (classifyBy === 'sides') {
    labelAway(ctx, String(operands[big]), midpoint(A, B), centre, 14);
    labelAway(ctx, String(operands[i]), midpoint(B, C), centre, 14);
    labelAway(ctx, String(operands[j]), midpoint(C, A), centre, 14);
  } else {
    labelAway(ctx, `${operands[i]}°`, A, centre, 16);
    labelAway(ctx, `${operands[j]}°`, B, centre, 16);
    labelAway(ctx, `${operands[big]}°`, C, centre, 16);
  }
  ctx.restore();
  return true;
}

/**
 * geometry_area. Rectangles (and squares) to scale with length and width;
 * triangles, parallelograms and trapezoids as those shapes, to scale, with
 * base(s) and height (before beta.19 they were all drawn as rectangles);
 * circles with their radius. The area is the answer and is never drawn.
 */
export function drawAreaShape(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  content: { shape?: string; operands?: number[]; radius?: number },
): void {
  ctx.clearRect(0, 0, w, h);
  const shape = content.shape ?? 'rectangle';
  const ops = content.operands ?? [];
  if (shape === 'triangle' && ops.length >= 2) {
    const [b, ht] = ops as [number, number];
    const apex = { x: b * 0.35, y: ht };
    drawAreaPolygon(ctx, w, h, [{ x: 0, y: 0 }, { x: b, y: 0 }, apex], apex, String(b), String(ht));
    return;
  }
  if (shape === 'parallelogram' && ops.length >= 2) {
    const [b, ht] = ops as [number, number];
    const off = b * 0.3;
    const topLeft = { x: off, y: ht };
    drawAreaPolygon(ctx, w, h,
      [{ x: 0, y: 0 }, { x: b, y: 0 }, { x: b + off, y: ht }, topLeft], topLeft, String(b), String(ht));
    return;
  }
  if (shape === 'trapezoid' && ops.length >= 3) {
    const [b1, b2, ht] = ops as [number, number, number];
    const long = Math.max(b1, b2), short = Math.min(b1, b2);
    const topLeft = { x: (long - short) / 2, y: ht };
    drawAreaPolygon(ctx, w, h,
      [{ x: 0, y: 0 }, { x: long, y: 0 }, { x: (long + short) / 2, y: ht }, topLeft], topLeft,
      String(long), String(ht), String(short));
    return;
  }
  if (shape === 'circle' && content.radius !== undefined) {
    const r = Math.min(w, h) * 0.35;
    ctx.fillStyle = '#e8f5e9'; ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2 + r, h / 2); ctx.stroke();
    ctx.fillStyle = '#333'; ctx.font = '11px Arial'; ctx.textAlign = 'center';
    ctx.fillText('r=' + content.radius, w / 2 + r / 2, h / 2 - 8);
  } else if (content.operands && content.operands.length >= 2) {
    const l = content.operands[0]!;
    const wd = content.operands[1]!;
    const scale = Math.min((w - 60) / l, (h - 40) / wd);
    const rectW = l * scale, rectH = wd * scale;
    const x = (w - rectW) / 2, y = (h - rectH) / 2;
    ctx.fillStyle = '#e8f5e9'; ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 2;
    ctx.fillRect(x, y, rectW, rectH); ctx.strokeRect(x, y, rectW, rectH);
    ctx.fillStyle = '#333'; ctx.font = '11px Arial'; ctx.textAlign = 'center';
    ctx.fillText(String(l), x + rectW / 2, y + rectH + 15);
    ctx.save();
    ctx.translate(x - 10, y + rectH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(String(wd), 0, 0);
    ctx.restore();
  }
}

/** A circle with a radius or a diameter drawn and labelled, or neither (null). */
function drawCircleWithSegment(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  segment: 'radius' | 'diameter' | null, label: string,
): void {
  ctx.clearRect(0, 0, w, h);
  const r = Math.min(w, h) * 0.35;
  ctx.fillStyle = '#fce4ec'; ctx.strokeStyle = '#e91e63'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (!segment) return;
  const isRadius = segment === 'radius';
  ctx.strokeStyle = '#c2185b'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(isRadius ? w / 2 : w / 2 - r, h / 2); ctx.lineTo(w / 2 + r, h / 2); ctx.stroke();
  ctx.fillStyle = '#333'; ctx.font = '11px Arial'; ctx.textAlign = 'center';
  // Above the middle of the segment.
  ctx.fillText(label, isRadius ? w / 2 + r / 2 : w / 2, h / 2 - 8);
}

export function drawCircumference(
  ctx: CanvasRenderingContext2D, w: number, h: number, radius: number,
): void {
  drawCircleWithSegment(ctx, w, h, 'radius', 'r=' + radius);
}

/**
 * geometry_circle_convert: "A circle has a diameter of 48. What is the radius?"
 * Draws and labels the measure the question gives; the other one is the
 * answer, so it is never drawn. An unknown given type gets the circle alone.
 */
export function drawCircleGiven(
  ctx: CanvasRenderingContext2D, w: number, h: number, givenType: string, value: number,
): void {
  if (givenType === 'radius') drawCircleWithSegment(ctx, w, h, 'radius', 'r=' + value);
  else if (givenType === 'diameter') drawCircleWithSegment(ctx, w, h, 'diameter', 'd=' + value);
  else drawCircleWithSegment(ctx, w, h, null, '');
}

export function drawFractionVisual(
  ctx: CanvasRenderingContext2D, w: number, h: number, fraction: [number, number],
): void {
  ctx.clearRect(0, 0, w, h);
  const [numerator, denominator] = fraction;
  const cx = w / 2, cy = h / 2, radius = Math.min(w, h) / 2 - 15;
  if (denominator <= 8) {
    const sliceAngle = (Math.PI * 2) / denominator;
    const startOffset = -Math.PI / 2;
    for (let i = 0; i < denominator; i++) {
      const startAngle = startOffset + i * sliceAngle;
      const endAngle = startOffset + (i + 1) * sliceAngle;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle); ctx.closePath();
      ctx.fillStyle = i < numerator ? '#42a5f5' : '#fff';
      ctx.fill(); ctx.strokeStyle = '#1976d2'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.fillStyle = '#1976d2';
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
  } else {
    const barW = w - 30, barH = 30;
    const x = (w - barW) / 2, y = (h - barH) / 2;
    const segW = barW / denominator;
    for (let i = 0; i < denominator; i++) {
      ctx.fillStyle = i < numerator ? '#42a5f5' : '#fff';
      ctx.fillRect(x + i * segW, y, segW, barH);
      ctx.strokeStyle = '#1976d2'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x + i * segW, y, segW, barH);
    }
  }
}

export function drawAngle(
  ctx: CanvasRenderingContext2D, w: number, h: number, degrees: number,
): void {
  ctx.clearRect(0, 0, w, h);
  const vx = w * 0.2, vy = h * 0.75;
  const rayLen = Math.min(w, h) * 0.6;
  const rad = (degrees * Math.PI) / 180;
  // One colour for every angle. A colour per type (acute, right, obtuse,
  // straight) is the answer, and a child learns the code within a few rounds.
  ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + rayLen, vy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(vx, vy);
  ctx.lineTo(vx + rayLen * Math.cos(-rad), vy + rayLen * Math.sin(-rad)); ctx.stroke();
  const arcR = rayLen * 0.3;
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(vx, vy, arcR, -rad, 0); ctx.stroke();
  if (degrees === 90) {
    const sq = 12;
    ctx.beginPath(); ctx.moveTo(vx + sq, vy); ctx.lineTo(vx + sq, vy - sq);
    ctx.lineTo(vx, vy - sq); ctx.stroke();
  }
  ctx.fillStyle = '#333'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
  ctx.fillText(
    degrees + '°',
    vx + arcR * 1.4 * Math.cos(-rad / 2),
    vy + arcR * 1.4 * Math.sin(-rad / 2),
  );
}

export function drawCircleParts(
  ctx: CanvasRenderingContext2D, w: number, h: number, partType: string,
): void {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.35;
  ctx.fillStyle = '#e3f2fd'; ctx.strokeStyle = '#2196f3'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#e91e63'; ctx.lineWidth = 3;
  switch (partType) {
    case 'radius':
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r, cy); ctx.stroke(); break;
    case 'diameter':
      ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke(); break;
    case 'chord':
      ctx.beginPath(); ctx.moveTo(cx - r * 0.7, cy - r * 0.7);
      ctx.lineTo(cx + r * 0.8, cy - r * 0.4); ctx.stroke(); break;
    case 'center':
      ctx.fillStyle = '#e91e63';
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill(); break;
    case 'arc':
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI * 0.3, Math.PI * 0.5); ctx.stroke(); break;
  }
}

export function drawCompoundShape(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  components: { width: number; height: number }[],
): void {
  ctx.clearRect(0, 0, w, h);
  if (components.length < 2) return;
  const c1 = components[0]!, c2 = components[1]!;
  const totalW = Math.max(c1.width, c2.width);
  const totalH = c1.height + c2.height;
  const scale = Math.min((w - 40) / totalW, (h - 30) / totalH) * 0.8;
  const x0 = 20, y0 = 10;
  const r1w = c1.width * scale, r1h = c1.height * scale;
  ctx.fillStyle = '#e8f5e9'; ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 2;
  ctx.fillRect(x0, y0, r1w, r1h); ctx.strokeRect(x0, y0, r1w, r1h);
  const r2w = c2.width * scale, r2h = c2.height * scale;
  ctx.fillStyle = '#fff3e0'; ctx.strokeStyle = '#ff9800';
  ctx.fillRect(x0, y0 + r1h, r2w, r2h); ctx.strokeRect(x0, y0 + r1h, r2w, r2h);
  ctx.fillStyle = '#333'; ctx.font = '10px Arial'; ctx.textAlign = 'center';
  ctx.fillText(String(c1.width), x0 + r1w / 2, y0 - 3);
  ctx.fillText(String(c2.width), x0 + r2w / 2, y0 + r1h + r2h + 12);
  ctx.save(); ctx.translate(x0 - 8, y0 + r1h / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText(String(c1.height), 0, 0); ctx.restore();
  ctx.save(); ctx.translate(x0 + Math.max(r1w, r2w) + 10, y0 + r1h + r2h / 2);
  ctx.rotate(-Math.PI / 2); ctx.fillText(String(c2.height), 0, 0); ctx.restore();
}

export function drawArray(
  ctx: CanvasRenderingContext2D, w: number, h: number, operands: [number, number],
): void {
  ctx.clearRect(0, 0, w, h);
  const rows = operands[0], cols = operands[1];
  const labelPadLeft = 24, labelPadBottom = 20, padding = 12;
  const gridLeft = labelPadLeft + padding, gridTop = padding;
  const gridRight = w - padding, gridBottom = h - labelPadBottom - padding;
  const availW = gridRight - gridLeft, availH = gridBottom - gridTop;
  const dotRadius = Math.min(10, availW / (cols * 2.5), availH / (rows * 2.5));
  const gapX = cols > 1 ? (availW - dotRadius * 2) / (cols - 1) : 0;
  const gapY = rows > 1 ? (availH - dotRadius * 2) / (rows - 1) : 0;
  const startX = gridLeft + dotRadius, startY = gridTop + dotRadius;
  ctx.fillStyle = '#42a5f5'; ctx.strokeStyle = '#1976d2'; ctx.lineWidth = 1.5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = startX + c * gapX, cy = startY + r * gapY;
      ctx.beginPath(); ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  ctx.fillStyle = '#1976d2'; ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(rows), labelPadLeft / 2, (gridTop + gridBottom) / 2);
  ctx.textBaseline = 'top';
  ctx.fillText(String(cols), (gridLeft + gridRight) / 2, gridBottom + 6);
}

export function drawAnalogClock(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  hour: number, minute: number,
): void {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#333'; ctx.font = `${r * 0.2}px Arial`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let n = 1; n <= 12; n++) {
    const angle = ((n * 30 - 90) * Math.PI) / 180;
    ctx.fillText(String(n), cx + r * 0.78 * Math.cos(angle), cy + r * 0.78 * Math.sin(angle));
  }
  for (let i = 0; i < 60; i++) {
    const angle = ((i * 6 - 90) * Math.PI) / 180;
    const len = i % 5 === 0 ? 0.88 : 0.92;
    ctx.strokeStyle = i % 5 === 0 ? '#333' : '#aaa';
    ctx.lineWidth = i % 5 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + r * len * Math.cos(angle), cy + r * len * Math.sin(angle));
    ctx.lineTo(cx + r * 0.95 * Math.cos(angle), cy + r * 0.95 * Math.sin(angle));
    ctx.stroke();
  }
  const hourAngle = (((hour % 12) * 30 + minute * 0.5 - 90) * Math.PI) / 180;
  ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * 0.5 * Math.cos(hourAngle), cy + r * 0.5 * Math.sin(hourAngle));
  ctx.stroke();
  const minAngle = ((minute * 6 - 90) * Math.PI) / 180;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * 0.7 * Math.cos(minAngle), cy + r * 0.7 * Math.sin(minAngle));
  ctx.stroke();
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
}

export function drawCoordinatePlane(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  point1: [number, number], point2: [number, number],
): void {
  ctx.clearRect(0, 0, w, h);
  const allX = [point1[0], point2[0]], allY = [point1[1], point2[1]];
  const minX = Math.min(...allX) - 2, maxX = Math.max(...allX) + 2;
  const minY = Math.min(...allY) - 2, maxY = Math.max(...allY) + 2;
  const pad = 30;
  const scaleX = (w - 2 * pad) / (maxX - minX);
  const scaleY = (h - 2 * pad) / (maxY - minY);
  const toSX = (x: number) => pad + (x - minX) * scaleX;
  const toSY = (y: number) => h - pad - (y - minY) * scaleY;
  ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
  for (let x = Math.ceil(minX); x <= Math.floor(maxX); x++) {
    const sx = toSX(x);
    ctx.beginPath(); ctx.moveTo(sx, pad); ctx.lineTo(sx, h - pad); ctx.stroke();
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const sy = toSY(y);
    ctx.beginPath(); ctx.moveTo(pad, sy); ctx.lineTo(w - pad, sy); ctx.stroke();
  }
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
  if (minX <= 0 && maxX >= 0) {
    const ax = toSX(0);
    ctx.beginPath(); ctx.moveTo(ax, pad); ctx.lineTo(ax, h - pad); ctx.stroke();
  }
  if (minY <= 0 && maxY >= 0) {
    const ay = toSY(0);
    ctx.beginPath(); ctx.moveTo(pad, ay); ctx.lineTo(w - pad, ay); ctx.stroke();
  }
  ctx.fillStyle = '#333'; ctx.font = '9px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let x = Math.ceil(minX); x <= Math.floor(maxX); x++) {
    ctx.fillText(String(x), toSX(x), toSY(0) + 4);
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    ctx.fillText(String(y), toSX(0) - 4, toSY(y));
  }
  const sx1 = toSX(point1[0]), sy1 = toSY(point1[1]);
  const sx2 = toSX(point2[0]), sy2 = toSY(point2[1]);
  ctx.strokeStyle = '#e91e63'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
  ctx.setLineDash([]);
  for (const [sx, sy, pt] of [[sx1, sy1, point1], [sx2, sy2, point2]] as const) {
    ctx.fillStyle = '#e91e63';
    ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#333'; ctx.font = '10px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`(${pt[0]},${pt[1]})`, sx, sy - 8);
  }
}

// — Base-10 blocks —

export type Base10Colors = {
  fillOnes?: string;
  fillTens?: string;
  fillHundreds?: string;
  fillThousands?: string;
  stroke?: string;
};

type B10 = { thousands?: number; hundreds?: number; tens?: number; ones?: number };

const B10C = 14;
const B10G = 3;
const B10RH = B10C * 10 + B10G * 9;
const B10D = 20;

const B10_FILL = {
  ones: '#90caf9', tens: '#a5d6a7', hundreds: '#ffcc80', thousands: '#ef9a9a',
};
function b10W(blocks: B10): number {
  let w = 0;
  if ((blocks.thousands ?? 0) > 0) w += (blocks.thousands!) * (B10RH + B10D + 8);
  if ((blocks.hundreds ?? 0) > 0) w += (blocks.hundreds!) * (B10RH + 6);
  if ((blocks.tens ?? 0) > 0) w += (blocks.tens!) * (B10C + 4);
  if ((blocks.ones ?? 0) > 0) w += Math.min(blocks.ones!, 5) * (B10C + B10G);
  return w + 10;
}

function b10H(blocks: B10): number {
  if ((blocks.thousands ?? 0) > 0) return B10RH + 40;
  if ((blocks.hundreds ?? 0) > 0) return B10RH + 20;
  if ((blocks.tens ?? 0) > 0) return B10RH + 20;
  const oR = Math.ceil((blocks.ones ?? 0) / 5);
  return Math.max(oR * (B10C + B10G) + 20, 60);
}

type B10Fills = { ones: string; tens: string; hundreds: string; thousands: string };

function b10Render(
  ctx: CanvasRenderingContext2D, blocks: B10,
  x0: number, y0: number,
  fills: B10Fills, stroke: string,
): void {
  let x = x0;
  const kCount = blocks.thousands ?? 0;
  const hCount = blocks.hundreds ?? 0;
  const tCount = blocks.tens ?? 0;
  const oCount = blocks.ones ?? 0;
  const flatS = B10RH;
  const lw = 1.5;

  for (let i = 0; i < kCount; i++) {
    ctx.fillStyle = fills.thousands;
    ctx.fillRect(x, y0 + B10D, flatS, flatS);
    ctx.strokeStyle = stroke; ctx.lineWidth = lw;
    ctx.strokeRect(x, y0 + B10D, flatS, flatS);
    ctx.lineWidth = 1;
    for (let r = 1; r < 10; r++) {
      const ly = y0 + B10D + r * (B10C + B10G) - B10G / 2;
      ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + flatS, ly); ctx.stroke();
    }
    for (let c = 1; c < 10; c++) {
      const lx = x + c * (B10C + B10G) - B10G / 2;
      ctx.beginPath(); ctx.moveTo(lx, y0 + B10D); ctx.lineTo(lx, y0 + B10D + flatS); ctx.stroke();
    }
    ctx.fillStyle = fills.thousands; ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y0 + B10D);
    ctx.lineTo(x + B10D, y0);
    ctx.lineTo(x + flatS + B10D, y0);
    ctx.lineTo(x + flatS, y0 + B10D);
    ctx.closePath();
    ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke();
    ctx.fillStyle = fills.thousands; ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + flatS, y0 + B10D);
    ctx.lineTo(x + flatS + B10D, y0);
    ctx.lineTo(x + flatS + B10D, y0 + flatS);
    ctx.lineTo(x + flatS, y0 + B10D + flatS);
    ctx.closePath();
    ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    x += flatS + B10D + 8;
  }

  for (let i = 0; i < hCount; i++) {
    ctx.fillStyle = fills.hundreds;
    ctx.fillRect(x, y0, flatS, flatS);
    ctx.strokeStyle = stroke; ctx.lineWidth = lw;
    ctx.strokeRect(x, y0, flatS, flatS);
    ctx.lineWidth = 1;
    for (let r = 1; r < 10; r++) {
      const ly = y0 + r * (B10C + B10G) - B10G / 2;
      ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + flatS, ly); ctx.stroke();
    }
    for (let c = 1; c < 10; c++) {
      const lx = x + c * (B10C + B10G) - B10G / 2;
      ctx.beginPath(); ctx.moveTo(lx, y0); ctx.lineTo(lx, y0 + flatS); ctx.stroke();
    }
    x += flatS + 6;
  }

  const rodTop = y0;
  for (let i = 0; i < tCount; i++) {
    ctx.fillStyle = fills.tens;
    ctx.fillRect(x, rodTop, B10C, B10RH);
    ctx.strokeStyle = stroke; ctx.lineWidth = lw;
    ctx.strokeRect(x, rodTop, B10C, B10RH);
    ctx.lineWidth = 1;
    for (let r = 1; r < 10; r++) {
      const ly = rodTop + r * (B10C + B10G) - B10G / 2;
      ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + B10C, ly); ctx.stroke();
    }
    x += B10C + 4;
  }

  if (oCount > 0) {
    const cols = Math.min(oCount, 5);
    const rows = Math.ceil(oCount / 5);
    const hasVertical = hCount > 0 || tCount > 0 || kCount > 0;
    const cubeTop = hasVertical
      ? y0 + B10RH - rows * (B10C + B10G) + B10G
      : y0;
    let drawn = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols && drawn < oCount; c++) {
        const bx = x + c * (B10C + B10G);
        const by = cubeTop + r * (B10C + B10G);
        ctx.fillStyle = fills.ones;
        ctx.fillRect(bx, by, B10C, B10C);
        ctx.strokeStyle = stroke; ctx.lineWidth = lw;
        ctx.strokeRect(bx, by, B10C, B10C);
        drawn++;
      }
    }
  }
}

function b10ScaledSet(
  ctx: CanvasRenderingContext2D, blocks: B10,
  ox: number, oy: number, availW: number, availH: number,
  fills: B10Fills, stroke: string,
): void {
  const natW = b10W(blocks);
  const natH = b10H(blocks);
  if (natW <= 0 || natH <= 0) return;
  const pad = 4;
  const scale = Math.min((availW - 2 * pad) / natW, (availH - 2 * pad) / natH, 1);
  const offX = ox + (availW - natW * scale) / 2;
  const offY = oy + (availH - natH * scale) / 2;
  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);
  b10Render(ctx, blocks, 0, 0, fills, stroke);
  ctx.restore();
}

export function drawBase10Blocks(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  content: {
    operation?: string; blocks?: B10;
    tens_shown?: number; ones_shown?: number;
    set_a?: { number: number; blocks: B10 };
    set_b?: { number: number; blocks: B10 };
  },
  colors?: Base10Colors,
): void {
  ctx.clearRect(0, 0, w, h);
  const fills: B10Fills = {
    ones: colors?.fillOnes ?? B10_FILL.ones,
    tens: colors?.fillTens ?? B10_FILL.tens,
    hundreds: colors?.fillHundreds ?? B10_FILL.hundreds,
    thousands: colors?.fillThousands ?? B10_FILL.thousands,
  };
  const stroke = colors?.stroke ?? '#000';
  const op = content.operation ?? '';

  if (op === 'base10_compare') {
    const blocksA = content.set_a?.blocks ?? {};
    const blocksB = content.set_b?.blocks ?? {};
    const mid = w / 2;
    ctx.fillStyle = '#666'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Set A', mid / 2, 12);
    ctx.fillText('Set B', mid + mid / 2, 12);
    b10ScaledSet(ctx, blocksA, 0, 18, mid, h - 18, fills, stroke);
    b10ScaledSet(ctx, blocksB, mid, 18, mid, h - 18, fills, stroke);
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(mid, 5); ctx.lineTo(mid, h - 5); ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  // base10_block_count never gets here: it has no picture (ChocaCanvasQuestion).
  const blocks: B10 = op === 'base10_regroup'
    ? { tens: content.tens_shown ?? 0, ones: content.ones_shown ?? 0 }
    : content.blocks ?? {};
  b10ScaledSet(ctx, blocks, 0, 0, w, h, fills, stroke);
}

/**
 * geometry_volume / geometry_surface_area: the solid, with each measure the
 * question gives labelled on the part it measures. The volume or surface area
 * is the answer and is never drawn. What the operands mean depends on the
 * shape and the question (from the bank's rows):
 * - box: length, width, height;  cylinder, cone: radius, height;  sphere: radius
 * - triangular prism, volume: base area, height (the distance between the ends)
 * - triangular prism, surface area: triangle base, triangle height, length
 * - pyramid, surface area: base side, slant height
 * Anything else (a pyramid's volume has no rows yet) gets no labels rather
 * than a guess. Before beta.19 prisms and pyramids were labelled l, w, h.
 */
export function drawLabeled3D(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  shapeName: string, operands: number[], kind: 'volume' | 'surface_area',
): void {
  drawShape3D(ctx, w, h, shapeName);
  const { cx, cy, s } = frame3D(w, h);
  ctx.save();
  ctx.fillStyle = '#333';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Keep every label on the canvas: the box is drawn larger than the canvas.
  const say = (text: string, at: Pt) =>
    ctx.fillText(text, Math.min(Math.max(at.x, 24), w - 24), Math.min(Math.max(at.y, 8), h - 8));
  const away = (p: Pt, from: Pt, gap: number): Pt => {
    const dx = p.x - from.x, dy = p.y - from.y, len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * gap, y: p.y + (dy / len) * gap };
  };
  const dashed = (from: Pt, to: Pt) => {
    ctx.save();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };
  const [o0, o1, o2] = operands;
  const name = shapeName.toLowerCase();
  if (name === 'cylinder' || name === 'cone') {
    if (o0 !== undefined) say('r=' + o0, { x: cx + s * 0.9, y: cy + s * 0.3 });
    if (o1 !== undefined) say('h=' + o1, { x: cx - s * 1.0, y: cy });
  } else if (name === 'sphere') {
    if (o0 !== undefined) say('r=' + o0, { x: cx + s * 0.6, y: cy - s * 0.2 });
  } else if (name === 'cube' || name === 'rectangular prism') {
    const v = boxFor(name, w, h);
    const centre = { x: cx, y: cy };
    // Length runs along x (3 → 2), width along z (2 → 1), height along y (3 → 7).
    if (o0 !== undefined) say('l=' + o0, away(midpoint(v[3]!, v[2]!), centre, 14));
    if (o1 !== undefined) say('w=' + o1, away(midpoint(v[2]!, v[1]!), centre, 14));
    if (o2 !== undefined) say('h=' + o2, away(midpoint(v[3]!, v[7]!), centre, 14));
  } else if (name === 'triangular prism') {
    const { front, back } = triPrismPoints(cx, cy, s);
    const centre = centroid([...front, ...back]);
    const baseMid = midpoint(front[0]!, front[1]!);
    const depth = away(midpoint(front[1]!, back[1]!), centre, 14);
    if (kind === 'volume') {
      if (o0 !== undefined) say('base area=' + o0, { x: baseMid.x, y: baseMid.y + 14 });
      if (o1 !== undefined) say('h=' + o1, depth);
    } else {
      if (o0 !== undefined) say('b=' + o0, { x: baseMid.x, y: baseMid.y + 14 });
      if (o1 !== undefined) {
        dashed(front[2]!, baseMid);
        say('h=' + o1, midpoint(front[2]!, baseMid));
      }
      if (o2 !== undefined) say('l=' + o2, depth);
    }
  } else if (name === 'pyramid' && kind === 'surface_area') {
    const { apex, base } = pyramidPoints(cx, cy, s);
    const frontMid = midpoint(base[3]!, base[2]!);
    if (o0 !== undefined) say('side=' + o0, { x: frontMid.x, y: frontMid.y + 14 });
    if (o1 !== undefined) {
      dashed(apex, frontMid);
      say('slant=' + o1, midpoint(apex, frontMid));
    }
  }
  ctx.restore();
}

type FaceOutline = { corners: Pt[] } | { ellipse: { x: number; y: number; rx: number; ry: number } };

/**
 * The face a geometry_face_identify question points at, on the shape that
 * drawShape3D drew. A shape with one kind of flat face (cube, rectangular
 * prism, cylinder, cone) shows that face whatever `faceShape` says. A pyramid
 * and a triangular prism have two kinds, so `faceShape` picks the face. Null
 * when the shape has no such face.
 */
function faceOutline(shape: string, faceShape: string, w: number, h: number): FaceOutline | null {
  const { cx, cy, s } = frame3D(w, h);
  switch (shape) {
    case 'cube':
    case 'rectangular prism': {
      const v = boxFor(shape, w, h);
      return { corners: [v[6]!, v[7]!, v[4]!, v[5]!] }; // the top face
    }
    case 'pyramid': {
      const { apex, base } = pyramidPoints(cx, cy, s);
      if (faceShape === 'square') return { corners: base };
      if (faceShape === 'triangle') return { corners: [apex, base[3]!, base[2]!] }; // the front face
      return null;
    }
    case 'triangular prism': {
      const { front, back } = triPrismPoints(cx, cy, s);
      if (faceShape === 'triangle') return { corners: front };
      if (faceShape === 'rectangle') return { corners: [front[2]!, back[2]!, back[1]!, front[1]!] };
      return null;
    }
    case 'cylinder': {
      const g = cylinderGeom(cy, s);
      return { ellipse: { x: cx, y: g.top, rx: g.rx, ry: g.ry } };
    }
    case 'cone': {
      const g = coneGeom(cy, s);
      return { ellipse: { x: cx, y: g.bot, rx: g.rx, ry: g.ry } };
    }
    default:
      return null;
  }
}

/**
 * "What shape is the highlighted face of this pyramid?" The shape, with the
 * face filled and outlined. The face's name is the answer, so it is never
 * written (before beta.19 every shape but a box printed "face: <answer>").
 */
export function drawFaceHighlight(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  shapeName: string, faceShape: string,
): void {
  drawShape3D(ctx, w, h, shapeName);
  const face = faceOutline(shapeName.toLowerCase(), faceShape.toLowerCase(), w, h);
  if (!face) return;
  ctx.fillStyle = 'rgba(255, 152, 0, 0.4)';
  ctx.strokeStyle = '#e65100';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if ('ellipse' in face) {
    const e = face.ellipse;
    ctx.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, Math.PI * 2);
  } else {
    tracePath(ctx, face.corners);
  }
  ctx.fill();
  ctx.stroke();
}
