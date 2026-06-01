import type { AnswerValue, Choice, Currency, NormalizedQuestion } from '../types';
import { formatAnswerForDisplay } from './formatters';

export type ChoiceBuilderOptions = {
  count?: number;
  shuffle?: boolean;
  seed?: number;
};

function getQuestionCurrency(q: NormalizedQuestion): Currency | undefined {
  if (q.format === 'money') {
    return q.content.currency;
  }
  return undefined;
}

function labelFor(value: AnswerValue, q: NormalizedQuestion): string {
  const currency = getQuestionCurrency(q);
  if (currency) {
    return formatAnswerForDisplay(value, q.format, { currency });
  }
  return formatAnswerForDisplay(value, q.format);
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
  // v0.4.0+: server-validated path. When the wire carries a pre-shuffled
  // `choices` field, use it directly — server is the source of truth for
  // pool composition and ordering. All choices marked `correct: false`
  // since correctness is host-validator-determined. Caller is responsible
  // for wiring `validateAnswer` on `<chocabloc-question>`; without it the
  // built-in validator will treat every pick as wrong.
  if (question.choices) {
    return question.choices.map((c) => ({
      value: c.value,
      correct: false,
      label: labelFor(c.value, question),
    }));
  }

  // Legacy path: build pool from `answer + distractors`. Required when the
  // server still ships the v0.2.0/v0.3.0 shape.
  if (question.answer === undefined) {
    // Defensive — shape has neither `choices` nor `answer`. Return empty
    // pool so the renderer shows nothing rather than crashing.
    return [];
  }
  const distractorsList = question.distractors ?? [];
  const count = opts.count ?? 4;
  const correct: Choice = {
    value: question.answer,
    correct: true,
    label: question.answerDisplay ?? labelFor(question.answer, question),
  };
  const wrong: Choice[] = distractorsList.map((d) => ({
    value: d.value,
    correct: false,
    errorType: d.errorType,
    label: d.label ?? labelFor(d.value, question),
  }));
  const seen = new Set<string>([JSON.stringify(question.answer)]);
  const deduped: Choice[] = [];
  for (const w of wrong) {
    if (w.value === '' || w.value === null || w.value === undefined) continue;
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
