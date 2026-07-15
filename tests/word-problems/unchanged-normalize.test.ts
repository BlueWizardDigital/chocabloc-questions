import { describe, it, expect } from 'vitest';
import { normalizeQuestion } from '../../src/helpers/normalizer';
import { createWordProblemEngine } from '../../src/word-problems/engine';

describe('word-problems does not affect normalization', () => {
  it('normalizeQuestion output is unchanged with the engine imported', () => {
    void createWordProblemEngine;
    const q = normalizeQuestion({
      id: 'ADD-1', skill_ids: ['ADD-WITHIN-10'], format: 'addition',
      content: { operands: [5, 3], operation: 'addition' }, answer: 8,
      distractors: [{ value: 7, error_type: 'off-by-1' }],
    });
    expect(q).toMatchObject({ id: 'ADD-1', format: 'text', content: { stem: '5 + 3 = ?' }, answer: 8 });
  });

  it('applyWordProblem never mutates the input row', () => {
    const engine = createWordProblemEngine({
      templates: { 'ADD-WITHIN-10': { intermediate: ['{a} plus {b}. How many?'] } },
      context: {},
    });
    const row = { id: 'x', skill_ids: ['ADD-WITHIN-10'], content: { operands: [5, 3] }, answer: 8 };
    const snapshot = JSON.stringify(row);
    engine.applyWordProblem(row, { difficulty: 'intermediate' });
    expect(JSON.stringify(row)).toBe(snapshot);
  });
});
