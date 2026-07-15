import { describe, it, expect } from 'vitest';
import { sampleTemplates, sampleContext } from '../../src/word-problems/sample-data';
import { analyzeDataset } from '../../src/word-problems/validate';
import { createWordProblemEngine } from '../../src/word-problems/engine';

const REPRESENTATIVE = [
  { id: 'a1', skill_ids: ['ADD-WITHIN-10'], content: { operands: [5, 3], operation: 'addition' }, answer: 8 },
  { id: 'a2', skill_ids: ['ADD-2DIGIT-1DIGIT-NO-REGROUP'], content: { operands: [23, 5], operation: 'addition' }, answer: 28 },
];

describe('bundled sample data', () => {
  it('excludes _meta and is structurally valid', () => {
    expect(sampleTemplates).not.toHaveProperty('_meta');
    const report = analyzeDataset({ templates: sampleTemplates, context: sampleContext });
    expect(report.ok).toBe(true);
    expect(report.total).toBeGreaterThan(50);
  });

  it('renders representative skills with all operands and no leftover placeholders', () => {
    const engine = createWordProblemEngine({ templates: sampleTemplates, context: sampleContext });
    for (const row of REPRESENTATIVE) {
      const out = engine.applyWordProblem(row, { difficulty: 'intermediate' });
      expect(out, `${row.skill_ids[0]} should be transformed, not fall back`).not.toBe(row);
      expect(typeof out.questionText).toBe('string');
      expect(out.questionText).not.toMatch(/[{}]/);
      expect(out.questionText).toContain(String(row.content.operands[0]));
      expect(out.questionText).toContain(String(row.content.operands[1]));
      // determinism:
      expect(engine.applyWordProblem(row, { difficulty: 'intermediate' }).questionText).toBe(out.questionText);
    }
  });
});
