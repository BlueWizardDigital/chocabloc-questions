// Test oracle for answer hiding. Written apart from src/help on purpose: it computes the
// unknown straight from the fact and reads every number by the role in its param name.
// Each problem is "<code>: <detail>", so a control can assert which check fired.
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
  if (unknown === null) return ['no-single-unknown: the fact has no single unknown'];
  // In a division fact the unknown is the quotient, which a row picture may draw as its rows.
  const isDivision = !(fact.op === 'mult' && fact.c === null);

  for (const [name, value] of Object.entries(step.say.params)) {
    if (name === 'total' || name === 'answer') {
      problems.push(`banned-name: param "${name}" is never allowed`);
      continue;
    }
    const role = /^[a-z]+/.exec(name)?.[0];
    if (role === 'given') {
      if (!shown.includes(value))
        problems.push(`given-not-shown: ${name}=${value} is not a number the question shows`);
    } else if (role === 'anchor' || role === 'partial') {
      if (value === unknown) problems.push(`equals-unknown: ${name}=${value} is the unknown`);
    } else {
      problems.push(`no-role: ${name} has no known role`);
    }
  }

  const p = step.picture;
  if (p?.kind === 'rows') {
    if (!shown.includes(p.rows) && !(isDivision && p.rows === unknown))
      problems.push(`rows-count-not-shown: ${p.rows} rows`);
    if (!shown.includes(p.perRow)) problems.push(`rows-size-not-shown: ${p.perRow} per row`);
    if (p.counted >= p.rows)
      problems.push('rows-fully-counted: every row is counted, so the last total is shown');
    for (let k = 1; k <= Math.min(p.counted, p.rows); k++) {
      if (k * p.perRow === unknown)
        problems.push(`rows-total-is-unknown: row ${k} is labelled ${unknown}`);
    }
  } else if (p?.kind === 'deal') {
    if (p.dealt >= p.total) problems.push('deal-finished: every object is dealt');
    if (!shown.includes(p.total)) problems.push(`deal-total-not-shown: ${p.total}`);
    if (!shown.includes(p.rows)) problems.push(`deal-rows-not-shown: ${p.rows}`);
  } else if (p?.kind === 'take') {
    if (p.taken * p.size >= p.total) problems.push('take-finished: every group is taken');
    if (!shown.includes(p.total)) problems.push(`take-total-not-shown: ${p.total}`);
    if (!shown.includes(p.size)) problems.push(`take-size-not-shown: ${p.size}`);
  }

  for (const pt of step.points) {
    // A missing factor's row or column is never lit, even when that number is on screen.
    if ((fact.a === null && pt.a === unknown) || (fact.b === null && pt.b === unknown))
      problems.push(`point-on-hidden-line: ${pt.a}×${pt.b}`);
    for (const n of [pt.a, pt.b, pt.a * pt.b]) {
      if (n === unknown && !shown.includes(n))
        problems.push(`point-shows-unknown: ${pt.a}×${pt.b} shows ${n}`);
    }
  }
  return problems;
}
