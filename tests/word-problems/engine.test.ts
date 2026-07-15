import { describe, it, expect } from 'vitest';
import { createWordProblemEngine } from '../../src/word-problems/engine';
import { WordProblemError, type WordProblemData } from '../../src/word-problems/types';

const data: WordProblemData = {
  templates: {
    'ADD-X': {
      beginner: ['{a} {item} plus {b}. {question_total}'],
      intermediate: ['{name} has {a} {item}. Finds {b} more. {question_total}'],
      advanced: ['{name} counted {a} {item}, then {b} more. {question_total}'],
    },
    'FRAC-X': { intermediate: ['{name} used {fraction} of the {item}. {question_total}'] },
    'DROP-B': { intermediate: ['{name} has {a} {item}. {question_total}'] }, // omits {b} -> incompatible
    'PCT-X': { intermediate: ['{name} needs {percent}% of the {item}. {question_total}'] }, // scalar-only
    'THEME-PREF': {
      intermediate: [
        'UNIVERSAL {a} plus {b}. {question_total}',
        { template: 'CAVE {a} plus {b}. {question_total}', themes: ['cave'] },
      ],
    },
    'VERB-X': { intermediate: ['{name} {verb_gain} {a} and {b}. {question_total}'] },
    'RES-X': { intermediate: ['{a} plus {b} equals {result}. Right?'] },
  },
  context: {
    themes: { cave: { item: ['gem/gems'] } },
    characters: { names: ['Emma'] },
    verbs: { addition: { gain: ['found'] } },
    question_phrases: { total: ['How many in all?'] },
  },
};
const engine = () => createWordProblemEngine(data);

describe('createWordProblemEngine', () => {
  it('rewrites questionText and preserves everything else', () => {
    const row = {
      id: 'ADD-X-1', skill_ids: ['ADD-X'], format: 'addition',
      content: { operands: [23, 5], operation: 'addition' }, answer: '28',
      distractors: [{ value: '27', error_type: 'off-by-1' }], questionText: '23 + 5 = ?',
    };
    const out = engine().applyWordProblem(row, { difficulty: 'intermediate', theme: 'cave' });
    expect(out.questionText).not.toBe('23 + 5 = ?');
    expect(out.questionText).toContain('23');
    expect(out.questionText).toContain('5');
    expect(out.answer).toBe('28');
    expect(out.content).toEqual(row.content);
    expect(out.distractors).toEqual(row.distractors);
    expect(out.skill_ids).toEqual(['ADD-X']);
  });

  it('is deterministic for the same row + seed', () => {
    const row = { id: 'ADD-X-1', skill_ids: ['ADD-X'], content: { operands: [4, 5] }, answer: 9 };
    expect(engine().applyWordProblem(row).questionText).toBe(engine().applyWordProblem(row).questionText);
  });

  it('rejects a template that drops an operand (compatibility gate)', () => {
    const row = { id: 'd1', skill_ids: ['DROP-B'], content: { operands: [7, 2] }, answer: 9 };
    expect(engine().applyWordProblem(row)).toBe(row); // no compatible template -> original
    expect(() => engine().applyWordProblem(row, { strict: true })).toThrow(WordProblemError);
  });

  it('renders fraction questions (covers fraction extraction)', () => {
    const row = { id: 'f1', skill_ids: ['FRAC-X'], content: { fraction: [3, 4] } };
    const out = engine().applyWordProblem(row, { difficulty: 'intermediate', theme: 'cave' });
    expect(out.questionText).toContain('3/4');
  });

  it('falls back / throws for an unknown skill', () => {
    const row = { id: 'z', skill_ids: ['NO-SUCH-SKILL'], content: { operands: [1, 2] }, answer: 3 };
    expect(engine().applyWordProblem(row)).toBe(row);
    expect(() => engine().applyWordProblem(row, { strict: true })).toThrow(WordProblemError);
  });

  it('picks the first supported skill id among several', () => {
    const row = { id: 'm', skill_ids: ['UNSUPPORTED', 'ADD-X'], content: { operands: [1, 2] }, answer: 3 };
    const out = engine().applyWordProblem(row, { theme: 'cave' });
    expect(out.questionText).toContain('1');
  });

  it('maps grade to difficulty when none is passed', () => {
    const e = engine();
    expect(e.generateStem({ skillId: 'ADD-X', operands: [1, 2], answer: 3, gradeBand: 'sprout' }, { theme: 'cave' })).toContain('1');
    expect(e.generateStem({ skillId: 'ADD-X', operands: [1, 2], answer: 3, gradeLevel: 6 }, { theme: 'cave' })).toContain('Emma');
  });

  it('degrades to the nearest difficulty bucket', () => {
    // FRAC-X only has intermediate; a beginner request still renders.
    const row = { id: 'f2', skill_ids: ['FRAC-X'], content: { fraction: [1, 2] } };
    expect(engine().applyWordProblem(row, { difficulty: 'beginner', theme: 'cave' }).questionText).toContain('1/2');
  });

  it('renders a scalar-only question through the engine', () => {
    const row = { id: 'p1', skill_ids: ['PCT-X'], content: { percent: 25 } };
    expect(engine().applyWordProblem(row, { difficulty: 'intermediate', theme: 'cave' }).questionText).toContain('25');
  });

  it('prefers a theme-specific template over a universal one', () => {
    const row = { id: 't1', skill_ids: ['THEME-PREF'], content: { operands: [1, 2] } };
    expect(engine().applyWordProblem(row, { theme: 'cave' }).questionText.startsWith('CAVE')).toBe(true);
  });

  it('falls back to row.format when content has no operation (verb pools)', () => {
    const row = { id: 'v1', format: 'addition', skill_ids: ['VERB-X'], content: { operands: [1, 2] } };
    expect(engine().applyWordProblem(row, { theme: 'cave' }).questionText).toContain('found');
  });

  it('renders a {result} template only when allowResult is set', () => {
    const row = { id: 'r1', skill_ids: ['RES-X'], content: { operands: [1, 2] }, answer: 3 };
    expect(engine().applyWordProblem(row, { theme: 'cave' })).toBe(row); // rejected by default
    expect(engine().applyWordProblem(row, { theme: 'cave', allowResult: true }).questionText).toContain('3');
  });

  it('rejects an explicit unknown theme in strict mode', () => {
    const row = { id: 'u1', skill_ids: ['ADD-X'], content: { operands: [1, 2] } };
    expect(() => engine().applyWordProblem(row, { strict: true, theme: 'nope' })).toThrow(/unknown theme/);
  });

  it('reads camelCase skillIds and question_id, and names a skill in strict errors', () => {
    const row = { question_id: 'c1', skillIds: ['ADD-X'], content: { operands: [1, 2] } };
    expect(engine().applyWordProblem(row, { theme: 'cave' }).questionText).toContain('1');
    const bad = { id: 'b', skill_ids: ['UNSUP1', 'UNSUP2'], content: { operands: [1, 2] } };
    expect(() => engine().applyWordProblem(bad, { strict: true })).toThrow(/UNSUP1/);
  });

  it('returns non-object inputs unchanged and exposes supportedSkills', () => {
    expect(engine().applyWordProblem(null)).toBe(null);
    expect(engine().supportedSkills.has('ADD-X')).toBe(true);
  });
});
