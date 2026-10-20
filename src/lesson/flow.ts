import type { NormalizedQuestion } from '../types';
import type { Lesson } from './types';

export type Outcome = 'right' | 'wrong' | 'unsure';
export interface StepScore {
  right: number;
  of: number;
  unsure: number;
}

/** Drops ids already shown and repeats within the batch; order kept. */
export function dedupe(batch: NormalizedQuestion[], seen: ReadonlySet<string>): NormalizedQuestion[] {
  const taken = new Set<string>();
  const out: NormalizedQuestion[] = [];
  for (const q of batch) {
    if (seen.has(q.id) || taken.has(q.id)) continue;
    taken.add(q.id);
    out.push(q);
  }
  return out;
}

/** Your turn is filled first, because it is the step that counts. */
export function splitFirstBatch(
  batch: NormalizedQuestion[],
  quickCheck: number,
  passQuestions: number,
): { quickCheck: NormalizedQuestion[]; yourTurn: NormalizedQuestion[] } {
  const qc = Math.max(0, Math.min(quickCheck, batch.length - passQuestions));
  return { quickCheck: batch.slice(0, qc), yourTurn: batch.slice(qc, qc + passQuestions) };
}

export function scoreStep(outcomes: Outcome[]): StepScore {
  let right = 0;
  let unsure = 0;
  for (const o of outcomes) {
    if (o === 'right') right++;
    else if (o === 'unsure') unsure++;
  }
  return { right, of: outcomes.length, unsure };
}

export function stepVerdict(
  available: number,
  outcomes: Outcome[],
  pass: Lesson['pass'],
): 'passed' | 'failed' | 'incomplete' {
  if (available < pass.questions) return 'incomplete';
  const s = scoreStep(outcomes);
  return outcomes.length >= pass.questions && s.right >= pass.right ? 'passed' : 'failed';
}

export type IntroOutcome = 'passed' | 'passedEasier' | 'notYet' | 'incomplete';
export interface IntroDoneDetail {
  mode: 'intro';
  skillId: string;
  outcome: IntroOutcome;
  startSkillId: string | null;
  incompleteStep?: 'yourTurn' | 'tryAgain';
  quickCheck: StepScore;
  yourTurn: StepScore;
  tryAgain?: StepScore;
}

interface ScoredStep {
  available: number;
  outcomes: Outcome[];
}

export function introDone(
  lesson: Lesson,
  s: { quickCheck: Outcome[]; yourTurn: ScoredStep; tryAgain?: ScoredStep },
): IntroDoneDetail {
  const base = {
    mode: 'intro' as const,
    skillId: lesson.skillId,
    quickCheck: scoreStep(s.quickCheck),
    yourTurn: scoreStep(s.yourTurn.outcomes),
  };
  const turn = stepVerdict(s.yourTurn.available, s.yourTurn.outcomes, lesson.pass);
  if (turn === 'incomplete') {
    return { ...base, outcome: 'incomplete', incompleteStep: 'yourTurn', startSkillId: null };
  }
  if (turn === 'passed') return { ...base, outcome: 'passed', startSkillId: lesson.skillId };

  // Your turn was failed in full. A missing Try again run counts as a short one.
  const again = s.tryAgain ?? { available: 0, outcomes: [] };
  const withAgain = { ...base, tryAgain: scoreStep(again.outcomes), startSkillId: lesson.moreHelp.skillId };
  const verdict = stepVerdict(again.available, again.outcomes, lesson.pass);
  if (verdict === 'incomplete') return { ...withAgain, outcome: 'incomplete', incompleteStep: 'tryAgain' };
  return { ...withAgain, outcome: verdict === 'passed' ? 'passedEasier' : 'notYet' };
}

export interface CheckDoneDetail {
  mode: 'check';
  right: number;
  of: number;
  unsure: number;
  bySkill: Record<string, StepScore>;
}

export function checkDone(answers: { skillId: string; outcome: Outcome }[]): CheckDoneDetail {
  const grouped: Record<string, Outcome[]> = {};
  for (const a of answers) (grouped[a.skillId] ||= []).push(a.outcome);
  const bySkill: Record<string, StepScore> = {};
  for (const [k, outcomes] of Object.entries(grouped)) bySkill[k] = scoreStep(outcomes);
  return { mode: 'check', ...scoreStep(answers.map((a) => a.outcome)), bySkill };
}
