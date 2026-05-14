import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatAnswerForDisplay,
  formatCoinCountForScreenReader,
} from '../../src/helpers/formatters';

describe('formatCurrency', () => {
  it('formats USD cents as dollars', () => {
    expect(formatCurrency(144, { currency: 'USD', locale: 'en-US' })).toBe('$1.44');
  });

  it('formats zero', () => {
    expect(formatCurrency(0, { currency: 'USD', locale: 'en-US' })).toBe('$0.00');
  });

  it('formats CAD cents', () => {
    // en-US + CAD produces 'CA$8.35'; en-CA may produce '$8.35' in Node
    // depending on ICU data. Use en-US to get the unambiguous CA$ prefix.
    expect(formatCurrency(835, { currency: 'CAD', locale: 'en-US' })).toBe('CA$8.35');
  });

  it('defaults to USD + en-US when opts omitted', () => {
    expect(formatCurrency(100)).toBe('$1.00');
  });

  it('handles large amounts', () => {
    expect(formatCurrency(123456, { currency: 'USD', locale: 'en-US' })).toBe('$1,234.56');
  });
});

describe('formatAnswerForDisplay', () => {
  it('formats money answer >= $1 as decimal currency', () => {
    expect(formatAnswerForDisplay(144, 'money')).toBe('$1.44');
  });

  it('formats sub-dollar money answer with cent symbol (pedagogical CCSS 2.MD.C.8)', () => {
    expect(formatAnswerForDisplay(45, 'money')).toBe('45¢');
  });

  it('formats single-digit cents with cent symbol', () => {
    expect(formatAnswerForDisplay(5, 'money')).toBe('5¢');
  });

  it('formats zero cents with cent symbol', () => {
    expect(formatAnswerForDisplay(0, 'money')).toBe('0¢');
  });

  it('formats 99¢ boundary with cent symbol', () => {
    expect(formatAnswerForDisplay(99, 'money')).toBe('99¢');
  });

  it('formats 100¢ boundary as $1.00 decimal', () => {
    expect(formatAnswerForDisplay(100, 'money')).toBe('$1.00');
  });

  it('passes strings through', () => {
    expect(formatAnswerForDisplay('Apples', 'text')).toBe('Apples');
  });

  it('formats coordinate tuple', () => {
    expect(formatAnswerForDisplay([8, -4], 'text')).toBe('(8, -4)');
  });
});

describe('formatCoinCountForScreenReader (R2.10)', () => {
  it('returns empty-string for empty coins', () => {
    expect(formatCoinCountForScreenReader({}, 'USD')).toBe('');
  });

  it('singular for count=1', () => {
    expect(formatCoinCountForScreenReader({ penny: 1 }, 'USD')).toBe('1 penny');
  });

  it('plural for count > 1', () => {
    expect(formatCoinCountForScreenReader({ penny: 3 }, 'USD')).toBe('3 pennies');
  });

  it('orders from highest denomination to lowest', () => {
    expect(
      formatCoinCountForScreenReader(
        { penny: 4, nickel: 1, dime: 1, quarter: 5 },
        'USD',
      ),
    ).toBe('5 quarters, 1 dime, 1 nickel, 4 pennies');
  });

  it('skips zero counts', () => {
    expect(formatCoinCountForScreenReader({ penny: 0, quarter: 2 }, 'USD')).toBe('2 quarters');
  });

  it('handles CAD coins (loonie/toonie plurals)', () => {
    expect(
      formatCoinCountForScreenReader(
        { nickel: 1, dime: 3, loonie: 0, toonie: 4 },
        'CAD',
      ),
    ).toBe('4 toonies, 3 dimes, 1 nickel');
  });

  it('handles CAD with single loonie singular', () => {
    expect(formatCoinCountForScreenReader({ loonie: 1 }, 'CAD')).toBe('1 loonie');
  });
});
