export type StackedOperator = '+' | '-' | '×';

export interface StackedMathLayout {
  kind: 'stacked';
  operands: string[];
  operator: StackedOperator;
  /** Digits in the widest integer part. Excludes the point and any decimals. */
  maxDigits: number;
  /** Decimals in the longest fractional part. 0 when no operand has one. */
  maxDecimals: number;
}

export interface LongDivisionLayout {
  kind: 'long-division';
  divisor: string;
  dividend: string;
}

export type MathLayout = StackedMathLayout | LongDivisionLayout;

const NORMALIZE: Record<string, string> = {
  x: '×',
  '*': '×',
  '/': '÷',
};

const STACKED_OPS = new Set(['+', '-', '×']);

// An operand is digits with an optional fractional part. A bare point (`.5`),
// a trailing point (`4.`) and a second point (`4.3.9`) are malformed, not
// decimals, and must not parse.
const NUMBER = String.raw`\d+(?:\.\d+)?`;
const OPERAND_RE = new RegExp(`^${NUMBER}$`);
const OPERATOR_RE = new RegExp(`^(${NUMBER})\\s+([+\\-x*×÷/])\\s+(${NUMBER})$`);
const MULTI_OPERAND_RE = new RegExp(`^(${NUMBER})(?:\\s+([+\\-x*×÷/])\\s+(${NUMBER}))+$`);

/** Digits before the decimal point. */
function integerDigits(operand: string): number {
  const dot = operand.indexOf('.');
  return dot === -1 ? operand.length : dot;
}

/** Digits after the decimal point, 0 when there is none. */
function decimalDigits(operand: string): number {
  const dot = operand.indexOf('.');
  return dot === -1 ? 0 : operand.length - dot - 1;
}

function stackedLayout(operands: string[], operator: StackedOperator): StackedMathLayout {
  return {
    kind: 'stacked',
    operands,
    operator,
    maxDigits: Math.max(...operands.map(integerDigits)),
    maxDecimals: Math.max(...operands.map(decimalDigits)),
  };
}

export function parseMathExpression(expr: string): MathLayout | null {
  if (!expr) return null;
  const trimmed = expr.trim();

  const simple = trimmed.match(OPERATOR_RE);
  if (simple) {
    const left = simple[1]!;
    const rawOp = simple[2]!;
    const right = simple[3]!;
    const op = NORMALIZE[rawOp] ?? rawOp;

    if (op === '÷') {
      return { kind: 'long-division', divisor: right, dividend: left };
    }
    if (STACKED_OPS.has(op)) {
      return stackedLayout([left, right], op as StackedOperator);
    }
    return null;
  }

  if (!MULTI_OPERAND_RE.test(trimmed)) return null;

  const parts = trimmed.split(/\s+/);
  const operands: string[] = [];
  let op: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (!OPERAND_RE.test(parts[i]!)) return null;
      operands.push(parts[i]!);
    } else {
      const raw = parts[i]!;
      const normalized = NORMALIZE[raw] ?? raw;
      if (!STACKED_OPS.has(normalized)) return null;
      if (op === null) op = normalized;
      else if (op !== normalized) return null;
    }
  }

  if (!op || operands.length < 2) return null;

  return stackedLayout(operands, op as StackedOperator);
}
