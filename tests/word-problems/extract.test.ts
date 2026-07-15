import { describe, it, expect } from 'vitest';
import { extractMath } from '../../src/word-problems/extract';

describe('extractMath', () => {
  it('maps operands positionally and answer to result', () => {
    expect(extractMath({ skillId: 'ADD', operands: [23, 5], answer: 28 })).toMatchObject({
      a: '23',
      b: '5',
      result: '28',
    });
  });
  it('maps a fraction to fraction / fraction_a / fraction_b', () => {
    expect(extractMath({ skillId: 'F', fraction: [3, 4] })).toMatchObject({
      fraction: '3/4',
      fraction_a: '3',
      fraction_b: '4',
    });
  });
  it('exposes scalar fields under their own key', () => {
    expect(extractMath({ skillId: 'P', scalars: { percent: 25, whole: 80 } })).toMatchObject({
      percent: '25',
      whole: '80',
    });
  });
  it('does not let scalars clobber positional keys', () => {
    expect(extractMath({ skillId: 'X', operands: [1, 2], scalars: { a: 999 } }).a).toBe('1');
  });
  it('omits absent inputs', () => {
    expect(extractMath({ skillId: 'X' })).toEqual({});
  });
});
