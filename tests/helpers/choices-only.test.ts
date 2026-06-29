// v0.4.0 — server-validated choices-only path.
//
// When the wire payload carries a `choices` field, the lib must:
//   - normalize the question without requiring `answer` or `distractors`
//   - have `buildChoicePool` return the choices as-is, all `correct: false`
//   - have the built-in `validateAnswer` return `correct: false` + warn (host
//     validator MUST be set to determine truth)
//
// Existing client-validated path (legacy v0.2.0/v0.3.0 shape with
// `answer + distractors`) keeps working unchanged. Tests in
// `normalizer.test.ts` + `choice-builder.test.ts` lock that path.

import { describe, expect, it, vi } from 'vitest';
import { normalizeQuestion } from '../../src/helpers/normalizer';
import { buildChoicePool } from '../../src/helpers/choice-builder';
import { validateAnswer } from '../../src/helpers/validators';

const choicesRow = {
  id: 'Q-CO-1',
  format: 'multiplication',
  imageType: 'array',
  skillIds: ['MULT-SINGLE-3X'],
  questionText: 'What is 3 x 4?',
  content: { operands: [3, 4] },
  choices: [{ value: 12 }, { value: 7 }, { value: 11 }, { value: 15 }],
  answerToken: 'IGNORED-BY-LIB',
};

describe('normalizeQuestion — choices-only (v0.4.0)', () => {
  it('returns a NormalizedQuestion with choices and no answer/distractors', () => {
    const q = normalizeQuestion(choicesRow);
    expect(q).not.toBeNull();
    expect(q!.id).toBe('Q-CO-1');
    expect(q!.choices).toEqual([
      { value: 12 }, { value: 7 }, { value: 11 }, { value: 15 },
    ]);
    expect(q!.answer).toBeUndefined();
    expect(q!.distractors).toBeUndefined();
  });

  it('drops malformed choice entries silently rather than throwing', () => {
    const q = normalizeQuestion({
      ...choicesRow,
      choices: [
        { value: 12 },
        { value: null },           // dropped — invalid AnswerValue
        { value: { evil: 1 } },    // dropped — object not allowed
        'not-an-object',           // dropped — not an object
        { value: 'seven' },        // kept — string AnswerValue
      ],
    });
    expect(q!.choices).toEqual([{ value: 12 }, { value: 'seven' }]);
  });

  it('accepts choices-only shape for any format string (no per-format normalizer required)', () => {
    // Even a format the per-format dispatcher doesn't know about works in
    // choices-only mode because we bypass the per-format normalizer.
    const q = normalizeQuestion({
      ...choicesRow, format: 'some_future_format', imageType: undefined,
    });
    expect(q!.format).toBe('some_future_format');
    expect(q!.choices).toHaveLength(4);
  });

  it('preserves answerToken on the normalized question (forwarded to validate)', () => {
    // The lib doesn't *consume* answerToken (its built-in validator still
    // returns correct:false — a host validator is required), but it must keep
    // it on the normalized object so the consumer can forward it to the host's
    // validate / attempt channel. As of the F6 question-model update it is a
    // typed BaseQuestion field, not just an untyped passthrough.
    const q = normalizeQuestion(choicesRow);
    expect(q).not.toBeNull();
    expect(q!.answerToken).toBe('IGNORED-BY-LIB');
  });
});

describe('buildChoicePool — choices-only (v0.4.0)', () => {
  it('returns the pre-shuffled server choices verbatim, all correct: false', () => {
    const q = normalizeQuestion(choicesRow)!;
    const pool = buildChoicePool(q, { shuffle: false });
    expect(pool).toHaveLength(4);
    for (const c of pool) {
      expect(c.correct).toBe(false);
    }
    expect(pool.map((c) => c.value)).toEqual([12, 7, 11, 15]);
  });

  it('ignores opts.shuffle/seed in choices-only mode (server owns order)', () => {
    const q = normalizeQuestion(choicesRow)!;
    const a = buildChoicePool(q, { shuffle: true, seed: 1 });
    const b = buildChoicePool(q, { shuffle: true, seed: 2 });
    expect(a.map((c) => c.value)).toEqual(b.map((c) => c.value));
  });

  it('falls back to legacy answer+distractors path when choices is absent', () => {
    const legacyRow = {
      id: 'Q-LEGACY-1',
      format: 'multiplication',
      imageType: 'array',
      skillIds: ['MULT-SINGLE-3X'],
      questionText: 'What is 3 x 4?',
      content: { operands: [3, 4] },
      answer: 12,
      distractors: [
        { value: 7, error_type: 'misc' },
        { value: 11, error_type: 'off-by-one' },
      ],
    };
    const q = normalizeQuestion(legacyRow)!;
    const pool = buildChoicePool(q, { shuffle: false });
    expect(pool[0]!.correct).toBe(true);
    expect(pool[0]!.value).toBe(12);
    expect(pool.length).toBeGreaterThan(1);
  });
});

describe('validateAnswer — choices-only (v0.4.0)', () => {
  it('returns correct:false + warn when called on a choices-only question', async () => {
    const q = normalizeQuestion(choicesRow)!;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await validateAnswer(q, 12);
    expect(result.correct).toBe(false);
    expect(result.distractorMatched).toBeNull();
    expect(result.expected).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('server-validated question'),
    );
    warn.mockRestore();
  });
});
