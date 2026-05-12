import { describe, it, expect } from 'vitest';
import { validateAnswer, matchesDistractor } from '../../src/helpers/validators';
import type { MoneyQuestion } from '../../src/types';

const q: MoneyQuestion = {
  id: 'TEST',
  skillIds: ['MONEY-COIN-VALUE-USD'],
  format: 'money',
  imageType: 'coins',
  content: { coins: { quarter: 5, dime: 1, nickel: 1, penny: 4 }, currency: 'USD' },
  answer: 144,
  distractors: [
    { value: 140, errorType: 'off-by-nickel' },
    { value: 145, errorType: 'off-by-1' },
  ],
};

describe('validateAnswer (async)', () => {
  it('returns Promise', () => {
    const result = validateAnswer(q, 144);
    expect(result).toBeInstanceOf(Promise);
  });

  it('correct answer returns correct=true', async () => {
    const r = await validateAnswer(q, 144);
    expect(r.correct).toBe(true);
    expect(r.distractorMatched).toBeNull();
    expect(r.expected).toBe(144);
    expect(r.skillTags).toEqual(['MONEY-COIN-VALUE-USD']);
  });

  it('wrong answer with distractor match', async () => {
    const r = await validateAnswer(q, 140);
    expect(r.correct).toBe(false);
    expect(r.distractorMatched).toEqual({ value: 140, errorType: 'off-by-nickel' });
  });

  it('wrong answer with no distractor match', async () => {
    const r = await validateAnswer(q, 999);
    expect(r.correct).toBe(false);
    expect(r.distractorMatched).toBeNull();
  });

  it('numeric coercion for string answers (money)', async () => {
    const r = await validateAnswer(q, '144');
    expect(r.correct).toBe(true);
  });

  it('does not coerce empty string to zero (CQ#4)', async () => {
    const zeroQ: MoneyQuestion = {
      ...q,
      answer: 0,
      distractors: [],
    };
    const r = await validateAnswer(zeroQ, '');
    expect(r.correct).toBe(false);
  });

  it('does not coerce whitespace-only to zero', async () => {
    const zeroQ: MoneyQuestion = {
      ...q,
      answer: 0,
      distractors: [],
    };
    const r = await validateAnswer(zeroQ, '   ');
    expect(r.correct).toBe(false);
  });

  it('does not coerce alphanumeric mix to number', async () => {
    const r = await validateAnswer(q, '144abc');
    expect(r.correct).toBe(false);
  });

  it('accepts well-formed numeric strings', async () => {
    const r = await validateAnswer(q, '144');
    expect(r.correct).toBe(true);
  });

  it('accepts numeric strings with leading/trailing whitespace', async () => {
    const r = await validateAnswer(q, '  144  ');
    expect(r.correct).toBe(true);
  });
});

describe('matchesDistractor', () => {
  it('returns matching distractor', () => {
    expect(matchesDistractor(q, 140)).toEqual({ value: 140, errorType: 'off-by-nickel' });
  });

  it('returns null when no match', () => {
    expect(matchesDistractor(q, 999)).toBeNull();
  });
});
