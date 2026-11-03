import { describe, it, expect } from 'vitest';
import { sampleTemplates, sampleContext } from '../../src/word-problems/sample-data';
import { createWordProblemEngine } from '../../src/word-problems/engine';

// Trello 450: wording the math tester robot found in Adventure 101. Each row is a skill that
// produced a reported sentence, with the operation its bank rows carry (verb pools need it).
// Every theme, difficulty and many seeds are rendered, so a template or pool edit that brings
// a reported sentence back fails here.
const ROWS: Array<{ skill: string; op: string; ops?: number[]; value?: number }> = [
  { skill: 'MULT-BY-MULTIPLES-OF-10', op: 'multiplication', ops: [1, 50] },
  { skill: 'MULT-3DIGIT-BY-1DIGIT', op: 'multiplication', ops: [948, 7] },
  { skill: 'DIV-BASIC-DIVISION-FACTS', op: 'division', ops: [24, 12] },
  { skill: 'DIV-2DIGIT-BY-1DIGIT-NO-REMAINDER', op: 'division', ops: [78, 6] },
  { skill: 'DIV-3DIGIT-BY-1DIGIT-NO-REMAINDER', op: 'division', ops: [112, 8] },
  { skill: 'DIV-3DIGIT-BY-2DIGIT', op: 'division', ops: [115, 23] },
  { skill: 'SUB-3DIGIT-NO-REGROUP', op: 'subtraction', ops: [687, 86] },
  { skill: 'SUB-3DIGIT-WITH-REGROUP', op: 'subtraction', ops: [742, 15] },
  { skill: 'SUB-2DIGIT-1DIGIT-NO-REGROUP', op: 'subtraction', ops: [16, 1] },
  { skill: 'SUB-2DIGIT-1DIGIT-WITH-REGROUP', op: 'subtraction', ops: [93, 9] },
  { skill: 'INT-SUB-BASIC', op: 'subtraction', ops: [800, 405] },
  { skill: 'ADD-WITHIN-5', op: 'addition', ops: [1, 2] },
  { skill: 'ADD-3DIGIT-WITH-REGROUP', op: 'addition', ops: [700, 991] },
  { skill: 'ADD-4DIGIT-NO-REGROUP', op: 'addition', ops: [4110, 5861] },
  { skill: 'COMPARE-NUMBERS-WITHIN-100', op: 'comparison', ops: [1, 64] },
  { skill: 'DEC-ADD-DECIMALS', op: 'decimal_addition', ops: [12.5, 6.82] },
  { skill: 'DEC-MULT-WHOLE-BY-DECIMAL', op: 'decimal_multiplication', ops: [10, 0.3] },
  { skill: 'DEC-DIV-WHOLE-BY-DECIMAL', op: 'decimal_division', ops: [0.4, 0.1] },
  { skill: 'DIV-BASIC-WITHIN-100-NO-REMAINDER', op: 'division', ops: [48, 6] },
  // Round 2: skills whose reported template never rendered, or whose wording was fixed.
  { skill: 'COMPARE-NUMBERS-WITHIN-1000', op: 'comparison', ops: [108, 105] },
  { skill: 'NUMBER-GCF', op: 'number_theory_gcf', ops: [10, 76] },
  { skill: 'SUB-5DIGIT-NO-REGROUP', op: 'subtraction', ops: [10121, 5430] },
  { skill: 'SUB-5DIGIT-WITH-REGROUP', op: 'subtraction', ops: [12315, 1319] },
  { skill: 'DIV-2DIGIT-BY-1DIGIT-WITH-REMAINDER', op: 'division', ops: [10, 3] },
  { skill: 'DEC-TO-FRAC', op: 'conversion', value: 0.125 },
  { skill: 'DEC-TO-PERCENT', op: 'conversion', value: 0.15 },
  { skill: 'PERCENT-TO-DECIMAL', op: 'conversion', value: 11 },
];

// Item and ingredient nouns, both number forms, longest first so "ancient coin" wins over "coin".
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ITEM_WORDS = [
  ...new Set(
    Object.values(sampleContext.themes ?? {})
      .flatMap((t) => [...(t.item ?? []), ...(t.ingredient ?? [])])
      .flatMap((v) => v.split('/')),
  ),
].sort((a, b) => b.length - a.length);
// A whole number (not part of a decimal) directly counting an item noun that ends its phrase
// ("10 gems × 0.3"); "10 crystal caves" is a place, not crystals, so a following word excludes it.
const WHOLE_NUMBER_COUNTS_ITEM = new RegExp(
  `(?<![\\d.])\\b\\d+ (?!(kg|g|L)\\b)(${ITEM_WORDS.map(escapeRe).join('|')})(?= [^a-z]|[.,?!]|$)`,
);
// Any object noun a story can count: items, ingredients and potions.
const OBJECT_WORDS = [
  ...new Set(
    Object.values(sampleContext.themes ?? {})
      .flatMap((t) => [...(t.item ?? []), ...(t.ingredient ?? []), ...(t.specialty ?? [])])
      .flatMap((v) => v.split('/')),
  ),
].sort((a, b) => b.length - a.length);
// "19.32 coins", "0.15 moonpetals": a decimal directly counting an object.
const DECIMAL_COUNTS_OBJECT = new RegExp(`\\d\\.\\d+ (${OBJECT_WORDS.map(escapeRe).join('|')})\\b`);

const DEFECTS: Array<[string, RegExp]> = [
  ['1 "What is the product?"', /What is the product\?/],
  ['2 an "each" ending naming something never set up', /How much for each explorer|What does each one receive|How many per /],
  ['3 "arrived at" with no article', /arrived at (?!the )/],
  ['4 "stampede"', /stampede/],
  ['5 a decimal counting whole objects', DECIMAL_COUNTS_OBJECT],
  ['6 "a" before a vowel sound', /(^|\s)[aA] (?!unicorn)[aeiouAEIOU]/],
  ['7 "1 were removed"', /\b1 were removed/],
  ['7 a singular after "a group of"', /group of (skeleton|golem|goblin|slime|slug|troll|spider|rat|logling) (?!warriors)/],
  ['7 "were the {monster} able"', /were the \w+ able/],
  ['7 "split the {item} equally"', /split the \w+ equally/],
  ['8 a capital after a comma', /, (What|How) /],
  ['9 "the 1st container"', /1st container|compare to the 2nd/],
  ['10 "shared"', / shared \d/],
  ['10 a total ending on a two-week story', /week two\. How many are there now/],
  ['10 a total ending on two containers', /second held \d+\. How many are there now/],
  ['R2.5 a compare question that does not ask for the sign', /How (does|did) .* compare/],
  ['R2.6 a name read as a title after "of {specialty}"', /amount of [a-z -]+(?<!that) [A-Z][a-z]+ could brew/],
  ['R2.7 "purcahsed" or a lower-case sentence start', /purcahsed|[.!?] a group of/],
  ['R2.8 "bigfoot" with no plural', /bigfoot/],
  ['R4 a lower-case sentence start', /[.!?] [a-z]/],
  ['R4 a compare question about places, not counts', /Which sign compares the (?!first |number of )/],
];

const engine = createWordProblemEngine({ templates: sampleTemplates, context: sampleContext });
const themes = Object.keys(sampleContext.themes ?? {});

function render(r: (typeof ROWS)[number], theme: string, seed: number, difficulty?: 'beginner' | 'intermediate' | 'advanced') {
  const content = r.ops ? { operands: r.ops, operation: r.op } : { value: r.value, operation: r.op };
  const row = { id: `${r.skill}-${seed}`, skill_ids: [r.skill], content };
  // The theme does not feed the random stream, so it goes into the seed: each theme gets its own draws.
  const opts = { theme, seed: `${seed}|${theme}|${difficulty ?? ''}`, ...(difficulty ? { difficulty } : {}) };
  // No template for this theme -> the row comes back untouched, with no questionText.
  return engine.applyWordProblem(row, opts).questionText as string | undefined;
}

describe('sample data wording (Trello 450)', () => {
  it('renders none of the reported sentences', () => {
    const found: string[] = [];
    let worded = 0;
    for (const r of ROWS) {
      for (const theme of themes) {
        for (const difficulty of ['beginner', 'intermediate', 'advanced'] as const) {
          for (let seed = 0; seed < 40; seed++) {
            const text = render(r, theme, seed, difficulty);
            if (text === undefined) continue;
            worded++;
            for (const [label, re] of DEFECTS) if (re.test(text)) found.push(`${label}: ${text}`);
            if (r.skill.startsWith('DEC-') && WHOLE_NUMBER_COUNTS_ITEM.test(text)) {
              found.push(`5 a decimal skill counting whole objects: ${text}`);
            }
          }
        }
      }
    }
    expect(worded).toBeGreaterThan(5000); // the sweep really rendered stories
    expect(found.slice(0, 10)).toEqual([]);
  });

  it('names what the story set up in its "each" ending', () => {
    let matched = 0;
    const kinds = new Set<string>();
    for (const r of ROWS.filter((x) => x.skill.startsWith('DIV-'))) {
      for (const theme of themes) {
        for (const difficulty of ['beginner', 'intermediate', 'advanced'] as const) {
          for (let seed = 0; seed < 40; seed++) {
            const text = render(r, theme, seed, difficulty);
            const unit = text && /How many (in|go in) each (\w+)\?|How many does each (\w+) get\?/.exec(text);
            if (!unit) continue;
            matched++;
            const noun = (unit[2] ?? unit[3]) as string;
            kinds.add(unit[1] === 'go in' ? 'go in each {container}' : noun);
            // The story mentions the same noun before the question (any number form).
            expect(text!.slice(0, unit.index), text).toMatch(new RegExp(`\\b${noun.slice(0, 4)}`));
          }
        }
      }
    }
    expect(matched).toBeGreaterThan(0);
    // Every story-specific ending was reached, including the potion batch and portion stories
    // (they used {item}, which potion has none of, until round 2).
    for (const k of ['pile', 'group', 'apprentice', 'shipment', 'display', 'batch', 'portion', 'go in each {container}']) {
      expect([...kinds], k).toContain(k);
    }
  });

  it('words the skills whose templates never rendered, in every theme, asking what the answer answers', () => {
    const asks: Record<string, RegExp> = {
      'DEC-TO-FRAC': /^Convert 0\.125 to a fraction\.$/,
      'DEC-TO-PERCENT': /^Convert 0\.15 to a percent\.$|into an? [a-z ]+\. As a decimal, the amount of the [a-z ]+ filled is 0\.15\. What percent of the [a-z ]+ is filled\?$/,
      'PERCENT-TO-DECIMAL': /^Convert 11% to a decimal\.$|fill 11% of an? [a-z ]+\. As a decimal, how much of the [a-z ]+ is filled\?$/,
    };
    for (const r of ROWS.filter((x) => x.skill in asks)) {
      for (const theme of themes) {
        for (const difficulty of ['beginner', 'intermediate', 'advanced'] as const) {
          const text = render(r, theme, 0, difficulty);
          expect(text, `${r.skill} ${theme} ${difficulty}`).toMatch(asks[r.skill] as RegExp);
        }
      }
    }
  });

  it('shares among a role the story names when a remainder is asked for', () => {
    const r = ROWS.find((x) => x.skill === 'DIV-2DIGIT-BY-1DIGIT-WITH-REMAINDER')!;
    const seen = new Set<string>();
    for (let seed = 0; seed < 80; seed++) {
      const text = render(r, 'cave', seed, 'intermediate');
      const m = text && /to share among 3 (\w+)\. How many does each get, and how many are left over\?$/.exec(text);
      if (m) seen.add(m[1] as string);
    }
    expect(seen.size).toBeGreaterThan(0); // the {recipient} story renders now, as a {role}
  });
});

// Round 3. Every template text, with where it lives and the themes it is written for.
const ALL_TEMPLATES = Object.entries(sampleTemplates).flatMap(([skill, byDiff]) =>
  (['beginner', 'intermediate', 'advanced'] as const).flatMap((d) =>
    (byDiff[d] ?? []).map((t, i) => ({
      where: `${skill} ${d}[${i}]`,
      text: typeof t === 'string' ? t : t.template,
      themes: typeof t === 'string' ? [] : (t.themes ?? []),
    })),
  ),
);

describe('template agreement and coverage (Trello 450 round 3)', () => {
  it('lets the count decide every verb that follows or leads a count slot', () => {
    // A verb written after a count ("{b} were taken") is wrong when the count is 1; use a
    // marker ("{b} {~was/were} taken"). A verb before the count ("There are {a} ...") cannot be
    // marked, because markers read backwards, so the sentence is reworded instead.
    const COUNT = String.raw`\{(?:[a-f]|number|result|abs_a|abs_b)\}`;
    const VERB = '(?:were|are|was|is|has|have|arrive|arrives|break|breaks|run|runs|remain|remains|expire|expires|make|makes|produce|produces|cost|costs|need|needs)';
    const rules: Array<[string, RegExp]> = [
      ['verb after a count', new RegExp(`${COUNT}(?: more)?(?: \\{[a-z_0-9]+\\})?(?: that)? ${VERB}\\b`)],
      ['verb before a count', new RegExp(`\\b[Tt]here (?:are|were|is|was) ${COUNT}`)],
      // "Another {location}" reads as plural; "Another {b} {~was/were} added" is fine.
      ['"another" before a word slot', /\b[Aa]nother \{(?![a-f]\})[a-z_0-9]+\}/],
    ];
    const found = ALL_TEMPLATES.flatMap(({ where, text }) =>
      rules.filter(([, re]) => re.test(text)).map(([rule]) => `${rule}: ${where}: ${text}`),
    );
    expect(found).toEqual([]);
  });

  it('gives every theme-only template words for each of its slots', () => {
    const themes = sampleContext.themes ?? {};
    const found = ALL_TEMPLATES.flatMap(({ where, text, themes: only }) =>
      only.flatMap((th) =>
        [...text.matchAll(/\{([a-z_0-9]+)\}/g)]
          .map((m) => (m[1] as string).replace(/\d+$/, ''))
          .filter((base) => base in (themes[th] ?? {}) && !(themes[th]![base] ?? []).length)
          .map((base) => `${where} (${th}) uses {${base}}, which ${th} has no words for`),
      ),
    );
    expect(found).toEqual([]);
  });

  it('words DIV-2DIGIT-BY-1DIGIT-WITH-REMAINDER at advanced in every theme, asking for both parts', () => {
    const r = { skill: 'DIV-2DIGIT-BY-1DIGIT-WITH-REMAINDER', op: 'division', ops: [10, 3] };
    for (const theme of themes) {
      for (let seed = 0; seed < 10; seed++) {
        const text = render(r, theme, seed, 'advanced');
        expect(text, `${theme} ${seed}`).toMatch(/\b10\b.*\b3\b.*How many .*each.*, and how many (are left( over)?|remain)\?$/);
      }
    }
  });
});

describe('template source and meaning checks (Trello 450 final pass)', () => {
  const themeVocab = sampleContext.themes ?? {};
  // Slots whose words are lower-case: theme pools, roles and the like, and verbs. Not names,
  // question phrases (written capitalised) or math slots (numbers).
  const lowerSlots = new Set<string>([
    ...Object.values(themeVocab).flatMap((t) => Object.keys(t)),
    ...Object.keys(sampleContext.characters ?? {}).filter((k) => k !== 'names').flatMap((k) => [k, k.replace(/s$/, '')]),
  ]);
  const opensLower = (slot: string) => lowerSlots.has(slot.replace(/\d+$/, '')) || slot.startsWith('verb_');

  it('opens every sentence with a capital, in the template text', () => {
    const found = ALL_TEMPLATES.filter(({ text }) =>
      [...text.matchAll(/(^|[.!?]\s+)(?:\{([a-z_0-9]+)\}|([a-z]))/g)].some((m) => (m[2] ? opensLower(m[2]) : !!m[3])),
    ).map(({ where, text }) => `${where}: ${text}`);
    expect(found).toEqual([]);
  });

  it('never writes a slot-pool word bare after a count ("{b} specialty")', () => {
    const words = [...lowerSlots].flatMap((b) => [b, `${b}s`, b.replace(/y$/, 'ies')]).map((w) => w.replace('_', '[ _]'));
    const bare = new RegExp(`\\{(?:[a-f]|number|result|value)\\}(?: more| small| extra| equal)? (?:${words.join('|')})\\b`);
    expect(ALL_TEMPLATES.filter(({ text }) => bare.test(text)).map(({ where, text }) => `${where}: ${text}`)).toEqual([]);
  });

  it('puts {a} before {b} in every compare story, so "<" still means a < b', () => {
    const found = ALL_TEMPLATES.filter(({ where, text }) => /COMPARE/.test(where) && text.includes('{a}') && text.includes('{b}'))
      .filter(({ text }) => text.indexOf('{a}') > text.indexOf('{b}'))
      .map(({ where, text }) => `${where}: ${text}`);
    expect(found).toEqual([]);
  });

  it('uses each ending pool only in the skills it answers', () => {
    const owner: Record<string, RegExp> = {
      question_total: /(^|-)ADD-/,
      question_remaining: /(^|-)SUB-/,
      question_product: /^MULT-/,
      question_each: /^DIV-/,
    };
    const found = ALL_TEMPLATES.flatMap(({ where, text }) =>
      Object.entries(owner)
        .filter(([slot, skills]) => text.includes(`{${slot}}`) && !skills.test(where.split(' ')[0] as string))
        .map(([slot]) => `${where} uses {${slot}}: ${text}`),
    );
    expect(found).toEqual([]);
  });

  it('subtracts in the potion SUB-FROM-10 and SUB-WITHIN-5 stories', () => {
    const totals = /How many in all\?|How many altogether\?|What is the total\?|What is the sum\?|How many are there now\?| and \d+ more\b/;
    for (const r of [
      { skill: 'SUB-FROM-10', op: 'subtraction', ops: [10, 7] },
      { skill: 'SUB-WITHIN-5', op: 'subtraction', ops: [4, 1] },
    ]) {
      let reworded = 0;
      for (let seed = 0; seed < 60; seed++) {
        const text = render(r, 'potion', seed, 'beginner') as string;
        expect(text, r.skill).not.toMatch(totals);
        if (/ (is|are) used for a potion\. /.test(text)) reworded++;
      }
      expect(reworded, `${r.skill} reaches its subtraction story`).toBeGreaterThan(0);
    }
  });

  it('asks for the ratio in simplest form in every RATIO-BASIC story', () => {
    // 23 of the 54 stored answers are simplified ("10:10" is a wrong choice, "1:1" the answer).
    const r = { skill: 'RATIO-BASIC', op: 'ratio', ops: [2, 8] };
    for (const theme of themes) {
      for (const difficulty of ['beginner', 'intermediate', 'advanced'] as const) {
        for (let seed = 0; seed < 20; seed++) {
          const text = render(r, theme, seed, difficulty);
          if (text !== undefined) expect(text, `${theme} ${difficulty}`).toMatch(/simplest form/);
        }
      }
    }
  });
});
