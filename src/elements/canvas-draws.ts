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

type IsoFn = (x: number, y: number, z: number) => { x: number; y: number };

function drawCube(ctx: CanvasRenderingContext2D, iso: IsoFn): void {
  const v = [
    iso(-1, -1, -1), iso(1, -1, -1), iso(1, -1, 1), iso(-1, -1, 1),
    iso(-1, 1, -1), iso(1, 1, -1), iso(1, 1, 1), iso(-1, 1, 1),
  ];
  const faces: [number[], string][] = [
    [[4, 5, 6, 7], '#ede7f6'],
    [[3, 2, 6, 7], '#d1c4e9'],
    [[2, 1, 5, 6], '#b39ddb'],
  ];
  for (const [indices, fill] of faces) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(v[indices[0]!]!.x, v[indices[0]!]!.y);
    for (let i = 1; i < indices.length; i++) ctx.lineTo(v[indices[i]!]!.x, v[indices[i]!]!.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawRectPrism(ctx: CanvasRenderingContext2D, iso: IsoFn): void {
  const v = [
    iso(-1.3, -0.7, -0.7), iso(1.3, -0.7, -0.7), iso(1.3, -0.7, 0.7), iso(-1.3, -0.7, 0.7),
    iso(-1.3, 0.7, -0.7), iso(1.3, 0.7, -0.7), iso(1.3, 0.7, 0.7), iso(-1.3, 0.7, 0.7),
  ];
  const faces: [number[], string][] = [
    [[4, 5, 6, 7], '#ede7f6'],
    [[3, 2, 6, 7], '#d1c4e9'],
    [[2, 1, 5, 6], '#b39ddb'],
  ];
  for (const [indices, fill] of faces) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(v[indices[0]!]!.x, v[indices[0]!]!.y);
    for (let i = 1; i < indices.length; i++) ctx.lineTo(v[indices[i]!]!.x, v[indices[i]!]!.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
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

function drawCylinder(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const rx = s * 0.7, ry = s * 0.25, h = s * 1.4;
  const top = cy - h / 2, bot = cy + h / 2;
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
  const rx = s * 0.7, ry = s * 0.25;
  const bot = cy + s * 0.6, top = cy - s * 0.8;
  ctx.fillStyle = '#ede7f6';
  ctx.beginPath();
  ctx.moveTo(cx, top); ctx.lineTo(cx + rx, bot);
  ctx.ellipse(cx, bot, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d1c4e9';
  ctx.beginPath(); ctx.ellipse(cx, bot, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawPyramid(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const apex = { x: cx, y: cy - s * 0.9 };
  const base = [
    { x: cx - s * 0.6, y: cy + s * 0.5 }, { x: cx + s * 0.6, y: cy + s * 0.5 },
    { x: cx + s * 0.3, y: cy + s * 0.8 }, { x: cx - s * 0.3, y: cy + s * 0.8 },
  ];
  const faces: [[number, number], string][] = [
    [[0, 3], '#ede7f6'], [[0, 1], '#d1c4e9'], [[1, 2], '#b39ddb'],
  ];
  for (const [[a, b], fill] of faces) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(base[a]!.x, base[a]!.y);
    ctx.lineTo(base[b]!.x, base[b]!.y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

function drawTriangularPrism(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const front = [
    { x: cx - s * 0.5, y: cy + s * 0.6 },
    { x: cx + s * 0.5, y: cy + s * 0.6 },
    { x: cx, y: cy - s * 0.4 },
  ];
  const offset = { x: s * 0.5, y: -s * 0.4 };
  const back = front.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }));
  const draws: [{ x: number; y: number }[], string][] = [
    [[back[0]!, back[1]!, back[2]!], '#ede7f6'],
    [[front[2]!, back[2]!, back[1]!, front[1]!], '#d1c4e9'],
    [[front[0]!, front[1]!, front[2]!], '#b39ddb'],
  ];
  for (const [pts, fill] of draws) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
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
  const cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.3;
  const iso: IsoFn = (x, y, z) => ({
    x: cx + (x - z) * 0.866 * s,
    y: cy - y * s + (x + z) * 0.5 * s,
  });
  switch (shapeName.toLowerCase()) {
    case 'cube': drawCube(ctx, iso); break;
    case 'rectangular prism': drawRectPrism(ctx, iso); break;
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

export function drawRightTriangle(
  ctx: CanvasRenderingContext2D, w: number, h: number, legs: [number, number],
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
  ctx.fillStyle = '#333'; ctx.font = '11px Arial'; ctx.textAlign = 'center';
  ctx.fillText(String(legs[0]), (x0 + x1) / 2, y0 + 12);
  ctx.fillText(String(legs[1]), x0 - 12, (y0 + y1) / 2);
  ctx.fillText('?', (x0 + x1) / 2 + 15, (y0 + y1) / 2 - 5);
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

export function drawPerimeterShape(
  ctx: CanvasRenderingContext2D, w: number, h: number, operands: [number, number],
): void {
  ctx.clearRect(0, 0, w, h);
  const [l, wd] = operands;
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

export function drawAreaShape(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  content: { shape?: string; operands?: number[]; radius?: number },
): void {
  ctx.clearRect(0, 0, w, h);
  const shape = content.shape ?? 'rectangle';
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

export function drawCircumference(
  ctx: CanvasRenderingContext2D, w: number, h: number, radius: number,
): void {
  ctx.clearRect(0, 0, w, h);
  const r = Math.min(w, h) * 0.35;
  ctx.fillStyle = '#fce4ec'; ctx.strokeStyle = '#e91e63'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#c2185b'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2 + r, h / 2); ctx.stroke();
  ctx.fillStyle = '#333'; ctx.font = '11px Arial'; ctx.textAlign = 'center';
  ctx.fillText('r=' + radius, w / 2 + r / 2, h / 2 - 8);
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
  let color = '#4caf50';
  if (degrees === 90) color = '#2196f3';
  else if (degrees > 90 && degrees < 180) color = '#ff9800';
  else if (degrees === 180) color = '#9c27b0';
  ctx.strokeStyle = color; ctx.lineWidth = 3;
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
