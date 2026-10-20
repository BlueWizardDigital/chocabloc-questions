import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/lesson-compare-100.json';
import { parseLesson, parseLessonIndex } from '../../src/lesson/parse';

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
