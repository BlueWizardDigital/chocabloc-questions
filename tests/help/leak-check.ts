// Test oracle for answer hiding. Written apart from src/help on purpose: it computes the
// unknown straight from the fact and reads every number by the role in its param name.
import type { HelpFact, HelpStep } from '../../src/help/types';

/** The hidden number, or null when the fact has no single whole-number unknown. */
export function unknownOf(f: HelpFact): number | null {
  const { a, b, c } = f;
  const nulls = [a, b, c].filter((n) => n === null).length;
  if (nulls !== 1) return null;
  let u: number;
  if (f.op === 'mult') {
    if (c === null) u = (a as number) * (b as number);
    else if (a === null) u = c / (b as number);
    else u = c / a;
  } else {
    if (a === null) u = (b as number) * (c as number);
    else if (b === null) u = a / (c as number);
    else u = a / (b as number);
  }
  return Number.isInteger(u) ? u : null;
}

/** The numbers the question itself shows. */
export function visibleOf(f: HelpFact): number[] {
  return [f.a, f.b, f.c].filter((n): n is number => n !== null);
}

/** Every way the step could show the unknown; empty when it is clean. */
export function leakCheckStep(step: HelpStep, fact: HelpFact): string[] {
  const unknown = unknownOf(fact);
  const shown = visibleOf(fact);
  const problems: string[] = [];
  if (unknown === null) return ['the fact has no single unknown'];

  for (const [name, value] of Object.entries(step.say.params)) {
    if (name === 'total' || name === 'answer') {
      problems.push(`param "${name}" is never allowed`);
      continue;
    }
    const role = /^[a-z]+/.exec(name)?.[0];
    if (role === 'given') {
      if (!shown.includes(value))
        problems.push(`${name}=${value} is not a number the question shows`);
    } else if (role === 'anchor' || role === 'partial') {
      if (value === unknown) problems.push(`${name}=${value} equals the unknown`);
    } else {
      problems.push(`${name} has no known role`);
    }
  }

  const p = step.picture;
  if (p?.kind === 'rows') {
    if (p.counted >= p.rows)
      problems.push('rows picture counts every row, so its last total is shown');
    for (let k = 1; k <= Math.min(p.counted, p.rows); k++) {
      if (k * p.perRow === unknown) problems.push(`rows picture labels ${unknown} on row ${k}`);
    }
  } else if (p?.kind === 'deal') {
    if (p.dealt >= p.total) problems.push('deal picture is fully dealt');
    if (!shown.includes(p.total))
      problems.push(`deal picture total ${p.total} is not shown by the question`);
  } else if (p?.kind === 'take') {
    if (p.taken * p.size >= p.total) problems.push('take picture took every group');
    if (!shown.includes(p.total))
      problems.push(`take picture total ${p.total} is not shown by the question`);
  }

  for (const pt of step.points) {
    for (const n of [pt.a, pt.b, pt.a * pt.b]) {
      if (n === unknown && !shown.includes(n)) problems.push(`point ${pt.a}×${pt.b} shows ${n}`);
    }
  }
  return problems;
}
