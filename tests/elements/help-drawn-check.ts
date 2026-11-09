// The drawn-output oracle for <chocabloc-help>. Not a test file itself (wtr runs *.browser.test.ts
// only). It reads what a kid can see or hear, and checks each number by its role: help may repeat a
// number the question shows, and never newly shows the unknown (spec, "What help may show").
// tests/help/leak-check.ts is the same rule at the builder level; the unknown comes from there.
// Each problem is "<code>: <detail>", so a control can assert which check fired.
import type { HelpFact, HelpPicture } from '../../src/help/types';
import { unknownOf, visibleOf } from '../help/leak-check';

const ROLES = ['given', 'anchor', 'partial'];
const ATTRIBUTES = ['aria-label', 'alt', 'title'];
const numbersIn = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number);
/** The words as the voice should say them: the same words, with the symbols read out. */
const voiced = (words: string): string =>
  words
    .replace(/×/g, ' times ')
    .replace(/=/g, ' is equal to ')
    .replace(/\s+/g, ' ')
    .trim();

export interface Drawn {
  fact: HelpFact;
  /** The utterances to check. Each must be this step's words, so leave out an earlier step's. */
  spoken: string[];
  /**
   * The exact "Way 1 of 4: name" line this step should show. It is a position count, not a math number
   * (Ruling 25), so one can match the unknown by chance (8 ÷ 2 has 4 ways). Only that exact text is
   * excused: the line's attributes, children and shadow root are checked like anything else.
   */
  way?: string;
  /** The picture the step asks for: then the printed labels must be exactly its running totals. */
  picture?: HelpPicture | null;
}

/** Everything wrong with what the element shows and says right now; empty when it is clean. */
export function drawnProblems(host: HTMLElement, d: Drawn): string[] {
  const unknown = unknownOf(d.fact);
  const shown = visibleOf(d.fact);
  const problems: string[] = [];

  /** The role rule, for text and attributes alike. `prefix` says which one a problem came from. */
  const read = (text: string, role: string | null, prefix: string): void => {
    for (const n of numbersIn(text)) {
      if (role === null) problems.push(`${prefix}no-role: ${n} in "${text}"`);
      if (role === 'given' && !shown.includes(n)) problems.push(`${prefix}given-not-shown: ${n}`);
      if (n === unknown && !(role === 'given' && shown.includes(n)))
        problems.push(`${prefix}shows-unknown: ${n} with role ${role} in "${text}"`);
    }
  };

  const visit = (node: Node, role: string | null): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      read(node.textContent ?? '', role, '');
      return;
    }
    let inner = role;
    let wayText = false;
    if (node instanceof Element) {
      if (node.tagName === 'STYLE') return;
      const own = node.getAttribute('data-help-role');
      if (own !== null) {
        if (!ROLES.includes(own)) problems.push(`bad-role: ${own}`);
        inner = own;
      }
      for (const name of ATTRIBUTES) read(node.getAttribute(name) ?? '', inner, 'attribute-');
      if (node.shadowRoot) visit(node.shadowRoot, inner);
      const isWay = node.getAttribute('part')?.split(' ').includes('way');
      wayText = isWay === true && d.way !== undefined && node.textContent === d.way;
    }
    node.childNodes.forEach((c) => {
      if (!(wayText && c.nodeType === Node.TEXT_NODE)) visit(c, inner);
    });
  };
  visit(host, null);

  // Saying the words on screen, and nothing else, is stricter than matching their numbers: on 1 × 6
  // "The answer is 6." has the same numbers as "One group of 6.", and it gives the answer away.
  // shortcut: a wrapped panel's voice adds "Let's look at this one again.", which this would flag; the sweep stops before a wrap, revisit if it goes past one.
  const words = host.shadowRoot?.querySelector('[part~="text"]')?.textContent ?? '';
  for (const said of d.spoken) {
    if (said !== voiced(words)) problems.push(`spoken-differs: said "${said}", the words are "${words}"`);
  }

  const picture = host.shadowRoot?.querySelector('[part~="picture"]');
  if (picture) {
    const lines = Array.from(picture.querySelectorAll('.cline'));
    const last = lines[lines.length - 1];
    if (last?.querySelector('[data-help-role="given"]')) problems.push('given-on-last-row: a given label on the last row');
    if (last && numbersIn(last.textContent ?? '').length > 0) problems.push(`last-row-labelled: "${last.textContent}"`);
    if (d.picture !== undefined) {
      const labels = Array.from(picture.querySelectorAll('[data-help-role]')).map((e) => e.textContent);
      const pic = d.picture;
      const want = pic?.kind === 'rows' ? Array.from({ length: pic.counted }, (_, k) => String((k + 1) * pic.perRow)) : [];
      if (labels.join() !== want.join()) problems.push(`wrong-labels: [${labels.join()}], want [${want.join()}]`);
    }
  }
  return problems;
}

/** The problems' codes, in order. */
export const codes = (problems: string[]): string[] => problems.map((p) => p.split(':')[0] as string);
