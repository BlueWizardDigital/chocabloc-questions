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

/** One polygon's points: 3–48 finite [x, y] pairs in −10..10. */
export function parsePolygonPoints(points: unknown): FigurePoint[] | null {
  if (!Array.isArray(points)) return null;
  if (points.length < 3 || points.length > MAX_POLYGON_POINTS) return null;
  const out: FigurePoint[] = [];
  for (const p of points) {
    const pt = parsePoint(p);
    if (!pt) return null;
    out.push(pt);
  }
  return out;
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
