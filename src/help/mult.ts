// Multiplication step builders. Each returns candidate step lists, best first;
// strategies.ts keeps the first one that passes stepIsSafe.
import { isFactor, rows, step, type Product } from './fact';
import type { HelpStep, SolvedFact } from './types';

/** g groups of s, as help says it. `turned` when help reads the fact as b × a. */
interface View {
  g: number;
  s: number;
  turned: boolean;
}

/** Numbers easy to count by, so 5 × 7 counts 5s. */
const EASY = new Set([2, 5, 10]);

/** A factor of 11 or more counts the groups, so help can start from 10 groups (4 × 13 turns around). */
const view = (p: Product): View =>
  p.a <= 10 && p.b >= 11 ? { g: p.b, s: p.a, turned: true } : { g: p.a, s: p.b, turned: false };

/** `groups` groups of the view's size, in the question's own a × b order (for grid highlights). */
const at = (v: View, groups: number): SolvedFact =>
  v.turned ? { a: v.s, b: groups } : { a: groups, b: v.s };

const turnStep = (v: View): HelpStep[] =>
  v.turned ? [step('mult.turn', { givenRows: v.g, givenEach: v.s }, rows(v.g, v.s, 0))] : [];

/** × 1 has no answer-free anchor: every strategy shows the one group. */
function oneGroup(p: Product): HelpStep[][] | null {
  if (p.a !== 1 && p.b !== 1) return null;
  const n = p.a === 1 ? p.b : p.a;
  return [[step('mult.one', { givenEach: n }, rows(1, n, 0))]];
}

/** 11–15 groups: 10 groups first, then the rest. `ten` and `rest` are the strategy's own messages. */
function fromTen(v: View, ten: string, rest: (more: number) => HelpStep): HelpStep[] {
  return [
    ...turnStep(v),
    step(ten, { anchorRows: 10, givenEach: v.s, anchorProduct: 10 * v.s }, rows(v.g, v.s, 10), [
      at(v, 10),
    ]),
    rest(v.g - 10),
  ];
}

export function groups(p: Product): HelpStep[][] {
  const one = oneGroup(p);
  if (one) return one;
  const v = view(p);
  const { g, s } = v;
  if (g >= 11) {
    return [
      fromTen(v, 'mult.groups.ten', (more) =>
        more === 1
          ? step('mult.groups.addOne', { givenEach: s }, rows(g, s, 10))
          : step('mult.groups.add', { partialMore: more, givenEach: s }, rows(g, s, 10)),
      ),
    ];
  }
  const out = [
    step('mult.groups.ask', { givenRows: g, givenEach: s }, rows(g, s, 0)),
    step('mult.groups.row', { givenEach: s }, rows(g, s, 1)),
  ];
  if (g >= 3)
    out.push(
      step('mult.groups.last', { partialRows: g - 1, partialSum: (g - 1) * s }, rows(g, s, g - 1)),
    );
  return [out];
}

export function skipCount(p: Product): HelpStep[][] {
  const one = oneGroup(p);
  if (one) return one;
  const v = view(p);
  if (v.g >= 11) {
    const { g, s } = v;
    return [
      fromTen(v, 'mult.skip-count.ten', (more) =>
        more === 1
          ? step('mult.skip-count.onOne', { givenEach: s }, rows(g, s, 10))
          : step('mult.skip-count.on', { partialMore: more, givenEach: s }, rows(g, s, 10)),
      ),
    ];
  }
  const easyTurn = EASY.has(p.a) && !EASY.has(p.b);
  const g = easyTurn ? p.b : p.a;
  const s = easyTurn ? p.a : p.b;
  const out = [
    step(
      easyTurn ? 'mult.skip-count.askTurn' : 'mult.skip-count.ask',
      { givenEach: s, givenTimes: g },
      rows(g, s, 0),
    ),
    step('mult.skip-count.start', { givenEach: s }, rows(g, s, 1)),
  ];
  if (g >= 3)
    out.push(step('mult.skip-count.next', { givenEach: s, partialSecond: 2 * s }, rows(g, s, 2)));
  return [out];
}

function knownSteps(v: View, anchorRows: number): HelpStep[] {
  const { g, s } = v;
  const groupsApart = Math.abs(g - anchorRows);
  const anchorProduct = anchorRows * s;
  const add = anchorRows < g;
  const one = groupsApart === 1 ? 'One' : '';
  const apart = groupsApart === 1 ? {} : { partialGroups: groupsApart };
  const pt = [at(v, anchorRows)];
  return [
    ...turnStep(v),
    step(
      `mult.known-fact.${add ? 'more' : 'fewer'}${one}`,
      { anchorRows, givenEach: s, anchorProduct, givenRows: g, ...apart },
      null,
      pt,
    ),
    step(
      `mult.known-fact.${add ? 'on' : 'back'}${one}`,
      { ...apart, givenEach: s, anchorProduct },
      add ? rows(g, s, anchorRows) : null,
      pt,
    ),
  ];
}

/**
 * Start from 5 or 10 groups, then add or take away groups. Never the asked fact or its
 * turnaround; prefer an anchor that isn't one of the fact's own factors (7 × 5 starts from
 * 10 × 5, not 5 × 5; 10 × 7 from 5 × 10), then the nearest, then not turning, then adding.
 */
export function knownFact(p: Product): HelpStep[][] {
  const one = oneGroup(p);
  if (one) return one;
  const base = view(p);
  if (base.g >= 11) return [knownSteps(base, 10)];
  const views: View[] = [{ g: p.a, s: p.b, turned: false }];
  if (p.a !== p.b) views.push({ g: p.b, s: p.a, turned: true });
  const ranked: { v: View; anchor: number; rank: number[] }[] = [];
  for (const v of views) {
    for (const anchor of [5, 10]) {
      const apart = Math.abs(v.g - anchor);
      if (anchor === v.g || apart > 5) continue;
      const ownFactor = anchor === p.a || anchor === p.b ? 1 : 0;
      ranked.push({
        v,
        anchor,
        rank: [apart > 3 ? 1 : 0, ownFactor, apart, v.turned ? 1 : 0, anchor > v.g ? 1 : 0],
      });
    }
  }
  const before = (x: number[], y: number[]) => {
    const i = x.findIndex((n, k) => n !== y[k]);
    return i < 0 ? 0 : (x[i] as number) - (y[i] as number);
  };
  return ranked.sort((x, y) => before(x.rank, y.rank)).map((r) => knownSteps(r.v, r.anchor));
}

/** A solved fact one group away (never the asked fact or its turnaround, never a zero). */
export function nearbyFact(p: Product, solved: readonly unknown[]): HelpStep[][] {
  const found: { add: boolean; steps: HelpStep[] }[] = [];
  for (const n of solved) {
    if (n === null || typeof n !== 'object') continue;
    const { a, b } = n as { a?: unknown; b?: unknown };
    if (!isFactor(a) || !isFactor(b)) continue;
    const sameA = a === p.a && Math.abs(b - p.b) === 1;
    const sameB = b === p.b && Math.abs(a - p.a) === 1;
    if (!sameA && !sameB) continue;
    // Moving b by one changes the fact by one group of a, and the other way round.
    const each = sameA ? p.a : p.b;
    const r = sameA ? p.b : p.a;
    const add = sameA ? b < p.b : a < p.a;
    const anchorProduct = a * b;
    const pt = [{ a, b }];
    found.push({
      add,
      steps: [
        step(
          `mult.nearby-fact.${add ? 'more' : 'fewer'}`,
          { anchorA: a, anchorB: b, anchorProduct, givenA: p.a, givenB: p.b, givenEach: each },
          null,
          pt,
        ),
        step(
          `mult.nearby-fact.${add ? 'on' : 'back'}`,
          { anchorProduct, givenEach: each },
          add ? rows(r, each, r - 1) : null,
          pt,
        ),
      ],
    });
  }
  // Adding on is easier than taking away; otherwise keep the game's order.
  return [...found.filter((f) => f.add), ...found.filter((f) => !f.add)].map((f) => f.steps);
}
