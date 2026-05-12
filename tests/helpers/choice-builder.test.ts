import { describe, it, expect } from 'vitest';
import { buildChoicePool, shuffleChoices } from '../../src/helpers/choice-builder';
import type { MoneyQuestion } from '../../src/types';

const sampleMoneyQ: MoneyQuestion = {
  id: 'TEST',
  skillIds: ['MONEY-COIN-VALUE-USD'],
  format: 'money',
  imageType: 'coins',
  content: { coins: { quarter: 5, dime: 1, nickel: 1, penny: 4 }, currency: 'USD' },
  answer: 144,
  distractors: [
    { value: 140, errorType: 'off-by-nickel' },
    { value: 150, errorType: 'off-by-nickel' },
    { value: 145, errorType: 'off-by-1' },
  ],
};

describe('buildChoicePool', () => {
  it('returns 4 choices for MC with 3 distractors', () => {
    const pool = buildChoicePool(sampleMoneyQ);
    expect(pool).toHaveLength(4);
  });

  it('includes exactly one correct choice', () => {
    const pool = buildChoicePool(sampleMoneyQ);
    expect(pool.filter((c) => c.correct)).toHaveLength(1);
  });

  it('correct choice has matching answer value', () => {
    const pool = buildChoicePool(sampleMoneyQ);
    const correct = pool.find((c) => c.correct);
    expect(correct?.value).toBe(144);
  });

  it('distractors carry errorType', () => {
    const pool = buildChoicePool(sampleMoneyQ);
    const wrong = pool.filter((c) => !c.correct);
    expect(wrong.every((c) => typeof c.errorType === 'string')).toBe(true);
  });

  it('count option trims pool', () => {
    const pool = buildChoicePool(sampleMoneyQ, { count: 3 });
    expect(pool).toHaveLength(3);
    expect(pool.filter((c) => c.correct)).toHaveLength(1);
  });

  it('seeded shuffle is reproducible', () => {
    const a = buildChoicePool(sampleMoneyQ, { shuffle: true, seed: 42 });
    const b = buildChoicePool(sampleMoneyQ, { shuffle: true, seed: 42 });
    expect(a.map((c) => c.value)).toEqual(b.map((c) => c.value));
  });

  it('different seeds produce different orders (probabilistic)', () => {
    const a = buildChoicePool(sampleMoneyQ, { shuffle: true, seed: 1 });
    const b = buildChoicePool(sampleMoneyQ, { shuffle: true, seed: 999 });
    expect(a.map((c) => c.value)).not.toEqual(b.map((c) => c.value));
  });
});

describe('shuffleChoices', () => {
  it('preserves elements', () => {
    const input = [
      { value: 1, correct: true },
      { value: 2, correct: false },
      { value: 3, correct: false },
    ];
    const out = shuffleChoices(input, 7);
    expect(out.map((c) => c.value).sort()).toEqual([1, 2, 3]);
  });
});
