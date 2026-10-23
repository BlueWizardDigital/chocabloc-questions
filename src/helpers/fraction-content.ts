/**
 * Parsers for the `fraction_models` and `fraction_number_line` picture content.
 *
 * The question's content stays in its wire shape (`Record<string, unknown>`,
 * `tick_labels` with an underscore). Only these parsers read it. Each returns
 * null for anything outside the contract, and the draw code then hides the
 * canvas: bad picture data costs the picture, never the question.
 */

export interface FractionModel {
  shape: 'bar' | 'circle';
  d: number;
  n: number;
  wholes: number;
  label?: string;
  caption?: string;
  split?: number[];
}

export interface FractionModelsSpec {
  layout: 'row' | 'stack';
  models: FractionModel[];
  guide?: [number, number];
}

export interface FractionNumberLineSpec {
  lines: { max: number; d: number }[];
  points: { line: number; n: number; label?: string }[];
  tickLabels: boolean;
}

const LABELS = ['A', 'B', 'C', 'D'];
const MAX_CAPTION = 8;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function parseModel(raw: unknown): FractionModel | null {
  if (!isObj(raw)) return null;
  const { shape, d, n, wholes, label, caption, split } = raw;
  if (shape !== 'bar' && shape !== 'circle') return null;
  if (!isInt(d, 1, 12) || !isInt(wholes, 1, 3)) return null;
  if (shape === 'circle' && (d > 8 || wholes !== 1)) return null;
  if (!isInt(n, 0, d * wholes)) return null;
  const out: FractionModel = { shape, d, n, wholes };
  if (label !== undefined) {
    if (typeof label !== 'string' || !LABELS.includes(label)) return null;
    out.label = label;
  }
  if (caption !== undefined) {
    if (typeof caption !== 'string' || caption.length > MAX_CAPTION) return null;
    out.caption = caption;
  }
  if (split !== undefined) {
    if (shape !== 'bar' || wholes !== 1) return null;
    if (!Array.isArray(split) || split.length !== d) return null;
    if (!split.every((w) => typeof w === 'number' && Number.isFinite(w) && w > 0)) return null;
    out.split = split as number[];
  }
  return out;
}

export function parseFractionModels(content: unknown): FractionModelsSpec | null {
  if (!isObj(content)) return null;
  const { layout, models, guide } = content;
  if (layout !== 'row' && layout !== 'stack') return null;
  if (!Array.isArray(models) || models.length < 1 || models.length > 4) return null;
  const parsed: FractionModel[] = [];
  const seen = new Set<string>();
  for (const m of models) {
    const p = parseModel(m);
    if (!p) return null;
    if (p.label !== undefined) {
      if (seen.has(p.label)) return null;
      seen.add(p.label);
    }
    parsed.push(p);
  }
  const out: FractionModelsSpec = { layout, models: parsed };
  if (guide !== undefined) {
    if (layout !== 'stack') return null;
    if (!Array.isArray(guide) || guide.length !== 2) return null;
    const [gn, gd] = guide as unknown[];
    if (!isInt(gd, 1, 12) || !isInt(gn, 0, gd)) return null;
    out.guide = [gn, gd];
  }
  return out;
}

export function parseFractionNumberLine(content: unknown): FractionNumberLineSpec | null {
  if (!isObj(content)) return null;
  const { lines, points } = content;
  const tickLabels = content['tick_labels'];
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 2) return null;
  if (!Array.isArray(points) || points.length < 1 || points.length > 4) return null;
  if (tickLabels !== undefined && typeof tickLabels !== 'boolean') return null;

  const outLines: { max: number; d: number }[] = [];
  for (const l of lines) {
    if (!isObj(l) || !isInt(l['max'], 1, 3) || !isInt(l['d'], 1, 12)) return null;
    if (l['max'] * l['d'] > 16) return null;
    outLines.push({ max: l['max'], d: l['d'] });
  }

  const outPoints: { line: number; n: number; label?: string }[] = [];
  const seen = new Set<string>();
  for (const p of points) {
    if (!isObj(p) || !isInt(p['line'], 0, outLines.length - 1)) return null;
    const ln = outLines[p['line']]!;
    if (!isInt(p['n'], 0, ln.max * ln.d)) return null;
    const pt: { line: number; n: number; label?: string } = { line: p['line'], n: p['n'] };
    const label = p['label'];
    if (label !== undefined) {
      if (typeof label !== 'string' || !LABELS.includes(label) || seen.has(label)) return null;
      seen.add(label);
      pt.label = label;
    }
    outPoints.push(pt);
  }
  return { lines: outLines, points: outPoints, tickLabels: tickLabels === true };
}
