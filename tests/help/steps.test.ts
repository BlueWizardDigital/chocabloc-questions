import { describe, test, expect } from 'vitest';
import { strategyOrder, buildSteps } from '../../src/help/strategies';
import { STRATEGIES } from '../../src/help/catalog';
import type { HelpFact, HelpStep, SolvedFact, StrategyId } from '../../src/help/types';
import en from '../../src/help/messages/en.json';
import { interpolate, lookup } from '../../src/lesson/messages';
import { leakCheckStep } from './leak-check';

const mult = (a: number | null, b: number | null, c: number | null): HelpFact => ({
  op: 'mult',
  a,
  b,
  c,
});
const div = (a: number | null, b: number | null, c: number | null): HelpFact => ({
  op: 'div',
  a,
  b,
  c,
});

const MULT_IDS: StrategyId[] = [
  'mult.groups',
  'mult.skip-count',
  'mult.known-fact',
  'mult.nearby-fact',
];
const DIV_IDS: StrategyId[] = ['div.share', 'div.groups', 'div.think-mult', 'div.array'];
const ALL_IDS = STRATEGIES.map((s) => s.id);
const FROM_GRADE = new Map(STRATEGIES.map((s) => [s.id, s.fromGrade]));
const opts = (
  grade: number | null = null,
  solved: SolvedFact[] = [],
  pick: StrategyId | null = null,
) => ({
  grade,
  pick,
  solved,
});

/** Every fact with factors 0..max: both ops, the unknown in each position. */
function allFacts(max: number): HelpFact[] {
  const out: HelpFact[] = [];
  for (let x = 0; x <= max; x++) {
    for (let y = 0; y <= max; y++) {
      const p = x * y;
      out.push(mult(x, y, null), mult(null, y, p), mult(x, null, p));
      out.push(div(p, y, null), div(p, null, x), div(null, y, x));
    }
  }
  return out;
}

/** Solved cells around a product fact: the neighbours, the diagonals, the fact itself and its turnaround. */
function around(f: HelpFact): SolvedFact[] {
  if (f.op !== 'mult' || f.c !== null || f.a === null || f.b === null) return [];
  const out: SolvedFact[] = [{ a: f.b, b: f.a }];
  for (let da = -1; da <= 1; da++) {
    for (let db = -1; db <= 1; db++) out.push({ a: f.a + da, b: f.b + db });
  }
  return out;
}

function render(step: HelpStep): string {
  const template = lookup(en, step.say.key);
  if (typeof template !== 'string') throw new Error(`no en message for ${step.say.key}`);
  return interpolate(template, step.say.params);
}
const wordCount = (s: string) => s.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
const label = (f: HelpFact) => `${f.op} a=${f.a} b=${f.b} c=${f.c}`;

/** All the neighbours, then only the larger ones (so the nearby fact also takes a group away). */
function solvedSets(f: HelpFact): SolvedFact[][] {
  const all = around(f);
  if (all.length === 0) return [[]];
  return [all, all.filter((n) => n.a >= (f.a as number) && n.b >= (f.b as number))];
}

/** Every step of every offered strategy, for every fact with factors 0–15. */
const SWEEP: { fact: HelpFact; id: StrategyId; steps: HelpStep[] }[] = [];
for (const fact of allFacts(15)) {
  for (const solved of solvedSets(fact)) {
    for (const id of strategyOrder(fact, opts(null, solved))) {
      SWEEP.push({ fact, id, steps: buildSteps(id, fact, opts(null, solved)) ?? [] });
    }
  }
}

describe('strategyOrder', () => {
  test('grade 3 gets only from-grade-0 strategies; null grade gets all', () => {
    const f = mult(7, 8, null);
    const solved = [{ a: 7, b: 7 }];
    expect(strategyOrder(f, opts(3, solved))).toEqual(['mult.groups', 'mult.skip-count']);
    expect(strategyOrder(f, opts(0, solved))).toEqual(['mult.groups', 'mult.skip-count']);
    expect(strategyOrder(f, opts(4, solved))).toEqual(MULT_IDS);
    expect(strategyOrder(f, opts(null, solved))).toEqual(MULT_IDS);
    const d = div(24, 4, null);
    expect(strategyOrder(d, opts(3))).toEqual(['div.share', 'div.groups']);
    expect(strategyOrder(d, opts(null))).toEqual(DIV_IDS);
    // buildSteps refuses a strategy above the grade too.
    expect(buildSteps('mult.known-fact', f, opts(3, solved))).toBeNull();
    expect(buildSteps('div.array', d, opts(2))).toBeNull();
  });

  test('pick goes first', () => {
    expect(strategyOrder(mult(7, 8, null), opts(null, [], 'mult.known-fact'))).toEqual([
      'mult.known-fact',
      'mult.groups',
      'mult.skip-count',
    ]);
    expect(strategyOrder(div(24, 4, null), opts(5, [], 'div.array'))).toEqual([
      'div.array',
      'div.share',
      'div.groups',
      'div.think-mult',
    ]);
  });

  test("a pick above the kid's grade is ignored", () => {
    expect(strategyOrder(mult(7, 8, null), opts(2, [], 'mult.known-fact'))).toEqual([
      'mult.groups',
      'mult.skip-count',
    ]);
    expect(strategyOrder(div(24, 4, null), opts(3, [], 'div.think-mult'))).toEqual([
      'div.share',
      'div.groups',
    ]);
    // So is a pick from the other family, or one that doesn't apply to this fact.
    expect(strategyOrder(mult(7, 8, null), opts(null, [], 'div.share'))).toEqual(
      MULT_IDS.slice(0, 3),
    );
    expect(strategyOrder(mult(7, 8, null), opts(null, [], 'mult.nearby-fact'))).toEqual(
      MULT_IDS.slice(0, 3),
    );
  });

  test('nearby-fact skipped with no usable solved fact', () => {
    const f = mult(7, 8, null);
    const unusable: SolvedFact[][] = [
      [],
      [{ a: 7, b: 8 }], // the asked fact
      [{ a: 8, b: 7 }], // its turnaround: same product
      [{ a: 5, b: 8 }], // two groups away
      [{ a: 6, b: 7 }], // both factors differ
      [{ a: 7.5, b: 8 }],
      [{ a: 16, b: 8 }],
      [{ a: -1, b: 8 }],
    ];
    for (const solved of unusable) {
      expect(strategyOrder(f, opts(null, solved))).not.toContain('mult.nearby-fact');
      expect(buildSteps('mult.nearby-fact', f, opts(null, solved))).toBeNull();
    }
    // Never a zero-width piece: 0 × 8 is one group from 1 × 8 but is not used.
    expect(
      buildSteps('mult.nearby-fact', mult(1, 8, null), opts(null, [{ a: 0, b: 8 }])),
    ).toBeNull();
    // Division facts never get it.
    expect(
      buildSteps('mult.nearby-fact', div(24, 4, null), opts(null, [{ a: 5, b: 4 }])),
    ).toBeNull();

    const steps = buildSteps(
      'mult.nearby-fact',
      f,
      opts(null, [
        { a: 8, b: 7 },
        { a: 7, b: 7 },
      ]),
    );
    expect(steps?.[0]?.say.params).toMatchObject({
      anchorA: 7,
      anchorB: 7,
      anchorProduct: 49,
      givenEach: 7,
    });
    expect(steps?.[0]?.points).toEqual([{ a: 7, b: 7 }]);
    const fewer = buildSteps('mult.nearby-fact', f, opts(null, [{ a: 8, b: 8 }]));
    expect(fewer?.[0]?.say.key).toBe('mult.nearby-fact.fewer');
    expect(fewer?.[0]?.say.params).toMatchObject({ anchorProduct: 64, givenEach: 8 });
  });

  test('every fact with factors 1–15 gets both from-grade-0 strategies (except an unknown dividend)', () => {
    for (let x = 1; x <= 15; x++) {
      for (let y = 1; y <= 15; y++) {
        const p = x * y;
        for (const f of [
          mult(x, y, null),
          mult(null, y, p),
          mult(x, null, p),
          div(p, y, null),
          div(p, null, x),
        ]) {
          expect(strategyOrder(f, opts(2)).length, label(f)).toBe(2);
          // Every strategy applies at grade 4 and up (the nearby fact needs a solved neighbour).
          expect(strategyOrder(f, opts(null)), label(f)).toEqual(
            f.c === null && f.op === 'mult' ? MULT_IDS.slice(0, 3) : DIV_IDS,
          );
        }
        expect(strategyOrder(div(null, y, x), opts(null)), 'unknown dividend').toEqual([]);
      }
    }
  });
});

describe('buildSteps: the step rules', () => {
  test('zero facts get no steps', () => {
    const zeros = [
      mult(0, 5, null),
      mult(5, 0, null),
      mult(0, 0, null),
      mult(null, 5, 0),
      mult(5, null, 0),
      mult(null, 0, 0),
      div(0, 5, null),
      div(0, null, 5),
      div(5, 0, null),
      div(0, 0, null),
    ];
    for (const f of zeros) {
      expect(strategyOrder(f, opts(null, around(f))), label(f)).toEqual([]);
      for (const id of ALL_IDS) expect(buildSteps(id, f, opts(null, around(f)))).toBeNull();
    }
  });

  test('bad numbers get no steps', () => {
    const bad: HelpFact[] = [
      mult(16, 2, null),
      mult(7.5, 2, null),
      mult(-3, 2, null),
      mult(null, 5, 24), // not a whole number
      mult(null, 2, 32), // the missing factor would be 16
      mult(7, 8, 56), // nothing hidden
      mult(null, null, 56), // two unknowns
      div(24, 5, null),
      div(240, 16, null),
      div(226, 2, null),
      div(32, 2, null), // quotient 16
      div(24, null, 5),
      div(null, 4, 6), // an unknown dividend is not supported
      { op: 'add', a: 1, b: 2, c: null } as unknown as HelpFact,
      { op: 'mult', a: '7', b: 8, c: null } as unknown as HelpFact,
    ];
    for (const f of bad) {
      expect(strategyOrder(f, opts()), label(f)).toEqual([]);
      for (const id of ALL_IDS) expect(buildSteps(id, f, opts())).toBeNull();
    }
    expect(buildSteps('mult.unknown' as StrategyId, mult(7, 8, null), opts())).toBeNull();
    expect(buildSteps('div.share', mult(7, 8, null), opts())).toBeNull();
  });

  test('7 × 5 never starts from 5 groups', () => {
    const f = mult(7, 5, null);
    for (const id of ['mult.groups', 'mult.skip-count', 'mult.known-fact'] as StrategyId[]) {
      for (const step of buildSteps(id, f, opts()) ?? []) {
        expect(step.say.params.anchorRows, id).not.toBe(5);
        expect(step.points).not.toContainEqual({ a: 5, b: 7 });
      }
    }
    expect(buildSteps('mult.known-fact', f, opts())?.[0]?.say.params).toMatchObject({
      anchorRows: 10,
      givenEach: 5,
      anchorProduct: 50,
    });
  });

  test('9 × 7 starts from 10 × 7 (the spec example), and a factor of 10 starts from 5', () => {
    const nine = buildSteps('mult.known-fact', mult(9, 7, null), opts());
    expect(nine?.[0]?.say).toEqual({
      key: 'mult.known-fact.fewerOne',
      params: { anchorRows: 10, givenEach: 7, anchorProduct: 70, givenRows: 9 },
    });
    for (const f of [mult(10, 7, null), mult(7, 10, null)]) {
      const anchors = (buildSteps('mult.known-fact', f, opts()) ?? []).map(
        (s) => s.say.params.anchorRows,
      );
      expect(anchors.filter((n) => n !== undefined)[0], label(f)).toBe(5);
    }
  });

  test('× 1 is one group', () => {
    for (const [f, n] of [
      [mult(1, 7, null), 7],
      [mult(7, 1, null), 7],
      [mult(1, 1, null), 1],
      [mult(1, 13, null), 13],
    ] as [HelpFact, number][]) {
      for (const id of ['mult.groups', 'mult.skip-count', 'mult.known-fact'] as StrategyId[]) {
        expect(buildSteps(id, f, opts()), `${id} ${label(f)}`).toEqual([
          {
            say: { key: 'mult.one', params: { givenEach: n } },
            picture: { kind: 'rows', rows: 1, perRow: n, counted: 0 },
            points: [],
          },
        ]);
      }
    }
  });

  test('squares never offer turning around', () => {
    for (let n = 1; n <= 15; n++) {
      const f = mult(n, n, null);
      for (const id of strategyOrder(f, opts(null, around(f)))) {
        for (const step of buildSteps(id, f, opts(null, around(f))) ?? []) {
          expect(step.say.key, `${id} ${n}×${n}`).not.toMatch(/turn/i);
        }
      }
    }
    // The check bites: a non-square can turn.
    expect(buildSteps('mult.groups', mult(4, 13, null), opts())?.[0]?.say.key).toMatch(/turn/i);
    expect(buildSteps('mult.skip-count', mult(5, 7, null), opts())?.[0]?.say.key).toMatch(/turn/i);
  });

  test('13 × 4 starts from 10 groups', () => {
    for (const id of ['mult.groups', 'mult.skip-count', 'mult.known-fact'] as StrategyId[]) {
      const steps = buildSteps(id, mult(13, 4, null), opts()) ?? [];
      expect(steps[0]?.say.params, id).toMatchObject({
        anchorRows: 10,
        givenEach: 4,
        anchorProduct: 40,
      });
      expect(steps[0]?.points, id).toEqual([{ a: 10, b: 4 }]);
      // 4 × 13 turns it around first, then starts from 10 groups of 4.
      const turned = buildSteps(id, mult(4, 13, null), opts()) ?? [];
      expect(turned[0]?.say).toEqual({ key: 'mult.turn', params: { givenRows: 13, givenEach: 4 } });
      expect(turned[1]?.say.params, id).toMatchObject({
        anchorRows: 10,
        givenEach: 4,
        anchorProduct: 40,
      });
      expect(turned[1]?.points, id).toEqual([{ a: 4, b: 10 }]);
    }
    expect(buildSteps('mult.groups', mult(13, 4, null), opts())?.[0]?.picture).toEqual({
      kind: 'rows',
      rows: 13,
      perRow: 4,
      counted: 10,
    });
    // 11s and 12s add one or two groups.
    expect(buildSteps('mult.known-fact', mult(11, 6, null), opts())?.[0]?.say.key).toBe(
      'mult.known-fact.moreOne',
    );
    expect(
      buildSteps('mult.known-fact', mult(12, 6, null), opts())?.[0]?.say.params.partialGroups,
    ).toBe(2);
  });

  test('every step has at most 12 words in its en message (8 for grade 3 and below)', () => {
    for (const { fact, id, steps } of SWEEP) {
      const limit = (FROM_GRADE.get(id) ?? 0) === 0 ? 8 : 12;
      for (const step of steps)
        expect(
          wordCount(render(step)),
          `${id} ${label(fact)}: ${render(step)}`,
        ).toBeLessThanOrEqual(limit);
    }
    for (const fact of allFacts(12)) {
      for (const id of strategyOrder(fact, opts(3, around(fact)))) {
        for (const step of buildSteps(id, fact, opts(3, around(fact))) ?? []) {
          expect(wordCount(render(step)), `${id} ${label(fact)}`).toBeLessThanOrEqual(8);
        }
      }
    }
  });

  test('every step has an en message whose placeholders are exactly its params', () => {
    const used = new Set<string>();
    for (const { steps } of SWEEP) {
      for (const step of steps) {
        const template = lookup(en, step.say.key);
        expect(typeof template, step.say.key).toBe('string');
        const holes = new Set([...String(template).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
        expect(holes, step.say.key).toEqual(new Set(Object.keys(step.say.params)));
        used.add(step.say.key);
      }
    }
    // Every message in en.json is reachable.
    const keys: string[] = [];
    const walk = (node: unknown, path: string[]) => {
      if (typeof node === 'string') keys.push(path.join('.'));
      else for (const [k, v] of Object.entries(node as object)) walk(v, [...path, k]);
    };
    walk(en, []);
    expect(new Set(keys)).toEqual(used);
  });
});

describe('answer hiding', () => {
  test('no step reveals the unknown (builder level)', () => {
    let checked = 0;
    for (const { fact, id, steps } of SWEEP) {
      expect(steps.length, `${id} ${label(fact)}`).toBeGreaterThanOrEqual(1);
      expect(steps.length, `${id} ${label(fact)}`).toBeLessThanOrEqual(3);
      for (const [i, step] of steps.entries()) {
        expect(leakCheckStep(step, fact), `${id} step ${i + 1} ${label(fact)}`).toEqual([]);
        checked++;
      }
    }
    // Strategies left out of the order really don't apply.
    for (const fact of allFacts(15)) {
      const order = strategyOrder(fact, opts(null, around(fact)));
      for (const id of ALL_IDS) {
        if (!order.includes(id))
          expect(buildSteps(id, fact, opts(null, around(fact))), `${id} ${label(fact)}`).toBeNull();
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });

  test('leakCheckStep catches deliberate leaks', () => {
    const f = mult(7, 8, null);
    const clean: HelpStep = {
      say: { key: 'x', params: { givenRows: 7, givenEach: 8, partialSum: 48, anchorProduct: 40 } },
      picture: { kind: 'rows', rows: 7, perRow: 8, counted: 6 },
      points: [{ a: 5, b: 8 }],
    };
    expect(leakCheckStep(clean, f)).toEqual([]);
    const say = (params: Record<string, number>) => ({ ...clean, say: { key: 'x', params } });
    // The product as a partial, a fully counted rows picture: the two required controls.
    expect(leakCheckStep(say({ partialSum: 56 }), f)).not.toEqual([]);
    expect(
      leakCheckStep({ ...clean, picture: { kind: 'rows', rows: 7, perRow: 8, counted: 7 } }, f),
    ).not.toEqual([]);
    // And the other roles and pictures.
    expect(leakCheckStep(say({ anchorProduct: 56 }), f)).not.toEqual([]);
    expect(leakCheckStep(say({ givenProduct: 56 }), f)).not.toEqual([]);
    expect(leakCheckStep(say({ total: 3 }), f)).not.toEqual([]);
    expect(leakCheckStep(say({ answer: 3 }), f)).not.toEqual([]);
    expect(leakCheckStep(say({ countRows: 3 }), f)).not.toEqual([]);
    expect(leakCheckStep({ ...clean, points: [{ a: 8, b: 7 }] }, f)).not.toEqual([]);
    const d = div(24, 4, null); // unknown 6
    expect(
      leakCheckStep(
        {
          ...clean,
          say: { key: 'x', params: {} },
          picture: { kind: 'rows', rows: 8, perRow: 3, counted: 2 },
          points: [],
        },
        d,
      ),
    ).not.toEqual([]);
    expect(
      leakCheckStep(
        {
          ...clean,
          say: { key: 'x', params: {} },
          picture: { kind: 'deal', total: 24, rows: 4, dealt: 24 },
          points: [],
        },
        d,
      ),
    ).not.toEqual([]);
    expect(
      leakCheckStep(
        {
          ...clean,
          say: { key: 'x', params: {} },
          picture: { kind: 'deal', total: 30, rows: 5, dealt: 0 },
          points: [],
        },
        d,
      ),
    ).not.toEqual([]);
    expect(
      leakCheckStep(
        {
          ...clean,
          say: { key: 'x', params: {} },
          picture: { kind: 'take', total: 24, size: 4, taken: 6 },
          points: [],
        },
        d,
      ),
    ).not.toEqual([]);
    expect(
      leakCheckStep(
        { ...clean, say: { key: 'x', params: {} }, picture: null, points: [{ a: 6, b: 3 }] },
        d,
      ),
    ).not.toEqual([]);
  });
});

describe('the preview facts (Task 6 builds its preview from these)', () => {
  const rows = (r: number, perRow: number, counted: number) => ({
    kind: 'rows',
    rows: r,
    perRow,
    counted,
  });

  test('7 × 8', () => {
    const f = mult(7, 8, null);
    const o = opts(null, [{ a: 7, b: 7 }]);
    expect(buildSteps('mult.groups', f, o)).toEqual([
      {
        say: { key: 'mult.groups.ask', params: { givenRows: 7, givenEach: 8 } },
        picture: rows(7, 8, 0),
        points: [],
      },
      {
        say: { key: 'mult.groups.row', params: { givenEach: 8 } },
        picture: rows(7, 8, 1),
        points: [],
      },
      {
        say: { key: 'mult.groups.last', params: { partialRows: 6, partialSum: 48 } },
        picture: rows(7, 8, 6),
        points: [],
      },
    ]);
    expect(buildSteps('mult.skip-count', f, o)).toEqual([
      {
        say: { key: 'mult.skip-count.ask', params: { givenEach: 8, givenTimes: 7 } },
        picture: rows(7, 8, 0),
        points: [],
      },
      {
        say: { key: 'mult.skip-count.start', params: { givenEach: 8 } },
        picture: rows(7, 8, 1),
        points: [],
      },
      {
        say: { key: 'mult.skip-count.next', params: { givenEach: 8, partialSecond: 16 } },
        picture: rows(7, 8, 2),
        points: [],
      },
    ]);
    const anchor = { a: 5, b: 8 };
    expect(buildSteps('mult.known-fact', f, o)).toEqual([
      {
        say: {
          key: 'mult.known-fact.more',
          params: {
            anchorRows: 5,
            givenEach: 8,
            anchorProduct: 40,
            givenRows: 7,
            partialGroups: 2,
          },
        },
        picture: null,
        points: [anchor],
      },
      {
        say: {
          key: 'mult.known-fact.on',
          params: { partialGroups: 2, givenEach: 8, anchorProduct: 40 },
        },
        picture: rows(7, 8, 5),
        points: [anchor],
      },
    ]);
    const near = { a: 7, b: 7 };
    expect(buildSteps('mult.nearby-fact', f, o)).toEqual([
      {
        say: {
          key: 'mult.nearby-fact.more',
          params: { anchorA: 7, anchorB: 7, anchorProduct: 49, givenA: 7, givenB: 8, givenEach: 7 },
        },
        picture: null,
        points: [near],
      },
      {
        say: { key: 'mult.nearby-fact.on', params: { anchorProduct: 49, givenEach: 7 } },
        picture: rows(8, 7, 7),
        points: [near],
      },
    ]);
  });

  test('24 ÷ 4', () => {
    const f = div(24, 4, null);
    const o = opts(null);
    const given = { givenDividend: 24, givenDivisor: 4 };
    expect(buildSteps('div.share', f, o)).toEqual([
      {
        say: { key: 'div.share.ask', params: given },
        picture: { kind: 'deal', total: 24, rows: 4, dealt: 0 },
        points: [],
      },
      {
        say: { key: 'div.share.deal', params: {} },
        picture: { kind: 'deal', total: 24, rows: 4, dealt: 4 },
        points: [],
      },
      {
        say: { key: 'div.share.more', params: { partialEach: 2 } },
        picture: { kind: 'deal', total: 24, rows: 4, dealt: 8 },
        points: [],
      },
    ]);
    expect(buildSteps('div.groups', f, o)).toEqual([
      {
        say: { key: 'div.groups.ask', params: given },
        picture: { kind: 'take', total: 24, size: 4, taken: 0 },
        points: [],
      },
      {
        say: { key: 'div.groups.take', params: { givenDivisor: 4 } },
        picture: { kind: 'take', total: 24, size: 4, taken: 1 },
        points: [],
      },
      {
        say: { key: 'div.groups.more', params: { givenDivisor: 4 } },
        picture: { kind: 'take', total: 24, size: 4, taken: 2 },
        points: [],
      },
    ]);
    const anchor = { a: 5, b: 4 };
    expect(buildSteps('div.think-mult', f, o)).toEqual([
      { say: { key: 'div.think-mult.ask', params: given }, picture: null, points: [] },
      {
        say: { key: 'div.think-mult.more', params: { anchorRows: 5, anchorProduct: 20, ...given } },
        picture: null,
        points: [anchor],
      },
      {
        say: { key: 'div.think-mult.on', params: { anchorProduct: 20, ...given } },
        picture: rows(6, 4, 5),
        points: [anchor],
      },
    ]);
    expect(buildSteps('div.array', f, o)).toEqual([
      { say: { key: 'div.array.ask', params: given }, picture: rows(6, 4, 0), points: [] },
      { say: { key: 'div.array.count', params: given }, picture: rows(6, 4, 1), points: [] },
      {
        say: { key: 'div.array.more', params: { partialSum: 8, givenDividend: 24 } },
        picture: rows(6, 4, 2),
        points: [],
      },
    ]);
  });

  test('array counts on from 10 rows unless a running total would name the unknown', () => {
    expect(buildSteps('div.array', div(52, 4, null), opts())?.[1]?.say.key).toBe('div.array.ten');
    // 2 × ? = 24: row 6 of 10 counted rows would read 12, the unknown.
    const steps = buildSteps('div.array', mult(2, null, 24), opts());
    expect(steps?.map((s) => s.say.key)).toEqual([
      'div.array.ask',
      'div.array.count',
      'div.array.more',
    ]);
  });

  test('Cocoa Lab Divide (a missing factor) points in the grid orientation', () => {
    expect(buildSteps('div.think-mult', mult(4, null, 24), opts())?.[1]?.points).toEqual([
      { a: 4, b: 5 },
    ]);
    expect(buildSteps('div.think-mult', mult(null, 4, 24), opts())?.[1]?.points).toEqual([
      { a: 5, b: 4 },
    ]);
  });
});
