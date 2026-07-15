import { LETTERS } from './extract';
import type { MathInput } from './types';

const PLACEHOLDER = /\{([a-z_0-9]+)\}/g; // lowercase-only by contract

export interface Compatibility {
  ok: boolean;
  missing: string[]; // required math placeholders the template omits
  exposesResult: boolean; // template reveals the answer via {result}
}

function placeholderSet(text: string): Set<string> {
  const s = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) s.add(m[1] as string);
  return s;
}

/**
 * Does this template represent ALL of the question's math? Run BEFORE rendering.
 * Rejects a template that would drop an operand, omit a fraction, reveal the
 * answer, or represent an input the extractor could not identify as math.
 */
export function templateCompatibility(
  text: string,
  input: MathInput,
  opts: { allowResult?: boolean } = {},
): Compatibility {
  const ph = placeholderSet(text);
  const exposesResult = ph.has('result') && !opts.allowResult;

  const ops = input.operands ?? [];
  const scalarKeys = Object.keys(input.scalars ?? {});
  // No identifiable math at all -> never generate a story from nothing.
  if (ops.length === 0 && !input.fraction && scalarKeys.length === 0) {
    return { ok: false, missing: ['math-input'], exposesResult };
  }
  // More operands than we can name uniquely (a..f) -> refuse, don't drop silently.
  if (ops.length > LETTERS.length) {
    return {
      ok: false,
      missing: ops.slice(LETTERS.length).map((_, i) => `operand_${LETTERS.length + i + 1}`),
      exposesResult,
    };
  }

  const missing: string[] = [];
  ops.forEach((_, i) => {
    const k = LETTERS[i];
    if (k && !ph.has(k)) missing.push(k);
  });

  if (input.fraction) {
    const hasFrac = ph.has('fraction') || (ph.has('fraction_a') && ph.has('fraction_b'));
    if (!hasFrac) missing.push('fraction');
  }

  // Scalars carry the math only when there are no operands/fraction to define it.
  if (ops.length === 0 && !input.fraction) {
    for (const k of scalarKeys) if (!ph.has(k)) missing.push(k);
  }

  return { ok: missing.length === 0 && !exposesResult, missing, exposesResult };
}
