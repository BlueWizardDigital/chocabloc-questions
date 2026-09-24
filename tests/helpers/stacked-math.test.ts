import { describe, it, expect } from 'vitest';
import { parseMathExpression } from '../../src/helpers/stacked-math';

describe('parseMathExpression', () => {
  it('parses addition', () => {
    expect(parseMathExpression('343 + 46')).toEqual({
      kind: 'stacked',
      operands: ['343', '46'],
      operator: '+',
      maxDigits: 3,
      maxDecimals: 0,
    });
  });

  it('parses subtraction', () => {
    expect(parseMathExpression('100 - 37')).toEqual({
      kind: 'stacked',
      operands: ['100', '37'],
      operator: '-',
      maxDigits: 3,
      maxDecimals: 0,
    });
  });

  it('normalizes x to ×', () => {
    expect(parseMathExpression('12 x 4')).toEqual({
      kind: 'stacked',
      operands: ['12', '4'],
      operator: '×',
      maxDigits: 2,
      maxDecimals: 0,
    });
  });

  it('normalizes * to ×', () => {
    const result = parseMathExpression('12 * 4');
    expect(result?.kind).toBe('stacked');
    if (result?.kind === 'stacked') expect(result.operator).toBe('×');
  });

  it('parses ÷ as long-division', () => {
    expect(parseMathExpression('583 ÷ 4')).toEqual({
      kind: 'long-division',
      divisor: '4',
      dividend: '583',
    });
  });

  it('normalizes / to ÷ (with spaces)', () => {
    expect(parseMathExpression('583 / 4')).toEqual({
      kind: 'long-division',
      divisor: '4',
      dividend: '583',
    });
  });

  it('rejects / without spaces (fraction ambiguity)', () => {
    expect(parseMathExpression('1/2')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseMathExpression('')).toBeNull();
  });

  it('returns null for non-numeric operands', () => {
    expect(parseMathExpression('abc + 1')).toBeNull();
  });

  it('parses three operands with same operator', () => {
    expect(parseMathExpression('12 + 5 + 3')).toEqual({
      kind: 'stacked',
      operands: ['12', '5', '3'],
      operator: '+',
      maxDigits: 2,
      maxDecimals: 0,
    });
  });

  it('parses four operands', () => {
    const result = parseMathExpression('1 + 2 + 3 + 4');
    expect(result?.kind).toBe('stacked');
    if (result?.kind === 'stacked') {
      expect(result.operands).toEqual(['1', '2', '3', '4']);
    }
  });

  it('rejects mixed operators in multi-operand', () => {
    expect(parseMathExpression('1 + 2 - 3')).toBeNull();
  });

  it('handles extra whitespace around expression', () => {
    expect(parseMathExpression('  343  +  46  ')).toEqual({
      kind: 'stacked',
      operands: ['343', '46'],
      operator: '+',
      maxDigits: 3,
      maxDecimals: 0,
    });
  });

  it('returns null for bare operator', () => {
    expect(parseMathExpression('+')).toBeNull();
  });

  it('returns null for single number', () => {
    expect(parseMathExpression('42')).toBeNull();
  });

  it('computes maxDigits from longest operand', () => {
    const result = parseMathExpression('5 + 1000');
    expect(result?.kind).toBe('stacked');
    if (result?.kind === 'stacked') expect(result.maxDigits).toBe(4);
  });

  it('computes maxDigits across three operands', () => {
    const result = parseMathExpression('5 + 3 + 1000');
    expect(result?.kind).toBe('stacked');
    if (result?.kind === 'stacked') expect(result.maxDigits).toBe(4);
  });

  it('reports maxDecimals 0 for integer-only input', () => {
    const result = parseMathExpression('343 + 46');
    expect(result?.kind).toBe('stacked');
    if (result?.kind === 'stacked') expect(result.maxDecimals).toBe(0);
  });
});

describe('parseMathExpression — decimals', () => {
  it('parses two decimals with the same scale', () => {
    expect(parseMathExpression('4.39 + 26.86')).toEqual({
      kind: 'stacked',
      operands: ['4.39', '26.86'],
      operator: '+',
      maxDigits: 2,
      maxDecimals: 2,
    });
  });

  it('parses decimals with different scales', () => {
    expect(parseMathExpression('4.5 + 26.86')).toEqual({
      kind: 'stacked',
      operands: ['4.5', '26.86'],
      operator: '+',
      maxDigits: 2,
      maxDecimals: 2,
    });
  });

  it('parses a decimal mixed with an integer', () => {
    expect(parseMathExpression('4 + 26.86')).toEqual({
      kind: 'stacked',
      operands: ['4', '26.86'],
      operator: '+',
      maxDigits: 2,
      maxDecimals: 2,
    });
  });

  it('parses decimal subtraction', () => {
    expect(parseMathExpression('26.86 - 4.5')).toEqual({
      kind: 'stacked',
      operands: ['26.86', '4.5'],
      operator: '-',
      maxDigits: 2,
      maxDecimals: 2,
    });
  });

  it('parses decimals across three operands', () => {
    expect(parseMathExpression('1.5 + 2.25 + 3')).toEqual({
      kind: 'stacked',
      operands: ['1.5', '2.25', '3'],
      operator: '+',
      maxDigits: 1,
      maxDecimals: 2,
    });
  });

  it('maxDigits counts the integer part only', () => {
    const result = parseMathExpression('4.1234 + 26.86');
    expect(result?.kind).toBe('stacked');
    if (result?.kind === 'stacked') {
      expect(result.maxDigits).toBe(2);
      expect(result.maxDecimals).toBe(4);
    }
  });

  it('rejects a leading bare point', () => {
    expect(parseMathExpression('.5 + 1')).toBeNull();
    expect(parseMathExpression('1 + .5')).toBeNull();
  });

  it('rejects a trailing point', () => {
    expect(parseMathExpression('4. + 1')).toBeNull();
    expect(parseMathExpression('1 + 4.')).toBeNull();
  });

  it('rejects a second point', () => {
    expect(parseMathExpression('4.3.9 + 1')).toBeNull();
    expect(parseMathExpression('1 + 4.3.9')).toBeNull();
  });

  it('rejects a spaced-out point', () => {
    expect(parseMathExpression('4 . 5')).toBeNull();
    expect(parseMathExpression('4 . 5 + 1')).toBeNull();
  });

  it('rejects a bare point', () => {
    expect(parseMathExpression('.')).toBeNull();
  });

  it('rejects a decimal in a three-operand stack with a malformed member', () => {
    expect(parseMathExpression('1.5 + 2. + 3')).toBeNull();
  });
});
