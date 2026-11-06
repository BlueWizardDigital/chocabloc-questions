import type { HelpFact } from './types';

const MAX_FACTOR = 15;
const MAX_DIVIDEND = MAX_FACTOR * MAX_FACTOR;

const isInt = (n: unknown, hi: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= hi;

/**
 * The fact a raw bank question shows, or null. Reads only content.operation and
 * content.operands: never the answer, choices, token or id.
 */
export function helpFactFromQuestion(q: unknown): HelpFact | null {
  if (q === null || typeof q !== 'object') return null;
  const content: unknown = (q as { content?: unknown }).content;
  if (content === null || typeof content !== 'object') return null;
  const { operation, operands } = content as { operation?: unknown; operands?: unknown };
  if (!Array.isArray(operands) || operands.length !== 2) return null;
  const [x, y] = operands as unknown[];
  if (operation === 'multiplication') {
    return isInt(x, MAX_FACTOR) && isInt(y, MAX_FACTOR)
      ? { op: 'mult', a: x, b: y, c: null }
      : null;
  }
  if (operation === 'division') {
    return isInt(x, MAX_DIVIDEND) && isInt(y, MAX_FACTOR)
      ? { op: 'div', a: x, b: y, c: null }
      : null;
  }
  return null;
}
