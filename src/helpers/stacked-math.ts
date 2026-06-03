export type StackedOperator = '+' | '-' | '×';

export interface StackedMathLayout {
  kind: 'stacked';
  operands: string[];
  operator: StackedOperator;
  maxDigits: number;
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

const OPERATOR_RE = /^(\d+)\s+([+\-x*×÷/])\s+(\d+)$/;
const MULTI_OPERAND_RE = /^(\d+)(?:\s+([+\-x*×÷/])\s+(\d+))+$/;

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
      return {
        kind: 'stacked',
        operands: [left, right],
        operator: op as StackedOperator,
        maxDigits: Math.max(left.length, right.length),
      };
    }
    return null;
  }

  if (!MULTI_OPERAND_RE.test(trimmed)) return null;

  const parts = trimmed.split(/\s+/);
  const operands: string[] = [];
  let op: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (!/^\d+$/.test(parts[i]!)) return null;
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

  return {
    kind: 'stacked',
    operands,
    operator: op as StackedOperator,
    maxDigits: Math.max(...operands.map(o => o.length)),
  };
}
