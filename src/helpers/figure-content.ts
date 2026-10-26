// Parser for the `geometry_figure` content and for the optional `points` on
// geometry_identify / _properties / _symmetry / _classify (plan § Contract).
// Normalizers never validate picture content: they pass it through and the
// drawing code reads it only through these parsers, so a malformed figure
// costs the picture at draw time, never the question. Both parsers return null
// for anything outside the contract and never throw.

export const FIGURE_FRAME = 10;
export const MAX_POLYGONS = 8;
export const MAX_POLYGON_POINTS = 48;
export const MAX_LINES = 4;

export type FigurePoint = readonly [number, number];
export interface FigureLine { from: FigurePoint; to: FigurePoint; label?: string }
export interface FigurePanel { label?: string; polygons: FigurePoint[][]; lines: FigureLine[] }
export interface FigureSpec { panels: FigurePanel[]; lettered: 'panels' | 'lines' | null }

const LETTERS = ['A', 'B', 'C', 'D'] as const;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function parsePoint(p: unknown): FigurePoint | null {
  if (!Array.isArray(p) || p.length !== 2) return null;
  const [x, y] = p as unknown[];
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > FIGURE_FRAME || Math.abs(y) > FIGURE_FRAME) return null;
  return [x, y];
}

type Pt = readonly [number, number];

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function onSegment(a: Pt, b: Pt, p: Pt): boolean {
  return (
    Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1])
  );
}

// Closed segments a-b and c-d share any point (touching and collinear overlap count).
function segmentsMeet(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (
    (d1 === 0 && onSegment(a, b, c)) || (d2 === 0 && onSegment(a, b, d)) ||
    (d3 === 0 && onSegment(c, d, a)) || (d4 === 0 && onSegment(c, d, b))
  );
}

// Simple = non-zero area, no zero-length edge, no edge folding back on its
// neighbour, and no two non-adjacent edges meeting. O(n²), n ≤ 48.
function isSimplePolygon(pts: readonly Pt[]): boolean {
  const n = pts.length;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    if (a[0] === b[0] && a[1] === b[1]) return false;
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  if (area2 === 0) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const c = pts[(i + 2) % n]!;
    // Adjacent edges a-b, b-c: reject a fold-back (collinear, reversing).
    if (cross(a, b, c) === 0 && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0) return false;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing edge
      if (segmentsMeet(a, b, pts[j]!, pts[(j + 1) % n]!)) return false;
    }
  }
  return true;
}

/** One simple polygon's points: 3–48 finite [x, y] pairs in −10..10, non-zero area, no self-intersection. */
export function parsePolygonPoints(points: unknown): FigurePoint[] | null {
  if (!Array.isArray(points)) return null;
  if (points.length < 3 || points.length > MAX_POLYGON_POINTS) return null;
  const out: FigurePoint[] = [];
  for (const p of points) {
    const pt = parsePoint(p);
    if (!pt) return null;
    out.push(pt);
  }
  return isSimplePolygon(out) ? out : null;
}

function parseLines(raw: unknown): FigureLine[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_LINES) return null;
  const out: FigureLine[] = [];
  let labelled = 0;
  for (const l of raw) {
    if (!isRecord(l)) return null;
    const from = parsePoint(l['from']);
    const to = parsePoint(l['to']);
    if (!from || !to) return null;
    const label = l['label'];
    if (label === undefined) {
      out.push({ from, to });
    } else if (typeof label === 'string') {
      labelled++;
      out.push({ from, to, label });
    } else {
      return null;
    }
  }
  if (labelled === 0) return out;
  // Lettered lines: all of them, 3–4, A… in order.
  if (labelled !== out.length || out.length < 3) return null;
  if (!out.every((l, i) => l.label === LETTERS[i])) return null;
  return out;
}

function parsePanel(raw: unknown): FigurePanel | null {
  if (!isRecord(raw)) return null;
  const rawPolys = raw['polygons'];
  if (!Array.isArray(rawPolys) || rawPolys.length < 1 || rawPolys.length > MAX_POLYGONS) return null;
  const polygons: FigurePoint[][] = [];
  for (const poly of rawPolys) {
    if (!isRecord(poly)) return null;
    const pts = parsePolygonPoints(poly['points']);
    if (!pts) return null;
    polygons.push(pts);
  }
  const lines = parseLines(raw['lines']);
  if (!lines) return null;
  const label = raw['label'];
  if (label !== undefined && typeof label !== 'string') return null;
  return label === undefined ? { polygons, lines } : { label, polygons, lines };
}

/** The whole `content` of a `geometry_figure` row, or null if it breaks the contract. */
export function parseFigure(content: unknown): FigureSpec | null {
  if (!isRecord(content)) return null;
  const rawPanels = content['panels'];
  if (!Array.isArray(rawPanels)) return null;
  const panels: FigurePanel[] = [];
  for (const rp of rawPanels) {
    const panel = parsePanel(rp);
    if (!panel) return null;
    panels.push(panel);
  }
  if (panels.length === 1) {
    // One unlabelled panel; it alone may carry lettered lines.
    const only = panels[0]!;
    if (only.label !== undefined) return null;
    return { panels, lettered: only.lines.some((l) => l.label !== undefined) ? 'lines' : null };
  }
  // 3–4 panels, every one labelled A, B, C(, D) in order; lines never lettered.
  if (panels.length < 3 || panels.length > 4) return null;
  if (!panels.every((p, i) => p.label === LETTERS[i])) return null;
  if (panels.some((p) => p.lines.some((l) => l.label !== undefined))) return null;
  return { panels, lettered: 'panels' };
}
