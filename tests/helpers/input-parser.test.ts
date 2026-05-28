import { describe, it, expect } from 'vitest';
import type { MoneyQuestion } from '../../src/types';
import { parseInputAnswer } from '../../src/helpers/input-parser';

describe('answerMode type field', () => {
  it('accepts answerMode on a question type', () => {
    const q: MoneyQuestion = {
      id: 'M-1', skillIds: ['MONEY-COIN-VALUE-USD'], format: 'money',
      imageType: 'coins', content: { coins: { quarter: 1 }, currency: 'USD' },
      answer: 25, distractors: [], answerMode: 'input',
    };
    expect(q.answerMode).toBe('input');
  });
});

describe('parseInputAnswer', () => {
  it('parses $2.53 as 253 cents for money', () => {
    expect(parseInputAnswer('$2.53', 'money')).toBe(253);
  });
  it('parses bare 2.53 as 253 cents', () => {
    expect(parseInputAnswer('2.53', 'money')).toBe(253);
  });
  it('parses $5 as 500 cents', () => {
    expect(parseInputAnswer('$5', 'money')).toBe(500);
  });
  it('parses $0.05 as 5 cents', () => {
    expect(parseInputAnswer('$0.05', 'money')).toBe(5);
  });
  it('handles money_budget_adjust same as money', () => {
    expect(parseInputAnswer('$12.50', 'money_budget_adjust')).toBe(1250);
  });
  it('strips degree symbol', () => {
    expect(parseInputAnswer('45°', 'geometry_angles')).toBe(45);
  });
  it('parses plain number for degrees', () => {
    expect(parseInputAnswer('90', 'geometry_angles')).toBe(90);
  });
  it('parses integer for numeric formats', () => {
    expect(parseInputAnswer('24', 'geometry_area')).toBe(24);
  });
  it('parses decimal for pythagorean', () => {
    expect(parseInputAnswer('5.0', 'pythagorean')).toBe(5);
  });
  it('keeps time string as-is', () => {
    expect(parseInputAnswer('2:30', 'time')).toBe('2:30');
  });
  it('keeps fraction string as-is', () => {
    expect(parseInputAnswer('1/2', 'fraction_concept')).toBe('1/2');
  });
  it('passes numeric fraction through as number', () => {
    expect(parseInputAnswer('0.5', 'fraction_concept')).toBe(0.5);
  });
  it('parses numeric pattern answer', () => {
    expect(parseInputAnswer('12', 'pattern')).toBe(12);
  });
  it('keeps non-numeric pattern as string', () => {
    expect(parseInputAnswer('red', 'pattern')).toBe('red');
  });
  it('returns NaN for empty on numeric format', () => {
    expect(parseInputAnswer('', 'geometry_area')).toBeNaN();
  });
  it('returns NaN for garbage on numeric format', () => {
    expect(parseInputAnswer('abc', 'geometry_area')).toBeNaN();
  });
  it('trims whitespace', () => {
    expect(parseInputAnswer('  24  ', 'geometry_area')).toBe(24);
  });
});
