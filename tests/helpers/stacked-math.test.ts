import { describe, it, expect } from 'vitest';
import { parseMathExpression } from '../../src/helpers/stacked-math';

describe('parseMathExpression', () => {
  it('parses addition', () => {
    expect(parseMathExpression('343 + 46')).toEqual({
      kind: 'stacked',
      operands: ['343', '46'],
      operator: '+',
      maxDigits: 3,
    });
  });

  it('parses subtraction', () => {
    expect(parseMathExpression('100 - 37')).toEqual({
      kind: 'stacked',
      operands: ['100', '37'],
      operator: '-',
      maxDigits: 3,
    });
  });

  it('normalizes x to ×', () => {
    expect(parseMathExpression('12 x 4')).toEqual({
      kind: 'stacked',
      operands: ['12', '4'],
      operator: '×',
      maxDigits: 2,
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
});
