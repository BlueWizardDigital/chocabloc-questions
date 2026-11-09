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

export interface Drawn {
  fact: HelpFact;
  /** Every utterance the voice was given for this step. */
  spoken: string[];
  /**
   * The exact "Way 1 of 4: name" line this step should show. Its numbers count strategies, so one can
   * match the unknown by chance (8 ÷ 2 has 4 ways); only that exact text is excused, nothing else.
   */
  way?: string;
  /** The picture the step asks for: then the printed labels must be exactly its running totals. */
  picture?: HelpPicture | null;
}

/** Everything wrong with what the element shows and says right now; empty when it is clean. */
export function drawnProblems(host: HTMLElement, d: Drawn): string[] {
  const unknown = unknownOf(d.fact);
  const shown = visibleOf(d.fact);
  const hidden = (n: number): boolean => n === unknown && !shown.includes(n);
  const problems: string[] = [];

  const visit = (node: Node, role: string | null): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      for (const n of numbersIn(text)) {
        if (role === null) problems.push(`no-role: ${n} in "${text}"`);
        if (role === 'given' && !shown.includes(n)) problems.push(`given-not-shown: ${n}`);
        if (n === unknown && !(role === 'given' && shown.includes(n)))
          problems.push(`shows-unknown: ${n} with role ${role} in "${text}"`);
      }
      return;
    }
    let inner = role;
    if (node instanceof Element) {
      if (node.tagName === 'STYLE') return;
      const isWay = node.getAttribute('part')?.split(' ').includes('way');
      if (isWay && d.way !== undefined && node.textContent === d.way) return;
      for (const name of ATTRIBUTES) {
        for (const n of numbersIn(node.getAttribute(name) ?? '')) {
          if (hidden(n)) problems.push(`attribute-shows-unknown: ${name}="${node.getAttribute(name)}"`);
        }
      }
      const own = node.getAttribute('data-help-role');
      if (own !== null) {
        if (!ROLES.includes(own)) problems.push(`bad-role: ${own}`);
        inner = own;
      }
      if (node.shadowRoot) visit(node.shadowRoot, inner);
    }
    node.childNodes.forEach((c) => visit(c, inner));
  };
  visit(host, null);

  for (const text of d.spoken) {
    for (const n of numbersIn(text)) {
      if (hidden(n)) problems.push(`spoken-shows-unknown: "${text}"`);
    }
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
