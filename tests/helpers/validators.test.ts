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

describe('validateAnswer — array and cross-type branches', () => {
  it('array answer matches identical array student answer', async () => {
    const coordQ = {
      id: 'COORD-1',
      skillIds: ['MISC'],
      format: 'text' as const,
      content: { stem: 'Pick the point' },
      answer: [3, 4] as [number, number],
      distractors: [],
    };
    const r = await validateAnswer(coordQ, [3, 4]);
    expect(r.correct).toBe(true);
  });

  it('array answer does not match different array', async () => {
    const coordQ = {
      id: 'COORD-2',
      skillIds: ['MISC'],
      format: 'text' as const,
      content: { stem: 'Pick the point' },
      answer: [3, 4] as [number, number],
      distractors: [],
    };
    const r = await validateAnswer(coordQ, [3, 5]);
    expect(r.correct).toBe(false);
  });

  it('string student answer matches numeric question answer via coercion', async () => {
    const numQ = {
      id: 'NUM-1',
      skillIds: ['MISC'],
      format: 'text' as const,
      content: { stem: 'What is the answer?' },
      answer: 42,
      distractors: [],
    };
    const r = await validateAnswer(numQ, '42');
    expect(r.correct).toBe(true);
  });

  it('numeric student answer matches string question answer via coercion', async () => {
    const strQ = {
      id: 'STR-1',
      skillIds: ['MISC'],
      format: 'text' as const,
      content: { stem: 'What number?' },
      answer: '42',
      distractors: [],
    };
    const r = await validateAnswer(strQ, 42);
    expect(r.correct).toBe(true);
  });
});
