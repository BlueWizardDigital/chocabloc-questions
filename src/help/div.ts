// Division step builders. Each returns candidate step lists, best first;
// strategies.ts keeps the first one that passes stepIsSafe. The quotient is the unknown,
// so it may shape the steps (how many rounds to deal) but never appears in them.
import { rows, safeCounted, step, type Quotient } from './fact';
import type { HelpPicture, HelpStep, SolvedFact } from './types';

const given = (p: Quotient) => ({ givenDividend: p.dividend, givenDivisor: p.divisor });
const deal = (p: Quotient, dealt: number): HelpPicture => ({
  kind: 'deal',
  total: p.dividend,
  rows: p.divisor,
  dealt,
});
const take = (p: Quotient, taken: number): HelpPicture => ({
  kind: 'take',
  total: p.dividend,
  size: p.divisor,
  taken,
});

/** A fact on the times grid, written the way the question is: d × ? keeps d on the a side. */
const onGrid = (p: Quotient, groups: number): SolvedFact =>
  p.hidden === 'b' ? { a: p.divisor, b: groups } : { a: groups, b: p.divisor };

/** Deal one to each row per step; the count per row is the kid's. 11 or more each: 10 first. */
export function share(p: Quotient): HelpStep[][] {
  const { divisor: d, unknown: q } = p;
  if (d === 1) return [[step('div.share.one', { givenDividend: p.dividend }, deal(p, 0))]];
  const out = [step('div.share.ask', given(p), deal(p, 0))];
  if (q >= 11) {
    out.push(step('div.share.ten', { anchorEach: 10 }, deal(p, 10 * d)));
  } else {
    if (q >= 2) out.push(step('div.share.deal', {}, deal(p, d)));
    if (q >= 3) out.push(step('div.share.more', { partialEach: 2 }, deal(p, 2 * d)));
  }
  return [out];
}

/** Take out one group per step; the number of groups is the kid's. */
export function groups(p: Quotient): HelpStep[][] {
  const { divisor: d, unknown: q } = p;
  const out = [step('div.groups.ask', given(p), take(p, 0))];
  if (q >= 11) {
    out.push(step('div.groups.ten', { anchorGroups: 10, givenDivisor: d }, take(p, 10)));
  } else {
    if (q >= 2) out.push(step('div.groups.take', { givenDivisor: d }, take(p, 1)));
    if (q >= 3) out.push(step('div.groups.more', { givenDivisor: d }, take(p, 2)));
  }
  return [out];
}

/** ? × d = D, then start from 5 or 10 groups of d (never the unknown itself). */
export function thinkMult(p: Quotient): HelpStep[][] {
  const { divisor: d, unknown: q } = p;
  const ask = step('div.think-mult.ask', given(p));
  const anchors = [5, 10]
    .filter((n) => n !== q && Math.abs(n - q) <= 5)
    .sort((x, y) => Math.abs(x - q) - Math.abs(y - q));
  const withAnchor = anchors.map((anchorRows) => {
    const add = anchorRows < q;
    const params = { anchorProduct: anchorRows * d, ...given(p) };
    const pt = [onGrid(p, anchorRows)];
    // The rows picture shows the anchor's totals only when none of them is the unknown.
    const picture =
      add && safeCounted(q, d, q, anchorRows) === anchorRows ? rows(q, d, anchorRows) : null;
    return [
      ask,
      step(`div.think-mult.${add ? 'more' : 'fewer'}`, { anchorRows, ...params }, null, pt),
      step(`div.think-mult.${add ? 'on' : 'back'}`, params, picture, pt),
    ];
  });
  return [...withAnchor, [ask]];
}

/** D dots in rows of d; counted rows with running totals, and the number of rows is the kid's. */
export function array(p: Quotient): HelpStep[][] {
  const { divisor: d, unknown: q } = p;
  const ask = step('div.array.ask', given(p), rows(q, d, 0));
  const counting = [ask];
  const first = safeCounted(q, d, q, 1);
  counting.push(step('div.array.count', given(p), rows(q, d, first)));
  const second = safeCounted(q, d, q, 2);
  if (second > first) {
    counting.push(
      step(
        'div.array.more',
        { partialSum: second * d, givenDividend: p.dividend },
        rows(q, d, second),
      ),
    );
  }
  if (q < 11) return [counting];
  // 11 rows or more: 10 rows first, unless one of their totals is the unknown (2 × ? = 24 reads 12 on row 6).
  return [
    [ask, step('div.array.ten', { anchorRows: 10, anchorProduct: 10 * d }, rows(q, d, 10))],
    counting,
  ];
}
