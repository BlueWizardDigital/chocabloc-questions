import type { HelpFact, HelpFamily, StrategyId } from './types';

/**
 * The strategy list, in the order help offers it. The server keeps a copy in
 * server-new config/help-strategies.json; tests/fixtures/help-catalog.json pins this one.
 */
export const STRATEGIES: readonly { id: StrategyId; family: HelpFamily; fromGrade: number }[] = [
  { id: 'mult.groups', family: 'mult-facts', fromGrade: 0 },
  { id: 'mult.skip-count', family: 'mult-facts', fromGrade: 0 },
  { id: 'mult.known-fact', family: 'mult-facts', fromGrade: 4 },
  { id: 'mult.nearby-fact', family: 'mult-facts', fromGrade: 4 },
  { id: 'div.share', family: 'div-facts', fromGrade: 0 },
  { id: 'div.groups', family: 'div-facts', fromGrade: 0 },
  { id: 'div.think-mult', family: 'div-facts', fromGrade: 4 },
  { id: 'div.array', family: 'div-facts', fromGrade: 4 },
];

/** An unknown product is multiplication; a missing factor counts as division. */
export function familyOf(fact: HelpFact): HelpFamily {
  return fact.op === 'mult' && fact.c === null ? 'mult-facts' : 'div-facts';
}

/** The help family of a bank skill, or null when the skill has no help. */
export function familyForSkill(skillId: string): HelpFamily | null {
  if (typeof skillId !== 'string') return null;
  if (skillId.startsWith('MULT-FACTS-')) return 'mult-facts';
  return skillId === 'DIV-BASIC-DIVISION-FACTS' ? 'div-facts' : null;
}

/**
 * The fact as the server stores it, from visible numbers only: `7x8` when the product is
 * hidden, otherwise `dividend÷divisor`.
 */
export function factKey(fact: HelpFact): string {
  const { a, b, c } = fact;
  if (fact.op === 'mult') {
    if (c === null) return `${a}x${b}`;
    // a × ? = c and ? × b = c: the product is the dividend, the shown factor the divisor.
    return `${c}÷${a === null ? b : a}`;
  }
  // ? ÷ b = c hides the product: c groups of b.
  if (a === null) return `${c}x${b}`;
  // a ÷ ? = c: divide by the shown quotient.
  return `${a}÷${b === null ? c : b}`;
}
