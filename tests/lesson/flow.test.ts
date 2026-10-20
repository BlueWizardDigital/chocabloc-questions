import { describe, test, expect } from 'vitest';
import { dedupe, splitFirstBatch, scoreStep, stepVerdict, introDone, checkDone } from '../../src/lesson/flow';
import type { Outcome } from '../../src/lesson/flow';
import type { Lesson } from '../../src/lesson/types';
import type { NormalizedQuestion } from '../../src/types';

const q = (id: string) => ({ id }) as unknown as NormalizedQuestion;
const qs = (n: number) => Array.from({ length: n }, (_, i) => q(`q${i + 1}`));
const id = (x: NormalizedQuestion) => x.id;
const P = { questions: 3, right: 2 };
const L = {
  skillId: 'S-HARD',
  moreHelp: { skillId: 'S-EASY', title: 'Easier', examples: [] },
  pass: P,
  quickCheck: 2,
} as unknown as Lesson;
const R: Outcome = 'right';
const W: Outcome = 'wrong';
const U: Outcome = 'unsure';

describe('stepVerdict', () => {
  test('passes with 2 of 3, all 3 asked', () => expect(stepVerdict(3, [R, W, R], P)).toBe('passed'));
  test('unsure counts as not right', () => expect(stepVerdict(3, [R, U, W], P)).toBe('failed'));
  test.each([0, 1, 2])('a batch of %i is incomplete', (n) => expect(stepVerdict(n, [], P)).toBe('incomplete'));
  test('fewer answers than asked never passes', () => expect(stepVerdict(3, [R, R], P)).toBe('failed'));
});

describe('splitFirstBatch', () => {
  test('first batch of 4 fills your turn first', () => {
    const s = splitFirstBatch(qs(4), 2, 3);
    expect(s.quickCheck.map(id)).toEqual(['q1']);
    expect(s.yourTurn.map(id)).toEqual(['q2', 'q3', 'q4']);
  });
  test('full first batch', () => {
    const s = splitFirstBatch(qs(5), 2, 3);
    expect(s.quickCheck.length).toBe(2);
    expect(s.yourTurn.length).toBe(3);
  });
  test('quickCheck 0', () => {
    const s = splitFirstBatch(qs(3), 0, 3);
    expect(s.quickCheck).toEqual([]);
    expect(s.yourTurn.length).toBe(3);
  });
  test('a short batch gives your turn everything and quick check nothing', () => {
    const s = splitFirstBatch(qs(2), 2, 3);
    expect(s.quickCheck).toEqual([]);
    expect(s.yourTurn.map(id)).toEqual(['q1', 'q2']);
  });
});

describe('dedupe', () => {
  test('drops seen and in-batch repeats, order kept', () =>
    expect(dedupe([q('a'), q('b'), q('a'), q('c')], new Set(['b'])).map(id)).toEqual(['a', 'c']));
});

describe('scoreStep', () => {
  test('counts right, asked and unsure', () => expect(scoreStep([R, U, W, R])).toEqual({ right: 2, of: 4, unsure: 1 }));
});

describe('introDone', () => {
  test('your turn short -> incomplete, startSkillId null', () =>
    expect(introDone(L, { quickCheck: [], yourTurn: { available: 2, outcomes: [] } })).toMatchObject({
      outcome: 'incomplete',
      incompleteStep: 'yourTurn',
      startSkillId: null,
    }));
  test('try again short -> incomplete at moreHelp', () => {
    const d = introDone(L, {
      quickCheck: [],
      yourTurn: { available: 3, outcomes: [W, W, R] },
      tryAgain: { available: 1, outcomes: [] },
    });
    expect(d).toMatchObject({ outcome: 'incomplete', incompleteStep: 'tryAgain', startSkillId: 'S-EASY' });
    expect(d.tryAgain).toEqual({ right: 0, of: 0, unsure: 0 });
  });
  test('passedEasier', () =>
    expect(
      introDone(L, {
        quickCheck: [],
        yourTurn: { available: 3, outcomes: [W, W, R] },
        tryAgain: { available: 3, outcomes: [R, W, R] },
      }),
    ).toMatchObject({ outcome: 'passedEasier', startSkillId: 'S-EASY' }));
  test('notYet', () =>
    expect(
      introDone(L, {
        quickCheck: [],
        yourTurn: { available: 3, outcomes: [W, W, R] },
        tryAgain: { available: 3, outcomes: [W, U, R] },
      }),
    ).toMatchObject({ outcome: 'notYet', startSkillId: 'S-EASY' }));
  test('passed', () => {
    const d = introDone(L, { quickCheck: [R, W], yourTurn: { available: 3, outcomes: [R, R, R] } });
    expect(d).toMatchObject({
      mode: 'intro',
      skillId: 'S-HARD',
      outcome: 'passed',
      startSkillId: 'S-HARD',
      quickCheck: { right: 1, of: 2, unsure: 0 },
      yourTurn: { right: 3, of: 3, unsure: 0 },
    });
    expect('tryAgain' in d).toBe(false);
    expect('incompleteStep' in d).toBe(false);
  });
  test('a passed run ignores any tryAgain passed in', () => {
    const d = introDone(L, {
      quickCheck: [],
      yourTurn: { available: 3, outcomes: [R, R, W] },
      tryAgain: { available: 3, outcomes: [W, W, W] },
    });
    expect(d.outcome).toBe('passed');
    expect('tryAgain' in d).toBe(false);
  });
  test('failed your turn with no try again run is incomplete at tryAgain', () =>
    expect(introDone(L, { quickCheck: [], yourTurn: { available: 3, outcomes: [W, W, W] } })).toMatchObject({
      outcome: 'incomplete',
      incompleteStep: 'tryAgain',
      startSkillId: 'S-EASY',
    }));
  test('bottom rung behaves the same', () => {
    const B = { ...L, moreHelp: { ...L.moreHelp, skillId: 'S-HARD' } } as Lesson;
    expect(
      introDone(B, {
        quickCheck: [],
        yourTurn: { available: 3, outcomes: [W, W, W] },
        tryAgain: { available: 3, outcomes: [R, R, R] },
      }),
    ).toMatchObject({ outcome: 'passedEasier', startSkillId: 'S-HARD' });
  });
});

describe('checkDone', () => {
  test('groups by skill', () => {
    expect(
      checkDone([
        { skillId: 'A', outcome: R },
        { skillId: 'A', outcome: W },
        { skillId: 'B', outcome: U },
        { skillId: 'B', outcome: R },
      ]),
    ).toEqual({
      mode: 'check',
      right: 2,
      of: 4,
      unsure: 1,
      bySkill: { A: { right: 1, of: 2, unsure: 0 }, B: { right: 1, of: 2, unsure: 1 } },
    });
  });
  test('empty', () => expect(checkDone([])).toEqual({ mode: 'check', right: 0, of: 0, unsure: 0, bySkill: {} }));
});
