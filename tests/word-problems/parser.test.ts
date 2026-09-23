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

  // A cue belongs to its own sentence; it must not reach across a full stop.
  it('takes a number from the same sentence', () => {
    expect(pluralCount('The pile held 39 ')).toBe(39);
    expect(pluralCount('found 5 more ')).toBe(5);
  });
  it('ignores a number in a previous sentence', () => {
    expect(pluralCount('Harper added 1 more. How many ')).toBe(2);
    expect(pluralCount('There is 1 gem. Total ')).toBe(2);
  });
  it('ignores a singular keyword in a previous sentence', () => {
    expect(pluralCount('6 more for the potion. How many ')).toBe(2);
    expect(pluralCount('It sits in the chest. Total ')).toBe(2);
  });
  it('defaults to plural for a cue-less "How many ...?"', () => {
    expect(pluralCount('How many ')).toBe(2);
    expect(pluralCount('Total ')).toBe(2);
  });
  it('stops at ! and ? as well as .', () => {
    expect(pluralCount('It was 1 gem! How many ')).toBe(2);
    expect(pluralCount('Was it 1 gem? How many ')).toBe(2);
  });
  it('matches the two reported failures', () => {
    expect(pluralCount('The pile held 39 gems. Harper added 1 more. How many ')).toBe(2);
    expect(pluralCount('Amelia gathered 34 enchanted berries. They then found 6 more for the potion. How many ')).toBe(2);
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

// One placeholder names one thing. Repeating {item} must not name a second thing.
describe('renderTemplate plural agreement across sentences', () => {
  const ctx4: ContextData = { themes: { cave: { item: ['gem/gems'], ingredient: ['berry/berries'] } }, characters: { names: ['Harper'] } };

  it('keeps the closing "How many ...?" plural (reported case 1)', () => {
    const out = renderTemplate('The pile held {a} {item}. {name} added {b} more. How many {item} are in the pouch now?',
      { a: '39', b: '1' }, ctx4, 'cave', undefined, makeRng('s'));
    expect(out).toBe('The pile held 39 gems. Harper added 1 more. How many gems are in the pouch now?');
  });

  it('keeps the closing "How many ...?" plural (reported case 2)', () => {
    const out = renderTemplate('{name} gathered {a} {ingredient}. They then found {b} more for the potion. How many {ingredient} were collected?',
      { a: '34', b: '6' }, ctx4, 'cave', undefined, makeRng('s'));
    expect(out).toBe('Harper gathered 34 berries. They then found 6 more for the potion. How many berries were collected?');
  });

  it('still inflects from a number in the same sentence', () => {
    expect(renderTemplate('{a} {item} here. And {b} {item} there.', { a: '1', b: '4' }, ctx4, 'cave', undefined, makeRng('s')))
      .toBe('1 gem here. And 4 gems there.');
  });
});

describe('renderTemplate title apposition', () => {
  // `roles` carries slash forms; `names` is the person-name pool.
  const ctx5: ContextData = {
    themes: { cave: { item: ['gem/gems'], location: ['cavern/caverns'] } },
    characters: { names: ['Evelyn'], roles: ['guide/guides'] },
  };

  it('keeps a role directly before a name singular', () => {
    expect(renderTemplate('If {role} {name} collects {a} {item}, ok?', { a: '34' }, ctx5, 'cave', undefined, makeRng('s')))
      .toBe('If guide Evelyn collects 34 gems, ok?');
  });

  it('recognises a numbered name variant', () => {
    expect(renderTemplate('{role} {name2} waited.', {}, ctx5, 'cave', undefined, makeRng('s')))
      .toBe('guide Evelyn waited.');
  });

  it('leaves a role NOT followed by a name to the normal count rules', () => {
    // plural by default ...
    expect(renderTemplate('The {role} gathered.', {}, ctx5, 'cave', undefined, makeRng('s'))).toBe('The guide gathered.');
    expect(renderTemplate('{a} {role} gathered.', { a: '5' }, ctx5, 'cave', undefined, makeRng('s'))).toBe('5 guides gathered.');
    expect(renderTemplate('Many {role} gathered.', {}, ctx5, 'cave', undefined, makeRng('s'))).toBe('Many guides gathered.');
  });

  it('does not fire when the next slot is not a person name', () => {
    expect(renderTemplate('{a} {role} {item} here', { a: '5' }, ctx5, 'cave', undefined, makeRng('s')))
      .toBe('5 guides gems here');
  });

  it('does not fire on a literal word that merely follows', () => {
    expect(renderTemplate('{a} {role} collects', { a: '5' }, ctx5, 'cave', undefined, makeRng('s'))).toBe('5 guides collects');
  });

  it('derives the name pool from the data, not a hard-coded key', () => {
    // Same pool array under a different key (exact-key form) -> still a name.
    const names = ['Evelyn'];
    const ctx6: ContextData = { themes: { cave: {} }, characters: { names, hero: names, roles: ['guide/guides'] } };
    expect(renderTemplate('{a} {role} {hero} ran', { a: '5' }, ctx6, 'cave', undefined, makeRng('s'))).toBe('5 guide Evelyn ran');
  });
});

describe('renderTemplate placeholder consistency', () => {
  // Every pool holds >= 2 options, so a second draw would visibly differ.
  const ctx3: ContextData = {
    themes: {
      cave: {
        item: ['gem/gems', 'ruby/rubies', 'crystal/crystals'],
        ingredient: ['gem/gems', 'ruby/rubies'], // overlaps `item` on purpose
      },
    },
    characters: { names: ['Emma', 'Liam', 'Olivia'] },
  };

  it('reuses one word for every occurrence of the same placeholder', () => {
    const out = renderTemplate('{name} took {a} {item}, so {name} has {item}.', { a: '4' }, ctx3, 'cave', undefined, makeRng('s'));
    const [, n1, i1, n2, i2] = /^(\w+) took 4 (\w+), so (\w+) has (\w+)\.$/.exec(out as string)!;
    expect(n2).toBe(n1);
    expect(i2).toBe(i1);
  });

  it('still inflects each occurrence for its own count', () => {
    // Same noun, plural after 3 and singular after "one".
    const out = renderTemplate('{a} {item} and one {item}', { a: '3' }, ctx3, 'cave', undefined, makeRng('s')) as string;
    const [, plural, singular] = /^3 (\w+) and one (\w+)$/.exec(out)!;
    expect(plural).toBe(`${singular}s`);
  });

  it('keeps numbered variants of one base distinct', () => {
    // {item} repeats AND has numbered siblings: reuse must not eat their distinctness.
    const out = renderTemplate('{item} {item} {item2} {item3}', {}, ctx3, 'cave', undefined, makeRng('s')) as string;
    const [w1, w2, w3, w4] = out.split(' ');
    expect(w2).toBe(w1); // same placeholder -> same word
    expect(new Set([w1, w3, w4]).size).toBe(3); // item / item2 / item3 all differ
  });

  it('scopes the choice to one render, not across renders', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const out = renderTemplate('{name} and {name}', {}, ctx3, 'cave', undefined, makeRng(`s${i}`)) as string;
      const [n1, , n2] = out.split(' ');
      expect(n2).toBe(n1); // consistent within each render
      seen.add(n1 as string);
    }
    expect(seen.size).toBe(3); // the cache is per render: every name is still reachable
  });
});
