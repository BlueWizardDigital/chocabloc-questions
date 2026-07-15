import { describe, it, expect } from 'vitest';
import { analyzeDataset } from '../../src/word-problems/validate';
import type { WordProblemData } from '../../src/word-problems/types';

const context = {
  themes: { cave: { item: ['gem/gems'] } },
  characters: { names: ['Emma'] },
  question_phrases: { total: ['How many?'] },
};

describe('analyzeDataset', () => {
  it('has no structural errors for good data', () => {
    const data: WordProblemData = { templates: { ADD: { beginner: ['{a} {item}. {question_total}'] } }, context };
    const r = analyzeDataset(data);
    expect(r.ok).toBe(true);
    expect(r.total).toBe(1);
  });
  it('lists unrecognized placeholders (possible typos) without failing', () => {
    const data: WordProblemData = { templates: { ADD: { beginner: ['{a} {iten}'] } }, context };
    const r = analyzeDataset(data);
    expect(r.ok).toBe(true);
    expect(r.skills[0]?.unrecognizedPlaceholders).toContain('iten');
  });
  it('flags a template that exposes {result}', () => {
    const data: WordProblemData = { templates: { ADD: { beginner: ['{a}+{b}={result}'] } }, context };
    expect(analyzeDataset(data).skills[0]?.exposesResult).toBe(true);
  });
  it('reports a structural error for double braces', () => {
    const data: WordProblemData = { templates: { ADD: { beginner: ['{{a}} {item}'] } }, context };
    const r = analyzeDataset(data);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('ADD');
  });
  it('reports a structural error when a difficulty is not an array', () => {
    expect(analyzeDataset({ templates: { ADD: { beginner: 'oops' } }, context }).ok).toBe(false);
  });
  it('reports malformed brace syntax and uppercase placeholders', () => {
    expect(analyzeDataset({ templates: { A: { beginner: ['{a'] } }, context }).ok).toBe(false);
    expect(analyzeDataset({ templates: { A: { beginner: ['{}'] } }, context }).ok).toBe(false);
    expect(analyzeDataset({ templates: { A: { beginner: ['{~item}'] } }, context }).ok).toBe(false);
    expect(analyzeDataset({ templates: { A: { beginner: ['{A}'] } }, context }).ok).toBe(false);
  });
  it('reports a template theme that does not exist in context', () => {
    const r = analyzeDataset({ templates: { A: { beginner: [{ template: '{a} {item}', themes: ['cvae'] }] } }, context });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('cvae');
  });
  it('rejects non-object data / templates / context', () => {
    expect(analyzeDataset(null).ok).toBe(false);
    expect(analyzeDataset({ templates: [], context }).ok).toBe(false);
    expect(analyzeDataset({ templates: { A: {} }, context: 'oops' }).ok).toBe(false);
  });
});
