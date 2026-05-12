import { describe, it, expect } from 'vitest';
import {
  parseQuestion,
  isQuestionLike,
  isNormalizedQuestion,
} from '../../src/helpers/parsers';
import type { NormalizedQuestion } from '../../src/types';

const validNormalizedMoney = {
  id: 'MONEY-COIN-VALUE-USD-144',
  skillIds: ['MONEY-COIN-VALUE-USD'],
  format: 'money' as const,
  imageType: 'coins' as const,
  content: {
    coins: { penny: 4, nickel: 1, dime: 1, quarter: 5 },
    currency: 'USD' as const,
  },
  answer: 144,
  distractors: [{ value: 140, errorType: 'off-by-nickel' }],
};

describe('parseQuestion (validates already-normalized shape)', () => {
  it('accepts a valid normalized money question', () => {
    const q: NormalizedQuestion = parseQuestion(validNormalizedMoney);
    expect(q.id).toBe('MONEY-COIN-VALUE-USD-144');
    expect(q.format).toBe('money');
    if (q.format === 'money') {
      expect(q.content.currency).toBe('USD');
    }
  });

  it('rejects a raw bank row (snake_case keys, no currency on content)', () => {
    const rawBank = {
      id: 'X',
      skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { penny: 1 }, operation: 'money' },
      answer: 1,
      distractors: [],
      format: 'money',
      image_type: 'coins',
    };
    expect(() => parseQuestion(rawBank)).toThrow();
  });

  it('accepts a valid normalized text question', () => {
    const q = parseQuestion({
      id: 'TEXT-1',
      skillIds: ['MISC'],
      format: 'text',
      content: { stem: 'What is the capital of France?' },
      answer: 'Paris',
      distractors: [],
    });
    expect(q.format).toBe('text');
  });
});

describe('isQuestionLike (shallow shape check)', () => {
  it('returns true for objects with string id + format', () => {
    expect(isQuestionLike({ id: 'X', format: 'money' })).toBe(true);
  });

  it('returns false for null / non-objects', () => {
    expect(isQuestionLike(null)).toBe(false);
    expect(isQuestionLike('string')).toBe(false);
    expect(isQuestionLike(42)).toBe(false);
  });

  it('returns false when id or format missing', () => {
    expect(isQuestionLike({ format: 'money' })).toBe(false);
    expect(isQuestionLike({ id: 'X' })).toBe(false);
  });
});

describe('isNormalizedQuestion (deep guard)', () => {
  it('returns true for a valid normalized money question', () => {
    expect(isNormalizedQuestion(validNormalizedMoney)).toBe(true);
  });

  it('returns false for a raw bank row (no currency, snake_case)', () => {
    expect(
      isNormalizedQuestion({
        id: 'X',
        skill_ids: ['MONEY-COIN-VALUE-USD'],
        content: { coins: { penny: 1 } },
        answer: 1,
        distractors: [],
        format: 'money',
        image_type: 'coins',
      }),
    ).toBe(false);
  });

  it('returns false when money answer is not a number', () => {
    expect(
      isNormalizedQuestion({
        ...validNormalizedMoney,
        answer: 'not-a-number',
      }),
    ).toBe(false);
  });

  it('returns false for unknown format (R2.9 — only money + text in v0)', () => {
    expect(isNormalizedQuestion({ ...validNormalizedMoney, format: 'bar_graph' })).toBe(false);
  });
});

describe('parseQuestion malformed inputs', () => {
  it('throws ParseError for null', () => {
    expect(() => parseQuestion(null)).toThrow(/id . format/);
  });

  it('throws ParseError for missing id', () => {
    expect(() => parseQuestion({ format: 'money' })).toThrow(/id . format/);
  });

  it('throws ParseError for unsupported format (v0 only money + text)', () => {
    expect(() => parseQuestion({ id: 'x', format: 'martian', skillIds: [], distractors: [] })).toThrow(
      /v0 supports money . text only/,
    );
  });

  it('throws ParseError when money answer is not a number', () => {
    expect(() =>
      parseQuestion({
        id: 'MONEY-X',
        skillIds: ['MONEY-COIN-VALUE-USD'],
        format: 'money',
        imageType: 'coins',
        content: { coins: { penny: 1 }, currency: 'USD' },
        answer: 'wrong',
        distractors: [],
      }),
    ).toThrow();
  });

  it('rejects USD content with loonie key (R2.3 — narrow types)', () => {
    expect(() =>
      parseQuestion({
        id: 'MONEY-X',
        skillIds: ['MONEY-COIN-VALUE-USD'],
        format: 'money',
        imageType: 'coins',
        content: { coins: { penny: 1, loonie: 5 }, currency: 'USD' },
        answer: 1,
        distractors: [],
      }),
    ).toThrow();
  });

  it('rejects CAD content with penny key (R2.3 — narrow types)', () => {
    expect(() =>
      parseQuestion({
        id: 'MONEY-X',
        skillIds: ['MONEY-COIN-VALUE-CAD'],
        format: 'money',
        imageType: 'coins',
        content: { coins: { penny: 1, nickel: 1 }, currency: 'CAD' },
        answer: 6,
        distractors: [],
      }),
    ).toThrow();
  });

  it('rejects negative coin counts', () => {
    expect(() =>
      parseQuestion({
        id: 'MONEY-X',
        skillIds: ['MONEY-COIN-VALUE-USD'],
        format: 'money',
        imageType: 'coins',
        content: { coins: { penny: -1 }, currency: 'USD' },
        answer: 0,
        distractors: [],
      }),
    ).toThrow();
  });

  it('rejects distractor missing errorType', () => {
    expect(() =>
      parseQuestion({
        id: 'MONEY-X',
        skillIds: ['MONEY-COIN-VALUE-USD'],
        format: 'money',
        imageType: 'coins',
        content: { coins: { penny: 1 }, currency: 'USD' },
        answer: 1,
        distractors: [{ value: 2 }],
      }),
    ).toThrow();
  });

  it('rejects distractor with object value (R2.2 Important #3 — guard must not lie)', () => {
    expect(() =>
      parseQuestion({
        id: 'MONEY-X',
        skillIds: ['MONEY-COIN-VALUE-USD'],
        format: 'money',
        imageType: 'coins',
        content: { coins: { penny: 1 }, currency: 'USD' },
        answer: 1,
        distractors: [{ value: { weird: 1 }, errorType: 'odd' }],
      }),
    ).toThrow();
  });

  it('rejects distractor with tuple of wrong length', () => {
    expect(() =>
      parseQuestion({
        id: 'MONEY-X',
        skillIds: ['MONEY-COIN-VALUE-USD'],
        format: 'money',
        imageType: 'coins',
        content: { coins: { penny: 1 }, currency: 'USD' },
        answer: 1,
        distractors: [{ value: [1, 2, 3], errorType: 'odd' }],
      }),
    ).toThrow();
  });

  it('accepts distractor with valid tuple value', () => {
    const q = parseQuestion({
      id: 'TEXT-1',
      skillIds: ['MISC'],
      format: 'text',
      content: { stem: 'pick coord' },
      answer: 'a',
      distractors: [{ value: [3, 4], errorType: 'reversed' }],
    });
    expect(q.distractors).toHaveLength(1);
  });
});
