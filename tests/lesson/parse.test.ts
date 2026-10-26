import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/lesson-compare-100.json';
import { parseLesson, parseLessonIndex, shareParts } from '../../src/lesson/parse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests mutate arbitrary paths
type Loose = Record<string, any>;
const clone = (): Loose => JSON.parse(JSON.stringify(fixture));

describe('parseLesson', () => {
  it('accepts the Compare fixture', () => {
    const r = parseLesson(fixture);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lesson.skillId).toBe('COMPARE-NUMBERS-WITHIN-100');
  });

  const bad: [string, (l: Loose) => void][] = [
    ['an extra field', (l) => { l.extra = 1; }],
    ['a 41-char title', (l) => { l.title = 'x'.repeat(41); }],
    ['picture plus result', (l) => { l.example.steps[0].result = '34 < 99'; }],
    ['missing operands', (l) => { delete l.example.operands; }],
    ['base10 number 10000', (l) => { l.example.steps[0].picture.numbers = [10000]; }],
    ['array rows 16', (l) => { l.idea.picture = { kind: 'array', rows: 16, cols: 2 }; }],
    ['pass.right above questions', (l) => { l.pass.right = 4; }],
    ['from outside afterWrong', (l) => { l.example.steps[0].picture.from = 'operands'; }],
    ['bad skill id', (l) => { l.skillId = 'compare'; }],
    ['bad lang', (l) => { l.lang = 'english'; }],
    ['too many cards', (l) => { l.idea.cards = Array(5).fill(l.idea.cards[0]); }],
    ['one example step', (l) => { l.example.steps = [l.example.steps[0]]; }],
  ];
  it.each(bad)('refuses %s', (_name, mutate) => {
    const l = clone();
    mutate(l);
    expect(parseLesson(l)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses formatVersion 2 and a missing formatVersion as unsupported-version', () => {
    const v2 = clone();
    v2.formatVersion = 2;
    expect(parseLesson(v2)).toEqual({ ok: false, reason: 'unsupported-version' });
    const none = clone();
    delete none.formatVersion;
    expect(parseLesson(none)).toEqual({ ok: false, reason: 'unsupported-version' });
  });

  it('counts caps in code points, not UTF-16 units', () => {
    const l = clone();
    l.title = '😀'.repeat(40);
    expect(parseLesson(l).ok).toBe(true);
    l.title = '😀'.repeat(41);
    expect(parseLesson(l)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses an empty heading', () => {
    const l = clone();
    l.idea.heading = '';
    expect(parseLesson(l)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses non-objects', () => {
    for (const v of [null, 'x', 3, [], undefined]) {
      expect(parseLesson(v)).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('accepts every picture kind', () => {
    const l = clone();
    l.idea.picture = { kind: 'numberLine', from: 0, to: 20, marks: [5], jumps: [{ from: 0, to: 5 }] };
    expect(parseLesson(l).ok).toBe(true);
    l.idea.picture = { kind: 'columns', op: '+', numbers: [12, '2.50'], carry: '1' };
    expect(parseLesson(l).ok).toBe(true);
    l.idea.picture = { kind: 'columns', op: '+', numbers: [12, 'abc'] };
    expect(parseLesson(l).ok).toBe(false);
    l.idea.picture = { kind: 'array', rows: 3, cols: 4 };
    expect(parseLesson(l).ok).toBe(true);
    l.idea.picture = { kind: 'nope' };
    expect(parseLesson(l).ok).toBe(false);
  });
});

describe('array.counted and the share picture', () => {
  const withPicture = (picture: unknown, extra: Loose = {}): Loose => {
    const l = clone();
    l.example.steps[0] = { heading: 'h', text: 't', picture, ...extra };
    return l;
  };
  const ok = (picture: unknown) => parseLesson(withPicture(picture)).ok;
  const share = (o: Loose) => ({ kind: 'share', ...o });

  it.each([0, 2, 4])('accepts counted %s on 4 rows', (counted) => {
    expect(ok({ kind: 'array', rows: 4, cols: 3, counted })).toBe(true);
  });
  it.each([-1, 5, 1.5, '2'])('refuses counted %j on 4 rows', (counted) => {
    expect(ok({ kind: 'array', rows: 4, cols: 3, counted })).toBe(false);
  });

  it.each([
    { total: 59, rows: 4, shown: 0 },
    { total: 59, rows: 4, shown: 2 },
    { total: 59, rows: 4, shown: 2, left: true },
    { total: 57, rows: 3, shown: 2 },
    { total: 47, rows: 6, shown: 1, left: true },
  ])('accepts share %j', (o) => {
    expect(ok(share(o))).toBe(true);
  });

  it.each([
    { total: 9, rows: 4, shown: 0 },
    { total: 100, rows: 4, shown: 0 },
    { total: 59, rows: 1, shown: 0 },
    { total: 59, rows: 10, shown: 0 },
    { total: 80, rows: 4, shown: 0 },
    { total: 40, rows: 4, shown: 0 },
    { total: 99, rows: 2, shown: 0 },
    { total: 59, rows: 4, shown: 3 },
    { total: 59, rows: 4, shown: 1, left: true },
    { total: 57, rows: 3, shown: 2, left: true },
    { total: 59, rows: 4, shown: 2, left: false },
    { total: 59, rows: 4, shown: 0, each: 14 },
  ])('refuses share %j', (o) => {
    expect(ok(share(o))).toBe(false);
  });

  it('refuses share in afterWrong.picture', () => {
    const l = clone();
    l.afterWrong.picture = { kind: 'share', from: 'operands' };
    expect(parseLesson(l)).toEqual({ ok: false, reason: 'invalid' });
  });
  it('refuses a young line on a share picture', () => {
    const l = withPicture(share({ total: 59, rows: 4, shown: 0 }), { young: 'x' });
    expect(parseLesson(l)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('shareParts', () => {
  it('splits the quotient by place', () => {
    expect(shareParts(59, 4)).toEqual([10, 4]);
    expect(shareParts(47, 6)).toEqual([7]);
    expect(shareParts(57, 3)).toEqual([10, 9]);
    expect(shareParts(23, 2)).toEqual([10, 1]);
  });
});

describe('parseLessonIndex', () => {
  const index = {
    formatVersion: 1,
    lang: 'en',
    lessons: { 'COMPARE-NUMBERS-WITHIN-100': { standards: ['2-C-01'] } },
    concepts: { 'COMPARE-TENS': ['COMPARE-NUMBERS-WITHIN-100'] },
  };
  it('accepts a valid index', () => {
    expect(parseLessonIndex(index).ok).toBe(true);
  });
  it('refuses bad versions and shapes', () => {
    expect(parseLessonIndex({ ...index, formatVersion: 3 })).toEqual({ ok: false, reason: 'unsupported-version' });
    expect(parseLessonIndex({ ...index, extra: 1 })).toEqual({ ok: false, reason: 'invalid' });
    expect(parseLessonIndex({ ...index, lessons: { bad: { standards: [] } } }).ok).toBe(false);
    expect(parseLessonIndex({ ...index, concepts: { A: [1] } }).ok).toBe(false);
    expect(parseLessonIndex(null).ok).toBe(false);
  });
});
