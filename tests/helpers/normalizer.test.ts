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
