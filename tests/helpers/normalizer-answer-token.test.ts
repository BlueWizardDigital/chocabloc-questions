// answerToken preservation: graded (F6) questions arrive with an opaque
// `answerToken` the consumer must forward to the host's validate endpoint.
// The lib does NOT consume it for its own validation (built-in validator still
// returns correct:false), but it must NOT drop it from the normalized object,
// or downstream game code (e.g. chocabloc-questions/host) loses the ability to
// report graded attempts. Preserved in the one shared spot (extractBase), so it
// rides both the F6/choices path and the legacy answer+distractors path.
import { describe, expect, it } from 'vitest';
import { normalizeQuestion } from '../../src/helpers/normalizer';

const f6Row = {
  id: 'Q-TOK-1',
  format: 'multiplication',
  imageType: 'array',
  skillIds: ['MULT-SINGLE-3X'],
  questionText: 'What is 3 x 4?',
  content: { operands: [3, 4] },
  choices: [{ value: 12 }, { value: 7 }, { value: 11 }, { value: 15 }],
  answerToken: 'tok.abc123',
};

describe('normalizeQuestion — answerToken preservation', () => {
  it('keeps answerToken on the F6/choices path', () => {
    const q = normalizeQuestion(f6Row)!;
    expect(q.answerToken).toBe('tok.abc123');
  });

  it('accepts the snake_case answer_token wire key', () => {
    const { answerToken: _omit, ...rest } = f6Row;
    const q = normalizeQuestion({ ...rest, answer_token: 'tok.snake' })!;
    expect(q.answerToken).toBe('tok.snake');
  });

  it('omits answerToken when the row has none', () => {
    const { answerToken: _omit, ...rest } = f6Row;
    const q = normalizeQuestion(rest)!;
    expect(q.answerToken).toBeUndefined();
  });

  it('keeps answerToken on the legacy answer+distractors path', () => {
    const legacyRow = {
      id: 'Q-LEGACY-TOK',
      format: 'multiplication',
      imageType: 'array',
      skillIds: ['MULT-SINGLE-3X'],
      questionText: 'What is 3 x 4?',
      content: { operands: [3, 4] },
      answer: 12,
      distractors: [{ value: 7, error_type: 'misc' }],
      answerToken: 'tok.legacy',
    };
    const q = normalizeQuestion(legacyRow)!;
    expect(q.answerToken).toBe('tok.legacy');
  });
});
