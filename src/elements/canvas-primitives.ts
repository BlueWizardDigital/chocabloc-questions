export type Pt = { x: number; y: number };
export type IsoFn = (x: number, y: number, z: number) => Pt;

/** Centre and scale every 3D shape is drawn at. */
export function frame3D(w: number, h: number): { cx: number; cy: number; s: number } {
  return { cx: w / 2, cy: h / 2, s: Math.min(w, h) * 0.3 };
}

export function isoProjection(cx: number, cy: number, s: number): IsoFn {
  return (x, y, z) => ({
    x: cx + (x - z) * 0.866 * s,
    y: cy - y * s + (x + z) * 0.5 * s,
  });
}

export function tracePath(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
}

export function fillFaces(ctx: CanvasRenderingContext2D, faces: readonly [Pt[], string][]): void {
  for (const [pts, fill] of faces) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    tracePath(ctx, pts);
    ctx.fill();
    ctx.stroke();
  }
}
