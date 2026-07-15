import { describe, it, expect } from 'vitest';
import { renderTemplate, pluralCount, slash, selectForTheme } from '../../src/word-problems/parser';
import { makeRng } from '../../src/word-problems/rng';
import type { ContextData } from '../../src/word-problems/types';

// Single-element pools -> output is independent of RNG selection.
const ctx: ContextData = {
  themes: { cave: { item: ['gem/gems'], location: ['cavern/caverns'] } },
  characters: { names: ['Emma'] },
  verbs: { addition: { gain: ['found'] } },
  question_phrases: { total: ['How many in all?'] },
};

describe('pluralCount', () => {
  it('is singular after 1 / a / the', () => {
    expect(pluralCount('there is 1 ')).toBe(1);
    expect(pluralCount('in the ')).toBe(1);
    expect(pluralCount('a ')).toBe(1);
  });
  it('is the count after a number > 1', () => {
    expect(pluralCount('found 5 ')).toBe(5);
  });
  it('defaults to plural', () => {
    expect(pluralCount('some ')).toBe(2);
  });
});

describe('slash', () => {
  it('picks singular vs plural, passes non-slash through', () => {
    expect(slash('gem/gems', 1)).toBe('gem');
    expect(slash('gem/gems', 3)).toBe('gems');
    expect(slash('fish', 3)).toBe('fish');
  });
});

describe('selectForTheme', () => {
  it('prefers theme-specific templates over universal ones', () => {
    const list = ['universal', { template: 'cave-only', themes: ['cave'] }];
    expect(selectForTheme(list, 'cave')).toEqual([{ template: 'cave-only', themes: ['cave'] }]);
    expect(selectForTheme(list, 'forest')).toEqual(['universal']);
  });
});

describe('renderTemplate', () => {
  it('fills math + context and agrees in number', () => {
    expect(renderTemplate('{name} {verb_gain} {a} {item}. {question_total}', { a: '5' }, ctx, 'cave', 'addition', makeRng('s')))
      .toBe('Emma found 5 gems. How many in all?');
  });
  it('uses the singular form after 1', () => {
    expect(renderTemplate('{a} {item}', { a: '1' }, ctx, 'cave', 'addition', makeRng('s'))).toBe('1 gem');
  });
  it('resolves {~singular/plural} by preceding number', () => {
    expect(renderTemplate('{a} {~group/groups}', { a: '1' }, ctx, 'cave', 'addition', makeRng('s'))).toBe('1 group');
  });
  it('returns null when a placeholder cannot be resolved (guard)', () => {
    expect(renderTemplate('{a} {c} {item}', { a: '5' }, ctx, 'cave', 'addition', makeRng('s'))).toBeNull();
  });
  it('returns null when the theme lacks the needed vocab', () => {
    expect(renderTemplate('{item}', {}, ctx, 'nonexistent', 'addition', makeRng('s'))).toBeNull();
  });
  it('rejects output containing any residual brace, even a lone one', () => {
    expect(renderTemplate('{a} things', { a: 'wei{rd' }, ctx, 'cave', 'addition', makeRng('s'))).toBeNull();
  });
  it('prefers distinct values for repeated keys when the pool allows, and supports exact character keys', () => {
    const ctx2: ContextData = {
      themes: { cave: { item: ['gem/gems', 'ruby/rubies'] } }, // two options -> can differ
      characters: { hero: ['Zed'] }, // exact key, no trailing 's'
    };
    const out = renderTemplate('{hero}: {item} and {item2}', {}, ctx2, 'cave', undefined, makeRng('s'));
    expect(out).toMatch(/^Zed: /);
    const [i1, i2] = (out as string).split(': ')[1]!.split(' and ');
    expect(i1).not.toBe(i2); // distinct because the pool has >= 2 values (contract: prefer-distinct)
  });
});
