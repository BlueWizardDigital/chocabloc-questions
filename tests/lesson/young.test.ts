import { describe, it, expect, vi, afterEach } from 'vitest';
import fixture from '../fixtures/lesson-compare-100.json';
import { parseLesson } from '../../src/lesson/parse';
import { lookFor, normalizeGrade } from '../../src/lesson/look';
import { LESSON_ANIMALS, pickAnimals } from '../../src/lesson/animals';
import { countCells } from '../../src/lesson/layout/count';
import { fillYoung } from '../../src/lesson/young-text';
import { createMessages, lessonMessagesEn } from '../../src/lesson/messages';
import { register } from '../../src/lesson/dom/young';
import { pictureFromQuestion } from '../../src/lesson/from-question';
import type { NormalizedQuestion } from '../../src/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests mutate arbitrary paths
type Loose = Record<string, any>;
const clone = (): Loose => JSON.parse(JSON.stringify(fixture));
const withPic = (picture: unknown, young?: string): Loose => {
  const l = clone();
  l.example.steps[0] = { heading: 'h', text: 't', picture, ...(young != null ? { young } : {}) };
  return l;
};
const ok = (l: Loose) => parseLesson(l).ok;

afterEach(() => vi.restoreAllMocks());
register(lessonMessagesEn);

describe('parse: count pictures, young and skillGrade', () => {
  it.each([
    [{ kind: 'count', groups: [3, 2] }],
    [{ kind: 'count', groups: [5], takeAway: 2 }],
    [{ kind: 'count', groups: [3], empty: 2 }],
    [{ kind: 'count', groups: [17, 12], apart: true }],
    [{ kind: 'count', groups: [20] }],
    [{ kind: 'count', groups: [0, 5], apart: true }],
  ])('accepts %j', (pic) => expect(ok(withPic(pic))).toBe(true));

  it.each([
    ['4 groups', { kind: 'count', groups: [1, 1, 1, 1] }],
    ['a group of 21', { kind: 'count', groups: [21] }],
    ['no groups', { kind: 'count', groups: [] }],
    ['total 0', { kind: 'count', groups: [0] }],
    ['total 21', { kind: 'count', groups: [10, 11] }],
    ['total 21 with empty', { kind: 'count', groups: [15], empty: 6 }],
    ['takeAway with empty', { kind: 'count', groups: [5], takeAway: 2, empty: 1 }],
    ['takeAway above the total', { kind: 'count', groups: [3], takeAway: 4 }],
    ['takeAway 0', { kind: 'count', groups: [3], takeAway: 0 }],
    ['apart with 3 groups', { kind: 'count', groups: [1, 2, 3], apart: true }],
    ['apart with 1 group', { kind: 'count', groups: [3], apart: true }],
    ['apart with takeAway', { kind: 'count', groups: [3, 2], apart: true, takeAway: 1 }],
    ['apart false', { kind: 'count', groups: [3, 2], apart: false }],
    ['a fraction', { kind: 'count', groups: [2.5] }],
    ['an extra field', { kind: 'count', groups: [2], extra: 1 }],
  ])('refuses %s', (_n, pic) => expect(ok(withPic(pic))).toBe(false));

  const count = { kind: 'count', groups: [3, 2] };
  it('accepts young on a count and an array step, with {a} {b} {c}', () => {
    expect(ok(withPic(count, '3 {a}. 2 {b} come too.'))).toBe(true);
    expect(ok(withPic({ kind: 'count', groups: [1, 1, 1] }, '{a} {b} {c}'))).toBe(true);
    expect(ok(withPic({ kind: 'array', rows: 2, cols: 3 }, '{a} in rows.'))).toBe(true);
  });
  it.each([
    ['young on a base10 step', { kind: 'base10', numbers: [3] }, 'hi'],
    ['young on a step with no picture', undefined, 'hi'],
    ['{d}', count, '3 {d}.'],
    ['a lone {', count, '3 { cats'],
    ['a lone }', count, '3 } cats'],
    ['an empty young', count, ''],
    ['a young of only spaces', count, '   '],
    ['61 characters', count, 'x'.repeat(61)],
    ['{b} on an array', { kind: 'array', rows: 2, cols: 3 }, '{a} and {b}'],
    ['{c} on an array', { kind: 'array', rows: 2, cols: 3 }, '{c}'],
    ['{b} on a one-group count', { kind: 'count', groups: [3] }, '{a} and {b}'],
    ['{c} on a two-group count', { kind: 'count', groups: [3, 2] }, '{a} {b} {c}'],
    ['{c} on a take-away count', { kind: 'count', groups: [5], takeAway: 2 }, '{c}'],
  ])('refuses %s', (_n, pic, young) => {
    const l = withPic(pic ?? count, young);
    if (pic === undefined) l.example.steps[0] = { heading: 'h', text: 't', young };
    expect(ok(l)).toBe(false);
  });

  it('requires a skillGrade of K or 1 to 8', () => {
    const none = clone();
    delete none.skillGrade;
    expect(ok(none)).toBe(false);
    for (const g of ['K', '1', '8']) expect(ok({ ...clone(), skillGrade: g })).toBe(true);
    for (const g of ['9', '0', 'k', 3, '']) expect(ok({ ...clone(), skillGrade: g })).toBe(false);
  });

  it('afterWrong may name the count picture', () => {
    const l = clone();
    l.afterWrong.picture = { kind: 'count', from: 'operands' };
    expect(ok(l)).toBe(true);
  });
});

describe('lookFor and normalizeGrade', () => {
  it('uses the kid grade first, then skillGrade', () => {
    expect(lookFor('K', '5')).toBe('young');
    expect(lookFor('5', 'K')).toBe('standard');
    expect(lookFor('3', '8')).toBe('young');
    expect(lookFor('4', 'K')).toBe('standard');
    expect(lookFor(null, '2')).toBe('young');
    expect(lookFor(null, null)).toBe('standard');
    expect(lookFor(undefined, undefined)).toBe('standard');
  });
  it('treats an unknown grade as null with one warning, and skillGrade decides', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(lookFor('Grade 3', '4')).toBe('standard');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(lookFor('7', 'K')).toBe('young');
    expect(lookFor('', 'K')).toBe('young');
    expect(lookFor(3, 'K')).toBe('young');
    expect(warn).toHaveBeenCalledTimes(4);
    expect(normalizeGrade('1')).toBe('1');
    expect(normalizeGrade(null)).toBeNull();
  });
});

describe('pickAnimals', () => {
  it('is deterministic, distinct, from the pool, and a prefix as n grows', () => {
    for (const id of ['ADD-WITHIN-5', 'SUB-FROM-10', 'COMPARE-NUMBERS-WITHIN-10', 'X']) {
      const three = pickAnimals(id, 3);
      expect(new Set(three).size).toBe(3);
      expect(three.every((a) => LESSON_ANIMALS.includes(a))).toBe(true);
      expect(pickAnimals(id, 3)).toEqual(three);
      expect(pickAnimals(id, 2)).toEqual(three.slice(0, 2));
      expect(pickAnimals(id, 1)).toEqual(three.slice(0, 1));
    }
  });
  it('varies across skills', () => {
    const firsts = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((s) => pickAnimals(s, 1)[0]));
    expect(firsts.size).toBeGreaterThan(2);
  });
});

describe('countCells', () => {
  it('[8, 5] fills the first frame with 8 of group 0 and 2 of group 1, then 3 of group 1', () => {
    const cells = countCells({ kind: 'count', groups: [8, 5] });
    expect(cells).toHaveLength(13);
    expect(cells.filter((c) => c.frame === 0).map((c) => c.group)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
    expect(cells.filter((c) => c.frame === 1).map((c) => [c.slot, c.group])).toEqual([[0, 1], [1, 1], [2, 1]]);
    expect(cells.every((c) => c.state === 'item')).toBe(true);
  });
  it('takeAway marks the last items taken, in place', () => {
    const cells = countCells({ kind: 'count', groups: [5], takeAway: 2 });
    expect(cells.map((c) => c.state)).toEqual(['item', 'item', 'item', 'taken', 'taken']);
    expect(cells.map((c) => c.slot)).toEqual([0, 1, 2, 3, 4]);
  });
  it('empty adds dashed places after the groups', () => {
    const cells = countCells({ kind: 'count', groups: [3], empty: 2 });
    expect(cells.map((c) => c.state)).toEqual(['item', 'item', 'item', 'empty', 'empty']);
  });
  it('apart gives each group its own frames', () => {
    const cells = countCells({ kind: 'count', groups: [12, 3], apart: true });
    expect(cells.filter((c) => c.group === 0).map((c) => c.frame)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
    expect(cells.filter((c) => c.group === 1).map((c) => [c.frame, c.slot])).toEqual([[2, 0], [2, 1], [2, 2]]);
  });
});

describe('fillYoung', () => {
  const msg = createMessages({ lang: 'en' });
  it('fills {a}, {b}, {c} with singular or plural animals', () => {
    expect(fillYoung('{a}, {b} and {c}', ['cat', 'dog', 'pig'], [1, 2, 3], msg)).toBe('cat, dogs and pigs');
    expect(fillYoung('{a}', ['fish'], [2], msg)).toBe('fish');
    expect(fillYoung('{a}', ['frog'], [1], msg)).toBe('frog');
  });
  it('has singular and plural for every pool animal', () => {
    for (const a of LESSON_ANIMALS) {
      expect(fillYoung('{a}', [a], [1], msg)).not.toContain('animals.');
      expect(fillYoung('{a}', [a], [2], msg)).not.toContain('animals.');
    }
  });
});

describe('afterWrong count from operands', () => {
  const q = (operation: string, operands: unknown) =>
    ({ content: { operands, operation } }) as unknown as NormalizedQuestion;
  const spec = { kind: 'count', from: 'operands' } as const;
  it('maps addition, subtraction and comparison', () => {
    expect(pictureFromQuestion(spec, q('addition', [3, 2]))).toEqual({ kind: 'count', groups: [3, 2] });
    expect(pictureFromQuestion(spec, q('subtraction', [5, 2]))).toEqual({ kind: 'count', groups: [5], takeAway: 2 });
    expect(pictureFromQuestion(spec, q('comparison', [7, 12]))).toEqual({ kind: 'count', groups: [7, 12], apart: true });
  });
  it('draws nothing past the limits or for another operation', () => {
    expect(pictureFromQuestion(spec, q('addition', [12, 15]))).toBeNull();
    expect(pictureFromQuestion(spec, q('addition', [0, 0]))).toBeNull();
    expect(pictureFromQuestion(spec, q('subtraction', [5, 6]))).toBeNull();
    expect(pictureFromQuestion(spec, q('subtraction', [5, 0]))).toBeNull();
    expect(pictureFromQuestion(spec, q('comparison', [7, 21]))).toBeNull();
    expect(pictureFromQuestion(spec, q('multiplication', [3, 2]))).toBeNull();
    expect(pictureFromQuestion(spec, q('addition', [1.5, 2]))).toBeNull();
    expect(pictureFromQuestion(spec, q('addition', [1, 2, 3]))).toBeNull();
  });
});
