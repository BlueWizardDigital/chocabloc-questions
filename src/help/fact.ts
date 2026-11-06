import type { HelpFact, HelpPicture, HelpStep, SolvedFact } from './types';

export const MAX_FACTOR = 15;

/** a × b with the product hidden. */
export interface Product {
  kind: 'product';
  a: number;
  b: number;
  unknown: number;
  shown: number[];
}
/**
 * dividend ÷ divisor with the quotient hidden; also a missing factor (a × ? = c), which is
 * c ÷ a. `hidden` says which grid side the unknown is on (Cocoa Lab's Divide), null for ÷.
 */
export interface Quotient {
  kind: 'quotient';
  dividend: number;
  divisor: number;
  unknown: number;
  shown: number[];
  hidden: 'a' | 'b' | null;
}
export type Parsed = Product | Quotient;

const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
export const isFactor = (n: unknown): n is number => isWhole(n) && n >= 1 && n <= MAX_FACTOR;

function quotient(
  dividend: number | null,
  divisor: number | null,
  hidden: Quotient['hidden'],
  shown: number[],
): Quotient | null {
  if (
    !isFactor(divisor) ||
    !isWhole(dividend) ||
    dividend < 1 ||
    dividend > MAX_FACTOR * MAX_FACTOR
  )
    return null;
  const q = dividend / divisor;
  return isFactor(q) ? { kind: 'quotient', dividend, divisor, unknown: q, shown, hidden } : null;
}

/**
 * The fact help can work with, or null: one unknown, whole numbers, factors 1–15, no zero.
 * An unknown dividend (? ÷ b = c) is not supported: every division strategy starts from it.
 */
export function parseFact(fact: HelpFact): Parsed | null {
  if (fact === null || typeof fact !== 'object') return null;
  const { op, a, b, c } = fact;
  const values = [a, b, c];
  if (values.filter((v) => v === null).length !== 1) return null;
  if (!values.every((v) => v === null || isWhole(v))) return null;
  const shown = values.filter((v): v is number => v !== null);
  if (op === 'mult') {
    if (c === null)
      return isFactor(a) && isFactor(b) ? { kind: 'product', a, b, unknown: a * b, shown } : null;
    return a === null ? quotient(c, b, 'a', shown) : quotient(c, a, 'b', shown);
  }
  if (op === 'div' && a !== null) return quotient(a, b === null ? c : b, null, shown);
  return null;
}

export const step = (
  key: string,
  params: Record<string, number>,
  picture: HelpPicture | null = null,
  points: SolvedFact[] = [],
): HelpStep => ({ say: { key, params }, picture, points });

export const rows = (r: number, perRow: number, counted: number): HelpPicture => ({
  kind: 'rows',
  rows: r,
  perRow,
  counted,
});

/** The most rows, up to `want`, whose running totals can be labelled without showing `unknown`. */
export function safeCounted(r: number, perRow: number, unknown: number, want: number): number {
  const most = Math.max(0, Math.min(want, r - 1));
  for (let k = 1; k <= most; k++) if (k * perRow === unknown) return k - 1;
  return most;
}

const ROLE = /^(given|anchor|partial)[A-Z]/;

/**
 * True when nothing in the step newly shows the unknown. Builders are written to pass;
 * this is the fail-closed check behind them (spec, "What help may show").
 */
export function stepIsSafe(s: HelpStep, p: Parsed): boolean {
  const { unknown, shown } = p;
  for (const [name, value] of Object.entries(s.say.params)) {
    const role = ROLE.exec(name)?.[1];
    if (!role || !isWhole(value)) return false;
    if (role === 'given' ? !shown.includes(value) : value === unknown) return false;
  }
  const pic = s.picture;
  if (pic?.kind === 'rows') {
    if (pic.counted < 0 || pic.counted >= pic.rows) return false;
    if (safeCounted(pic.rows, pic.perRow, unknown, pic.counted) !== pic.counted) return false;
  } else if (pic?.kind === 'deal') {
    if (pic.dealt < 0 || pic.dealt >= pic.total || !shown.includes(pic.total)) return false;
  } else if (pic?.kind === 'take') {
    if (pic.taken < 0 || pic.taken * pic.size >= pic.total || !shown.includes(pic.total))
      return false;
  }
  const fine = (n: number) => n !== unknown || shown.includes(n);
  return s.points.every((pt) => fine(pt.a) && fine(pt.b) && fine(pt.a * pt.b));
}
