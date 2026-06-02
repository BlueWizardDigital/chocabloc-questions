import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeQuestion, normalizeBatch } from '../../src/helpers/normalizer';
import type { MoneyQuestion } from '../../src/types';
import * as env from '../../src/internal/env';
import usdSamples from '../fixtures/money-usd-sample.json';
import cadSamples from '../fixtures/money-cad-sample.json';
import malformed from '../fixtures/malformed-questions.json';

describe('normalizeQuestion (dev mode - strict)', () => {
  beforeEach(() => {
    vi.spyOn(env, 'isProd').mockReturnValue(false);
  });

  it('returns normalized money question for valid bank row', () => {
    const raw = {
      id: 'MONEY-COIN-VALUE-USD-144',
      skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { penny: 4, nickel: 1, dime: 1, quarter: 5 }, operation: 'money' },
      answer: 144,
      distractors: [{ value: 140, error_type: 'off-by-nickel' }],
      format: 'money',
      image_type: 'coins',
    };
    const q = normalizeQuestion(raw) as MoneyQuestion;
    expect(q.format).toBe('money');
    expect(q.content.currency).toBe('USD');
    expect(q.answer).toBe(144);
    expect(q.distractors).toHaveLength(1);
    expect(q.distractors[0]?.errorType).toBe('off-by-nickel');
  });

  it('throws on malformed row in dev', () => {
    expect(() => normalizeQuestion({ id: 'X', format: 'bogus' })).toThrow();
  });

  it('strips USD-invalid coin keys (e.g. loonie) when normalizing USD', () => {
    const raw = {
      id: 'X',
      skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { penny: 1, loonie: 5 } },
      answer: 1,
      distractors: [],
      format: 'money',
      image_type: 'coins',
    };
    const q = normalizeQuestion(raw) as MoneyQuestion;
    expect(q.content.coins.penny).toBe(1);
    expect((q.content.coins as { loonie?: number }).loonie).toBeUndefined();
  });

  it('infers currency from -CAD skill ID', () => {
    const raw = {
      id: 'X',
      skill_ids: ['MONEY-COIN-VALUE-CAD'],
      content: { coins: { toonie: 1 } },
      answer: 200,
      distractors: [],
      format: 'money',
      image_type: 'coins',
    };
    const q = normalizeQuestion(raw) as MoneyQuestion;
    expect(q.content.currency).toBe('CAD');
  });

  it('throws on ambiguous currency (both -USD and -CAD in skill ids)', () => {
    expect(() =>
      normalizeQuestion({
        id: 'X',
        skill_ids: ['MONEY-COIN-VALUE-USD', 'MONEY-COIN-VALUE-CAD'],
        content: { coins: { penny: 1 } },
        answer: 1,
        distractors: [],
        format: 'money',
        image_type: 'coins',
      }),
    ).toThrow(/Ambiguous currency/);
  });

  it('normalizes distractors that already use camelCase errorType (no rename needed)', () => {
    const raw = {
      id: 'X',
      skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { penny: 1 } },
      answer: 1,
      distractors: [{ value: 2, errorType: 'already-camelCase' }],
      format: 'money',
      image_type: 'coins',
    };
    const q = normalizeQuestion(raw) as MoneyQuestion;
    expect(q.distractors[0]?.errorType).toBe('already-camelCase');
  });

  it('coerces numeric-string answer to number for money format', () => {
    const raw = {
      id: 'X',
      skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { quarter: 1 } },
      answer: '25',
      distractors: [],
      format: 'money',
      image_type: 'coins',
    };
    const q = normalizeQuestion(raw) as MoneyQuestion;
    expect(q.answer).toBe(25);
    expect(typeof q.answer).toBe('number');
  });

  it('coerces numeric-string answer to number for money_count_mixed format', () => {
    const raw = {
      id: 'X',
      skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { penny: 1, dime: 1 } },
      answer: '11',
      distractors: [],
      format: 'money_count_mixed',
      image_type: 'coins',
    };
    const q = normalizeQuestion(raw) as MoneyQuestion;
    expect(q.answer).toBe(11);
    expect(typeof q.answer).toBe('number');
  });

  it('throws on non-numeric string answer for money format', () => {
    expect(() =>
      normalizeQuestion({
        id: 'X',
        skill_ids: ['MONEY-COIN-VALUE-USD'],
        content: { coins: { penny: 1 } },
        answer: 'abc',
        distractors: [],
        format: 'money',
        image_type: 'coins',
      }),
    ).toThrow(/Money answer must be a number/);
  });
});

describe('normalizeQuestion (prod mode - lenient)', () => {
  beforeEach(() => {
    vi.spyOn(env, 'isProd').mockReturnValue(true);
  });

  it('returns null and emits event on malformed row', () => {
    const onMalformed = vi.fn();
    const result = normalizeQuestion({ id: 'X', format: 'bogus' }, { onMalformed });
    expect(result).toBeNull();
    expect(onMalformed).toHaveBeenCalledTimes(1);
    expect(onMalformed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'X', reason: expect.any(String) }),
    );
  });
});

describe('normalizeBatch', () => {
  it('returns array of normalized; drops malformed in prod with events', () => {
    vi.spyOn(env, 'isProd').mockReturnValue(true);
    const onMalformed = vi.fn();
    const rows = [
      {
        id: 'OK-1',
        skill_ids: ['MONEY-COIN-VALUE-USD'],
        content: { coins: { penny: 1 } },
        answer: 1,
        distractors: [],
        format: 'money',
        image_type: 'coins',
      },
      { id: 'BAD-1', format: 'martian' },
    ];
    const result = normalizeBatch(rows, { onMalformed });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('OK-1');
    expect(onMalformed).toHaveBeenCalledTimes(1);
  });
});

describe('normalizer fixtures', () => {
  it.each(usdSamples)('normalizes USD sample $id', (raw) => {
    vi.spyOn(env, 'isProd').mockReturnValue(false);
    const q = normalizeQuestion(raw) as MoneyQuestion;
    expect(q).not.toBeNull();
    expect(q.format).toBe('money');
    expect(q.content.currency).toBe('USD');
  });

  it.each(cadSamples)('normalizes CAD sample $id', (raw) => {
    vi.spyOn(env, 'isProd').mockReturnValue(false);
    const q = normalizeQuestion(raw) as MoneyQuestion;
    expect(q).not.toBeNull();
    expect(q.format).toBe('money');
    expect(q.content.currency).toBe('CAD');
  });

  it('drops all malformed rows in prod batch', () => {
    vi.spyOn(env, 'isProd').mockReturnValue(true);
    const onMalformed = vi.fn();
    const result = normalizeBatch(malformed, { onMalformed });
    expect(result).toHaveLength(0);
    expect(onMalformed).toHaveBeenCalledTimes(malformed.length);
  });
});

describe('normalizeQuestion — text format', () => {
  beforeEach(() => {
    vi.spyOn(env, 'isProd').mockReturnValue(false);
  });

  it('normalizes a valid text question with string answer', () => {
    const raw = {
      id: 'TEXT-1',
      skillIds: ['MISC'],
      format: 'text',
      content: { stem: 'What is 2 + 2?' },
      answer: 'four',
      distractors: [],
    };
    const q = normalizeQuestion(raw);
    expect(q).not.toBeNull();
    expect(q!.format).toBe('text');
    expect((q!.content as { stem: string }).stem).toBe('What is 2 + 2?');
    expect(q!.answer).toBe('four');
  });

  it('normalizes a valid text question with numeric answer', () => {
    const raw = {
      id: 'TEXT-2',
      skillIds: ['MATH'],
      format: 'text',
      content: { stem: 'What is 2 + 2?' },
      answer: 4,
      distractors: [],
    };
    const q = normalizeQuestion(raw);
    expect(q).not.toBeNull();
    expect(q!.answer).toBe(4);
  });

  it('normalizes a text question with [n,n] coordinate answer', () => {
    const raw = {
      id: 'TEXT-3',
      skillIds: ['MISC'],
      format: 'text',
      content: { stem: 'What is the coordinate?' },
      answer: [3, 4],
      distractors: [],
    };
    const q = normalizeQuestion(raw);
    expect(q).not.toBeNull();
    expect(q!.answer).toEqual([3, 4]);
  });

  it('throws on text question with missing stem', () => {
    const raw = {
      id: 'TEXT-4',
      skillIds: ['MISC'],
      format: 'text',
      content: { notStem: 'no stem here' },
      answer: 'x',
      distractors: [],
    };
    expect(() => normalizeQuestion(raw)).toThrow();
  });

  it('throws on text question with non-object content', () => {
    const raw = {
      id: 'TEXT-5',
      skillIds: ['MISC'],
      format: 'text',
      content: 'not an object',
      answer: 'x',
      distractors: [],
    };
    expect(() => normalizeQuestion(raw)).toThrow();
  });

  it('throws on text question with invalid answer type', () => {
    const raw = {
      id: 'TEXT-6',
      skillIds: ['MISC'],
      format: 'text',
      content: { stem: 'What?' },
      answer: { nested: 'object' },
      distractors: [],
    };
    expect(() => normalizeQuestion(raw)).toThrow();
  });

  it('throws on unsupported format', () => {
    const raw = {
      id: 'UNK-1',
      skillIds: ['MISC'],
      format: 'video',
      content: {},
      answer: 'x',
      distractors: [],
    };
    expect(() => normalizeQuestion(raw)).toThrow(/Unsupported format/);
  });
});

describe('answerMode passthrough', () => {
  it('passes answerMode: input through', () => {
    const raw = {
      id: 'INPUT-1', format: 'money', skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { quarter: 1 } }, answer: 25, distractors: [],
      answerMode: 'input',
    };
    const q = normalizeQuestion(raw);
    expect(q?.answerMode).toBe('input');
  });

  it('reads snake_case answer_mode', () => {
    const raw = {
      id: 'SNAKE-1', format: 'money', skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { quarter: 1 } }, answer: 25, distractors: [],
      answer_mode: 'input',
    };
    const q = normalizeQuestion(raw);
    expect(q?.answerMode).toBe('input');
  });

  it('leaves undefined when absent', () => {
    const raw = {
      id: 'NONE-1', format: 'money', skill_ids: ['MONEY-COIN-VALUE-USD'],
      content: { coins: { quarter: 1 } }, answer: 25, distractors: [],
    };
    const q = normalizeQuestion(raw);
    expect(q?.answerMode).toBeUndefined();
  });
});

describe('normalizeQuestion — legacy correctIndex rejection (v0.2.0)', () => {
  it('throws explicit error when correctIndex is present', () => {
    const legacy = {
      id: 'LEGACY-1',
      questionText: 'p',
      choices: [1, 2, 3],
      correctIndex: 0,
      format: 'text',
      difficulty: 'easy',
      content: { stem: 'p' },
      skill_ids: [],
    };
    expect(() => normalizeQuestion(legacy)).toThrow(
      /Received legacy question shape with 'correctIndex'/,
    );
  });

  it('rejects correctIndex even in prod mode (does not silently drop)', () => {
    vi.spyOn(env, 'isProd').mockReturnValue(true);
    const legacy = {
      id: 'LEGACY-2',
      questionText: 'p',
      choices: [1, 2, 3],
      correctIndex: 0,
      format: 'text',
      content: { stem: 'p' },
      skill_ids: [],
    };
    // The guard runs BEFORE try/catch so it always throws (signal for caller bug)
    expect(() => normalizeQuestion(legacy)).toThrow(
      /Received legacy question shape with 'correctIndex'/,
    );
  });
});
