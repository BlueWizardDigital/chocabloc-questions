import { describe, test, expect } from 'vitest';
import { createMessages } from '../../src/lesson/messages';
import { speakableText } from '../../src/lesson/speak-text';

const msg = createMessages({ lang: 'en' });

describe('speakableText', () => {
  test('words for comparison and equals', () => {
    expect(speakableText('34 < 99', msg)).toBe('34 is less than 99');
    expect(speakableText('99 > 34', msg)).toBe('99 is greater than 34');
  });
  test('minus between digits, equals', () => {
    expect(speakableText('7 - 3 = 4', msg)).toBe('7 minus 3 is equal to 4');
    expect(speakableText('7-3', msg)).toBe('7 minus 3');
  });
  test('plus, times, divided by, minus sign, blank', () => {
    expect(speakableText('2 + 3', msg)).toBe('2 plus 3');
    expect(speakableText('2 × 3', msg)).toBe('2 times 3');
    expect(speakableText('6 ÷ 3', msg)).toBe('6 divided by 3');
    expect(speakableText('8 − 2', msg)).toBe('8 minus 2');
    expect(speakableText('3 + ☐ = 5', msg)).toBe('3 plus blank is equal to 5');
  });
  test('a hyphen in a word is left alone', () => {
    expect(speakableText('well-known 5', msg)).toBe('well-known 5');
  });
});
