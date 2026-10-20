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
