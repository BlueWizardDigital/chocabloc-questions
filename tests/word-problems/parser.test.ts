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

// Trello 450: wording the math tester robot found in Adventure 101.
describe('pluralCount after "of" (Trello 450)', () => {
  it('is plural for a bare noun after "of"', () => {
    expect(pluralCount('A group of ')).toBe(2);
    expect(pluralCount('a bag of ')).toBe(2);
    expect(pluralCount('One team of ')).toBe(2);
  });
  it('lets "of" outrank a singular word further back', () => {
    expect(pluralCount('What is the ratio of {item} to ')).toBe(2);
  });
  it('still lets a nearer number or "the" decide', () => {
    expect(pluralCount('A stampede of 1 ')).toBe(1);
    expect(pluralCount('A stampede of 7 ')).toBe(7);
    expect(pluralCount('the edge of the ')).toBe(1);
  });
  it('does not carry across a sentence boundary', () => {
    expect(pluralCount('A group of them. The ')).toBe(1);
  });
});

describe('renderTemplate "a" before a vowel sound (Trello 450)', () => {
  const ctxA: ContextData = {
    themes: {
      cave: { animal: ['glowworm/glowworms'], location: ['alcove/alcoves'], monster: ['golem/golems'] },
      catacomb: { location: ['underground lake/underground lakes'], item: ['urn/urns'] },
      potion: { ingredient: ['unicorn hair/unicorn hairs'], location: ['apothecary shop/apothecary shops'] },
    },
    characters: { names: ['Zoey'], roles: ['explorer/explorers'] },
  };
  const r = (tpl: string, theme: string, math: Record<string, string> = {}) =>
    renderTemplate(tpl, math, ctxA, theme, undefined, makeRng('s'));

  it('writes "an" before a slot that starts with a vowel sound (reported case)', () => {
    expect(r('{name} sees {a} {animal} in a {location}.', 'cave', { a: '1' })).toBe('Zoey sees 1 glowworm in an alcove.');
  });
  it('turns a sentence-initial "A" into "An"', () => {
    expect(r('A {location} sells potions. A {location} again.', 'potion')).toBe('An apothecary shop sells potions. An apothecary shop again.');
    expect(r('A {role} waits.', 'cave')).toBe('An explorer waits.');
  });
  it('goes by the first word of a multi-word value', () => {
    expect(r('They rest by a {location}.', 'catacomb')).toBe('They rest by an underground lake.');
    expect(r('It is a {item}.', 'catacomb')).toBe('It is an urn.');
  });
  it('keeps "a" before a consonant sound, including a "you" sound', () => {
    expect(r('A lair of a {monster}.', 'cave')).toBe('A lair of a golem.');
    expect(r('Add a {ingredient}.', 'potion')).toBe('Add a unicorn hair.');
  });
  it('touches only a standalone article right before the slot', () => {
    // "A" mid-sentence is a label, not an article; "a" inside a word is not one.
    expect(r('Point A {location} is near.', 'cave')).toBe('Point A alcove is near.');
    expect(r('Gamma {location} and a big {location}.', 'cave')).toBe('Gamma alcoves and a big alcove.');
    expect(r('an {location}', 'cave')).toBe('an alcove');
  });
  it('leaves literal template text alone', () => {
    expect(r('Point A is {a} steps away.', 'cave', { a: '5' })).toBe('Point A is 5 steps away.');
  });
  it('goes by sound for "you", "w" and silent-h words', () => {
    const ctxS: ContextData = {
      themes: { cave: { item: ['uniform/uniforms'], monster: ['one-eyed troll/one-eyed trolls'], span: ['hour/hours'] } },
    };
    const rs = (tpl: string) => renderTemplate(tpl, {}, ctxS, 'cave', undefined, makeRng('s'));
    expect(rs('Wear a {item}.')).toBe('Wear a uniform.');
    expect(rs('A {monster} waits.')).toBe('A one-eyed troll waits.');
    expect(rs('Rest for a {span}.')).toBe('Rest for an hour.');
  });
});

describe('renderTemplate question phrase after a comma (Trello 450)', () => {
  const ctxQ: ContextData = {
    themes: { cave: { item: ['gem/gems'] } },
    characters: { names: ['Emma', 'Harper'] },
    question_phrases: { remaining: ['What is left over?'], total: ['How many in all?'] },
  };
  const r = (tpl: string, math: Record<string, string>) => renderTemplate(tpl, math, ctxQ, 'cave', undefined, makeRng('s'));

  it('lower-cases a question phrase that continues a sentence (reported case)', () => {
    expect(r('{name} started with {a} {item}. After giving {b} to {name2}, {question_remaining}', { a: '800', b: '405' }))
      .toMatch(/^\w+ started with 800 gems\. After giving 405 to \w+, what is left over\?$/);
  });
  it('keeps the capital where the question opens a sentence', () => {
    expect(r('{a} {item}. {question_total}', { a: '5' })).toBe('5 gems. How many in all?');
    expect(r('{question_total}', {})).toBe('How many in all?');
  });
});

describe('renderTemplate "a group of {x}" (Trello 450)', () => {
  const ctxG: ContextData = { themes: { catacomb: { monster: ['skeleton/skeletons'], item: ['urn/urns'] } } };
  it('is plural after "a group of" (reported case)', () => {
    expect(renderTemplate('A group of {monster} stole {a} {item}.', { a: '742' }, ctxG, 'catacomb', undefined, makeRng('s')))
      .toBe('A group of skeletons stole 742 urns.');
  });
});

// A slot inside a question phrase used to stay unfilled, so the whole template was thrown away.
describe('renderTemplate slots inside a question phrase (Trello 450)', () => {
  const ctxP: ContextData = {
    themes: { cave: { item: ['gem/gems', 'ruby/rubies'], container: ['chest/chests', 'sack/sacks'] } },
    characters: { names: ['Emma', 'Liam', 'Olivia'] },
    question_phrases: {
      total: ['How many does {name} have now?', 'How many in all?'],
      groups: ['How many {container}?'],
      only_slot: ['How many does {name} have now?'],
    },
  };
  const r = (tpl: string, seed: string, math: Record<string, string> = { a: '5', b: '3' }) =>
    renderTemplate(tpl, math, ctxP, 'cave', undefined, makeRng(seed));
  const seeds = Array.from({ length: 40 }, (_, i) => `s${i}`);

  it('fills the slot with the word the story bound', () => {
    const outs = seeds.map((s) => r('{name} has {a} {item} and finds {b} more. {question_total}', s));
    const filled = outs.filter((o) => o && /have now\?$/.test(o));
    expect(filled.length).toBeGreaterThan(0); // the phrase is drawn, not thrown away
    for (const o of filled) {
      const [, story, asked] = /^(\w+) has .* How many does (\w+) have now\?$/.exec(o as string)!;
      expect(asked).toBe(story);
    }
  });

  it('fills a phrase that comes before the story slot with the same word', () => {
    for (const s of seeds) {
      const o = r('{question_only_slot} {name} had {a} {item}.', s) as string;
      const [, asked, story] = /^How many does (\w+) have now\? (\w+) had 5 \w+\.$/.exec(o)!;
      expect(story).toBe(asked);
    }
  });

  it('inflects the slot for its place in the phrase', () => {
    for (const s of seeds) {
      const o = r('{name} packs {a} {item} into {b} {container}. {question_groups}', s) as string;
      const [, story, asked] = /into 3 (\w+)\. How many (\w+)\?$/.exec(o)!;
      expect(asked).toBe(story); // "How many sacks?" names the same, plural, word
    }
  });

  it('skips a phrase whose slot the story never bound, and never adds a new name', () => {
    for (const s of seeds) {
      const o = r('There are {a} {item}. {b} more arrive. {question_total}', s);
      expect(o).toMatch(/^There are 5 \w+\. 3 more arrive\. How many in all\?$/);
    }
  });

  it('returns null only when no phrase in the pool can be used', () => {
    expect(r('There are {a} {item}. {question_only_slot}', 's1')).toBeNull();
  });

  it('fills a math slot inside a phrase with the story number', () => {
    const ctxM: ContextData = { themes: { cave: { item: ['gem/gems'] } }, question_phrases: { more: ['How many more than {a}?'] } };
    expect(renderTemplate('{a} {item} and {b} more. {question_more}', { a: '5', b: '3' }, ctxM, 'cave', undefined, makeRng('s')))
      .toBe('5 gems and 3 more. How many more than 5?');
  });

  it('reuses a fitting phrase when every fitting one is already used', () => {
    for (const s of seeds) {
      expect(r('There are {a} {item}. {question_total} {question_total2}', s))
        .toBe(r('There are {a} {item}. {question_total} {question_total2}', s)); // deterministic
      expect(r('There are {a} {item}. {question_total} {question_total2}', s)).toMatch(/How many in all\? How many in all\?$/);
    }
  });

  it('gives up on the template when the bound slot itself has no words', () => {
    const ctxN: ContextData = { themes: { cave: {} }, question_phrases: { total: ['How many {thing}?'] } };
    expect(renderTemplate('{a} {thing}. {question_total}', { a: '5' }, ctxN, 'cave', undefined, makeRng('s'))).toBeNull();
  });
});

// "If they already had 1, how many torch ...": the count before the comma decided the noun.
describe('pluralCount after "many" (Trello 450 round 3)', () => {
  it('is plural right after "many", whatever came earlier in the sentence', () => {
    expect(pluralCount('If they already had 1, how many ')).toBe(2);
    expect(pluralCount('With 1 fairy wing, how many ')).toBe(2);
    expect(pluralCount('the one with so many ')).toBe(2);
  });
  it('still lets a nearer cue decide', () => {
    expect(pluralCount('many a ')).toBe(1); // "many a gem" is singular English
  });
  it('inflects a slot after a comma-joined "how many" (reported shape)', () => {
    const ctxM: ContextData = { themes: { cave: { item: ['torch/torches'] } } };
    expect(renderTemplate('If they already had {b}, how many {item} did the patrol finish with?', { b: '1' }, ctxM, 'cave', undefined, makeRng('s')))
      .toBe('If they already had 1, how many torches did the patrol finish with?');
  });
});

// "0.1" and "3.1" used to read as a count of 1: the decimal point was taken as a sentence end.
describe('pluralCount and decimals (Trello 450)', () => {
  it('reads a decimal number as plural', () => {
    expect(pluralCount('weighs 0.1 ')).toBe(2);
    expect(pluralCount('found 3.1 ')).toBe(2);
    expect(pluralCount('pours 1.0 ')).toBe(2);
    expect(pluralCount('costs $0.01 ')).toBe(2);
  });
  it('does not end a sentence at a decimal point', () => {
    // Read as a sentence end, the "1" after the point would be the nearest cue.
    expect(pluralCount('Each sack holds 2.1 more ')).toBe(2);
    expect(pluralCount('Each of the 4.1 kg ')).toBe(2);
  });
  it('still ends a sentence at a full stop after a number', () => {
    expect(pluralCount('It held 7. How many ')).toBe(2);
    expect(pluralCount('There is 1 gem. 1 ')).toBe(1);
    expect(pluralCount('It weighs 0.5. The ')).toBe(1);
    // No other cue after the full stop, so only the sentence end keeps "1" out.
    expect(pluralCount('He took 1. Then he ate ')).toBe(2);
  });
  it('inflects a slot and a marker after a decimal', () => {
    const ctxD: ContextData = { themes: { cave: { item: ['gem/gems'] } } };
    expect(renderTemplate('{a} {item} and {b} {~kilogram/kilograms}.', { a: '3.1', b: '0.1' }, ctxD, 'cave', undefined, makeRng('s')))
      .toBe('3.1 gems and 0.1 kilograms.');
  });
});
