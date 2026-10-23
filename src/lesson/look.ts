const GRADE = /^(K|[1-9]|1[0-2])$/;
const YOUNG = ['K', '1', '2', '3'];

/** A kid's grade as the player takes it: 'K' or 1 to 12 (old accounts carry 7 to 12), as a string or number. Anything else is null, with a warning. */
export function normalizeGrade(v: unknown): string | null {
  if (v == null) return null;
  // Only strings and numbers are read; String() on anything else could throw.
  const g = typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  if (GRADE.test(g)) return g;
  console.warn(`[chocabloc-lesson] unknown grade: ${g || typeof v}`);
  return null;
}

/** K to 3 get the young look; 4 and up never do. The kid's grade decides; with none, the skill's own grade does. */
export function lookFor(grade: unknown, skillGrade: unknown): 'young' | 'standard' {
  const g = normalizeGrade(grade) ?? (typeof skillGrade === 'string' ? skillGrade : null);
  return g !== null && YOUNG.includes(g) ? 'young' : 'standard';
}
