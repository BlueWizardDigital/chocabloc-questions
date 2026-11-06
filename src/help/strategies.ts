import { STRATEGIES } from './catalog';
import * as div from './div';
import { parseFact, stepIsSafe, type Product, type Quotient } from './fact';
import * as mult from './mult';
import type { HelpFact, HelpStep, SolvedFact, StrategyId } from './types';

export interface HelpOptions {
  /** The kid's grade, K = 0. Null means grade 4 and up. */
  grade: number | null;
  /** The kid's saved strategy for this family, if any. It may not fit this grade. */
  pick: StrategyId | null;
  /** Facts already solved on screen (Cocoa Lab's grid), for the nearby fact. */
  solved: SolvedFact[];
}

const MAX_STEPS = 3;

const MULT: Partial<Record<StrategyId, (p: Product, solved: readonly unknown[]) => HelpStep[][]>> =
  {
    'mult.groups': mult.groups,
    'mult.skip-count': mult.skipCount,
    'mult.known-fact': mult.knownFact,
    'mult.nearby-fact': mult.nearbyFact,
  };
const DIV: Partial<Record<StrategyId, (p: Quotient) => HelpStep[][]>> = {
  'div.share': div.share,
  'div.groups': div.groups,
  'div.think-mult': div.thinkMult,
  'div.array': div.array,
};

function gradeOf(grade: unknown): number {
  if (grade === null || grade === undefined) return 4;
  return typeof grade === 'number' && Number.isFinite(grade) ? Math.max(0, grade) : 0;
}

/**
 * The strategy's 1–3 steps for this fact, or null when it doesn't apply: above the grade,
 * the other family, a zero or out-of-range number, or nothing answer-free to show.
 */
export function buildSteps(
  id: StrategyId,
  fact: HelpFact,
  o: Pick<HelpOptions, 'grade' | 'solved'>,
): HelpStep[] | null {
  const entry = STRATEGIES.find((s) => s.id === id);
  if (!entry || entry.fromGrade > gradeOf(o.grade)) return null;
  const p = parseFact(fact);
  if (!p) return null;
  let candidates: HelpStep[][] | undefined;
  if (p.kind === 'product') candidates = MULT[id]?.(p, Array.isArray(o.solved) ? o.solved : []);
  else candidates = DIV[id]?.(p);
  const chosen = candidates?.find(
    (steps) =>
      steps.length >= 1 && steps.length <= MAX_STEPS && steps.every((s) => stepIsSafe(s, p)),
  );
  return chosen ?? null;
}

/** The strategies that apply, in catalog order, with the kid's pick first when it applies. */
export function strategyOrder(fact: HelpFact, o: HelpOptions): StrategyId[] {
  const ids = STRATEGIES.map((s) => s.id).filter((id) => buildSteps(id, fact, o) !== null);
  const pick = o.pick;
  return pick !== null && ids.includes(pick) ? [pick, ...ids.filter((id) => id !== pick)] : ids;
}
