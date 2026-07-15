import { describe, it, expect } from 'vitest';
import { makeRng, pick, shuffle } from '../../src/word-problems/rng';

describe('seeded rng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng('seed-1'),
      b = makeRng('seed-1');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('differs across seeds', () => {
    expect(makeRng('seed-1')()).not.toBe(makeRng('seed-2')());
  });
  it('accepts numeric seeds', () => {
    expect(makeRng(42)()).toBe(makeRng(42)());
  });
  it('pick returns a member deterministically', () => {
    const arr = ['x', 'y', 'z'];
    expect(pick(makeRng('s'), arr)).toBe(pick(makeRng('s'), arr));
    expect(arr).toContain(pick(makeRng('s'), arr));
  });
  it('pick throws on an empty array', () => {
    expect(() => pick(makeRng('s'), [])).toThrow();
  });
  it('shuffle is a deterministic permutation that does not mutate input', () => {
    const arr = [1, 2, 3, 4, 5];
    const s1 = shuffle(makeRng('s'), arr),
      s2 = shuffle(makeRng('s'), arr);
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5]);
  });
});
