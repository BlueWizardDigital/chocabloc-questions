import { describe, it, expect } from 'vitest';
import { templateCompatibility } from '../../src/word-problems/compat';

describe('templateCompatibility', () => {
  it('requires every operand placeholder', () => {
    const r = templateCompatibility('{name} has {a} apples.', { skillId: 'X', operands: [23, 5] });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('b');
  });
  it('passes when all operands are present', () => {
    expect(templateCompatibility('{a} + {b}', { skillId: 'X', operands: [1, 2] }).ok).toBe(true);
  });
  it('forbids {result} by default and reports it', () => {
    const r = templateCompatibility('{a} + {b} = {result}', { skillId: 'X', operands: [1, 2] });
    expect(r.ok).toBe(false);
    expect(r.exposesResult).toBe(true);
  });
  it('allows {result} when opted in', () => {
    expect(
      templateCompatibility(
        '{a}+{b}={result}',
        { skillId: 'X', operands: [1, 2] },
        { allowResult: true },
      ).ok,
    ).toBe(true);
  });
  it('accepts a fraction via {fraction} or both parts, not one part', () => {
    expect(templateCompatibility('{fraction} of it', { skillId: 'X', fraction: [3, 4] }).ok).toBe(
      true,
    );
    expect(
      templateCompatibility('{fraction_a}/{fraction_b}', { skillId: 'X', fraction: [3, 4] }).ok,
    ).toBe(true);
    expect(templateCompatibility('just {fraction_a}', { skillId: 'X', fraction: [3, 4] }).ok).toBe(
      false,
    );
  });
  it('requires scalars only when no operands/fraction define the math', () => {
    expect(
      templateCompatibility('{percent}% of {whole}', {
        skillId: 'X',
        scalars: { percent: 25, whole: 80 },
      }).ok,
    ).toBe(true);
    expect(
      templateCompatibility('{percent}% only', {
        skillId: 'X',
        scalars: { percent: 25, whole: 80 },
      }).ok,
    ).toBe(false);
    expect(
      templateCompatibility('{a} and {b}', {
        skillId: 'X',
        operands: [1, 2],
        scalars: { extra: 9 },
      }).ok,
    ).toBe(true);
  });
  it('rejects more than six operands rather than dropping them', () => {
    const r = templateCompatibility('{a}{b}{c}{d}{e}{f}{g}', {
      skillId: 'X',
      operands: [1, 2, 3, 4, 5, 6, 7],
    });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('operand_7');
  });
  it('rejects an input with no identifiable math', () => {
    expect(
      templateCompatibility('{name} found some {item}.', { skillId: 'X', scalars: {} }).ok,
    ).toBe(false);
    expect(templateCompatibility('{name} found some {item}.', { skillId: 'X' }).ok).toBe(false);
  });
});
