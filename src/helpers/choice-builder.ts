import type { AnswerValue, Choice, Currency, NormalizedQuestion } from '../types';
import { formatAnswerForDisplay } from './formatters';

export type ChoiceBuilderOptions = {
  count?: number;
  shuffle?: boolean;
  seed?: number;
};

function getQuestionCurrency(q: NormalizedQuestion): Currency | undefined {
  if (q.format === 'money') {
    return (q as { currency?: Currency }).currency;
  }
  return undefined;
}

function labelFor(value: AnswerValue, q: NormalizedQuestion): string {
  return formatAnswerForDisplay(value, q.format, { currency: getQuestionCurrency(q) });
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleChoices<T>(items: T[], seed?: number): T[] {
  const rng = typeof seed === 'number' ? mulberry32(seed) : Math.random;
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

export function buildChoicePool(
  question: NormalizedQuestion,
  opts: ChoiceBuilderOptions = {},
): Choice[] {
  const count = opts.count ?? 4;
  const correct: Choice = {
    value: question.answer,
    correct: true,
    label: labelFor(question.answer, question),
  };
  const wrong: Choice[] = question.distractors.map((d) => ({
    value: d.value,
    correct: false,
    errorType: d.errorType,
    label: labelFor(d.value, question),
  }));
  const seen = new Set<string>([JSON.stringify(question.answer)]);
  const deduped: Choice[] = [];
  for (const w of wrong) {
    const key = JSON.stringify(w.value);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(w);
  }
  // R2/CQ#1: shuffle distractors FIRST so we don't deterministically drop the
  // last N when count is smaller than the available distractor pool. Then slice
  // to count - 1 distractors, prepend the correct answer, and optionally
  // shuffle the final pool for display order.
  const distractorsForRound = opts.shuffle
    ? shuffleChoices(deduped, opts.seed).slice(0, count - 1)
    : deduped.slice(0, count - 1);
  const pool: Choice[] = [correct, ...distractorsForRound];
  return opts.shuffle ? shuffleChoices(pool, opts.seed) : pool;
}
