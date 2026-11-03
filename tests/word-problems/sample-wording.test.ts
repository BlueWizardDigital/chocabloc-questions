import { describe, it, expect } from 'vitest';
import { sampleTemplates, sampleContext } from '../../src/word-problems/sample-data';
import { createWordProblemEngine } from '../../src/word-problems/engine';

// Trello 450: wording the math tester robot found in Adventure 101. Each row is a skill that
// produced a reported sentence, with the operation its bank rows carry (verb pools need it).
// Every theme, difficulty and many seeds are rendered, so a template or pool edit that brings
// a reported sentence back fails here.
const ROWS = [
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

const DEFECTS: Array<[string, RegExp]> = [
  ['1 "What is the product?"', /What is the product\?/],
  ['2 an "each" ending naming something never set up', /How much for each explorer|What does each one receive|How many per /],
  ['3 "arrived at" with no article', /arrived at (?!the )/],
  ['4 "stampede"', /stampede/],
  ['5 a decimal counting whole objects', /\d\.\d+ (?!(kg|g|L)\b)[a-z]/],
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
];

const engine = createWordProblemEngine({ templates: sampleTemplates, context: sampleContext });
const themes = Object.keys(sampleContext.themes ?? {});

function render(r: (typeof ROWS)[number], theme: string, seed: number, difficulty?: 'beginner' | 'intermediate' | 'advanced') {
  const row = { id: `${r.skill}-${seed}`, skill_ids: [r.skill], content: { operands: r.ops, operation: r.op } };
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
    // Every story-specific ending that can render was reached. (The batch and portion stories are
    // potion-only and use {item}, which potion has none of, so they never render.)
    for (const k of ['pile', 'group', 'apprentice', 'shipment', 'display', 'go in each {container}']) {
      expect([...kinds], k).toContain(k);
    }
  });
});
