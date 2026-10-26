import { CSS as ROWS_CSS } from '../../src/lesson/dom/counted-rows';
import { CSS as PICTURES_CSS } from '../../src/lesson/dom/more-pictures';
import { CSS as YOUNG_CSS } from '../../src/lesson/dom/young';

// Both lazy chunks add their stylesheet to the same shadow root, so a class one styles must never
// be a class the other draws with (the young chunk's `.grp` once stacked a share row's dots).

/** Each selector of each rule, @media blocks included. */
const selectors = (css: string): string[] =>
  [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((m) => m[1]!.split(',').map((s) => s.trim()));

const classes = (css: string): Set<string> => new Set(selectors(css).flatMap((s) => s.match(/\.[\w-]+/g) ?? []));

/** A chunk's own rules, without the counted rows both chunks may carry. */
const own = (css: string): string => css.replace(ROWS_CSS, '');

describe("the pictures chunk's stylesheet", () => {
  test('starts every rule at a picture root, .crows or .share', () => {
    const all = selectors(PICTURES_CSS);
    expect(all.length).toBeGreaterThan(20);
    for (const s of all) expect(s).toMatch(/^(\.step\.enter )?\.(crows|share)\b/);
  });

  test("shares no class with the young chunk's own rules", () => {
    const ours = new Set([...classes(own(PICTURES_CSS)), ...classes(ROWS_CSS)]);
    const shared = [...classes(own(YOUNG_CSS))].filter((c) => ours.has(c) && c !== '.step' && c !== '.enter');
    expect(shared).toEqual([]);
  });
});
