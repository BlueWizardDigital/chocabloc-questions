import type { NormalizedQuestion } from '../types';
import type { FromQuestionPicture, LessonPicture } from './types';

const MAX_SPAN = 1000;
const OPS = { addition: '+', decimal_addition: '+', subtraction: '−', multiplication: '×', comparison: 'compare' } as const;

const isInt = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;

function numbersOf(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? (v as number[]) : null;
}

function fromOperands(kind: FromQuestionPicture['kind'], c: Record<string, unknown>): LessonPicture | null {
  const ops = numbersOf(c.operands);
  if (!ops) return null;
  switch (kind) {
    case 'base10':
      return ops.length <= 2 && ops.every((n) => isInt(n, 0, 9999)) ? { kind, numbers: ops } : null;
    case 'array': {
      const [rows, cols] = ops;
      return ops.length === 2 && rows != null && cols != null && ops.every((n) => isInt(n, 1, 15))
        ? { kind, rows, cols }
        : null;
    }
    case 'count': {
      const [a, b] = ops;
      if (ops.length !== 2 || a == null || b == null || !ops.every((n) => isInt(n, 0, 20))) return null;
      if (c.operation === 'addition') return a + b >= 1 && a + b <= 20 ? { kind, groups: [a, b] } : null;
      if (c.operation === 'subtraction') return b >= 1 && b <= a ? { kind, groups: [a], takeAway: b } : null;
      return c.operation === 'comparison' ? { kind, groups: [a, b], apart: true } : null;
    }
    case 'numberLine': {
      const [a, b] = ops;
      const jumps: { from: number; to: number }[] = [];
      if (ops.length === 2 && a != null && b != null) {
        if (c.operation === 'addition') jumps.push({ from: a, to: a + b });
        else if (c.operation === 'subtraction') jumps.push({ from: a, to: a - b });
      }
      // The line must hold every number it shows.
      const points = [0, ...ops, ...jumps.map((j) => j.to)];
      const from = Math.min(...points);
      const to = Math.max(...points);
      if (to - from > MAX_SPAN) return null;
      // A jump's size is not a spot on the line: mark where it starts and ends.
      const j = jumps[0];
      return j ? { kind, from, to, marks: [j.from, j.to], jumps } : { kind, from, to, marks: ops };
    }
    case 'columns': {
      const op = typeof c.operation === 'string' && c.operation in OPS ? OPS[c.operation as keyof typeof OPS] : null;
      const [x, y] = ops;
      return op && ops.length === 2 && x != null && y != null ? { kind, op, numbers: [x, y] } : null;
    }
  }
}

function fromNumber(kind: FromQuestionPicture['kind'], c: Record<string, unknown>): LessonPicture | null {
  const n = c.number;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (kind === 'base10') return isInt(n, 0, 9999) ? { kind, numbers: [n] } : null;
  if (kind === 'numberLine') {
    // A rounding question spans the two multiples of round_to around n; a multiple sits at the low end.
    const r = c.round_to;
    const digits = String(Math.trunc(Math.abs(n))).length;
    const step = r === 10 || r === 100 || r === 1000 ? r : Math.max(10, 10 ** (digits - 1));
    const from = Math.floor(n / step) * step;
    if (step > MAX_SPAN) return null;
    return { kind, from, to: from + step, marks: [n] };
  }
  return null;
}

/** A picture of the question's own numbers, or null when they don't fit it. */
export function pictureFromQuestion(spec: FromQuestionPicture, q: NormalizedQuestion): LessonPicture | null {
  const content = (q as { content?: unknown } | null)?.content;
  if (content == null || typeof content !== 'object') return null;
  const c = content as Record<string, unknown>;
  return spec.from === 'operands' ? fromOperands(spec.kind, c) : fromNumber(spec.kind, c);
}
