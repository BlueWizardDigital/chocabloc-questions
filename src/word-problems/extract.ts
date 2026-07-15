import type { MathInput } from './types';

export const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/** Build the math placeholder map for a question. All values are strings. */
export function extractMath(input: MathInput): Record<string, string> {
  const out: Record<string, string> = {};

  (input.operands ?? []).forEach((v, i) => {
    const key = LETTERS[i];
    if (key) out[key] = String(v);
  });

  if (input.answer !== undefined && input.answer !== null && input.answer !== '') {
    out.result = String(input.answer);
  }

  if (input.fraction) {
    out.fraction = `${input.fraction[0]}/${input.fraction[1]}`;
    out.fraction_a = String(input.fraction[0]);
    out.fraction_b = String(input.fraction[1]);
  }

  for (const [k, v] of Object.entries(input.scalars ?? {})) {
    if (!(k in out)) out[k] = String(v);
  }

  return out;
}
