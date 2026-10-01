import { describe, expect, it } from 'vitest';
import { normalizeQuestion } from '../../src/helpers/normalizer';
import { buildChoicePool } from '../../src/helpers/choice-builder';
import { formatAnswerForDisplay } from '../../src/helpers/formatters';

// Rows exactly as the platform serves them (serializeQuestionForGame over the
// content dump; token replaced). answer/distractors are TEXT columns, so every
// choice value is a string: coin lists comma-joined, money as cents. The
// content allow-list drops `currency`; it survives only as the -CAD skill id.
// The server checks a pick with an exact string compare, so values must reach
// the host unchanged.
const coinColourRow = {
  id: 'MONEY-COIN-COLOUR-CAD-identify-gold-dime-loonie-quarter-toonie',
  skillIds: ['MONEY-COIN-COLOUR-CAD'],
  content: { coins: ['quarter', 'loonie', 'dime', 'toonie'], attribute: 'colour', operation: 'money_coin_colour' },
  format: 'money_coin_colour', imageType: 'coins', difficulty: 'medium',
  questionText: 'Which of these coins are gold?',
  choices: [{ value: 'loonie,quarter,toonie' }, { value: 'loonie,toonie' }, { value: 'loonie' }, { value: 'dime,quarter,toonie' }],
  answerToken: 'token',
};

const countMixedRow = {
  id: 'MONEY-COIN-VALUE-CAD-5n-5d-4q-2l-3t',
  skillIds: ['MONEY-COIN-VALUE-CAD'],
  content: { coins: { dime: 5, loonie: 2, nickel: 5, toonie: 3, quarter: 4 }, operation: 'money_count_mixed' },
  format: 'money_count_mixed', imageType: 'coins', difficulty: 'hard',
  questionText: '5 nickels + 5 dimes + 4 quarters + 2 loonies + 3 toonies = ?',
  choices: [{ value: '985' }, { value: '974' }, { value: '980' }, { value: '975' }],
  answerToken: 'token',
};

describe('platform wire: money_coin_colour', () => {
  it('marks its answers as coin lists and keeps the string values', () => {
    const q = normalizeQuestion(coinColourRow);
    if (q.format !== 'text') throw new Error(`expected text, got ${q.format}`);
    expect(q.content.coinChoices).toBe(true);
    expect(q.content.coinScene).toEqual({ currency: 'CAD', coins: { quarter: 1, loonie: 1, dime: 1, toonie: 1 } });
    expect(q.choices).toEqual(coinColourRow.choices);
  });

  it('does not mark coin-name questions, whose answers name one coin', () => {
    const q = normalizeQuestion({
      ...coinColourRow, id: 'MONEY-COIN-SIZE-CAD-1', format: 'money_coin_size',
      content: { coins: ['dime', 'loonie'], operation: 'money_coin_size' },
      choices: [{ value: 'loonie' }, { value: 'dime' }],
    });
    if (q.format !== 'text') throw new Error(`expected text, got ${q.format}`);
    expect(q.content.coinScene).toBeDefined();
    expect(q.content.coinChoices).toBeUndefined();
  });
});

describe('platform wire: money_count_mixed', () => {
  it('normalizes to a money question with its coins, like the answer-bearing path', () => {
    const q = normalizeQuestion(countMixedRow);
    expect(q.format).toBe('money');
    if (q.format !== 'money') return;
    expect(q.imageType).toBe('coins');
    expect(q.content).toEqual({ currency: 'CAD', coins: { nickel: 5, dime: 5, quarter: 4, loonie: 2, toonie: 3 } });
    expect(q.choices).toEqual(countMixedRow.choices);
    expect(q.answerToken).toBe('token');
  });

  it('labels cents strings as money and leaves the values alone', () => {
    const pool = buildChoicePool(normalizeQuestion(countMixedRow), { shuffle: false });
    // CAD labels use the lib's existing en-US convention ("CA$"); see formatters.test.ts.
    expect(pool.map((c) => c.label)).toEqual(['CA$9.85', 'CA$9.74', 'CA$9.80', 'CA$9.75']);
    expect(pool.map((c) => c.value)).toEqual(['985', '974', '980', '975']);
  });

  it('still refuses a money row whose currency cannot be told', () => {
    expect(() => normalizeQuestion({ ...countMixedRow, skillIds: ['MONEY-COIN-VALUE'] })).toThrow();
  });
});

describe('formatAnswerForDisplay: money cents as strings', () => {
  it('formats whole-number cent strings like numbers', () => {
    expect(formatAnswerForDisplay('200', 'money')).toBe('$2.00');
    expect(formatAnswerForDisplay('25', 'money')).toBe('25¢');
  });

  it('leaves non-numeric strings alone', () => {
    expect(formatAnswerForDisplay('about 2', 'money')).toBe('about 2');
  });
});
